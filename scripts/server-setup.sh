#!/bin/bash
# ============================================================
# FixITPro — VPS Initial Setup Script
# Run ONCE on a fresh Ubuntu 22.04 VPS as root
# Usage: bash server-setup.sh
# ============================================================
set -euo pipefail

APP_USER="fixitpro"
APP_DIR="/srv/fixitpro"

echo "╔══════════════════════════════════════════════╗"
echo "║   FixITPro VPS Setup — Ubuntu 22.04          ║"
echo "╚══════════════════════════════════════════════╝"

# ── 1. System update ─────────────────────────────────────────
echo "▶ [1/10] Updating system packages..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -yq
apt-get install -yq \
  curl wget git unzip htop vim ufw fail2ban \
  ca-certificates gnupg lsb-release

# ── 2. Docker ────────────────────────────────────────────────
echo "▶ [2/10] Installing Docker..."
if ! command -v docker &> /dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  echo "  Docker installed: $(docker --version)"
else
  echo "  Docker already installed: $(docker --version)"
fi

# ── 3. App user ──────────────────────────────────────────────
echo "▶ [3/10] Creating app user '$APP_USER'..."
if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash -G docker "$APP_USER"
  echo "  User '$APP_USER' created"
else
  echo "  User '$APP_USER' already exists"
  usermod -aG docker "$APP_USER"
fi

# ── 4. App directory ─────────────────────────────────────────
echo "▶ [4/10] Setting up app directory $APP_DIR..."
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── 5. Firewall (UFW) ────────────────────────────────────────
echo "▶ [5/10] Configuring firewall (UFW)..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP'
ufw allow 443/tcp  comment 'HTTPS'
ufw --force enable
echo "  UFW status:"
ufw status verbose

# ── 6. Fail2ban ──────────────────────────────────────────────
echo "▶ [6/10] Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
destemail = root@localhost
action = %(action_mw)s

[sshd]
enabled  = true
port     = 22
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 86400

[nginx-http-auth]
enabled  = true
filter   = nginx-http-auth
port     = http,https
logpath  = /srv/fixitpro/nginx_logs/error.log

[nginx-limit-req]
enabled  = true
filter   = nginx-limit-req
port     = http,https
logpath  = /srv/fixitpro/nginx_logs/error.log
maxretry = 10
EOF
systemctl enable --now fail2ban
echo "  Fail2ban configured"

# ── 7. SSH hardening ─────────────────────────────────────────
echo "▶ [7/10] Hardening SSH..."
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/'   /etc/ssh/sshd_config
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/'               /etc/ssh/sshd_config
sed -i 's/PermitRootLogin yes/PermitRootLogin no/'                /etc/ssh/sshd_config
echo "  ⚠  SSH password auth disabled. Ensure your SSH key is installed first!"

# ── 8. Auto security updates ─────────────────────────────────
echo "▶ [8/10] Enabling automatic security updates..."
apt-get install -yq unattended-upgrades
echo 'Unattended-Upgrade::Automatic-Reboot "false";' \
  >> /etc/apt/apt.conf.d/50unattended-upgrades

# ── 9. Swap (2GB) ────────────────────────────────────────────
echo "▶ [9/10] Configuring 2GB swap..."
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  sysctl -p
  echo "  Swap configured: 2GB"
else
  echo "  Swap already configured"
fi

# ── 10. Cron jobs ────────────────────────────────────────────
echo "▶ [10/10] Setting up cron jobs..."
cat > /etc/cron.d/fixitpro << EOF
# FixITPro maintenance cron jobs
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Reload nginx daily at 3:05 AM (picks up renewed SSL certs)
5 3 * * * root docker compose -f $APP_DIR/docker-compose.prod.yml --env-file $APP_DIR/.env.prod exec -T nginx nginx -s reload >> /var/log/fixitpro-cron.log 2>&1

# Daily database backup at 2:00 AM
0 2 * * * $APP_USER bash $APP_DIR/scripts/backup.sh >> /var/log/fixitpro-backup.log 2>&1

# Disk usage alert — warn if > 80%
0 8 * * * root df -h / | awk 'NR==2{print \$5}' | tr -d '%' | xargs -I{} bash -c 'if [ {} -gt 80 ]; then echo "DISK ALERT: {}% used on $(hostname)" | mail -s "Disk Alert" root; fi'
EOF
chmod 644 /etc/cron.d/fixitpro
systemctl restart cron

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✓ Server setup complete!                            ║"
echo "║                                                      ║"
echo "║  Next steps:                                         ║"
echo "║  1. su - $APP_USER                                   ║"
echo "║  2. cd $APP_DIR                                      ║"
echo "║  3. git clone <your-repo> .                          ║"
echo "║  4. cp .env.prod.example .env.prod && nano .env.prod ║"
echo "║  5. bash scripts/init-ssl.sh                         ║"
echo "║  6. bash scripts/deploy.sh                           ║"
echo "╚══════════════════════════════════════════════════════╝"
