-- =====================================================================
--  Vues de confort pour l'administrateur de la base
--
--  Les tables conservent les dates au format ISO, tel que l'application les
--  produit. Ces vues les exposent converties et jointes aux libellés, pour
--  qu'une requête d'exploitation n'ait pas à réécrire les mêmes jointures.
-- =====================================================================

CREATE OR REPLACE VIEW v_equipements AS
SELECT
  e.id,
  e.code,
  e.designation,
  e.marque,
  e.modele,
  e.numero_serie,
  f.nom                                   AS famille,
  e.domaine,
  e.classe_dm,
  e.criticite,
  e.statut,
  s.nom                                   AS service,
  b.nom                                   AS batiment,
  l.nom                                   AS local,
  l.code                                  AS local_code,
  si.nom                                  AS site,
  NULLIF(e.date_mise_en_service, '')::date AS mise_en_service,
  NULLIF(e.fin_garantie, '')::date         AS fin_garantie,
  e.valeur_achat,
  e.duree_amortissement_ans,
  ROUND(
    EXTRACT(EPOCH FROM (now() - NULLIF(e.date_mise_en_service, '')::date))
      / NULLIF(e.duree_amortissement_ans * 365.25 * 86400, 0) * 100
  , 1)                                     AS vetuste_pct,
  c.numero                                AS contrat,
  fo.raison_sociale                       AS fournisseur
FROM equipements e
LEFT JOIN familles f     ON f.id = e.famille_id
LEFT JOIN services s     ON s.id = e.service_id
LEFT JOIN batiments b    ON b.id = e.batiment_id
LEFT JOIN locaux l       ON l.id = e.local_id
LEFT JOIN sites si       ON si.id = e.site_id
LEFT JOIN contrats c     ON c.id = e.contrat_id
LEFT JOIN fournisseurs fo ON fo.id = e.fournisseur_id;

CREATE OR REPLACE VIEW v_ordres_travail AS
SELECT
  o.id,
  o.numero,
  o.type,
  o.statut,
  o.priorite,
  o.objet,
  e.code                                        AS equipement_code,
  e.designation                                 AS equipement,
  s.nom                                         AS service,
  NULLIF(o.date_creation, '')::timestamp        AS creation,
  NULLIF(o.date_planifiee, '')::date            AS planifiee,
  NULLIF(o.date_echeance_sla, '')::timestamp    AS echeance_sla,
  NULLIF(o.date_fin, '')::timestamp             AS fin_reelle,
  NULLIF(o.date_cloture, '')::timestamp         AS cloture,
  o.execution,
  u.nom || ' ' || u.prenom                      AS technicien,
  fo.raison_sociale                             AS prestataire,
  -- Temps passé et coûts recalculés depuis les lignes JSONB, pour que l'export
  -- comptable n'ait pas à les redériver.
  COALESCE((SELECT SUM((t ->> 'dureeMin')::numeric) FROM jsonb_array_elements(o.temps) t), 0)          AS temps_min,
  COALESCE((SELECT SUM((t ->> 'dureeMin')::numeric / 60 * (t ->> 'tauxHoraire')::numeric)
            FROM jsonb_array_elements(o.temps) t), 0)                                                  AS cout_main_oeuvre,
  COALESCE((SELECT SUM((p ->> 'quantite')::numeric * (p ->> 'prixUnitaire')::numeric)
            FROM jsonb_array_elements(o.pieces) p), 0)                                                 AS cout_pieces,
  o.cout_prestataire,
  o.arret_equipement_min,
  o.conformite
FROM ordres_travail o
LEFT JOIN equipements e   ON e.id = o.equipement_id
LEFT JOIN services s      ON s.id = o.service_id
LEFT JOIN utilisateurs u  ON u.id = o.technicien_principal_id
LEFT JOIN fournisseurs fo ON fo.id = o.prestataire_id;

CREATE OR REPLACE VIEW v_conformite_reglementaire AS
SELECT
  c.code                                  AS controle_code,
  c.libelle                               AS controle,
  c.referentiel,
  c.bloquant,
  e.code                                  AS equipement_code,
  e.designation                           AS equipement,
  s.nom                                   AS service,
  NULLIF(v.date_visite, '')::date         AS derniere_visite,
  NULLIF(v.date_prochaine, '')::date      AS prochaine_echeance,
  NULLIF(v.date_prochaine, '')::date - CURRENT_DATE AS jours_restants,
  v.verdict,
  v.numero_rapport,
  jsonb_array_length(COALESCE(v.reserves, '[]'::jsonb)) AS nb_reserves
FROM visites_controle v
JOIN controles c    ON c.id = v.controle_id
LEFT JOIN equipements e ON e.id = v.equipement_id
LEFT JOIN services s    ON s.id = e.service_id;

CREATE OR REPLACE VIEW v_rondes_inspection AS
SELECT
  r.id,
  r.numero,
  NULLIF(r.date, '')::date        AS date,
  r.shift,
  si.nom                          AS site,
  r.statut,
  u.nom || ' ' || u.prenom        AS agent,
  NULLIF(r.heure_debut, '')::timestamp AS debut,
  NULLIF(r.heure_fin, '')::timestamp   AS fin,
  jsonb_array_length(r.equipements_attendus)                       AS equipements_attendus,
  (SELECT count(*) FROM releves_inspection ri WHERE ri.ronde_id = r.id) AS releves_saisis,
  (SELECT count(*) FROM releves_inspection ri
     WHERE ri.ronde_id = r.id AND ri.etat <> 'conforme')           AS anomalies,
  r.observations,
  r.signature,
  vu.nom || ' ' || vu.prenom      AS vise_par
FROM rondes r
LEFT JOIN sites si       ON si.id = r.site_id
LEFT JOIN utilisateurs u ON u.id = r.agent_id
LEFT JOIN utilisateurs vu ON vu.id = r.vise_par_id;

-- Détail à plat des valeurs relevées : la forme la plus commode pour tracer
-- l'évolution d'un paramètre ou exporter vers un tableur.
CREATE OR REPLACE VIEW v_releves_inspection_detail AS
SELECT
  ri.id                                   AS releve_id,
  r.numero                                AS ronde,
  NULLIF(r.date, '')::date                AS date,
  r.shift,
  e.code                                  AS equipement_code,
  e.designation                           AS equipement,
  m.code                                  AS modele,
  (pt ->> 'ordre')::int                   AS ordre,
  pt ->> 'libelle'                        AS point_controle,
  pt ->> 'unite'                          AS unite,
  (v ->> 'valeurNum')::numeric            AS valeur_num,
  v ->> 'valeurTexte'                     AS valeur_texte,
  (v ->> 'valeurBool')::boolean           AS valeur_bool,
  (v ->> 'conforme')::boolean             AS conforme,
  (pt ->> 'bloquant')::boolean            AS bloquant,
  ri.etat,
  ri.observation,
  u.nom || ' ' || u.prenom                AS agent
FROM releves_inspection ri
JOIN rondes r             ON r.id = ri.ronde_id
JOIN equipements e        ON e.id = ri.equipement_id
JOIN modeles_inspection m ON m.id = ri.modele_id
LEFT JOIN utilisateurs u  ON u.id = ri.agent_id
CROSS JOIN LATERAL jsonb_array_elements(ri.valeurs) v
LEFT JOIN LATERAL (
  SELECT p FROM jsonb_array_elements(m.points) p WHERE p ->> 'id' = v ->> 'pointId'
) pts(pt) ON true;

CREATE OR REPLACE VIEW v_stock_a_commander AS
SELECT
  a.code,
  a.designation,
  a.categorie,
  a.critique,
  a.stock_actuel,
  a.stock_min,
  a.stock_max,
  a.stock_max - a.stock_actuel            AS quantite_a_commander,
  a.consommation_mensuelle,
  a.delai_appro_jours,
  CASE WHEN a.consommation_mensuelle > 0
       THEN ROUND(a.stock_actuel::numeric / a.consommation_mensuelle * 30, 0)
  END                                     AS couverture_jours,
  f.raison_sociale                        AS fournisseur,
  a.prix_moyen_pondere,
  ROUND((a.stock_max - a.stock_actuel) * a.prix_moyen_pondere, 2) AS montant_estime
FROM articles a
LEFT JOIN fournisseurs f ON f.id = a.fournisseur_principal_id
WHERE a.actif AND a.stock_actuel <= a.stock_min
ORDER BY a.critique DESC, a.stock_actuel;
