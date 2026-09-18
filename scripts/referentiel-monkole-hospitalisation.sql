-- =====================================================================
--  Référentiel Monkole — hospitalisation (CHME)
--
--  Les huit services d'hospitalisation, leurs 45 chambres et les 23
--  appareils biomédicaux qui s'y trouvent.
--
--  POURQUOI CE SCRIPT
--
--  Une réponse du formulaire qui dit « Lieu : CHME / Salle : Ch 104 »
--  n'est que du texte tant que la chambre 104 n'existe pas dans la
--  GMAO : la demande revient au service par défaut, sans localisation,
--  et le technicien doit deviner où aller. Avec ces chambres, elle
--  arrive dans le bon service dès son import.
--
--  CE QUI EST CRÉÉ, ET CE QUI NE L'EST PAS
--
--  Les chambres deviennent des LOCAUX. Les couveuses et les tables —
--  23 appareils — deviennent des ÉQUIPEMENTS, parce qu'ils tombent en
--  panne, se réparent et méritent un historique.
--
--  Les lits, berceaux et box ne deviennent rien : ce sont des places
--  dans une chambre. Leur nombre est noté sur la chambre. Créer 130
--  fiches d'équipement sans marque, sans numéro de série et sans date
--  d'achat remplirait l'inventaire de coquilles vides et fausserait
--  tous les indicateurs de parc. Le jour où ces lits sont inventoriés
--  pour de bon, ils s'ajouteront avec leurs vraies données.
--
--  Les appareils créés portent une marque et un numéro de série vides,
--  et une date d'acquisition inconnue. C'est assumé : mieux vaut une
--  fiche à compléter qu'une fiche inventée. Elles ressortent dans
--  Parc d'équipements › filtre « à compléter ».
--
--  PRÉREQUIS
--
--  Le site et le bâtiment CHME, créés par referentiel-monkole.sql. Ce
--  script les crée au besoin, il peut donc se passer tout seul.
--
--  DÉROULÉ
--    1. Sauvegarder :  ./scripts/sauvegarder.sh
--    2. Exécuter tel quel : le COMMIT est commenté, rien n'est écrit,
--       le récapitulatif final montre ce qui serait créé.
--    3. Décommenter COMMIT, commenter ROLLBACK, réexécuter.
--    4. Dans l'application : Paramètres › Base de données ›
--       « Recharger depuis la base ».
--
--  Rejouable : ce qui existe déjà n'est pas touché.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
--  Site et bâtiment porteurs
-- ---------------------------------------------------------------------
INSERT INTO sites (id, code, nom, adresse, ville, province, type, nb_lits, actif)
VALUES ('site_monkole', 'MONKOLE', 'Réseau Monkole',
        'À renseigner', 'Kinshasa', 'Kinshasa', 'hopital', 0, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO batiments (id, site_id, code, nom, nb_etages)
VALUES ('bat_CHME', 'site_monkole', 'CHME', 'CHME', 4)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
--  Les huit services d'hospitalisation
--
--  La criticité et la continuité 24/7 décident des délais attendus sur
--  une intervention. Réanimation, urgences, néonatologie et soins
--  intensifs sont en criticité 1 : une panne y touche des patients qui
--  ne peuvent pas être déplacés.
-- ---------------------------------------------------------------------
INSERT INTO services (id, code, nom, pole, site_id, responsable, criticite, continuite24_7) VALUES
  ('srv_mkl_chir', 'CHIR', 'Chirurgie', 'Plateau technique', 'site_monkole', 'À désigner', 2, false),
  ('srv_mkl_gyno', 'GYNO', 'Gynéco-Obstétrique', 'Femme-enfant', 'site_monkole', 'À désigner', 1, true),
  ('srv_mkl_medi', 'MEDI', 'Médecine interne', 'Médecine', 'site_monkole', 'À désigner', 2, false),
  ('srv_mkl_neon', 'NEON', 'Néonatologie', 'Femme-enfant', 'site_monkole', 'À désigner', 1, true),
  ('srv_mkl_pedi', 'PEDI', 'Pédiatrie', 'Femme-enfant', 'site_monkole', 'À désigner', 2, true),
  ('srv_mkl_rea', 'REA', 'Réanimation', 'Soins critiques', 'site_monkole', 'À désigner', 1, true),
  ('srv_mkl_sipe', 'SIPE', 'Soins intensifs pédiatriques', 'Soins critiques', 'site_monkole', 'À désigner', 1, true),
  ('srv_mkl_urg', 'URG', 'Urgences', 'Soins critiques', 'site_monkole', 'À désigner', 1, true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
--  Les 45 chambres
--
--  Le CODE est ce que la GMAO compare à la « Salle de lieu » du
--  formulaire. La comparaison retire d'elle-même le mot qui nomme la
--  salle : « Ch 104 », « chambre 104 » et « 104 » tombent sur la même
--  chambre.
--
--  Le NOM reste ce que l'hôpital écrit, sans rien y ajouter : un suffixe
--  dans le nom — « Chambre 104 — 2 places » — empêcherait justement ce
--  rapprochement. Le nombre de places est en commentaire de ligne.
-- ---------------------------------------------------------------------
INSERT INTO locaux (id, site_id, batiment_id, service_id, etage, code, nom, zone_risque, acces_controle) VALUES
  ('loc_mkl_chir_101', 'site_monkole', 'bat_CHME', 'srv_mkl_chir', '1', 'CHIR-101', 'Chambre 101', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_chir_102', 'site_monkole', 'bat_CHME', 'srv_mkl_chir', '1', 'CHIR-102', 'Chambre 102', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_chir_103', 'site_monkole', 'bat_CHME', 'srv_mkl_chir', '1', 'CHIR-103', 'Chambre 103', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_chir_104', 'site_monkole', 'bat_CHME', 'srv_mkl_chir', '1', 'CHIR-104', 'Chambre 104', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_chir_105', 'site_monkole', 'bat_CHME', 'srv_mkl_chir', '1', 'CHIR-105', 'Chambre 105', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_chir_107', 'site_monkole', 'bat_CHME', 'srv_mkl_chir', '1', 'CHIR-107', 'Chambre 107', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_chir_chambre1', 'site_monkole', 'bat_CHME', 'srv_mkl_chir', '0', 'CHIR-CHAMBRE1', 'Chambre 1', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_chir_chambre2', 'site_monkole', 'bat_CHME', 'srv_mkl_chir', '0', 'CHIR-CHAMBRE2', 'Chambre 2', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_chir_chambre3', 'site_monkole', 'bat_CHME', 'srv_mkl_chir', '0', 'CHIR-CHAMBRE3', 'Chambre 3', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_chir_chambre4', 'site_monkole', 'bat_CHME', 'srv_mkl_chir', '0', 'CHIR-CHAMBRE4', 'Chambre 4', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_chir_chambre5', 'site_monkole', 'bat_CHME', 'srv_mkl_chir', '0', 'CHIR-CHAMBRE5', 'Chambre 5', 'zone_standard', false),  -- 3 place(s)
  ('loc_mkl_chir_chambre6', 'site_monkole', 'bat_CHME', 'srv_mkl_chir', '0', 'CHIR-CHAMBRE6', 'Chambre 6', 'zone_standard', false),  -- 3 place(s)
  ('loc_mkl_chir_chambre7', 'site_monkole', 'bat_CHME', 'srv_mkl_chir', '0', 'CHIR-CHAMBRE7', 'Chambre 7', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_gyno_200go', 'site_monkole', 'bat_CHME', 'srv_mkl_gyno', '2', 'GYNO-200GO', '200go', 'zone_controlee', false),  -- 6 place(s)
  ('loc_mkl_gyno_201', 'site_monkole', 'bat_CHME', 'srv_mkl_gyno', '2', 'GYNO-201', 'Chambre 201', 'zone_controlee', false),  -- 6 place(s)
  ('loc_mkl_gyno_202', 'site_monkole', 'bat_CHME', 'srv_mkl_gyno', '2', 'GYNO-202', 'Chambre 202', 'zone_controlee', false),  -- 6 place(s)
  ('loc_mkl_gyno_203', 'site_monkole', 'bat_CHME', 'srv_mkl_gyno', '2', 'GYNO-203', 'Chambre 203', 'zone_controlee', false),  -- 6 place(s)
  ('loc_mkl_gyno_204', 'site_monkole', 'bat_CHME', 'srv_mkl_gyno', '2', 'GYNO-204', 'Chambre 204', 'zone_controlee', false),  -- 6 place(s)
  ('loc_mkl_gyno_205', 'site_monkole', 'bat_CHME', 'srv_mkl_gyno', '2', 'GYNO-205', 'Chambre 205', 'zone_controlee', false),  -- 6 place(s)
  ('loc_mkl_gyno_206', 'site_monkole', 'bat_CHME', 'srv_mkl_gyno', '2', 'GYNO-206', 'Chambre 206', 'zone_controlee', false),  -- 4 place(s)
  ('loc_mkl_gyno_207', 'site_monkole', 'bat_CHME', 'srv_mkl_gyno', '2', 'GYNO-207', 'Chambre 207', 'zone_controlee', false),  -- 4 place(s)
  ('loc_mkl_gyno_pp', 'site_monkole', 'bat_CHME', 'srv_mkl_gyno', '0', 'GYNO-PP', 'P.P', 'zone_controlee', false),  -- 12 place(s)
  ('loc_mkl_gyno_utpr', 'site_monkole', 'bat_CHME', 'srv_mkl_gyno', '0', 'GYNO-UTPR', 'UTPR', 'zone_controlee', false),  -- 10 place(s)
  ('loc_mkl_medi_106', 'site_monkole', 'bat_CHME', 'srv_mkl_medi', '1', 'MEDI-106', 'Chambre 106', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_medi_108', 'site_monkole', 'bat_CHME', 'srv_mkl_medi', '1', 'MEDI-108', 'Chambre 108', 'zone_standard', false),  -- 1 place(s)
  ('loc_mkl_medi_109', 'site_monkole', 'bat_CHME', 'srv_mkl_medi', '1', 'MEDI-109', 'Chambre 109', 'zone_standard', false),  -- 1 place(s)
  ('loc_mkl_medi_110', 'site_monkole', 'bat_CHME', 'srv_mkl_medi', '1', 'MEDI-110', 'Chambre 110', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_medi_111', 'site_monkole', 'bat_CHME', 'srv_mkl_medi', '1', 'MEDI-111', 'Chambre 111', 'zone_standard', false),  -- 3 place(s)
  ('loc_mkl_medi_112', 'site_monkole', 'bat_CHME', 'srv_mkl_medi', '1', 'MEDI-112', 'Chambre 112', 'zone_standard', false),  -- 3 place(s)
  ('loc_mkl_medi_113', 'site_monkole', 'bat_CHME', 'srv_mkl_medi', '1', 'MEDI-113', 'Chambre 113', 'zone_standard', false),  -- 3 place(s)
  ('loc_mkl_medi_301', 'site_monkole', 'bat_CHME', 'srv_mkl_medi', '3', 'MEDI-301', 'Chambre 301', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_medi_302', 'site_monkole', 'bat_CHME', 'srv_mkl_medi', '3', 'MEDI-302', 'Chambre 302', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_neon_215', 'site_monkole', 'bat_CHME', 'srv_mkl_neon', '2', 'NEON-215', 'Chambre 215', 'zone_protegee', false),  -- 7 place(s)
  ('loc_mkl_neon_216', 'site_monkole', 'bat_CHME', 'srv_mkl_neon', '2', 'NEON-216', 'Chambre 216', 'zone_protegee', false),  -- 7 place(s)
  ('loc_mkl_neon_217', 'site_monkole', 'bat_CHME', 'srv_mkl_neon', '2', 'NEON-217', 'Chambre 217', 'zone_protegee', false),  -- 5 place(s)
  ('loc_mkl_pedi_208', 'site_monkole', 'bat_CHME', 'srv_mkl_pedi', '2', 'PEDI-208', 'Chambre 208', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_pedi_209', 'site_monkole', 'bat_CHME', 'srv_mkl_pedi', '2', 'PEDI-209', 'Chambre 209', 'zone_standard', false),  -- 2 place(s)
  ('loc_mkl_pedi_210', 'site_monkole', 'bat_CHME', 'srv_mkl_pedi', '2', 'PEDI-210', 'Chambre 210', 'zone_standard', false),  -- 3 place(s)
  ('loc_mkl_pedi_211', 'site_monkole', 'bat_CHME', 'srv_mkl_pedi', '2', 'PEDI-211', 'Chambre 211', 'zone_standard', false),  -- 3 place(s)
  ('loc_mkl_pedi_212', 'site_monkole', 'bat_CHME', 'srv_mkl_pedi', '2', 'PEDI-212', 'Chambre 212', 'zone_standard', false),  -- 3 place(s)
  ('loc_mkl_rea_boxreanim', 'site_monkole', 'bat_CHME', 'srv_mkl_rea', '0', 'REA-BOXREANIM', 'Box Reanim', 'zone_protegee', false),  -- 8 place(s)
  ('loc_mkl_sipe_213', 'site_monkole', 'bat_CHME', 'srv_mkl_sipe', '2', 'SIPE-213', 'Chambre 213', 'zone_protegee', false),  -- 3 place(s)
  ('loc_mkl_sipe_214', 'site_monkole', 'bat_CHME', 'srv_mkl_sipe', '2', 'SIPE-214', 'Chambre 214', 'zone_protegee', false),  -- 7 place(s)
  ('loc_mkl_sipe_218', 'site_monkole', 'bat_CHME', 'srv_mkl_sipe', '2', 'SIPE-218', 'Chambre 218', 'zone_protegee', false),  -- 5 place(s)
  ('loc_mkl_urg_boxurg', 'site_monkole', 'bat_CHME', 'srv_mkl_urg', '0', 'URG-BOXURG', 'Box Urg', 'zone_controlee', false)  -- 8 place(s)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
--  Familles des appareils créés
-- ---------------------------------------------------------------------
INSERT INTO familles (id, code, nom, domaine, duree_vie_ans) VALUES
  ('fam_NEO', 'NEO', 'Néonatologie et maternité', 'biomedical', 10)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
--  Les 23 appareils biomédicaux
--
--  Couveuses et tables de réanimation néonatale. Criticité 1 : un
--  nouveau-né ne se déplace pas pendant qu'on répare.
--
--  Marque, modèle, numéro de série et dates restent vides : ils ne
--  figurent pas dans le tableau des chambres, et les inventer rendrait
--  l'inventaire faux tout en le faisant paraître complet.
--
--  Le jeton QR se déduit du code, comme pour tout le parc : l'étiquette
--  s'imprime sans attendre que la fiche soit complète.
-- ---------------------------------------------------------------------
INSERT INTO equipements (id, code, designation, famille_id, domaine, marque, modele, numero_serie,
                         classe_dm, marquage_ce, soumis_vigilance, site_id, batiment_id, local_id,
                         service_id, statut, criticite, date_acquisition, date_mise_en_service,
                         valeur_achat, duree_amortissement_ans, risque_infectieux, qr_token, notes) VALUES
  ('eq_mkl_neo_001', 'MKL-NEO-001', 'Couveuse néonatale', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_215', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-001', 'Couveuse 1 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_002', 'MKL-NEO-002', 'Couveuse néonatale', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_215', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-002', 'Couveuse 2 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_003', 'MKL-NEO-003', 'Couveuse néonatale', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_215', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-003', 'Couveuse 3 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_004', 'MKL-NEO-004', 'Couveuse néonatale', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_215', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-004', 'Couveuse 4 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_005', 'MKL-NEO-005', 'Table à langer chauffante', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_215', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-005', 'Table 1 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_006', 'MKL-NEO-006', 'Table à langer chauffante', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_215', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-006', 'Table 2 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_007', 'MKL-NEO-007', 'Table de réanimation néonatale', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_215', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-007', 'Table Réa — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_008', 'MKL-NEO-008', 'Couveuse néonatale', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_216', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-008', 'Couveuse 1 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_009', 'MKL-NEO-009', 'Couveuse néonatale', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_216', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-009', 'Couveuse 2 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_010', 'MKL-NEO-010', 'Couveuse néonatale', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_216', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-010', 'Couveuse 3 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_011', 'MKL-NEO-011', 'Table à langer chauffante', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_216', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-011', 'Table 1 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_012', 'MKL-NEO-012', 'Table à langer chauffante', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_216', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-012', 'Table 2 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_013', 'MKL-NEO-013', 'Table à langer chauffante', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_216', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-013', 'Table 3 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_014', 'MKL-NEO-014', 'Table de réanimation néonatale', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_216', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-014', 'Table Réa — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_015', 'MKL-NEO-015', 'Couveuse néonatale', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_217', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-015', 'Couveuse 1 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_016', 'MKL-NEO-016', 'Couveuse néonatale', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_217', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-016', 'Couveuse 2 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_017', 'MKL-NEO-017', 'Couveuse néonatale', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_217', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-017', 'Couveuse 3 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_018', 'MKL-NEO-018', 'Couveuse néonatale', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_217', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-018', 'Couveuse 4 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_019', 'MKL-NEO-019', 'Couveuse néonatale', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_neon_217', 'srv_mkl_neon', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-019', 'Couveuse 5 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_020', 'MKL-NEO-020', 'Table à langer chauffante', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_sipe_214', 'srv_mkl_sipe', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-020', 'Table 1 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_021', 'MKL-NEO-021', 'Table à langer chauffante', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_sipe_214', 'srv_mkl_sipe', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-021', 'Table 2 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_022', 'MKL-NEO-022', 'Table à langer chauffante', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_sipe_214', 'srv_mkl_sipe', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-022', 'Table 3 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.'),
  ('eq_mkl_neo_023', 'MKL-NEO-023', 'Table à langer chauffante', 'fam_NEO', 'biomedical', '', '', '', 'IIb', false, true, 'site_monkole', 'bat_CHME', 'loc_mkl_sipe_214', 'srv_mkl_sipe', 'en_service', 1, '', '', 0, 10, true, 'GMAO:MKL-NEO-023', 'Table 4 — repris du plan d''hospitalisation. Marque, n° de série et dates à compléter.')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
--  Récapitulatif
-- ---------------------------------------------------------------------
SELECT s.nom                             AS service,
       count(DISTINCT l.id)              AS chambres,
       count(DISTINCT e.id)              AS appareils
  FROM services s
  LEFT JOIN locaux      l ON l.service_id = s.id
  LEFT JOIN equipements e ON e.service_id = s.id
 WHERE s.id IN ('srv_mkl_chir', 'srv_mkl_gyno', 'srv_mkl_medi', 'srv_mkl_neon',
                 'srv_mkl_pedi', 'srv_mkl_rea',  'srv_mkl_sipe', 'srv_mkl_urg')
 GROUP BY s.nom
 ORDER BY s.nom;

-- Remplacer par COMMIT une fois le récapitulatif vérifié.
ROLLBACK;
-- COMMIT;
