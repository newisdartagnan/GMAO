-- =====================================================================
--  Créer un site et un compte administrateur sur une base vidée
--
--  À exécuter après une purge de niveau 2, avant la première connexion.
--  Adapter les valeurs, puis exécuter dans pgAdmin.
--
--  Le mot de passe ne peut pas être écrit ici : il doit être haché en
--  bcrypt. Deux façons de faire, au choix.
--
--  a) Laisser ce script créer le compte sans mot de passe, puis en
--     définir un depuis le serveur :
--        docker compose exec api node -e "
--          const b=require('bcryptjs');
--          console.log(b.hashSync('MonMotDePasse', 10));
--        "
--     et coller le résultat dans le UPDATE en bas de ce fichier.
--
--  b) Plus simple : garder un compte administrateur du jeu de
--     démonstration avant la purge, et l'utiliser pour créer les autres
--     depuis Paramètres → Comptes.
-- =====================================================================

BEGIN;

INSERT INTO sites (id, code, nom, adresse, ville, province, type, nb_lits, actif)
VALUES ('site_principal', 'HGR', 'Hôpital Général de Référence',
        'Adresse de l''établissement', 'Ville', 'Province', 'hopital', 0, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO services (id, code, nom, pole, site_id, responsable, criticite, continuite24_7)
VALUES ('srv_TEC', 'TEC', 'Services techniques', 'Support', 'site_principal',
        'À renseigner', 2, true)
ON CONFLICT (id) DO NOTHING;

-- Un bâtiment et un local sont nécessaires : tout équipement en dépend.
INSERT INTO batiments (id, site_id, code, nom, nb_etages, annee_construction)
VALUES ('bat_principal', 'site_principal', 'B1', 'Bâtiment principal', 1, 2000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO locaux (id, site_id, batiment_id, service_id, etage, code, nom,
                    zone_risque, surface_m2, acces_controle)
VALUES ('loc_TEC_01', 'site_principal', 'bat_principal', 'srv_TEC', 'RDC',
        'B1-TEC01', 'Atelier technique', 'zone_1', 40, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO utilisateurs (id, matricule, nom, prenom, email, role, site_id, service_id,
                          competences, taux_horaire, actif)
VALUES ('usr_admin', 'M001', 'Nom', 'Prénom', 'admin@hopital.local', 'admin',
        'site_principal', 'srv_TEC', '[]'::jsonb, 0, true)
ON CONFLICT (id) DO NOTHING;

-- Cette base est désormais tenue à la main : le jeu de démonstration ne
-- doit jamais s'y déverser, même si les tables sont vides à un
-- redémarrage. C'est cette trace que l'API consulte avant de peupler.
INSERT INTO installation (cle, valeur)
VALUES ('peuplement_initial', 'base montée à la main, jamais peuplée')
ON CONFLICT (cle) DO NOTHING;

-- Coller ici le haché produit par la commande ci-dessus :
-- UPDATE utilisateurs SET mot_de_passe_hash = '$2a$10$...' WHERE id = 'usr_admin';

SELECT id, email, role, (mot_de_passe_hash IS NOT NULL) AS acces_ouvert
  FROM utilisateurs WHERE id = 'usr_admin';

-- Remplacer par COMMIT une fois le résultat vérifié.
ROLLBACK;
