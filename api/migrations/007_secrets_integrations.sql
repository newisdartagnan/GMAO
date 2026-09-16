-- =====================================================================
--  Jetons d'intégration
--
--  Microsoft fait tourner le jeton de rafraîchissement : chaque
--  renouvellement en délivre un nouveau et invalide le précédent. Celui
--  qui figure dans le fichier .env ne vaut donc que pour le premier
--  échange — s'il n'était pas conservé ailleurs, la collecte
--  s'arrêterait au redémarrage suivant, sans rien dire.
--
--  Cette table contient un secret en clair. Elle est réservée au
--  propriétaire de la base, au même titre que les empreintes de mots de
--  passe, et n'est jamais renvoyée par l'API. Une sauvegarde de la base
--  doit être traitée en conséquence.
-- =====================================================================

CREATE TABLE integrations_secrets (
  source      text PRIMARY KEY,
  cle         text NOT NULL,
  valeur      text NOT NULL,
  mis_a_jour  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE integrations_secrets IS
  'Jetons renouvelables des connecteurs externes. Contient des secrets en clair : ne pas exposer.';

REVOKE ALL ON integrations_secrets FROM PUBLIC;
