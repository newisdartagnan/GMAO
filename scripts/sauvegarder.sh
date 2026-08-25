#!/bin/sh
# Sauvegarde de la base, à lancer depuis le serveur qui héberge la pile.
#
#   ./scripts/sauvegarder.sh
#
# Le fichier produit est un dump compressé, restaurable par pg_restore. Il
# atterrit dans ./sauvegardes, monté dans le conteneur de base de données.
# Prévoir une copie sur support externe : une sauvegarde qui reste sur le
# même disque que la base ne protège de rien.
set -eu

HORODATAGE=$(date '+%Y%m%d-%H%M')
FICHIER="/sauvegardes/gmao-${HORODATAGE}.dump"

docker compose exec -T db sh -c \
  "pg_dump -U \"\${POSTGRES_USER}\" -d \"\${POSTGRES_DB}\" --format=custom --compress=9 --file='$FICHIER'"

echo "Sauvegarde écrite dans ./sauvegardes/gmao-${HORODATAGE}.dump"

# Rétention : on garde les trente dernières.
docker compose exec -T db sh -c \
  "ls -1t /sauvegardes/gmao-*.dump 2>/dev/null | tail -n +31 | xargs -r rm --"
