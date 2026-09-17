#!/usr/bin/env bash
# =====================================================================
#  Mise à jour de la pile après un « git pull »
#
#      ./scripts/mettre-a-jour.sh
#
#  « docker compose up -d » ne reconstruit pas les images : il constate
#  que les conteneurs tournent et ne fait rien. Le code fraîchement
#  récupéré reste donc sur le disque sans jamais entrer dans la pile, et
#  l'application continue de servir l'ancienne version — sans le dire.
#
#  Ce script reconstruit, redémarre, et vérifie que les migrations du
#  dépôt sont bien celles qu'a la base.
# =====================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

rouge()  { printf '\033[31m%s\033[0m\n' "$*"; }
orange() { printf '\033[33m%s\033[0m\n' "$*"; }
vert()   { printf '\033[32m%s\033[0m\n' "$*"; }
titre()  { printf '\n\033[1m%s\033[0m\n%s\n' "$1" "$(printf '%.0s-' $(seq 1 ${#1}))"; }

compose() { docker compose "$@"; }

# ---------------------------------------------------------------------
titre "1. Configuration"
if [ -x ./scripts/verifier-configuration.sh ]; then
  ./scripts/verifier-configuration.sh || exit 1
else
  orange "scripts/verifier-configuration.sh introuvable, contrôle sauté."
fi

# ---------------------------------------------------------------------
titre "2. Reconstruction des images"
echo "Le code récupéré n'entre dans la pile que par une reconstruction."
if ! compose build api web; then
  rouge "✘ La construction a échoué. Rien n'a été redémarré, la pile tourne toujours."
  exit 1
fi
vert "✔ Images reconstruites"

# ---------------------------------------------------------------------
titre "3. Redémarrage"
# « up -d » suffit maintenant que les images ont changé : Compose recrée
# les conteneurs dont l'image ne correspond plus.
if ! compose up -d; then
  rouge "✘ Le démarrage a échoué. Voir : docker compose logs --tail=50"
  exit 1
fi

printf 'Attente de l’API'
pret=""
for _ in $(seq 1 60); do
  if compose exec -T api node -e \
       "fetch('http://127.0.0.1:3001/api/sante').then(r=>r.json()).then(d=>process.exit(d.statut==='pret'?0:1)).catch(()=>process.exit(1))" \
       >/dev/null 2>&1; then
    pret="oui"; break
  fi
  printf '.'; sleep 2
done
printf '\n'
if [ -n "$pret" ]; then
  vert "✔ API démarrée"
else
  # Sans abandonner : le contrôle des migrations qui suit dit mieux que ce
  # sondage ce qui ne va pas, et l'abandonner ici priverait du diagnostic.
  orange "• L’API n’a pas répondu au bout de deux minutes — on poursuit le diagnostic."
  echo "    docker compose logs api --tail=60"
fi

# ---------------------------------------------------------------------
titre "4. Migrations"
# Les migrations s'appliquent au démarrage de l'API, depuis l'image. Si
# le dépôt en contient une que la base n'a pas, c'est que l'image servie
# n'est pas celle du dépôt — le symptôme d'une reconstruction oubliée.
attendues="$(ls api/migrations/*.sql 2>/dev/null | xargs -n1 basename 2>/dev/null | sort)"
appliquees="$(compose exec -T db psql -U "${DB_USER:-gmao}" -d "${DB_NAME:-gmao}" -Atc \
  'SELECT version FROM schema_migrations ORDER BY version' 2>/dev/null | tr -d '\r' | sort)"

if [ -z "$appliquees" ]; then
  rouge "✘ Impossible de lire les migrations appliquées."
  echo "   docker compose logs db --tail=30"
  exit 1
fi

# comm exige des entrées triées ; les deux listes le sont déjà.
manquantes="$(comm -23 <(printf '%s\n' "$attendues") <(printf '%s\n' "$appliquees"))"
if [ -n "$manquantes" ]; then
  rouge "✘ La base n’a pas toutes les migrations du dépôt :"
  echo "$manquantes" | sed 's/^/     /'
  echo
  echo "   L’API servie n’est pas celle du dépôt. Forcer la reconstruction :"
  echo "     docker compose build --no-cache api && docker compose up -d api"
  exit 1
fi
vert "✔ $(echo "$attendues" | wc -l | tr -d ' ') migration(s), toutes appliquées"

# ---------------------------------------------------------------------
titre "5. Commandes d'administration"
# Vérifier qu'un script figure au package.json ne prouve rien : il peut y
# être et ne pas pouvoir s'exécuter, faute de l'outil qu'il appelle. On le
# lance donc pour de vrai — « lancer.mjs » sans argument se contente
# d'afficher son usage et de sortir.
if compose exec -T api node api/lancer.mjs 2>&1 | grep -q 'Usage'; then
  vert "✔ Les commandes d'administration répondent"
  echo "    docker compose exec api npm run lier-microsoft   --workspace=api"
  echo "    docker compose exec api npm run trouver-classeur --workspace=api"
else
  rouge "✘ Les commandes d'administration ne répondent pas dans le conteneur."
  echo "   Image trop ancienne : docker compose build --no-cache api && docker compose up -d api"
  exit 1
fi

titre "Terminé"
port="$(sed -n 's/^[[:space:]]*WEB_PORT=//p' .env 2>/dev/null | tail -1 | tr -d '\r')"
echo "Interface : http://localhost:${port:-8080}"
echo
echo "Si le connecteur Microsoft n’est pas encore autorisé :"
echo "    docker compose exec api npm run lier-microsoft --workspace=api"
