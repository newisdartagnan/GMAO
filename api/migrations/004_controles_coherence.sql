-- =====================================================================
--  Contrôles de cohérence
--
--  Les clés étrangères couvrent les colonnes, mais pas les identifiants
--  rangés dans les colonnes JSONB — le périmètre d'un contrat, les
--  équipements d'une gamme, les pièces d'un ordre de travail. Une reprise
--  de données faite à la main peut donc y laisser des références mortes
--  sans qu'aucune contrainte ne proteste.
--
--  De même, les dates sont stockées en texte ISO : une saisie au format
--  français (« 25/08/2026 ») passe l'insertion et casse tous les calculs
--  d'échéance en silence.
--
--  La vue « v_coherence » rassemble ces contrôles. À consulter après
--  chaque reprise de données :
--
--      SELECT * FROM v_coherence ORDER BY gravite, controle;
-- =====================================================================

-- Une date ISO valide : « AAAA-MM-JJ » éventuellement suivi d'une heure.
CREATE OR REPLACE FUNCTION est_date_iso(valeur text) RETURNS boolean AS $$
BEGIN
  IF valeur IS NULL OR valeur = '' THEN RETURN true; END IF;
  IF valeur !~ '^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$' THEN RETURN false; END IF;
  PERFORM valeur::timestamp;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION est_date_iso IS
  'Vrai si la chaîne est une date ISO exploitable par l''application (ou vide).';

-- Références d'équipements contenues dans les colonnes JSONB.
CREATE OR REPLACE VIEW v_references_jsonb AS
SELECT 'contrats' AS table_source, c.id AS ligne, 'equipement_ids' AS colonne,
       e.valeur AS identifiant, 'equipements' AS table_cible
  FROM contrats c CROSS JOIN LATERAL jsonb_array_elements_text(c.equipement_ids) e(valeur)
UNION ALL
SELECT 'gammes', g.id, 'equipement_ids', e.valeur, 'equipements'
  FROM gammes g CROSS JOIN LATERAL jsonb_array_elements_text(g.equipement_ids) e(valeur)
UNION ALL
SELECT 'controles', c.id, 'equipement_ids', e.valeur, 'equipements'
  FROM controles c CROSS JOIN LATERAL jsonb_array_elements_text(c.equipement_ids) e(valeur)
UNION ALL
SELECT 'controles', c.id, 'famille_ids', f.valeur, 'familles'
  FROM controles c CROSS JOIN LATERAL jsonb_array_elements_text(c.famille_ids) f(valeur)
UNION ALL
SELECT 'articles', a.id, 'equipements_compatibles', e.valeur, 'equipements'
  FROM articles a CROSS JOIN LATERAL jsonb_array_elements_text(a.equipements_compatibles) e(valeur)
UNION ALL
SELECT 'rappels', r.id, 'equipement_ids', e.valeur, 'equipements'
  FROM rappels r CROSS JOIN LATERAL jsonb_array_elements_text(r.equipement_ids) e(valeur)
UNION ALL
SELECT 'rappels', r.id, 'equipements_traites', e.valeur, 'equipements'
  FROM rappels r CROSS JOIN LATERAL jsonb_array_elements_text(r.equipements_traites) e(valeur)
UNION ALL
SELECT 'rondes', r.id, 'equipements_attendus', e.valeur, 'equipements'
  FROM rondes r CROSS JOIN LATERAL jsonb_array_elements_text(r.equipements_attendus) e(valeur)
UNION ALL
SELECT 'gammes', g.id, 'pieces_prevues', p.valeur ->> 'articleId', 'articles'
  FROM gammes g CROSS JOIN LATERAL jsonb_array_elements(g.pieces_prevues) p(valeur)
UNION ALL
SELECT 'ordres_travail', o.id, 'pieces', p.valeur ->> 'articleId', 'articles'
  FROM ordres_travail o CROSS JOIN LATERAL jsonb_array_elements(o.pieces) p(valeur)
UNION ALL
SELECT 'ordres_travail', o.id, 'temps', t.valeur ->> 'technicienId', 'utilisateurs'
  FROM ordres_travail o CROSS JOIN LATERAL jsonb_array_elements(o.temps) t(valeur)
UNION ALL
SELECT 'bons_commande', b.id, 'lignes', l.valeur ->> 'articleId', 'articles'
  FROM bons_commande b CROSS JOIN LATERAL jsonb_array_elements(b.lignes) l(valeur)
 WHERE l.valeur ? 'articleId';

CREATE OR REPLACE VIEW v_coherence AS

-- 1. Références mortes dans les colonnes JSONB
SELECT
  'bloquant'::text AS gravite,
  'référence introuvable'::text AS controle,
  r.table_source || ' ' || r.ligne AS objet,
  r.colonne || ' pointe vers ' || r.table_cible || ' « ' || r.identifiant || ' » qui n''existe pas' AS detail
FROM v_references_jsonb r
WHERE r.identifiant IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM equipements e WHERE r.table_cible = 'equipements' AND e.id = r.identifiant
    UNION ALL SELECT 1 FROM articles a WHERE r.table_cible = 'articles' AND a.id = r.identifiant
    UNION ALL SELECT 1 FROM familles f WHERE r.table_cible = 'familles' AND f.id = r.identifiant
    UNION ALL SELECT 1 FROM utilisateurs u WHERE r.table_cible = 'utilisateurs' AND u.id = r.identifiant
  )

-- 2. Dates au mauvais format : elles cassent tous les calculs d'échéance
UNION ALL
SELECT 'bloquant', 'date non exploitable', 'equipements ' || code,
       'date_mise_en_service = « ' || date_mise_en_service || ' » — attendu AAAA-MM-JJ'
  FROM equipements WHERE NOT est_date_iso(date_mise_en_service)
UNION ALL
SELECT 'bloquant', 'date non exploitable', 'equipements ' || code,
       'date_acquisition = « ' || date_acquisition || ' » — attendu AAAA-MM-JJ'
  FROM equipements WHERE NOT est_date_iso(date_acquisition)
UNION ALL
SELECT 'bloquant', 'date non exploitable', 'equipements ' || code,
       'fin_garantie = « ' || fin_garantie || ' » — attendu AAAA-MM-JJ'
  FROM equipements WHERE NOT est_date_iso(fin_garantie)
UNION ALL
SELECT 'bloquant', 'date non exploitable', 'ordres_travail ' || numero,
       'date_creation = « ' || date_creation || ' » — attendu AAAA-MM-JJ'
  FROM ordres_travail WHERE NOT est_date_iso(date_creation)
UNION ALL
SELECT 'bloquant', 'date non exploitable', 'contrats ' || numero,
       'date_debut ou date_fin hors format ISO'
  FROM contrats WHERE NOT est_date_iso(date_debut) OR NOT est_date_iso(date_fin)
UNION ALL
SELECT 'bloquant', 'date non exploitable', 'visites_controle ' || COALESCE(numero_rapport, id),
       'date_visite ou date_prochaine hors format ISO'
  FROM visites_controle WHERE NOT est_date_iso(date_visite) OR NOT est_date_iso(date_prochaine)

-- 3. Accès : un compte actif sans mot de passe ne peut pas se connecter
UNION ALL
SELECT 'bloquant', 'compte sans accès', 'utilisateurs ' || email,
       'compte actif mais aucun mot de passe défini'
  FROM utilisateurs WHERE actif AND mot_de_passe_hash IS NULL

UNION ALL
SELECT 'bloquant', 'aucun administrateur', 'utilisateurs',
       'aucun compte de rôle « admin » actif avec un mot de passe défini'
 WHERE NOT EXISTS (
   SELECT 1 FROM utilisateurs WHERE role = 'admin' AND actif AND mot_de_passe_hash IS NOT NULL
 )

-- 4. Incohérences de paramétrage
UNION ALL
SELECT 'attention', 'seuils de stock', 'articles ' || code,
       'stock_min (' || stock_min || ') supérieur à stock_max (' || stock_max || ')'
  FROM articles WHERE stock_min > stock_max
UNION ALL
SELECT 'attention', 'contrat incohérent', 'contrats ' || numero,
       'date_fin antérieure à date_debut'
  FROM contrats
 WHERE est_date_iso(date_debut) AND est_date_iso(date_fin) AND date_fin < date_debut
UNION ALL
SELECT 'attention', 'mise en service future', 'equipements ' || code,
       'date_mise_en_service au ' || date_mise_en_service || ', postérieure à aujourd''hui'
  FROM equipements
 WHERE statut = 'en_service' AND est_date_iso(date_mise_en_service)
   AND date_mise_en_service::date > CURRENT_DATE

-- 5. Couverture de maintenance
UNION ALL
SELECT 'attention', 'équipement critique sans préventif', 'equipements ' || e.code,
       e.designation || ' — criticité ' || e.criticite || ', aucune gamme ne le couvre'
  FROM equipements e
 WHERE e.statut <> 'reforme' AND e.criticite <= 2
   AND NOT EXISTS (
     SELECT 1 FROM gammes g
      WHERE g.actif
        AND (g.equipement_ids ? e.id OR g.famille_id = e.famille_id)
   )
UNION ALL
SELECT 'information', 'équipement sans document', 'equipements ' || e.code,
       e.designation || ' — aucune notice ni certificat archivé'
  FROM equipements e
 WHERE e.statut <> 'reforme' AND e.criticite = 1
   AND NOT EXISTS (
     SELECT 1 FROM documents d WHERE d.entite_type = 'equipement' AND d.entite_id = e.id
   )

-- 6. Rondes
UNION ALL
SELECT 'attention', 'ronde sans périmètre', 'rondes ' || numero,
       'aucun équipement attendu : la ronde ne peut pas être effectuée'
  FROM rondes WHERE jsonb_array_length(equipements_attendus) = 0;

COMMENT ON VIEW v_coherence IS
  'Anomalies de données que les contraintes du schéma ne peuvent pas attraper. À consulter après toute reprise de données.';
