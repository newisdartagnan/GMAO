-- =====================================================================
--  Référentiel de départ — réseau Monkole
--
--  Les vingt lieux et les neuf secteurs du formulaire de signalement en
--  service, créés dans la GMAO pour que les réponses s'y rattachent.
--
--  Sans cela, une réponse qui indique « MKL2 » n'est qu'un texte : la
--  demande revient au service par défaut, et le tri par site ne dit
--  rien. Avec, elle arrive dans le bon service dès son import.
--
--  Ce n'est qu'un point de départ. Les lieux sont créés à plat, un
--  service et un bâtiment chacun, parce que la liste du formulaire ne
--  dit pas lesquels sont des sites distincts et lesquels sont des
--  bâtiments du campus. À réorganiser depuis pgAdmin une fois la
--  structure réelle arrêtée — les identifiants sont stables, rien ne
--  se casse à renommer.
--
--  Le script est rejouable : ce qui existe déjà n'est pas touché.
--
--  DÉROULÉ
--    1. Exécuter tel quel : le COMMIT est commenté, rien n'est écrit,
--       le récapitulatif final montre ce qui serait créé.
--    2. Décommenter COMMIT, commenter ROLLBACK, réexécuter.
--    3. Dans l'application : Paramètres › Base de données ›
--       « Recharger depuis la base ».
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
--  Site porteur
-- ---------------------------------------------------------------------
INSERT INTO sites (id, code, nom, adresse, ville, province, type, nb_lits, actif)
VALUES ('site_monkole', 'MONKOLE', 'Réseau Monkole',
        'À renseigner', 'Kinshasa', 'Kinshasa', 'hopital', 0, true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
--  Les vingt lieux du formulaire
--
--  Chaque lieu devient un service et un bâtiment de même nom, plus un
--  local générique : c'est ce qui permet à « Lieu » et « Salle de lieu »
--  de se rattacher dès l'import, avant même que l'inventaire soit saisi.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE lieux_monkole (code text, nom text, ordre serial) ON COMMIT DROP;

INSERT INTO lieux_monkole (code, nom) VALUES
  ('CHME',      'CHME'),
  ('MKL2',      'MKL2'),
  ('MKL3',      'MKL3'),
  ('MKL-GOMBE', 'MKL - Gombe'),
  ('CEFA-MKL1', 'CEFA MKL1'),
  ('GARAGE',    'Base Garage'),
  ('DECOMA',    'Decoma'),
  ('MORGUE',    'Morgue'),
  ('NGEBA-FOR', 'Ngeba Forage'),
  ('NGEBA-HSE', 'Ngeba House'),
  ('CECFOR',    'CECFOR Santé SP'),
  ('KIMBONDO',  'Kimbondo'),
  ('KINVULA',   'Kinvula'),
  ('MOLUKA',    'Moluka'),
  ('OLOMA',     'Oloma'),
  ('ELIBA',     'Eliba'),
  ('PARKING',   'Parking'),
  ('TGBT',      'TGBT'),
  ('IMAGERIE',  'Imagerie'),
  ('RDC',       'RDC');

INSERT INTO services (id, code, nom, pole, site_id, responsable, criticite, continuite24_7)
SELECT 'srv_mkl_' || lower(replace(l.code, '-', '_')), l.code, l.nom,
       'Réseau Monkole', 'site_monkole', 'À renseigner',
       -- Sans information sur la criticité réelle, tout est en « importante » :
       -- une criticité inventée orienterait les priorités à tort.
       2, false
FROM lieux_monkole l
ON CONFLICT (id) DO NOTHING;

INSERT INTO batiments (id, site_id, code, nom, nb_etages, annee_construction)
SELECT 'bat_mkl_' || lower(replace(l.code, '-', '_')), 'site_monkole', l.code, l.nom, 1, NULL
FROM lieux_monkole l
ON CONFLICT (id) DO NOTHING;

INSERT INTO locaux (id, site_id, batiment_id, service_id, etage, code, nom,
                    zone_risque, surface_m2, acces_controle)
SELECT 'loc_mkl_' || lower(replace(l.code, '-', '_')),
       'site_monkole',
       'bat_mkl_' || lower(replace(l.code, '-', '_')),
       'srv_mkl_' || lower(replace(l.code, '-', '_')),
       'RDC', l.code || '-GEN', l.nom || ' — local non précisé',
       'zone2_moyen', NULL, false
FROM lieux_monkole l
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
--  Les neuf secteurs, en équipes
--
--  Le secteur déclaré sur le formulaire présélectionne l'équipe au
--  moment de créer l'ordre de travail. « Autres » n'a pas d'équipe :
--  c'est un arbitrage qui revient au responsable.
-- ---------------------------------------------------------------------
INSERT INTO equipes (id, code, nom, domaine, responsable_id, site_id, heures_hebdo, astreinte)
SELECT v.id, v.code, v.nom, v.domaine,
       -- Le responsable est repris du premier compte de rôle adéquat ; à
       -- corriger service par service depuis Paramètres → Comptes.
       (SELECT u.id FROM utilisateurs u
         WHERE u.actif AND u.role IN ('responsable_technique', 'responsable_biomedical', 'admin')
         ORDER BY CASE u.role WHEN 'responsable_technique' THEN 1
                              WHEN 'responsable_biomedical' THEN 2 ELSE 3 END
         LIMIT 1),
       'site_monkole', 40, v.astreinte
FROM (VALUES
  ('eqp_mkl_plomberie',  'PLOMB', 'Plomberie',    'technique_batiment', true),
  ('eqp_mkl_electricite','ELEC',  'Électricité',  'technique_batiment', true),
  ('eqp_mkl_clim',       'CLIM',  'Climatisation','technique_batiment', false),
  ('eqp_mkl_gaz',        'GAZMED','Gaz médicaux', 'fluides_medicaux',   true),
  ('eqp_mkl_biomed',     'BIOMED','Biomédical',   'biomedical',         true),
  ('eqp_mkl_menuiserie', 'MENUI', 'Menuiserie',   'technique_batiment', false),
  ('eqp_mkl_maconnerie', 'MACON', 'Maçonnerie',   'technique_batiment', false),
  ('eqp_mkl_it',         'IT',    'It/réseau',    'informatique',       false)
) AS v(id, code, nom, domaine, astreinte)
WHERE EXISTS (SELECT 1 FROM utilisateurs WHERE actif)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
--  Récapitulatif
-- ---------------------------------------------------------------------
SELECT 'services créés'  AS objet, count(*)::text AS nombre FROM services  WHERE id LIKE 'srv_mkl_%'
UNION ALL SELECT 'bâtiments créés', count(*)::text FROM batiments WHERE id LIKE 'bat_mkl_%'
UNION ALL SELECT 'locaux créés',    count(*)::text FROM locaux    WHERE id LIKE 'loc_mkl_%'
UNION ALL SELECT 'équipes créées',  count(*)::text FROM equipes   WHERE id LIKE 'eqp_mkl_%';

SELECT * FROM v_coherence WHERE gravite = 'bloquant';

-- Remplacer par COMMIT une fois le récapitulatif vérifié.
ROLLBACK;
-- COMMIT;
