#!/usr/bin/env bash
# =====================================================================
#  Contrôle du fichier .env avant démarrage
#
#      ./scripts/verifier-configuration.sh
#
#  Docker Compose interpole tout le fichier avant de démarrer quoi que
#  ce soit : une variable manquante fait échouer la commande entière,
#  et le message se perd dans le défilement. Ce script dit ce qui
#  manque, en clair, avant d'en arriver là.
# =====================================================================
set -u

ENV_FICHIER="${1:-.env}"
manques=0
avertissements=0

rouge()  { printf '\033[31m%s\033[0m\n' "$*"; }
orange() { printf '\033[33m%s\033[0m\n' "$*"; }
vert()   { printf '\033[32m%s\033[0m\n' "$*"; }

if [ ! -f "$ENV_FICHIER" ]; then
  rouge "✘ $ENV_FICHIER est absent."
  echo "   cp .env.example .env"
  exit 1
fi

# Lecture sans exécuter le fichier : une valeur qui contient un espace ou
# un caractère de shell ne doit pas être interprétée.
lire() {
  sed -n "s/^[[:space:]]*$1=//p" "$ENV_FICHIER" | tail -1 | sed 's/[[:space:]]*$//'
}

exiger() {
  local nom="$1" role="$2" minimum="${3:-1}"
  local valeur; valeur="$(lire "$nom")"
  if [ -z "$valeur" ]; then
    rouge "✘ $nom est vide — $role"
    manques=$((manques + 1))
  elif [ "${#valeur}" -lt "$minimum" ]; then
    rouge "✘ $nom fait ${#valeur} caractères, $minimum au minimum — $role"
    manques=$((manques + 1))
  else
    vert "✔ $nom"
  fi
}

conseiller() {
  local nom="$1" role="$2"
  local valeur; valeur="$(lire "$nom")"
  if [ -z "$valeur" ]; then
    orange "• $nom non renseigné — $role"
    avertissements=$((avertissements + 1))
  else
    vert "✔ $nom"
  fi
}

echo
echo "Indispensable au démarrage de la pile"
echo "-------------------------------------"
exiger DB_PASSWORD "mot de passe du compte PostgreSQL de l'application" 8
exiger JWT_SECRET  "clé de signature des sessions" 16

echo
echo "Profil « admin » — docker compose --profile admin up -d"
echo "-------------------------------------------------------"
conseiller PGADMIN_PASSWORD "sans lui, pgAdmin refuse de démarrer (Adminer, lui, fonctionne)"

echo
echo "Formulaire externe de signalement"
echo "---------------------------------"
source_formulaire="$(lire FORMULAIRE_SOURCE)"
case "${source_formulaire:-aucune}" in
  microsoft)
    conseiller MSFORMS_MODE "« webhook » ou « graph »"
    if [ "$(lire MSFORMS_MODE)" = "graph" ]; then
      exiger MSFORMS_TENANT_ID "identifiant du locataire Microsoft 365" 10
      exiger MSFORMS_CLIENT_ID "identifiant de l'application inscrite" 10
      exiger MSFORMS_CLIENT_SECRET "secret de l'application inscrite" 10
      exiger MSFORMS_CLASSEUR "chemin du classeur des réponses" 3
    else
      exiger FORMULAIRE_SECRET_WEBHOOK "secret attendu sur l'appel de Power Automate" 16
    fi
    conseiller FORMULAIRE_URL "lien du formulaire, encodé dans le QR des étiquettes"
    ;;
  jotform)
    exiger JOTFORM_API_KEY "clé d'API JotForm" 10
    exiger JOTFORM_FORMULAIRE_ID "identifiant du formulaire" 6
    conseiller FORMULAIRE_URL "lien du formulaire, encodé dans le QR des étiquettes"
    ;;
  *)
    orange "• FORMULAIRE_SOURCE non renseigné — aucun formulaire branché,"
    orange "  l'application fonctionne normalement sans."
    avertissements=$((avertissements + 1))
    ;;
esac

echo
if [ "$manques" -gt 0 ]; then
  rouge "$manques réglage(s) manquant(s) : « docker compose up » échouera."
  exit 1
fi
if [ "$avertissements" -gt 0 ]; then
  orange "Rien ne bloque le démarrage ; $avertissements option(s) non utilisée(s)."
else
  vert "Configuration complète."
fi
exit 0
