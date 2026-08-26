#!/bin/sh
# Restauration d'une sauvegarde.
#
#   ./scripts/restaurer.sh gmao-20260825-1830.dump
#
# ATTENTION : le contenu actuel de la base est remplacé. Arrêter l'API avant,
# et la relancer après, pour qu'elle relise l'état restauré.
set -eu

if [ $# -ne 1 ]; then
  echo "Usage : $0 <fichier.dump présent dans ./sauvegardes>"
  exit 1
fi

FICHIER="/sauvegardes/$1"

echo "Arrêt de l'API…"
docker compose stop api

echo "Restauration de $1…"
docker compose exec -T db sh -c \
  "pg_restore -U \"\${POSTGRES_USER}\" -d \"\${POSTGRES_DB}\" --clean --if-exists --no-owner '$FICHIER'"

echo "Redémarrage de l'API…"
docker compose start api

echo "Restauration terminée."
