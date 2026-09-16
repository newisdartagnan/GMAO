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
    mode="$(lire MSFORMS_MODE)"
    if [ "${mode:-graph}" = "graph" ]; then
      exiger MSFORMS_CLIENT_ID "identifiant de l'application inscrite dans Entra ID" 10
      exiger MSFORMS_CLASSEUR "emplacement du classeur des réponses" 3
      case "$(lire MSFORMS_CLASSEUR)" in
        me:*|item:*|drive:*|site:*|'') ;;
        # Laissé pour mémoire : les quatre formes valides commencent toutes
        # par un préfixe. Un chemin nu est l'erreur la plus fréquente.
        *) rouge "✘ MSFORMS_CLASSEUR doit commencer par me: / item: / drive: / site:"
           manques=$((manques + 1)) ;;
      esac
      if [ "$(lire MSFORMS_AUTH)" = "application" ]; then
        exiger MSFORMS_TENANT_ID "identifiant du locataire Microsoft 365" 10
        exiger MSFORMS_CLIENT_SECRET "secret de l'application inscrite" 10
      else
        if [ -n "$(lire MSFORMS_CLIENT_SECRET)" ]; then
          orange "• MSFORMS_CLIENT_SECRET est renseigné en flux délégué — un client"
          orange "  public n'a pas de secret, et l'envoyer fait refuser l'échange."
          avertissements=$((avertissements + 1))
        fi
        orange "• L'autorisation s'obtient à part, une seule fois :"
        orange "    docker compose exec api npm run lier-microsoft --workspace=api"
      fi
      if [ -z "$(lire MSFORMS_CLASSEUR)" ]; then
        orange "• MSFORMS_CLASSEUR se trouve après l'autorisation, sans le saisir :"
        orange "    docker compose exec api npm run trouver-classeur --workspace=api"
      fi
      if [ "$(lire MSFORMS_PORTEE)" = "Files.Read" ] && \
         case "$(lire MSFORMS_CLASSEUR)" in drive:*:item:*) true ;; *) false ;; esac; then
        orange "• Le classeur appartient à un autre compte, mais MSFORMS_PORTEE"
        orange "  vaut Files.Read, qui ne couvre que vos propres fichiers."
        orange "  Mettez Files.Read.All, puis relancez lier-microsoft."
        avertissements=$((avertissements + 1))
      fi
      if true; then :
      fi
    else
      exiger FORMULAIRE_SECRET_WEBHOOK "secret attendu sur l'appel entrant" 16
      orange "• MSFORMS_MODE=webhook suppose deux choses :"
      orange "    — un serveur joignable depuis Internet ;"
      orange "    — l'action HTTP de Power Automate, qui est un connecteur payant"
      orange "      et n'existe pas sur un compte Microsoft personnel."
      orange "  Pour lire le classeur que Forms remplit de lui-même, sans licence"
      orange "  ni adresse publique : MSFORMS_MODE=graph."
      avertissements=$((avertissements + 1))
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
  # DB_PASSWORD et JWT_SECRET arrêtent Compose lui-même ; les autres
  # n'empêchent que le connecteur de fonctionner. Le dire tel quel évite de
  # chercher une panne de démarrage qui n'existe pas.
  if [ -z "$(lire DB_PASSWORD)" ] || [ -z "$(lire JWT_SECRET)" ]; then
    rouge "$manques réglage(s) à corriger, dont un indispensable : « docker compose up » échouera."
  else
    rouge "$manques réglage(s) à corriger — la pile démarrera, le connecteur ne fonctionnera pas."
  fi
  exit 1
fi
if [ "$avertissements" -gt 0 ]; then
  orange "Rien ne bloque le démarrage ; $avertissements option(s) non utilisée(s)."
else
  vert "Configuration complète."
fi
exit 0
