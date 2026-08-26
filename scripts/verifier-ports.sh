#!/usr/bin/env bash
# Vérifie que les ports de la pile sont libres avant « docker compose up ».
#
#   ./scripts/verifier-ports.sh
#
# Un port déjà pris fait échouer le démarrage avec « port is already
# allocated », après plusieurs minutes de construction d'images. Autant le
# savoir avant.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Aucun fichier .env — copier .env.example d'abord :"
  echo "    cp .env.example .env"
  exit 1
fi

# Lecture d'une variable du .env sans exécuter le fichier.
lire() {
  local valeur
  valeur=$(grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d "\"'" || true)
  [ -n "$valeur" ] && echo "$valeur" || echo "$2"
}

WEB=$(lire WEB_PORT 8080)
DB=$(lire DB_PORT_HOTE 5434)
API=$(lire API_PORT_HOTE 3001)
ADMINER=$(lire ADMINER_PORT 8081)

# Une seule méthode de détection, choisie une fois. Si aucune n'est
# disponible, il faut le dire plutôt que d'annoncer « libre » : un outil de
# diagnostic qui se tait sur son ignorance est pire que pas d'outil.
if command -v ss >/dev/null 2>&1 && ss -tln >/dev/null 2>&1; then
  METHODE=ss
elif command -v netstat >/dev/null 2>&1 && netstat -tln >/dev/null 2>&1; then
  METHODE=netstat
elif command -v lsof >/dev/null 2>&1; then
  METHODE=lsof
elif command -v nc >/dev/null 2>&1; then
  METHODE=nc
else
  # /dev/tcp est une extension bash : disponible ici puisque ce script
  # s'exécute sous bash.
  METHODE=bash
fi

occupe() {
  local port="$1"
  case "$METHODE" in
    ss)      ss -tln 2>/dev/null | grep -qE "[:.]${port}[[:space:]]" ;;
    netstat) netstat -tln 2>/dev/null | grep -qE "[:.]${port}[[:space:]]" ;;
    lsof)    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 ;;
    nc)      nc -z 127.0.0.1 "$port" >/dev/null 2>&1 ;;
    bash)    (exec 3<>"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1 ;;
  esac
}

# Qui tient le port : un conteneur, ou un service de la machine.
qui() {
  local port="$1" detail=""
  if command -v docker >/dev/null 2>&1; then
    detail=$(docker ps --format '{{.Names}} → {{.Ports}}' 2>/dev/null | grep ":${port}->" || true)
    if [ -n "$detail" ]; then
      echo "        conteneur : $detail"
      return
    fi
  fi
  case "$METHODE" in
    ss)      detail=$(ss -tlnp 2>/dev/null | grep -E "[:.]${port}[[:space:]]" | head -n1 || true) ;;
    netstat) detail=$(netstat -tlnp 2>/dev/null | grep -E "[:.]${port}[[:space:]]" | head -n1 || true) ;;
    lsof)    detail=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | sed -n '2p' || true) ;;
  esac
  [ -n "$detail" ] && echo "        $detail"
}

conflits=0
verifier() {
  local nom="$1" port="$2" variable="$3"
  if occupe "$port"; then
    printf '  ✗ %-24s port %-6s DÉJÀ UTILISÉ\n' "$nom" "$port"
    qui "$port"
    echo "        → changer $variable dans .env"
    conflits=$((conflits + 1))
  else
    printf '  ✓ %-24s port %-6s libre\n' "$nom" "$port"
  fi
}

echo "Vérification des ports de la pile GMAO (méthode : $METHODE)"
echo
verifier "Interface web"           "$WEB"     WEB_PORT
verifier "PostgreSQL"              "$DB"      DB_PORT_HOTE
verifier "API"                     "$API"     API_PORT_HOTE
verifier "Adminer (profil admin)"  "$ADMINER" ADMINER_PORT
echo

if [ "$conflits" -gt 0 ]; then
  echo "$conflits conflit(s) à régler dans .env avant « docker compose up -d »."
  echo "Ces ports ne servent qu'à joindre la pile depuis le poste : les changer"
  echo "n'a aucune incidence sur le fonctionnement interne."
  exit 1
fi

echo "Tous les ports sont libres."
