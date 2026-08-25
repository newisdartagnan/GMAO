#!/bin/sh
# Ouvre les créneaux d'inspection du jour.
#
# Appelé par le planificateur avant chaque prise de service. La route est
# idempotente : si les créneaux existent déjà, elle ne fait rien.
set -eu

API="${API_URL:-http://api:3001}"

if [ -z "${COMPTE_SERVICE:-}" ] || [ -z "${MOT_DE_PASSE_SERVICE:-}" ]; then
  echo "$(date '+%F %T') — compte de service non configuré, ouverture ignorée"
  exit 0
fi

JETON=$(curl -sS -X POST "$API/api/auth/connexion" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$COMPTE_SERVICE\",\"motDePasse\":\"$MOT_DE_PASSE_SERVICE\"}" \
  | sed -n 's/.*"jeton":"\([^"]*\)".*/\1/p')

if [ -z "$JETON" ]; then
  echo "$(date '+%F %T') — authentification refusée"
  exit 1
fi

REPONSE=$(curl -sS -X POST "$API/api/inspections/generer" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $JETON" \
  -d '{}')

echo "$(date '+%F %T') — $REPONSE"
