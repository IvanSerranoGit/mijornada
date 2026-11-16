#!/usr/bin/env bash
# Crea la zona mijornada.xyz en Cloudflare (plan gratuito), importa los registros de
# `infra/dns/mijornada.xyz.zone` y muestra los nameservers que hay que capturar en Akky.
#
# Requiere en `.env.local`: CLOUDFLARE_API_TOKEN (permisos Zone:Edit y DNS:Edit)
# y CLOUDFLARE_ACCOUNT_ID (el token no puede listar cuentas; el ID está en la URL del panel).
set -euo pipefail
cd "$(dirname "$0")/.."

ZONE_NAME="mijornada.xyz"
ZONE_FILE="infra/dns/${ZONE_NAME}.zone"
API="https://api.cloudflare.com/client/v4"

# Lee una variable de .env.local; devuelve vacío si no está definida.
read_env() { { grep -E "^$1=" .env.local 2>/dev/null || true; } | tail -1 | cut -d= -f2- | tr -d '"'"'"; }
TOKEN="${CLOUDFLARE_API_TOKEN:-$(read_env CLOUDFLARE_API_TOKEN)}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$(read_env CLOUDFLARE_ACCOUNT_ID)}"
[ -n "$TOKEN" ] || { echo "Falta CLOUDFLARE_API_TOKEN en .env.local" >&2; exit 1; }

cf() { curl -sS -H "Authorization: Bearer ${TOKEN}" "$@"; }
# Extrae un campo de la respuesta JSON; falla mostrando los errores de la API.
pick() {
  node -e '
    const body = JSON.parse(require("fs").readFileSync(0, "utf8"));
    if (!body.success) { console.error(JSON.stringify(body.errors)); process.exit(1); }
    const value = new Function("r", "return " + process.argv[1])(body.result);
    console.log(Array.isArray(value) ? value.join("\n") : (value ?? ""));
  ' "$1"
}

zone_id="$(cf "${API}/zones?name=${ZONE_NAME}" | pick 'r[0]?.id')"
if [ -z "$zone_id" ]; then
  if [ -z "$ACCOUNT_ID" ]; then
    ACCOUNT_ID="$(cf "${API}/accounts" | pick 'r[0]?.id')"
  fi
  echo "Creando la zona ${ZONE_NAME}..."
  zone_id="$(cf -X POST "${API}/zones" -H "Content-Type: application/json" \
    --data "{\"name\":\"${ZONE_NAME}\",\"account\":{\"id\":\"${ACCOUNT_ID}\"},\"type\":\"full\"}" | pick 'r.id')"
else
  echo "La zona ${ZONE_NAME} ya existe."
fi

existing="$(cf "${API}/zones/${zone_id}/dns_records?per_page=100" | pick 'r.length')"
if [ "$existing" = "0" ]; then
  echo "Importando registros de ${ZONE_FILE}..."
  cf -X POST "${API}/zones/${zone_id}/dns_records/import" \
    -F "file=@${ZONE_FILE}" -F "proxied=false" | pick '`${r.recs_added} registros agregados`'
else
  echo "La zona ya tiene ${existing} registros; no se importa nada."
fi

echo "Registros actuales:"
cf "${API}/zones/${zone_id}/dns_records?per_page=100" | pick 'r.map((x) => `  ${x.type} ${x.name} -> ${x.content}`)'
echo "Nameservers para capturar en Akky:"
cf "${API}/zones/${zone_id}" | pick 'r.name_servers.map((x) => `  ${x}`)'
