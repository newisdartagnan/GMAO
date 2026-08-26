-- =====================================================================
--  Purge des données, pour repartir sur les données réelles de l'hôpital
--
--  À exécuter dans pgAdmin (ou psql) sur la base « gmao ».
--  Deux niveaux au choix : décommenter celui qui convient.
--
--  APRÈS EXÉCUTION : redémarrer l'API, ou lui demander de relire les
--  tables si elle est restée allumée — sans quoi elle continue de servir
--  l'ancien état depuis sa mémoire —
--      docker compose start api
--  ou  Paramètres → Base de données → Recharger depuis la base
--  ou  curl -X POST http://localhost:8080/api/admin/recharger \
--           -H "Authorization: Bearer <jeton>"
-- =====================================================================

-- ---------------------------------------------------------------------
--  AVANT DE COMMENCER
--
--  1. Arrêter l'API le temps de l'opération, sinon elle continue
--     d'écrire par-dessus depuis sa copie en mémoire :
--         docker compose stop api
--  2. Sauvegarder. Une purge ne se rattrape pas :
--         ./scripts/sauvegarder.sh
--  3. Le jeu de démonstration ne reviendra pas de lui-même : la trace
--     du peuplement initial est conservée dans la table
--     « installation », que cette purge ne touche pas.
-- ---------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------
--  NIVEAU 1 — Effacer l'activité, garder le référentiel
--
--  Supprime l'historique d'exploitation (interventions, rondes, stocks,
--  vigilance) mais conserve les sites, services, locaux, familles,
--  équipements, fournisseurs, gammes et comptes. Utile pour repartir
--  proprement une fois le paramétrage validé.
-- ---------------------------------------------------------------------

-- TRUNCATE
--   releves_inspection, rondes,
--   releves, capteurs,
--   mouvements_stock, lots, bons_commande,
--   visites_controle, vigilances, rappels,
--   ordres_travail, demandes,
--   mouvements_equipement,
--   journal_audit, alertes, documents
-- RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------
--  NIVEAU 2 — Tout effacer, y compris le référentiel et les comptes
--
--  Ne laisse que le schéma. Il faudra recréer au minimum un site, un
--  service, un local, une famille et un compte administrateur avant que
--  l'application soit utilisable.
--
--  Les tables sont listées dans l'ordre inverse des dépendances ; le
--  CASCADE de TRUNCATE s'en charge de toute façon.
-- ---------------------------------------------------------------------

-- TRUNCATE
--   releves_inspection, rondes, modeles_inspection,
--   releves, capteurs, alertes,
--   mouvements_stock, lots, bons_commande, articles, magasins,
--   visites_controle, controles, vigilances, rappels,
--   ordres_travail, demandes, gammes,
--   mouvements_equipement, equipements, contrats, familles, fournisseurs,
--   habilitations, utilisateurs, equipes,
--   locaux, services, batiments, sites,
--   documents, journal_audit, budgets,
--   integrations_etat
-- RESTART IDENTITY CASCADE;
--
--  « schema_migrations » ne figure pas dans cette liste et ne doit jamais
--  y figurer : la vider ferait rejouer toutes les migrations au prochain
--  démarrage, sur un schéma qui existe déjà.

-- ---------------------------------------------------------------------
--  Vérification avant de valider : toutes les tables visées doivent être
--  à 0. Le comptage est réel — les statistiques de pg_stat_user_tables
--  ne sont pas rafraîchies à l'intérieur d'une transaction et
--  afficheraient encore les anciens totaux.
-- ---------------------------------------------------------------------
SELECT
  t.table_name AS "table",
  (xpath(
     '/row/c/text()',
     query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.table_name), false, true, '')
   ))[1]::text::bigint AS lignes
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY 2 DESC, 1;

-- Remplacer par COMMIT une fois le résultat vérifié.
ROLLBACK;
