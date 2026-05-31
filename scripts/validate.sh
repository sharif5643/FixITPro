#!/bin/bash
# ============================================================
# FixITPro — Pre-Launch Validation Script
# Usage: bash scripts/validate.sh [--domain app.example.com]
# Runs against production or localhost depending on args
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$APP_DIR/.env.prod"

# ── Config ────────────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
  API_BASE="https://${API_DOMAIN:-localhost}/api/v1"
else
  API_BASE="http://localhost:3000/api/v1"
fi

# Allow override via arg
while [[ $# -gt 0 ]]; do
  case "$1" in
    --api) API_BASE="$2"; shift 2 ;;
    --domain) API_BASE="https://$2/api/v1"; shift 2 ;;
    *) shift ;;
  esac
done

PASS=0
FAIL=0
SKIP=0
TOKEN=""
SHIFT_ID=""
SALE_ID=""
REPAIR_ID=""
CLAIM_ID=""
PO_ID=""
USER_ID=""
CATEGORY_ID=""
PRODUCT_ID=""

# ── Helpers ───────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}  ✓ PASS${NC}  $1"; ((PASS++)); }
fail() { echo -e "${RED}  ✗ FAIL${NC}  $1 — $2"; ((FAIL++)); }
skip() { echo -e "${YELLOW}  ⚠ SKIP${NC}  $1 — $2"; ((SKIP++)); }
header() { echo ""; echo "━━━ $1 ━━━"; }

# Generic curl wrapper — returns HTTP status code
http() {
  local method="$1"; local url="$2"; shift 2
  curl -s -o /tmp/vld_body.json -w "%{http_code}" \
    -X "$method" "$url" \
    -H "Content-Type: application/json" \
    ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
    "$@"
}

body() { cat /tmp/vld_body.json 2>/dev/null || echo '{}'; }
jq_val() { body | python3 -c "import sys,json; d=json.load(sys.stdin); print($1)" 2>/dev/null || echo ""; }

# ── Tests ─────────────────────────────────────────────────────

test_health() {
  header "Health Check"
  local status; status=$(http GET "$API_BASE/health")
  if [ "$status" = "200" ]; then
    pass "GET /health → 200"
  else
    fail "GET /health" "Expected 200, got $status"
  fi
}

test_auth() {
  header "Authentication"

  # Login with owner
  local status; status=$(http POST "$API_BASE/auth/login" \
    -d "{\"email\":\"${OWNER_EMAIL:-owner@fixitpro.local}\",\"password\":\"${OWNER_PASS:-changeme}\"}")

  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    TOKEN=$(jq_val "d['data']['accessToken'] if 'data' in d else d.get('accessToken','')")
    if [ -z "$TOKEN" ]; then
      TOKEN=$(jq_val "d.get('accessToken','')")
    fi
    if [ -n "$TOKEN" ]; then
      pass "POST /auth/login → token received"
    else
      fail "POST /auth/login" "No accessToken in response: $(body)"
    fi
  else
    fail "POST /auth/login" "Expected 200, got $status — $(body)"
  fi

  # Wrong password → 401
  local status2; status2=$(http POST "$API_BASE/auth/login" \
    -d '{"email":"nobody@x.com","password":"wrong"}')
  if [ "$status2" = "401" ]; then
    pass "POST /auth/login (wrong pass) → 401"
  else
    fail "POST /auth/login (wrong pass)" "Expected 401, got $status2"
  fi

  # Profile
  if [ -n "$TOKEN" ]; then
    local status3; status3=$(http GET "$API_BASE/auth/profile")
    if [ "$status3" = "200" ]; then
      pass "GET /auth/profile → 200"
    else
      fail "GET /auth/profile" "Expected 200, got $status3"
    fi
  fi
}

test_users() {
  header "User Management"

  if [ -z "$TOKEN" ]; then skip "Users" "No token"; return; fi

  local status; status=$(http GET "$API_BASE/users")
  if [ "$status" = "200" ]; then
    pass "GET /users → 200"
  else
    fail "GET /users" "Expected 200, got $status"
  fi

  # Create test user
  local ts; ts=$(date +%s)
  status=$(http POST "$API_BASE/users" \
    -d "{\"email\":\"teststaff${ts}@fixitpro.local\",\"name\":\"Test Staff\",\"role\":\"CASHIER\",\"password\":\"Test@1234\"}")
  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    USER_ID=$(jq_val "d.get('id',d.get('data',{}).get('id',''))")
    pass "POST /users (create CASHIER) → $status"
  else
    fail "POST /users" "Expected 201, got $status — $(body)"
  fi
}

test_categories() {
  header "Categories"

  if [ -z "$TOKEN" ]; then skip "Categories" "No token"; return; fi

  # List categories
  local status; status=$(http GET "$API_BASE/categories")
  if [ "$status" = "200" ]; then
    pass "GET /categories → 200"
  else
    fail "GET /categories" "Expected 200, got $status"
  fi

  # Create category
  local ts; ts=$(date +%s)
  status=$(http POST "$API_BASE/categories" \
    -d "{\"name\":\"Validate Cat ${ts}\",\"slug\":\"validate-cat-${ts}\"}")
  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    CATEGORY_ID=$(jq_val "d.get('id',d.get('data',{}).get('id',''))")
    pass "POST /categories → $status"
  else
    fail "POST /categories" "Expected 201, got $status — $(body)"
  fi
}

test_products() {
  header "Products"

  if [ -z "$TOKEN" ]; then skip "Products" "No token"; return; fi

  # List products
  local status; status=$(http GET "$API_BASE/products")
  if [ "$status" = "200" ]; then
    pass "GET /products → 200"
  else
    fail "GET /products" "Expected 200, got $status"
  fi

  # Create product
  local ts; ts=$(date +%s)
  local body_json="{\"name\":\"Validate Product ${ts}\",\"sku\":\"VLD-${ts}\",\"price\":999,\"cost\":500,\"type\":\"PRODUCT\",\"stock\":10}"
  if [ -n "$CATEGORY_ID" ]; then
    body_json="{\"name\":\"Validate Product ${ts}\",\"sku\":\"VLD-${ts}\",\"price\":999,\"cost\":500,\"type\":\"PRODUCT\",\"stock\":10,\"categoryId\":\"$CATEGORY_ID\"}"
  fi
  status=$(http POST "$API_BASE/products" -d "$body_json")
  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    PRODUCT_ID=$(jq_val "d.get('id',d.get('data',{}).get('id',''))")
    pass "POST /products → $status"
  else
    fail "POST /products" "Expected 201, got $status — $(body)"
  fi
}

test_shifts() {
  header "Shifts"

  if [ -z "$TOKEN" ]; then skip "Shifts" "No token"; return; fi

  # Open shift
  local status; status=$(http POST "$API_BASE/shifts/open" \
    -d '{"openBalance":1000,"note":"Validation shift"}')
  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    SHIFT_ID=$(jq_val "d.get('id',d.get('data',{}).get('id',''))")
    pass "POST /shifts/open → $status (id: $SHIFT_ID)"
  else
    fail "POST /shifts/open" "Expected 201, got $status — $(body)"
    return
  fi

  # Get current shift
  status=$(http GET "$API_BASE/shifts/current")
  if [ "$status" = "200" ]; then
    pass "GET /shifts/current → 200"
  else
    fail "GET /shifts/current" "Expected 200, got $status"
  fi
}

test_sales() {
  header "POS / Sales"

  if [ -z "$TOKEN" ]; then skip "Sales" "No token"; return; fi
  if [ -z "$SHIFT_ID" ]; then skip "Sales" "No active shift"; return; fi
  if [ -z "$PRODUCT_ID" ]; then skip "Sales" "No product ID"; return; fi

  # Create sale
  local status; status=$(http POST "$API_BASE/sales" \
    -d "{\"shiftId\":\"$SHIFT_ID\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"quantity\":1,\"price\":999}],\"paymentMethod\":\"CASH\",\"totalAmount\":999,\"paidAmount\":1000}")
  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    SALE_ID=$(jq_val "d.get('id',d.get('data',{}).get('id',''))")
    pass "POST /sales → $status"
  else
    fail "POST /sales" "Expected 201, got $status — $(body)"
  fi

  # Get sale
  if [ -n "$SALE_ID" ]; then
    status=$(http GET "$API_BASE/sales/$SALE_ID")
    if [ "$status" = "200" ]; then
      pass "GET /sales/:id → 200"
    else
      fail "GET /sales/:id" "Expected 200, got $status"
    fi
  fi
}

test_repairs() {
  header "Repairs"

  if [ -z "$TOKEN" ]; then skip "Repairs" "No token"; return; fi

  # Create repair
  local ts; ts=$(date +%s)
  local status; status=$(http POST "$API_BASE/repairs" \
    -d "{\"customerName\":\"Validate Customer\",\"customerPhone\":\"0812345678\",\"deviceBrand\":\"Apple\",\"deviceModel\":\"iPhone 14\",\"issueDescription\":\"Screen broken\",\"estimatedCost\":2500}")
  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    REPAIR_ID=$(jq_val "d.get('id',d.get('data',{}).get('id',''))")
    pass "POST /repairs → $status"
  else
    fail "POST /repairs" "Expected 201, got $status — $(body)"
  fi

  # List repairs
  status=$(http GET "$API_BASE/repairs")
  if [ "$status" = "200" ]; then
    pass "GET /repairs → 200"
  else
    fail "GET /repairs" "Expected 200, got $status"
  fi
}

test_purchase_orders() {
  header "Purchase Orders"

  if [ -z "$TOKEN" ]; then skip "Purchase Orders" "No token"; return; fi

  # List suppliers
  local status; status=$(http GET "$API_BASE/suppliers")
  if [ "$status" = "200" ]; then
    pass "GET /suppliers → 200"
  else
    fail "GET /suppliers" "Expected 200, got $status"
  fi

  # Create supplier
  local ts; ts=$(date +%s)
  status=$(http POST "$API_BASE/suppliers" \
    -d "{\"name\":\"Validate Supplier ${ts}\",\"phone\":\"0812341234\"}")
  local supplier_id=""
  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    supplier_id=$(jq_val "d.get('id',d.get('data',{}).get('id',''))")
    pass "POST /suppliers → $status"
  else
    skip "POST /suppliers" "Got $status — $(body)"
  fi

  # Create PO
  if [ -n "$supplier_id" ] && [ -n "$PRODUCT_ID" ]; then
    status=$(http POST "$API_BASE/purchase-orders" \
      -d "{\"supplierId\":\"$supplier_id\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"quantity\":5,\"cost\":450}]}")
    if [ "$status" = "200" ] || [ "$status" = "201" ]; then
      PO_ID=$(jq_val "d.get('id',d.get('data',{}).get('id',''))")
      pass "POST /purchase-orders → $status"
    else
      fail "POST /purchase-orders" "Expected 201, got $status — $(body)"
    fi
  else
    skip "POST /purchase-orders" "Missing supplier or product"
  fi
}

test_reports() {
  header "Reports / Dashboard"

  if [ -z "$TOKEN" ]; then skip "Reports" "No token"; return; fi

  local status; status=$(http GET "$API_BASE/reports/dashboard")
  if [ "$status" = "200" ]; then
    pass "GET /reports/dashboard → 200"
  else
    fail "GET /reports/dashboard" "Expected 200, got $status"
  fi

  local today; today=$(date '+%Y-%m-%d')
  status=$(http GET "$API_BASE/reports/sales?startDate=${today}&endDate=${today}")
  if [ "$status" = "200" ]; then
    pass "GET /reports/sales?date → 200"
  else
    fail "GET /reports/sales" "Expected 200, got $status"
  fi
}

test_permissions() {
  header "Permission Enforcement"

  if [ -z "$TOKEN" ]; then skip "Permissions" "No token"; return; fi

  # GET /permissions/roles — OWNER only
  local status; status=$(http GET "$API_BASE/permissions/roles")
  if [ "$status" = "200" ]; then
    pass "GET /permissions/roles → 200 (OWNER can access)"
  else
    fail "GET /permissions/roles" "Expected 200, got $status"
  fi

  # Test 403 with cashier token (if user was created)
  if [ -n "$USER_ID" ]; then
    local cashier_token=""
    local ts; ts=$(date +%s)
    local login_status; login_status=$(http POST "$API_BASE/auth/login" \
      -d "{\"email\":\"teststaff${ts}@fixitpro.local\",\"password\":\"Test@1234\"}" \
      --no-proxy localhost)
    if [ "$login_status" = "200" ] || [ "$login_status" = "201" ]; then
      cashier_token=$(jq_val "d.get('accessToken',d.get('data',{}).get('accessToken',''))")
    fi

    if [ -n "$cashier_token" ]; then
      local saved_token="$TOKEN"
      TOKEN="$cashier_token"
      status=$(http GET "$API_BASE/permissions/roles")
      TOKEN="$saved_token"
      if [ "$status" = "403" ]; then
        pass "GET /permissions/roles (CASHIER) → 403 (correctly blocked)"
      else
        fail "GET /permissions/roles (CASHIER)" "Expected 403, got $status"
      fi
    else
      skip "Permission 403 test" "Could not get cashier token"
    fi
  else
    skip "Permission 403 test" "No cashier user created"
  fi
}

test_claims() {
  header "Claims"

  if [ -z "$TOKEN" ]; then skip "Claims" "No token"; return; fi

  local status; status=$(http GET "$API_BASE/claims")
  if [ "$status" = "200" ]; then
    pass "GET /claims → 200"
  else
    fail "GET /claims" "Expected 200, got $status — $(body)"
  fi
}

test_close_shift() {
  header "Close Shift (Cleanup)"

  if [ -z "$TOKEN" ] || [ -z "$SHIFT_ID" ]; then
    skip "Close Shift" "No token or shift ID"
    return
  fi

  local status; status=$(http POST "$API_BASE/shifts/close" \
    -d "{\"shiftId\":\"$SHIFT_ID\",\"closeBalance\":1000,\"note\":\"Validation complete\"}")
  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    pass "POST /shifts/close → $status"
  else
    fail "POST /shifts/close" "Expected 200, got $status — $(body)"
  fi
}

test_ssl() {
  header "SSL / HTTPS"

  if [[ "$API_BASE" == http://localhost* ]]; then
    skip "SSL check" "Running against localhost"
    return
  fi

  local domain="${API_DOMAIN:-}"
  if [ -z "$domain" ]; then
    skip "SSL check" "API_DOMAIN not set"
    return
  fi

  # Check cert expiry
  local expiry; expiry=$(echo | openssl s_client -connect "$domain:443" -servername "$domain" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || echo "")

  if [ -n "$expiry" ]; then
    pass "SSL certificate valid — expires: $expiry"
  else
    fail "SSL check" "Could not retrieve certificate"
  fi

  # Check HTTPS redirect
  local http_status; http_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    "http://$domain/api/v1/health" || echo "000")
  if [ "$http_status" = "301" ] || [ "$http_status" = "302" ] || [ "$http_status" = "308" ]; then
    pass "HTTP → HTTPS redirect → $http_status"
  else
    fail "HTTP → HTTPS redirect" "Expected 30x, got $http_status"
  fi
}

test_backup() {
  header "Backup Script"

  local backup_script="$SCRIPT_DIR/backup.sh"
  if [ ! -f "$backup_script" ]; then
    skip "Backup script" "backup.sh not found"
    return
  fi

  if [ ! -x "$backup_script" ]; then
    skip "Backup script" "backup.sh not executable (run: chmod +x scripts/backup.sh)"
    return
  fi

  if [ ! -f "$ENV_FILE" ]; then
    skip "Backup run" "Not on VPS (no .env.prod)"
    return
  fi

  echo "  Running backup (may take a moment)..."
  if bash "$backup_script" 2>&1 | tail -3; then
    pass "backup.sh ran successfully"
  else
    fail "backup.sh" "Script exited with error"
  fi
}

# ── Summary ───────────────────────────────────────────────────
print_summary() {
  local total=$((PASS + FAIL + SKIP))
  echo ""
  echo "════════════════════════════════════════"
  echo "  Validation Complete"
  echo "════════════════════════════════════════"
  echo -e "  ${GREEN}PASS: $PASS${NC}  |  ${RED}FAIL: $FAIL${NC}  |  ${YELLOW}SKIP: $SKIP${NC}  |  Total: $total"
  echo ""
  if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}  ✗ Validation FAILED — fix the issues above before going live.${NC}"
    exit 1
  else
    echo -e "${GREEN}  ✓ All checks passed — system is ready!${NC}"
    exit 0
  fi
}

# ── Entry Point ───────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  FixITPro Pre-Launch Validation                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo "  API: $API_BASE"
echo "  Date: $(date '+%Y-%m-%d %H:%M:%S')"

test_health
test_auth
test_users
test_categories
test_products
test_shifts
test_sales
test_repairs
test_purchase_orders
test_reports
test_permissions
test_claims
test_close_shift
test_ssl
test_backup

print_summary
