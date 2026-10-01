-- =====================================================================
--  Technicien d'essai, pour éprouver la notification par courriel
--
--      psql -d gmao -f scripts/technicien-essai.sql
--
--  Crée « CTI Test », un compte technicien qui porte une adresse réelle
--  — la vôtre. Affectez-lui un ordre de travail depuis l'application, et
--  vous recevrez le courriel que recevra un vrai technicien.
--
--  CHANGEZ L'ADRESSE ci-dessous avant d'exécuter.
--
--  Le compte est actif : il apparaît donc dans la liste des techniciens
--  à qui affecter. C'est voulu — c'est tout l'objet de l'essai. Pensez à
--  le désactiver ensuite :
--      UPDATE utilisateurs SET actif = false WHERE id = 'usr_cti_test';
--
--  Il n'a pas de mot de passe utilisable : il reçoit des courriels, il ne
--  se connecte pas. Pour qu'il se connecte aussi, lui en donner un par
--  Paramètres › Comptes.
--
--  DÉROULÉ
--    1. Exécuter tel quel : le COMMIT est commenté, rien n'est écrit.
--    2. Décommenter COMMIT, commenter ROLLBACK, réexécuter.
--    3. Paramètres › Base de données › « Recharger depuis la base ».
-- =====================================================================

BEGIN;

INSERT INTO utilisateurs (id, matricule, nom, prenom, email, telephone, role,
                          equipe_id, site_id, service_id, competences,
                          taux_horaire, actif, date_embauche, mot_de_passe_hash)
SELECT 'usr_cti_test',
       'CTI-TEST',
       'Test',
       'CTI',
       'boris.ikula@monkole.cd',          -- ← l'adresse qui recevra l'essai
       NULL,
       'technicien',
       (SELECT id FROM equipes ORDER BY id LIMIT 1),
       (SELECT id FROM sites   ORDER BY id LIMIT 1),
       NULL,
       '["essai"]'::jsonb,
       0,
       true,
       to_char(now(), 'YYYY-MM-DD'),
       NULL
ON CONFLICT (id) DO UPDATE
   SET email = EXCLUDED.email,
       actif = true;

SELECT u.prenom || ' ' || u.nom AS compte, u.email, u.role, e.nom AS equipe
  FROM utilisateurs u LEFT JOIN equipes e ON e.id = u.equipe_id
 WHERE u.id = 'usr_cti_test';

-- Remplacer par COMMIT une fois l'adresse vérifiée.
ROLLBACK;
-- COMMIT;
