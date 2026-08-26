-- =====================================================================
--  Journal d'installation
--
--  Une seule question à laquelle cette table répond : le jeu de
--  démonstration a-t-il déjà été versé dans cette base ?
--
--  Sans elle, le peuplement se déclenchait dès que la table « sites »
--  était vide. C'est un piège pour l'administrateur qui purge la base
--  afin d'y verser l'inventaire réel de l'établissement : au premier
--  redémarrage, les 977 équipements de démonstration revenaient
--  s'ajouter à son travail.
--
--  Cette table n'est jamais vidée par les scripts de purge, au même
--  titre que « schema_migrations » : elle décrit l'installation, pas
--  les données de l'hôpital.
-- =====================================================================

CREATE TABLE installation (
  cle    text PRIMARY KEY,
  valeur text,
  date   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE installation IS
  'Faits d''installation, hors données métier. Ne pas vider lors d''une purge.';

-- Une base qui contient déjà des sites au moment de cette migration a
-- forcément été peuplée : on l'enregistre plutôt que de risquer un
-- second peuplement au prochain démarrage.
INSERT INTO installation (cle, valeur)
SELECT 'peuplement_initial', 'antérieur à la migration 006'
 WHERE EXISTS (SELECT 1 FROM sites);
