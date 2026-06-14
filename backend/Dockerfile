# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install OpenSSL (required by Prisma)
RUN apk add --no-cache openssl

# Install all dependencies (including dev — needed for build)
COPY package*.json ./
RUN npm ci

# Generate Prisma client BEFORE copying source
COPY prisma ./prisma
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npm run build

# Prune devDependencies after build
RUN npm prune --omit=dev

# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Runtime dependencies
# postgresql-client: provides pg_dump for the admin-triggered backup API endpoint.
RUN apk add --no-cache openssl dumb-init postgresql-client

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

# Copy only what's needed to run
COPY --from=builder --chown=nestjs:nodejs /app/dist          ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules  ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/prisma        ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/package.json  ./

COPY --chown=nestjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Create uploads and backups directories before switching to non-root user.
# Named volumes inherit ownership from the image directory on first mount,
# so this ensures the nestjs user can write repair images and backup files.
RUN mkdir -p /app/uploads/repairs /app/backups && chown -R nestjs:nodejs /app/uploads /app/backups

USER nestjs
EXPOSE 3000

# dumb-init handles PID 1 signal forwarding
ENTRYPOINT ["dumb-init", "--"]
CMD ["./docker-entrypoint.sh"]
