#!/usr/bin/env bash
# Escribe apps/web/.env.local y apps/kiosco/.env.local con las llaves del Supabase
# local (`supabase start`). No toca las variables que ya existan en esos archivos.
set -euo pipefail
cd "$(dirname "$0")/.."

status="$(supabase status -o json 2>/dev/null)"
value() { printf '%s' "$status" | python3 -c "import sys, json; print(json.load(sys.stdin)['$1'])"; }

for app in web kiosco; do
  file="apps/$app/.env.local"
  touch "$file"
  put() { grep -q "^$1=" "$file" || printf '%s=%s\n' "$1" "$2" >> "$file"; }
  put NEXT_PUBLIC_SUPABASE_URL "$(value API_URL)"
  put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$(value PUBLISHABLE_KEY)"
  put SUPABASE_SECRET_KEY "$(value SECRET_KEY)"
  put NEXT_PUBLIC_SITE_URL "http://localhost:3000"
  put NEXT_PUBLIC_KIOSCO_URL "http://localhost:3001"
  echo "Listo: $file"
done
