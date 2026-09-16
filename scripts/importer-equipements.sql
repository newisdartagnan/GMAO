-- =====================================================================
--  Import de l'inventaire réel depuis un fichier CSV
--
--  À utiliser après avoir vidé le jeu de démonstration
--  (scripts/purger-donnees.sql, niveau 2) pour charger le parc de
--  l'établissement.
--
--  Le fichier CSV désigne les rattachements par leurs codes métier —
--  ceux que les agents connaissent — et non par des identifiants
--  internes. La correspondance est faite ici : rien à recopier à la
--  main, et une ligne qui désigne un service inexistant est signalée
--  au lieu d'être avalée en silence.
--
--  PRÉALABLE — les référentiels doivent exister :
--      familles, sites, bâtiments, locaux, services.
--  Ils se saisissent depuis pgAdmin ou se chargent par le même procédé.
--
--  DÉROULÉ
--    1. Préparer le CSV (modèle : scripts/modele-equipements.csv)
--    2. Le déposer dans le dossier « sauvegardes/ » du dépôt : il est
--       monté dans le conteneur pgAdmin sous « echanges ».
--    3. Ouvrir ce fichier dans pgAdmin (Query Tool) et l'exécuter en
--       entier. Rien n'est écrit tant que le COMMIT final est commenté.
--    4. Lire le rapport, corriger le CSV, recommencer.
--    5. Décommenter COMMIT, commenter ROLLBACK, réexécuter.
--    6. Dans l'application : Paramètres › Base de données ›
--       « Recharger depuis la base ».
-- =====================================================================

BEGIN;

-- Ce script s'appuie sur « est_date_iso », apportée par la migration 004.
-- Sur une pile qui n'a pas été reconstruite depuis le dernier git pull, elle
-- manque : autant le dire ici plutôt que d'échouer au milieu de l'insertion.
DO $prealable$
BEGIN
  IF to_regprocedure('public.est_date_iso(text)') IS NULL THEN
    RAISE EXCEPTION 'Migrations incomplètes : la fonction est_date_iso manque. Lancez ./scripts/mettre-a-jour.sh, puis recommencez.';
  END IF;
END
$prealable$;

DROP TABLE IF EXISTS import_equipements;

CREATE TEMP TABLE import_equipements (
  code                 text,
  designation          text,
  famille_code         text,
  marque               text,
  modele               text,
  numero_serie         text,
  classe_dm            text,   -- non_dm | I | IIa | IIb | III
  criticite            text,   -- 1 à 4 (1 = vital)
  local_code           text,
  service_code         text,
  date_acquisition     text,   -- AAAA-MM-JJ
  date_mise_en_service text,   -- AAAA-MM-JJ
  valeur_achat         text,
  fin_garantie         text,
  risque_infectieux    text,   -- oui / non
  notes                text
);

-- --------------------------------------------------------------------
--  CHARGEMENT DU FICHIER
--
--  Depuis pgAdmin : clic droit sur la table « import_equipements » ›
--  Import/Export Data › fichier /var/lib/pgadmin/storage/echanges/....
--
--  Depuis psql, décommenter la ligne ci-dessous :
-- \copy import_equipements FROM 'equipements.csv' WITH (FORMAT csv, HEADER true)
-- --------------------------------------------------------------------

-- --------------------------------------------------------------------
--  CONTRÔLES — à lire avant d'écrire quoi que ce soit
-- --------------------------------------------------------------------
SELECT 'lignes lues' AS controle, count(*)::text AS valeur FROM import_equipements
UNION ALL
SELECT 'code vide', count(*)::text FROM import_equipements WHERE coalesce(trim(code), '') = ''
UNION ALL
SELECT 'codes en double dans le fichier', count(*)::text
  FROM (SELECT code FROM import_equipements GROUP BY code HAVING count(*) > 1) d
UNION ALL
SELECT 'codes déjà présents dans la base', count(*)::text
  FROM import_equipements i WHERE EXISTS (SELECT 1 FROM equipements e WHERE e.code = i.code)
UNION ALL
SELECT 'famille inconnue : ' || coalesce(i.famille_code, '(vide)'), count(*)::text
  FROM import_equipements i
 WHERE NOT EXISTS (SELECT 1 FROM familles f WHERE f.code = i.famille_code)
 GROUP BY i.famille_code
UNION ALL
SELECT 'local inconnu : ' || coalesce(i.local_code, '(vide)'), count(*)::text
  FROM import_equipements i
 WHERE NOT EXISTS (SELECT 1 FROM locaux l WHERE l.code = i.local_code)
 GROUP BY i.local_code
UNION ALL
SELECT 'service inconnu : ' || coalesce(i.service_code, '(vide)'), count(*)::text
  FROM import_equipements i
 WHERE NOT EXISTS (SELECT 1 FROM services s WHERE s.code = i.service_code)
 GROUP BY i.service_code
UNION ALL
SELECT 'date non exploitable', count(*)::text
  FROM import_equipements i
 WHERE NOT est_date_iso(i.date_acquisition) OR NOT est_date_iso(i.date_mise_en_service)
UNION ALL
SELECT 'criticité hors 1-4', count(*)::text
  FROM import_equipements i WHERE i.criticite !~ '^[1-4]$';

-- --------------------------------------------------------------------
--  ÉCRITURE
--
--  Seules les lignes complètes et cohérentes passent : celles qui ont
--  été signalées plus haut sont laissées de côté, à corriger dans le
--  CSV pour un second passage.
-- --------------------------------------------------------------------
INSERT INTO equipements (
  id, code, designation, famille_id, domaine, marque, modele, numero_serie,
  classe_dm, marquage_ce, soumis_vigilance, site_id, batiment_id, local_id, service_id,
  statut, criticite, date_acquisition, date_mise_en_service, valeur_achat,
  duree_amortissement_ans, fin_garantie, compteurs, risque_infectieux,
  objectif_disponibilite, notes, qr_token, actif
)
SELECT
  'eqp_' || lower(replace(i.code, ' ', '_')),
  trim(i.code),
  trim(i.designation),
  f.id,
  f.domaine,
  coalesce(trim(i.marque), ''),
  coalesce(trim(i.modele), ''),
  coalesce(trim(i.numero_serie), ''),
  coalesce(nullif(trim(i.classe_dm), ''), 'non_dm'),
  -- Un dispositif médical de classe IIa ou plus porte un marquage CE :
  -- l'hypothèse est raisonnable et se corrige équipement par équipement.
  coalesce(nullif(trim(i.classe_dm), ''), 'non_dm') IN ('I', 'IIa', 'IIb', 'III'),
  coalesce(nullif(trim(i.classe_dm), ''), 'non_dm') IN ('IIb', 'III'),
  l.site_id,
  l.batiment_id,
  l.id,
  s.id,
  'en_service',
  i.criticite::smallint,
  i.date_acquisition,
  i.date_mise_en_service,
  coalesce(nullif(replace(trim(i.valeur_achat), ',', '.'), ''), '0')::numeric,
  f.duree_vie_ans,
  nullif(trim(i.fin_garantie), ''),
  '[]'::jsonb,
  lower(coalesce(trim(i.risque_infectieux), 'non')) IN ('oui', 'o', 'true', '1'),
  CASE i.criticite WHEN '1' THEN 99 WHEN '2' THEN 97 WHEN '3' THEN 95 ELSE 90 END,
  nullif(trim(i.notes), ''),
  'QR-' || upper(trim(i.code)),
  true
FROM import_equipements i
JOIN familles f ON f.code = i.famille_code
JOIN locaux   l ON l.code = i.local_code
JOIN services s ON s.code = i.service_code
WHERE coalesce(trim(i.code), '') <> ''
  AND i.criticite ~ '^[1-4]$'
  AND est_date_iso(i.date_acquisition)
  AND est_date_iso(i.date_mise_en_service)
  AND NOT EXISTS (SELECT 1 FROM equipements e WHERE e.code = trim(i.code))
ON CONFLICT (code) DO NOTHING;

-- Ce qui vient d'être écrit.
SELECT count(*) AS equipements_en_base FROM equipements;
SELECT * FROM v_coherence WHERE gravite = 'bloquant';

-- --------------------------------------------------------------------
--  Tant que ROLLBACK est actif, cette exécution ne laisse aucune trace.
--  Quand le rapport est propre : commenter ROLLBACK, décommenter COMMIT.
-- --------------------------------------------------------------------
ROLLBACK;
-- COMMIT;
