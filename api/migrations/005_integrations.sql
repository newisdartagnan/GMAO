-- =====================================================================
--  Demandes venues d'un formulaire externe
--
--  Les services de soins signalent une panne en scannant l'étiquette de
--  l'équipement, qui ouvre un formulaire JotForm. Les soumissions
--  arrivent ici et deviennent des demandes d'intervention ordinaires.
--
--  L'origine est conservée sur la demande : d'où elle vient, quelle
--  soumission, et les réponses brutes telles que le formulaire les a
--  envoyées. Cela permet de relire l'original en cas de doute sur une
--  interprétation, et surtout d'éviter les doublons — une reprise après
--  coupure réseau ne doit pas créer deux fois la même demande.
-- =====================================================================

ALTER TABLE demandes ADD COLUMN origine_externe jsonb;

COMMENT ON COLUMN demandes.origine_externe IS
  'Provenance d''une demande créée par un formulaire externe : {source, formulaireId, soumissionId, recuLe, reponses}.';

-- Une soumission ne peut donner qu'une seule demande. C'est cet index qui
-- rend la reprise idempotente : réimporter le même lot ne crée rien de neuf.
CREATE UNIQUE INDEX idx_demandes_soumission_externe
    ON demandes ((origine_externe ->> 'source'), (origine_externe ->> 'soumissionId'))
 WHERE origine_externe IS NOT NULL;

-- Suivi de la récupération périodique : où en était-on à la dernière fois.
CREATE TABLE integrations_etat (
  source          text PRIMARY KEY,
  derniere_lecture timestamptz,
  dernier_horodatage text,
  soumissions_traitees integer NOT NULL DEFAULT 0,
  derniere_erreur text,
  actif           boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE integrations_etat IS
  'Position de lecture de chaque connecteur externe, pour ne relire que le nouveau.';

CREATE OR REPLACE VIEW v_demandes_externes AS
SELECT
  d.numero,
  d.origine_externe ->> 'source'       AS source,
  d.origine_externe ->> 'soumissionId' AS soumission,
  NULLIF(d.origine_externe ->> 'recuLe', '')::timestamptz AS recu_le,
  d.objet,
  e.code                               AS equipement_code,
  e.designation                        AS equipement,
  s.nom                                AS service,
  d.urgence_declaree,
  d.impact_patient,
  d.statut,
  o.numero                             AS ordre_travail,
  d.origine_externe -> 'reponses'      AS reponses_brutes
FROM demandes d
LEFT JOIN equipements e   ON e.id = d.equipement_id
LEFT JOIN services s      ON s.id = d.service_id
LEFT JOIN ordres_travail o ON o.id = d.ot_id
WHERE d.origine_externe IS NOT NULL;

COMMENT ON VIEW v_demandes_externes IS
  'Demandes issues d''un formulaire externe, avec les réponses d''origine.';
