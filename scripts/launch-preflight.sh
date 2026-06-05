#!/usr/bin/env bash
# Pre-launch verification — run before Go/No-Go.
# Usage: ./scripts/launch-preflight.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PASS=0
FAIL=0
WARN=0

ok() { echo "[preflight] OK: $1"; PASS=$((PASS + 1)); }
bad() { echo "[preflight] FAIL: $1" >&2; FAIL=$((FAIL + 1)); }
warn() { echo "[preflight] WARN: $1"; WARN=$((WARN + 1)); }

echo "=== Fleet Launch Preflight ==="

# Static code gates
if (cd backend && npm run build >/dev/null 2>&1); then
  ok "backend build"
else
  bad "backend build"
fi

if (cd frontend && npm run build >/dev/null 2>&1); then
  ok "frontend build"
else
  bad "frontend build"
fi

if (cd backend && npx ts-node --transpile-only scripts/tenant-isolation-check.ts >/dev/null 2>&1); then
  ok "tenant isolation check"
else
  bad "tenant isolation check"
fi

# No public /uploads in frontend
if rg -q '"/uploads/' frontend/app frontend/components 2>/dev/null; then
  bad "frontend still references /uploads paths"
else
  ok "no /uploads links in frontend"
fi

# Ops docs present
for doc in \
  docs/ops/SMTP-GO-LIVE.md \
  docs/ops/STRIPE-GO-LIVE.md \
  docs/ops/S3-GO-LIVE.md \
  docs/ops/BACKUP-CRON.md \
  docs/ops/LAUNCH-E2E-REHEARSAL.md \
  docs/security/PENTEST-CHECKLIST.md; do
  if [[ -f "$doc" ]]; then
    ok "doc $doc"
  else
    bad "missing $doc"
  fi
done

# Optional live checks when .env is configured
if [[ -f backend/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source backend/.env
  set +a

  if [[ "${SMTP_ENABLED:-}" == "true" ]]; then
    if (cd backend && npm run verify:smtp >/dev/null 2>&1); then
      ok "SMTP verify"
    else
      warn "SMTP verify failed (check credentials)"
    fi
  fi

  if [[ "${STORAGE_DRIVER:-}" == "s3" ]]; then
    if (cd backend && npm run verify:s3 >/dev/null 2>&1); then
      ok "S3 verify"
    else
      warn "S3 verify failed (check credentials)"
    fi
  fi

  if [[ "${STRIPE_ENABLED:-}" == "true" ]]; then
    if (cd backend && npm run verify:stripe >/dev/null 2>&1); then
      ok "Stripe verify"
    else
      warn "Stripe verify failed (check keys)"
    fi
  fi
else
  warn "backend/.env not found — skipping live SMTP/S3/Stripe checks"
fi

echo ""
echo "=== Summary: $PASS passed, $FAIL failed, $WARN warnings ==="

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi

exit 0
