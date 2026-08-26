-- =====================================================================
--  GMAO hospitalière — schéma initial
--
--  Conventions
--  -----------
--  * Les identifiants sont des chaînes applicatives (« eqp_0042 »), pas des
--    séquences : ils sont produits côté application et circulent tels quels
--    entre le navigateur, l'API et la base, ce qui rend les exports lisibles.
--  * Les dates sont stockées en `text` au format ISO. Le modèle métier mêle
--    des dates simples (échéance planifiée) et des horodatages (début réel
--    d'intervention) sur des champs voisins ; les conserver tels quels évite
--    toute dérive de fuseau entre le poste de saisie et le serveur. Les vues
--    de la migration 003 exposent les mêmes colonnes converties en date et
--    timestamp pour les requêtes d'administration.
--  * Les sous-structures toujours lues avec leur parent — opérations d'une
--    gamme, temps passés d'un OT, valeurs d'un relevé — sont en JSONB.
--  * Toutes les clés étrangères sont différées : le chargement initial écrit
--    l'ensemble dans une seule transaction, sans avoir à trier les tables.
-- =====================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     text PRIMARY KEY,
  applique_le timestamptz NOT NULL DEFAULT now()
);

/* ---------------------------------------------------------------- */
/* Organisation                                                      */
/* ---------------------------------------------------------------- */

CREATE TABLE sites (
  id        text PRIMARY KEY,
  code      text NOT NULL UNIQUE,
  nom       text NOT NULL,
  adresse   text NOT NULL,
  ville     text NOT NULL,
  province  text NOT NULL,
  type      text NOT NULL,
  nb_lits   integer NOT NULL DEFAULT 0,
  telephone text,
  actif     boolean NOT NULL DEFAULT true
);

CREATE TABLE batiments (
  id                  text PRIMARY KEY,
  site_id             text NOT NULL REFERENCES sites(id) DEFERRABLE INITIALLY DEFERRED,
  code                text NOT NULL,
  nom                 text NOT NULL,
  nb_etages           integer NOT NULL DEFAULT 1,
  annee_construction  integer
);

CREATE TABLE services (
  id              text PRIMARY KEY,
  code            text NOT NULL,
  nom             text NOT NULL,
  pole            text NOT NULL,
  site_id         text NOT NULL REFERENCES sites(id) DEFERRABLE INITIALLY DEFERRED,
  responsable     text NOT NULL,
  telephone       text,
  criticite       smallint NOT NULL CHECK (criticite BETWEEN 1 AND 4),
  continuite24_7  boolean NOT NULL DEFAULT false
);

CREATE TABLE locaux (
  id             text PRIMARY KEY,
  site_id        text NOT NULL REFERENCES sites(id) DEFERRABLE INITIALLY DEFERRED,
  batiment_id    text NOT NULL REFERENCES batiments(id) DEFERRABLE INITIALLY DEFERRED,
  service_id     text NOT NULL REFERENCES services(id) DEFERRABLE INITIALLY DEFERRED,
  etage          text NOT NULL,
  code           text NOT NULL,
  nom            text NOT NULL,
  zone_risque    text NOT NULL,
  surface_m2     integer,
  acces_controle boolean NOT NULL DEFAULT false
);

CREATE TABLE equipes (
  id             text PRIMARY KEY,
  code           text NOT NULL,
  nom            text NOT NULL,
  domaine        text NOT NULL,
  responsable_id text NOT NULL,
  site_id        text NOT NULL REFERENCES sites(id) DEFERRABLE INITIALLY DEFERRED,
  heures_hebdo   integer NOT NULL DEFAULT 40,
  astreinte      boolean NOT NULL DEFAULT false
);

CREATE TABLE utilisateurs (
  id                text PRIMARY KEY,
  matricule         text NOT NULL,
  nom               text NOT NULL,
  prenom            text NOT NULL,
  email             text NOT NULL UNIQUE,
  telephone         text,
  role              text NOT NULL,
  equipe_id         text REFERENCES equipes(id) DEFERRABLE INITIALLY DEFERRED,
  site_id           text NOT NULL REFERENCES sites(id) DEFERRABLE INITIALLY DEFERRED,
  service_id        text REFERENCES services(id) DEFERRABLE INITIALLY DEFERRED,
  competences       jsonb NOT NULL DEFAULT '[]'::jsonb,
  taux_horaire      numeric(10, 2) NOT NULL DEFAULT 0,
  actif             boolean NOT NULL DEFAULT true,
  date_embauche     text,
  -- Hors agrégat métier : l'authentification ne descend jamais au navigateur.
  mot_de_passe_hash text,
  derniere_connexion timestamptz
);

ALTER TABLE equipes
  ADD CONSTRAINT equipes_responsable_fk
  FOREIGN KEY (responsable_id) REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE habilitations (
  id              text PRIMARY KEY,
  utilisateur_id  text NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  intitule        text NOT NULL,
  reference       text NOT NULL,
  organisme       text NOT NULL,
  date_obtention  text NOT NULL,
  date_expiration text,
  obligatoire     boolean NOT NULL DEFAULT false
);

CREATE TABLE fournisseurs (
  id                    text PRIMARY KEY,
  code                  text NOT NULL UNIQUE,
  raison_sociale        text NOT NULL,
  types                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  contact_nom           text,
  email                 text,
  telephone             text,
  pays                  text NOT NULL,
  certifications        jsonb NOT NULL DEFAULT '[]'::jsonb,
  delai_intervention_h  integer,
  note_performance      numeric(3, 1),
  actif                 boolean NOT NULL DEFAULT true
);

/* ---------------------------------------------------------------- */
/* Parc                                                              */
/* ---------------------------------------------------------------- */

CREATE TABLE familles (
  id            text PRIMARY KEY,
  code          text NOT NULL UNIQUE,
  nom           text NOT NULL,
  domaine       text NOT NULL,
  parent_id     text REFERENCES familles(id) DEFERRABLE INITIALLY DEFERRED,
  duree_vie_ans integer NOT NULL DEFAULT 8
);

CREATE TABLE contrats (
  id                        text PRIMARY KEY,
  numero                    text NOT NULL UNIQUE,
  libelle                   text NOT NULL,
  fournisseur_id            text NOT NULL REFERENCES fournisseurs(id) DEFERRABLE INITIALLY DEFERRED,
  type                      text NOT NULL,
  date_debut                text NOT NULL,
  date_fin                  text NOT NULL,
  montant_annuel            numeric(14, 2) NOT NULL DEFAULT 0,
  visites_incluses          integer NOT NULL DEFAULT 0,
  pieces_incluses           boolean NOT NULL DEFAULT false,
  sla_delai_intervention_h  integer NOT NULL DEFAULT 72,
  sla_delai_retablissement_h integer NOT NULL DEFAULT 168,
  sla_taux_disponibilite    numeric(5, 2) NOT NULL DEFAULT 95,
  reconduction_tacite       boolean NOT NULL DEFAULT false,
  preavis_jours             integer NOT NULL DEFAULT 60,
  equipement_ids            jsonb NOT NULL DEFAULT '[]'::jsonb,
  statut                    text NOT NULL,
  notes                     text
);

CREATE TABLE equipements (
  id                       text PRIMARY KEY,
  code                     text NOT NULL UNIQUE,
  designation              text NOT NULL,
  famille_id               text NOT NULL REFERENCES familles(id) DEFERRABLE INITIALLY DEFERRED,
  domaine                  text NOT NULL,
  marque                   text NOT NULL,
  modele                   text NOT NULL,
  numero_serie             text NOT NULL,
  classe_dm                text NOT NULL,
  marquage_ce              boolean NOT NULL DEFAULT false,
  numero_ce                text,
  soumis_vigilance         boolean NOT NULL DEFAULT false,
  fabricant_id             text REFERENCES fournisseurs(id) DEFERRABLE INITIALLY DEFERRED,
  fournisseur_id           text REFERENCES fournisseurs(id) DEFERRABLE INITIALLY DEFERRED,
  site_id                  text NOT NULL REFERENCES sites(id) DEFERRABLE INITIALLY DEFERRED,
  batiment_id              text NOT NULL REFERENCES batiments(id) DEFERRABLE INITIALLY DEFERRED,
  local_id                 text NOT NULL REFERENCES locaux(id) DEFERRABLE INITIALLY DEFERRED,
  service_id               text NOT NULL REFERENCES services(id) DEFERRABLE INITIALLY DEFERRED,
  statut                   text NOT NULL,
  criticite                smallint NOT NULL CHECK (criticite BETWEEN 1 AND 4),
  equipement_secours_id    text REFERENCES equipements(id) DEFERRABLE INITIALLY DEFERRED,
  date_acquisition         text NOT NULL,
  date_mise_en_service     text NOT NULL,
  valeur_achat             numeric(14, 2) NOT NULL DEFAULT 0,
  duree_amortissement_ans  integer NOT NULL DEFAULT 8,
  fin_garantie             text,
  contrat_id               text REFERENCES contrats(id) DEFERRABLE INITIALLY DEFERRED,
  parent_id                text REFERENCES equipements(id) DEFERRABLE INITIALLY DEFERRED,
  compteurs                jsonb NOT NULL DEFAULT '[]'::jsonb,
  risque_infectieux        boolean NOT NULL DEFAULT false,
  source_radioactive       boolean NOT NULL DEFAULT false,
  gaz_medicaux             boolean NOT NULL DEFAULT false,
  alimentation_secourue    boolean NOT NULL DEFAULT false,
  objectif_disponibilite   numeric(5, 2) NOT NULL DEFAULT 95,
  notes                    text,
  photo_url                text,
  qr_token                 text NOT NULL,
  actif                    boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_equipements_service ON equipements(service_id);
CREATE INDEX idx_equipements_statut ON equipements(statut);
CREATE INDEX idx_equipements_famille ON equipements(famille_id);
CREATE INDEX idx_equipements_criticite ON equipements(criticite);

CREATE TABLE mouvements_equipement (
  id              text PRIMARY KEY,
  equipement_id   text NOT NULL REFERENCES equipements(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  date            text NOT NULL,
  local_source_id text REFERENCES locaux(id) DEFERRABLE INITIALLY DEFERRED,
  local_cible_id  text NOT NULL REFERENCES locaux(id) DEFERRABLE INITIALLY DEFERRED,
  motif           text NOT NULL,
  utilisateur_id  text NOT NULL REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED
);

/* ---------------------------------------------------------------- */
/* Maintenance                                                       */
/* ---------------------------------------------------------------- */

CREATE TABLE gammes (
  id                       text PRIMARY KEY,
  code                     text NOT NULL UNIQUE,
  libelle                  text NOT NULL,
  type                     text NOT NULL,
  famille_id               text REFERENCES familles(id) DEFERRABLE INITIALLY DEFERRED,
  equipement_ids           jsonb NOT NULL DEFAULT '[]'::jsonb,
  mode_declenchement       text NOT NULL,
  periodicite_valeur       integer NOT NULL,
  periodicite_unite        text NOT NULL,
  compteur_type            text,
  compteur_seuil           integer,
  duree_estimee_min        integer NOT NULL,
  competences_requises     jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipe_id                text REFERENCES equipes(id) DEFERRABLE INITIALLY DEFERRED,
  execution                text NOT NULL,
  arret_equipement_requis  boolean NOT NULL DEFAULT false,
  consignes_securite       text NOT NULL DEFAULT '',
  reference_normative      text,
  operations               jsonb NOT NULL DEFAULT '[]'::jsonb,
  pieces_prevues           jsonb NOT NULL DEFAULT '[]'::jsonb,
  actif                    boolean NOT NULL DEFAULT true
);

CREATE TABLE demandes (
  id              text PRIMARY KEY,
  numero          text NOT NULL UNIQUE,
  date_creation   text NOT NULL,
  demandeur_id    text NOT NULL REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED,
  service_id      text NOT NULL REFERENCES services(id) DEFERRABLE INITIALLY DEFERRED,
  local_id        text REFERENCES locaux(id) DEFERRABLE INITIALLY DEFERRED,
  equipement_id   text REFERENCES equipements(id) DEFERRABLE INITIALLY DEFERRED,
  objet           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  urgence_declaree text NOT NULL,
  impact_patient  text NOT NULL,
  canal           text NOT NULL,
  statut          text NOT NULL,
  ot_id           text,
  motif_refus     text,
  traite_par_id   text REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED,
  date_traitement text
);

CREATE INDEX idx_demandes_statut ON demandes(statut);

CREATE TABLE ordres_travail (
  id                      text PRIMARY KEY,
  numero                  text NOT NULL UNIQUE,
  type                    text NOT NULL,
  objet                   text NOT NULL,
  description             text NOT NULL DEFAULT '',
  equipement_id           text REFERENCES equipements(id) DEFERRABLE INITIALLY DEFERRED,
  local_id                text NOT NULL REFERENCES locaux(id) DEFERRABLE INITIALLY DEFERRED,
  service_id              text NOT NULL REFERENCES services(id) DEFERRABLE INITIALLY DEFERRED,
  site_id                 text NOT NULL REFERENCES sites(id) DEFERRABLE INITIALLY DEFERRED,
  demande_id              text REFERENCES demandes(id) DEFERRABLE INITIALLY DEFERRED,
  gamme_id                text REFERENCES gammes(id) DEFERRABLE INITIALLY DEFERRED,
  controle_id             text,
  alerte_id               text,
  priorite                text NOT NULL,
  statut                  text NOT NULL,
  date_creation           text NOT NULL,
  date_planifiee          text,
  date_echeance_sla       text,
  date_debut              text,
  date_fin                text,
  date_cloture            text,
  equipe_id               text REFERENCES equipes(id) DEFERRABLE INITIALLY DEFERRED,
  technicien_principal_id text REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED,
  prestataire_id          text REFERENCES fournisseurs(id) DEFERRABLE INITIALLY DEFERRED,
  execution               text NOT NULL,
  temps                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  pieces                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  cout_prestataire        numeric(14, 2) NOT NULL DEFAULT 0,
  arret_equipement_min    integer NOT NULL DEFAULT 0,
  diagnostic              text,
  cause_panne             text,
  actions_realisees       text,
  mesures                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  conformite              text,
  reserves                jsonb NOT NULL DEFAULT '[]'::jsonb,
  securite                jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_technicien    text,
  signature_demandeur     text,
  valide_par              text REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED,
  date_validation         text,
  commentaires            jsonb NOT NULL DEFAULT '[]'::jsonb,
  document_ids            jsonb NOT NULL DEFAULT '[]'::jsonb,
  photo_urls              jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_ot_statut ON ordres_travail(statut);
CREATE INDEX idx_ot_equipement ON ordres_travail(equipement_id);
CREATE INDEX idx_ot_type ON ordres_travail(type);
CREATE INDEX idx_ot_date_creation ON ordres_travail(date_creation);
CREATE INDEX idx_ot_gamme_equipement ON ordres_travail(gamme_id, equipement_id);

ALTER TABLE demandes
  ADD CONSTRAINT demandes_ot_fk FOREIGN KEY (ot_id) REFERENCES ordres_travail(id) DEFERRABLE INITIALLY DEFERRED;

/* ---------------------------------------------------------------- */
/* Conformité et vigilance                                           */
/* ---------------------------------------------------------------- */

CREATE TABLE controles (
  id                 text PRIMARY KEY,
  code               text NOT NULL UNIQUE,
  libelle            text NOT NULL,
  referentiel        text NOT NULL,
  texte_reference    text NOT NULL,
  famille_ids        jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipement_ids     jsonb NOT NULL DEFAULT '[]'::jsonb,
  periodicite_valeur integer NOT NULL,
  periodicite_unite  text NOT NULL,
  organisme_id       text REFERENCES fournisseurs(id) DEFERRABLE INITIALLY DEFERRED,
  execution          text NOT NULL,
  bloquant           boolean NOT NULL DEFAULT false,
  actif              boolean NOT NULL DEFAULT true
);

ALTER TABLE ordres_travail
  ADD CONSTRAINT ot_controle_fk FOREIGN KEY (controle_id) REFERENCES controles(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE visites_controle (
  id             text PRIMARY KEY,
  controle_id    text NOT NULL REFERENCES controles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  equipement_id  text REFERENCES equipements(id) DEFERRABLE INITIALLY DEFERRED,
  local_id       text REFERENCES locaux(id) DEFERRABLE INITIALLY DEFERRED,
  date_visite    text NOT NULL,
  date_prochaine text NOT NULL,
  organisme_id   text REFERENCES fournisseurs(id) DEFERRABLE INITIALLY DEFERRED,
  ot_id          text REFERENCES ordres_travail(id) DEFERRABLE INITIALLY DEFERRED,
  verdict        text NOT NULL,
  reserves       jsonb NOT NULL DEFAULT '[]'::jsonb,
  numero_rapport text,
  document_ids   jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_visites_controle_equipement ON visites_controle(controle_id, equipement_id);

CREATE TABLE vigilances (
  id                  text PRIMARY KEY,
  numero              text NOT NULL UNIQUE,
  equipement_id       text NOT NULL REFERENCES equipements(id) DEFERRABLE INITIALLY DEFERRED,
  date_evenement      text NOT NULL,
  date_declaration    text,
  description         text NOT NULL,
  gravite             text NOT NULL,
  patient_implique    boolean NOT NULL DEFAULT false,
  consequence_patient text,
  mesures_immediates  text NOT NULL DEFAULT '',
  declare_autorite    boolean NOT NULL DEFAULT false,
  numero_declaration  text,
  fabricant_informe   boolean NOT NULL DEFAULT false,
  analyse_cause       text,
  actions_correctives jsonb NOT NULL DEFAULT '[]'::jsonb,
  ot_id               text REFERENCES ordres_travail(id) DEFERRABLE INITIALLY DEFERRED,
  statut              text NOT NULL,
  date_cloture        text,
  declarant_id        text NOT NULL REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE rappels (
  id                   text PRIMARY KEY,
  reference            text NOT NULL UNIQUE,
  fabricant_id         text NOT NULL REFERENCES fournisseurs(id) DEFERRABLE INITIALLY DEFERRED,
  date_reception       text NOT NULL,
  objet                text NOT NULL,
  description          text NOT NULL DEFAULT '',
  action_requise       text NOT NULL,
  date_echeance        text NOT NULL,
  equipement_ids       jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipements_traites  jsonb NOT NULL DEFAULT '[]'::jsonb,
  statut               text NOT NULL
);

/* ---------------------------------------------------------------- */
/* Logistique                                                        */
/* ---------------------------------------------------------------- */

CREATE TABLE magasins (
  id             text PRIMARY KEY,
  code           text NOT NULL UNIQUE,
  nom            text NOT NULL,
  site_id        text NOT NULL REFERENCES sites(id) DEFERRABLE INITIALLY DEFERRED,
  responsable_id text REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE articles (
  id                       text PRIMARY KEY,
  code                     text NOT NULL UNIQUE,
  designation              text NOT NULL,
  categorie                text NOT NULL,
  domaine                  text NOT NULL,
  unite                    text NOT NULL,
  magasin_id               text NOT NULL REFERENCES magasins(id) DEFERRABLE INITIALLY DEFERRED,
  emplacement              text NOT NULL DEFAULT '',
  stock_actuel             integer NOT NULL DEFAULT 0,
  stock_min                integer NOT NULL DEFAULT 0,
  stock_max                integer NOT NULL DEFAULT 0,
  consommation_mensuelle   integer NOT NULL DEFAULT 0,
  prix_moyen_pondere       numeric(14, 2) NOT NULL DEFAULT 0,
  delai_appro_jours        integer NOT NULL DEFAULT 30,
  fournisseur_principal_id text REFERENCES fournisseurs(id) DEFERRABLE INITIALLY DEFERRED,
  reference_fournisseur    text,
  critique                 boolean NOT NULL DEFAULT false,
  gestion_lot              boolean NOT NULL DEFAULT false,
  gestion_peremption       boolean NOT NULL DEFAULT false,
  equipements_compatibles  jsonb NOT NULL DEFAULT '[]'::jsonb,
  actif                    boolean NOT NULL DEFAULT true,
  CONSTRAINT articles_stock_positif CHECK (stock_actuel >= 0)
);

CREATE INDEX idx_articles_sous_seuil ON articles(stock_actuel, stock_min);

CREATE TABLE lots (
  id              text PRIMARY KEY,
  article_id      text NOT NULL REFERENCES articles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  numero_lot      text NOT NULL,
  quantite        integer NOT NULL DEFAULT 0,
  date_peremption text
);

CREATE TABLE bons_commande (
  id                    text PRIMARY KEY,
  numero                text NOT NULL UNIQUE,
  fournisseur_id        text NOT NULL REFERENCES fournisseurs(id) DEFERRABLE INITIALLY DEFERRED,
  date_creation         text NOT NULL,
  date_envoi            text,
  date_livraison_prevue text,
  date_reception        text,
  lignes                jsonb NOT NULL DEFAULT '[]'::jsonb,
  origine               text NOT NULL,
  ot_id                 text REFERENCES ordres_travail(id) DEFERRABLE INITIALLY DEFERRED,
  statut                text NOT NULL,
  demandeur_id          text NOT NULL REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED,
  valide_par_id         text REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED,
  notes                 text
);

CREATE TABLE mouvements_stock (
  id              text PRIMARY KEY,
  date            text NOT NULL,
  article_id      text NOT NULL REFERENCES articles(id) DEFERRABLE INITIALLY DEFERRED,
  type            text NOT NULL,
  quantite        integer NOT NULL,
  prix_unitaire   numeric(14, 2) NOT NULL DEFAULT 0,
  stock_apres     integer NOT NULL DEFAULT 0,
  ot_id           text REFERENCES ordres_travail(id) DEFERRABLE INITIALLY DEFERRED,
  bon_commande_id text REFERENCES bons_commande(id) DEFERRABLE INITIALLY DEFERRED,
  numero_lot      text,
  motif           text NOT NULL DEFAULT '',
  utilisateur_id  text NOT NULL REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_mouvements_stock_article ON mouvements_stock(article_id, date DESC);

/* ---------------------------------------------------------------- */
/* Supervision                                                       */
/* ---------------------------------------------------------------- */

CREATE TABLE capteurs (
  id                  text PRIMARY KEY,
  code                text NOT NULL UNIQUE,
  equipement_id       text NOT NULL REFERENCES equipements(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  type                text NOT NULL,
  unite               text NOT NULL,
  seuil_bas_critique  numeric(14, 3),
  seuil_bas_alerte    numeric(14, 3),
  seuil_haut_alerte   numeric(14, 3),
  seuil_haut_critique numeric(14, 3),
  frequence_releve_min integer NOT NULL DEFAULT 60,
  actif               boolean NOT NULL DEFAULT true
);

CREATE TABLE releves (
  id         text PRIMARY KEY,
  capteur_id text NOT NULL REFERENCES capteurs(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  date       text NOT NULL,
  valeur     numeric(14, 3) NOT NULL
);

CREATE INDEX idx_releves_capteur_date ON releves(capteur_id, date DESC);

-- Seules les décisions humaines sur une alerte sont conservées : l'alerte
-- elle-même est recalculée à chaque lecture à partir de l'état de la base.
CREATE TABLE alertes (
  id             text PRIMARY KEY,
  date           text NOT NULL,
  source         text NOT NULL,
  niveau         text NOT NULL,
  titre          text NOT NULL,
  message        text NOT NULL DEFAULT '',
  entite_type    text NOT NULL,
  entite_id      text NOT NULL,
  statut         text NOT NULL,
  ot_id          text REFERENCES ordres_travail(id) DEFERRABLE INITIALLY DEFERRED,
  traite_par_id  text REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED
);

/* ---------------------------------------------------------------- */
/* Documentation, audit, budget                                      */
/* ---------------------------------------------------------------- */

CREATE TABLE documents (
  id            text PRIMARY KEY,
  nom           text NOT NULL,
  categorie     text NOT NULL,
  entite_type   text NOT NULL,
  entite_id     text,
  date_ajout    text NOT NULL,
  ajoute_par_id text NOT NULL REFERENCES utilisateurs(id) DEFERRABLE INITIALLY DEFERRED,
  version       text NOT NULL DEFAULT 'v1.0',
  taille_ko     integer NOT NULL DEFAULT 0,
  url           text NOT NULL DEFAULT '#',
  opposable     boolean NOT NULL DEFAULT false
);

CREATE TABLE journal_audit (
  id             text PRIMARY KEY,
  date           text NOT NULL,
  utilisateur_id text NOT NULL,
  action         text NOT NULL,
  entite_type    text NOT NULL,
  entite_id      text NOT NULL,
  libelle        text NOT NULL,
  details        text
);

CREATE INDEX idx_journal_audit_date ON journal_audit(date DESC);
CREATE INDEX idx_journal_audit_entite ON journal_audit(entite_type, entite_id);

CREATE TABLE budgets (
  id             text PRIMARY KEY,
  annee          integer NOT NULL,
  service_id     text REFERENCES services(id) DEFERRABLE INITIALLY DEFERRED,
  domaine        text NOT NULL,
  poste          text NOT NULL,
  montant_alloue numeric(14, 2) NOT NULL DEFAULT 0
);
