#!/usr/bin/env bash
# Check SPF/DKIM/DMARC DNS records for a sending domain.
# Usage: ./scripts/check-email-dns.sh myfleet.app
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Usage: $0 <domain>" >&2
  echo "Example: $0 myfleet.app" >&2
  exit 1
fi

echo "=== Email DNS check for: $DOMAIN ==="

check_txt() {
  local name="$1"
  echo ""
  echo "--- TXT: $name ---"
  if command -v dig >/dev/null 2>&1; then
    dig +short TXT "$name" || true
  else
    nslookup -type=TXT "$name" 2>/dev/null || true
  fi
}

check_txt "$DOMAIN"
check_txt "mail.$DOMAIN"
check_txt "_dmarc.$DOMAIN"

echo ""
echo "Tip: SPF should include your provider (e.g. include:spf.mtasv.net for Postmark)."
echo "Tip: DKIM is usually at a selector like pm._domainkey.$DOMAIN (provider-specific)."
echo "After DNS propagates, run: cd backend && npm run verify:smtp"
