#!/usr/bin/env bash
# Reinicia la base local y aplica migraciones y seeds desde cero.
#
# Con Supabase CLI 2.75 el gateway local (Kong) conserva la IP anterior de los
# contenedores que `db reset` reinicia, y la verificación final del CLI falla con
# "Error status 502" aunque las migraciones ya se aplicaron. En ese caso
# reiniciamos Kong; cualquier otro error (por ejemplo, una migración inválida)
# se propaga tal cual.
set -uo pipefail

output_file="$(mktemp)"
trap 'rm -f "$output_file"' EXIT

supabase db reset --local "$@" 2>&1 | tee "$output_file"
status=${PIPESTATUS[0]}

if [ "$status" -ne 0 ]; then
  if grep -q "Restarting containers" "$output_file" && grep -q "Error status 502" "$output_file"; then
    echo "Migraciones aplicadas; reiniciando el gateway local para refrescar sus rutas..."
    docker restart supabase_kong_mijornada >/dev/null
    for _ in $(seq 1 30); do
      code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/storage/v1/status || true)"
      if [ "$code" = "200" ]; then
        echo "Base local lista."
        exit 0
      fi
      sleep 1
    done
    echo "El gateway local no respondió después del reinicio." >&2
    exit 1
  fi
  exit "$status"
fi
