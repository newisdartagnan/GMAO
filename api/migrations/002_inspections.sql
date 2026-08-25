-- =====================================================================
--  Rondes d'inspection quotidiennes
--
--  Deux passages par jour sur les installations qui ne s'arrêtent pas :
--  production d'oxygène, eau, groupes électrogènes, climatisation, air
--  médical, froid critique. Le modèle sépare le référentiel (ce qu'il faut
--  contrôler) de la trace (ce qui a été constaté, par qui et à quelle heure).
-- =====================================================================

CREATE TABLE modeles_inspection (
  id                  text PRIMARY KEY,
  code                text NOT NULL UNIQUE,
  libelle             text NOT NULL,
  designations        jsonb NOT NULL DEFAULT '[]'::jsonb,
  shifts              jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipe_id           text REFERENCES equipes(id) DEFERRABLE INITIALLY DEFERRED,
  duree_estimee_min   integer NOT NULL DEFAULT 15,
  consignes_securite  text,
  points              jsonb NOT NULL DEFAULT '[]'::jsonb,
  actif               boolean NOT NULL DEFAULT true
);

CREATE TABLE rondes (
  id                    text PRIMARY KEY,
  numero                text NOT NULL UNIQUE,
  date                  text NOT NULL,
  shift                 text NOT NULL CHECK (shift IN ('matin', 'soir')),
  site_id               text NOT NULL REFERENCES sites(id) DEFERRABLE INITIALLY DEFERRED,
  agent_id              text REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED,
  statut                text NOT NULL,
  heure_debut           text,
  heure_fin             text,
  equipements_attendus  jsonb NOT NULL DEFAULT '[]'::jsonb,
  observations          text,
  signature             text,
  vise_par_id           text REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED,
  date_visa             text,
  -- Une seule ronde par créneau et par site : c'est ce qui rend un créneau
  -- manqué visible plutôt que rattrapable après coup par une seconde saisie.
  CONSTRAINT rondes_creneau_unique UNIQUE (date, shift, site_id)
);

CREATE INDEX idx_rondes_date ON rondes(date DESC, shift);

CREATE TABLE releves_inspection (
  id            text PRIMARY KEY,
  ronde_id      text NOT NULL REFERENCES rondes(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  equipement_id text NOT NULL REFERENCES equipements(id) DEFERRABLE INITIALLY DEFERRED,
  modele_id     text NOT NULL REFERENCES modeles_inspection(id) DEFERRABLE INITIALLY DEFERRED,
  heure         text NOT NULL,
  agent_id      text NOT NULL REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED,
  valeurs       jsonb NOT NULL DEFAULT '[]'::jsonb,
  etat          text NOT NULL,
  observation   text,
  demande_id    text REFERENCES demandes(id) DEFERRABLE INITIALLY DEFERRED,
  -- Un équipement n'est relevé qu'une fois par ronde ; une correction de
  -- saisie remplace le relevé précédent au lieu de s'y ajouter.
  CONSTRAINT releves_inspection_unique UNIQUE (ronde_id, equipement_id)
);

CREATE INDEX idx_releves_inspection_equipement ON releves_inspection(equipement_id);
CREATE INDEX idx_releves_inspection_etat ON releves_inspection(etat);
