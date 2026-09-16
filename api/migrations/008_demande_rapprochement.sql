-- =====================================================================
--  Rapprochement d'un signalement avec l'inventaire
--
--  Le formulaire en service ne demande pas de numéro d'inventaire : il
--  demande l'équipement en toutes lettres — « climatiseur »,
--  « robinet », « prise murale oxygène ». Cette désignation est
--  conservée à part de la description, parce que c'est sur elle que
--  s'appuie la recherche d'équipement proposée au responsable.
--
--  Le secteur déclaré donne de même un corps de métier, qui
--  présélectionne l'équipe à la création de l'ordre de travail. Ni l'un
--  ni l'autre ne rattache quoi que ce soit tout seul : ils préparent une
--  décision qui reste humaine.
-- =====================================================================

ALTER TABLE demandes ADD COLUMN domaine_suggere text;
ALTER TABLE demandes ADD COLUMN designation_libre text;

COMMENT ON COLUMN demandes.domaine_suggere IS
  'Corps de métier déduit du secteur déclaré. Présélectionne l''équipe, ne décide pas.';
COMMENT ON COLUMN demandes.designation_libre IS
  'Équipement tel que le demandeur l''a écrit, avant tout rapprochement avec l''inventaire.';

-- Les demandes venues d'un formulaire et pas encore rattachées à une
-- machine : c'est la file de travail du rapprochement.
CREATE OR REPLACE VIEW v_demandes_a_rattacher AS
SELECT
  d.numero,
  d.date_creation,
  d.designation_libre,
  d.domaine_suggere,
  d.objet,
  s.nom  AS service,
  l.nom  AS local,
  d.urgence_declaree,
  d.statut
FROM demandes d
LEFT JOIN services s ON s.id = d.service_id
LEFT JOIN locaux   l ON l.id = d.local_id
WHERE d.equipement_id IS NULL
  AND d.origine_externe IS NOT NULL
  AND d.statut IN ('nouvelle', 'en_analyse')
ORDER BY d.date_creation DESC;

COMMENT ON VIEW v_demandes_a_rattacher IS
  'Signalements reçus du formulaire qui ne sont encore rattachés à aucun équipement.';
