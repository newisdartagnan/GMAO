# GMAO Hospitalière

Gestion de maintenance assistée par ordinateur pour un hôpital général de
référence : parc d'équipements biomédicaux et techniques, ordres de travail,
maintenance préventive et réglementaire, rondes d'inspection quotidiennes,
matériovigilance, stocks et contrats.

L'ensemble tourne sur un serveur de l'établissement, en conteneurs Docker.
Rien ne sort du réseau local.

| Composant | Technologie |
|---|---|
| Interface web | React 19, TypeScript, Vite, Tailwind CSS 4 |
| API | Fastify 5, TypeScript, Node 22 |
| Base de données | PostgreSQL 16 |
| Distribution | Docker Compose, nginx |

---

## Démarrage

Prérequis : Docker et Docker Compose sur le serveur.

```bash
git clone https://github.com/newisdartagnan/GMAO.git
cd GMAO
cp .env.example .env
```

Renseigner au minimum deux valeurs dans `.env` :

```bash
openssl rand -base64 32   # pour DB_PASSWORD
openssl rand -base64 32   # pour JWT_SECRET
```

Puis :

```bash
docker compose up -d
```

L'interface est disponible sur **http://localhost:8080** (ou l'adresse du
serveur sur le réseau de l'établissement).

Au premier démarrage, l'API applique les migrations puis peuple la base avec un
jeu de données de démonstration décrivant un hôpital complet — 30 services,
près de mille équipements, vingt mois d'historique d'interventions. Pour partir
d'une base vierge, mettre `SEED_AU_DEMARRAGE=false` avant le premier
lancement : il ne restera qu'à créer les comptes d'accès.

### Première connexion

Les comptes créés par le peuplement utilisent l'adresse
`prenom.nom@hgr-kinshasa.cd` et le mot de passe défini par
`MOT_DE_PASSE_PAR_DEFAUT` (`gmao2026` si rien n'est précisé). Deux profils
utiles pour commencer :

| Profil | Adresse | Ce qu'il peut faire |
|---|---|---|
| Responsable biomédical | `celine.tshibangu@hgr-kinshasa.cd` | Tout le suivi technique : planifier, clôturer, valider |
| Administrateur | `antoine.mbuyi@hgr-kinshasa.cd` | En plus : gérer les comptes et la base |

**Changer ces mots de passe à la première connexion** (Paramètres → Mon compte).

### Ouverture automatique des rondes

Les créneaux d'inspection du jour peuvent être ouverts automatiquement avant
chaque prise de service. Renseigner `COMPTE_SERVICE` et
`MOT_DE_PASSE_SERVICE` dans `.env`, puis :

```bash
docker compose --profile planificateur up -d
```

Un conteneur léger appelle alors l'API à 6 h 30 et 16 h 30. Sans lui, les
créneaux s'ouvrent à la demande depuis l'écran des rondes.

---

## Administration de la base

```bash
docker compose --profile admin up -d
```

Adminer est alors accessible sur **http://localhost:8081** (serveur `db`,
utilisateur et base définis dans `.env`). L'accès est limité à la boucle
locale du serveur : depuis un autre poste, passer par un tunnel SSH.

La base est aussi joignable par pgAdmin, DBeaver ou `psql` sur le port
`DB_PORT_HOTE` (5433 par défaut), lui aussi restreint à la boucle locale.

### Vues prêtes à l'emploi

Le schéma expose des vues qui évitent de réécrire les jointures courantes :

| Vue | Contenu |
|---|---|
| `v_equipements` | Parc avec familles, services, localisation et vétusté calculée |
| `v_ordres_travail` | Interventions avec temps passé et coûts recalculés |
| `v_conformite_reglementaire` | Échéances de contrôle, verdicts, jours restants |
| `v_rondes_inspection` | Registre de garde : ronde, agent, avancement, anomalies |
| `v_releves_inspection_detail` | Chaque valeur relevée, à plat, prête pour un tableur |
| `v_stock_a_commander` | Articles sous seuil, quantité à commander, couverture |

```sql
-- Ce qu'un auditeur demande en premier
SELECT controle, equipement, prochaine_echeance, jours_restants
  FROM v_conformite_reglementaire
 WHERE jours_restants < 0
 ORDER BY jours_restants;

-- Suivi d'un paramètre relevé en ronde
SELECT date, shift, valeur_num, conforme
  FROM v_releves_inspection_detail
 WHERE equipement_code = 'FLU-0634'
   AND point_controle LIKE 'Titre en oxygène%'
 ORDER BY date;
```

### Après une modification directe en SQL

L'API garde une copie de l'état en mémoire. Après une écriture faite hors de
l'application, lui demander de relire les tables : **Paramètres → Base de
données → Recharger depuis la base**, ou `POST /api/admin/recharger`.

---

## Sauvegarde et restauration

```bash
./scripts/sauvegarder.sh                      # → sauvegardes/gmao-AAAAMMJJ-HHMM.dump
./scripts/restaurer.sh gmao-20260825-1830.dump
```

Le script de sauvegarde conserve les trente derniers fichiers. **Les copier
sur un support externe** : une sauvegarde qui reste sur le disque de la base ne
protège de rien. Pour une sauvegarde quotidienne, ajouter au `crontab` du
serveur :

```
30 22 * * * cd /chemin/vers/GMAO && ./scripts/sauvegarder.sh
```

---

## Ce que couvre l'application

### Pilotage
Tableau de bord — disponibilité du parc, MTBF, MTTR, part de préventif, coût du
mois, conformité réglementaire, alertes critiques. Alertes recalculées en
continu à partir des échéances, des seuils de stock, des capteurs et des
engagements de service. Analyses : fiabilité, coûts par service et par domaine,
diagramme de Pareto des causes de défaillance, plan de renouvellement chiffré,
export CSV pour la direction.

### Interventions
Demandes émises par les services de soins (web, code-barres, téléphone),
qualifiées puis transformées en ordre de travail ou refusées avec motif.
Ordres de travail correctifs, préventifs, réglementaires et métrologiques :
planification, affectation, saisie des temps et des pièces, relevés de mesure
avec tolérances, préparation sécurité, réserves, signatures, fil d'échanges.
Vue liste ou kanban, planning hebdomadaire et plan de charge par technicien.

### Rondes d'inspection quotidiennes
Deux passages par jour sur les installations qui ne s'arrêtent pas — **prise de
service à 7 h, relève de garde à 17 h**. Sept modèles de ronde couvrent la
production d'oxygène, l'eau, les groupes électrogènes, la climatisation et le
traitement d'air, l'énergie et les onduleurs, l'air médical et le vide, le
froid médical critique.

Chaque modèle décrit ses points de contrôle avec la valeur attendue : titre en
oxygène entre 93 et 96 %, niveau de gasoil au-dessus de 40 %, eau chaude au
moins à 55 °C pour la prévention des légionelles, surpression du bloc
opératoire au-dessus de 10 Pa. Certains points sont marqués *bloquants* : un
écart y ouvre automatiquement une demande d'intervention, en priorité P1 sur un
équipement vital, avant même que l'agent ait fini son tour.

Les relevés de compteur alimentent la maintenance sur usage, un créneau non
fait apparaît comme manqué, et le responsable technique vise la ronde à la
relève. Le registre est exportable — c'est la pièce qui prouve que la
surveillance a été assurée.

### Maintenance programmée
Gammes de maintenance à périodicité calendaire ou sur compteur d'usage, avec
opérations détaillées, tolérances, pièces prévues et référence normative.
Échéancier et génération automatique des ordres de travail.

Conformité réglementaire : dix-sept obligations de contrôle (installations
électriques, locaux à usage médical, sécurité électrique des dispositifs
médicaux, radioprotection, fluides médicaux, appareils à pression,
stérilisation, salles propres, légionelles, eau de dialyse, ascenseurs,
sécurité incendie, métrologie), échéancier, saisie des visites d'organismes
agréés, suivi et levée des réserves, export du dossier d'audit.

Maintenance prédictive : capteurs, seuils, courbes de tendance et projection de
la date de franchissement.

### Parc et sécurité
Fiche équipement complète : identification et classe de dispositif médical,
implantation, cycle de vie et vétusté, compteurs, historique, coûts et
arbitrage de renouvellement, pièces compatibles, documents, traçabilité des
mouvements. Étiquette d'inventaire à code-barres Code 128 imprimable.
Implantation arborescente site → bâtiment → service → local. Matériovigilance
et suivi des actions correctives de sécurité des fabricants.

### Logistique
Stocks avec seuils, couverture rapportée au délai d'approvisionnement, pièces
critiques, mouvements tracés, lots et péremptions. Achats : bons de commande,
validation, réception avec recalcul du prix moyen pondéré, réapprovisionnement
automatique. Contrats et fournisseurs avec performance mesurée sur les
interventions réellement exécutées.

### Organisation
Comptes et rôles, équipes, habilitations réglementaires avec suivi de validité,
documentation technique, journal d'audit exportable.

---

## Rôles et droits

Le contrôle des droits se fait dans l'API, jamais dans l'interface : masquer un
bouton n'a jamais empêché personne d'appeler une route.

| Rôle | Peut |
|---|---|
| `demandeur` | Signaler une anomalie, commenter, consulter |
| `technicien` | En plus : saisir temps, pièces et mesures, terminer une intervention, faire les rondes |
| `magasinier` | En plus : mouvementer le stock, réceptionner |
| `acheteur` | En plus : engager et valider une commande |
| `responsable_biomedical` / `responsable_technique` | En plus : planifier, affecter, clôturer, viser, modifier le parc |
| `qualite` | Valider, lever une réserve, viser une ronde |
| `direction` | Consultation et analyses |
| `admin` | En plus : gérer les comptes et la base |

Deux garde-fous méritent d'être connus : la **clôture** d'un ordre de travail
est réservée aux responsables — l'exécutant enregistre son intervention comme
réalisée — et un agent ne peut pas **viser** sa propre ronde.

---

## Développement

```bash
npm install
npm run dev:api    # API sur http://localhost:3001
npm run dev:web    # interface sur http://localhost:5173
```

L'API a besoin d'un PostgreSQL. Le plus simple est de ne lancer que la base :

```bash
docker compose up -d db
npm run migrer --workspace=api
npm run seed --workspace=api
```

Autres commandes :

| Commande | Effet |
|---|---|
| `npm run typecheck` | Vérification des types sur les trois paquets |
| `npm run build` | Compile l'API et l'interface |
| `npm run migrer --workspace=api` | Applique les migrations en attente |
| `npm run seed --workspace=api -- --remplacer` | Régénère le jeu de démonstration |
| `npm run verifier-mapping --workspace=api` | Contrôle l'aller-retour objet ↔ SQL |

`verifier-mapping` relit la base et la compare au jeu qui a servi au
peuplement : une colonne oubliée dans une migration ou une conversion de nom
fautive s'y voit immédiatement. À lancer après toute modification du modèle de
domaine.

---

## Architecture

```
├── shared/          modèle de domaine, calculs, opérations métier
├── api/             Fastify, PostgreSQL, migrations SQL
│   └── migrations/  schéma versionné, appliqué au démarrage
├── web/             interface React
├── scripts/         sauvegarde, restauration, ouverture des rondes
└── docker-compose.yml
```

Quatre principes guident le code.

**Une seule définition du métier.** Le modèle de domaine, les indicateurs, les
échéanciers et les opérations d'écriture vivent dans `shared/`, utilisé tel
quel par l'API et par le navigateur. Il n'existe qu'une seule définition de
« ordre de travail en retard » ou de « prochaine échéance préventive » dans
tout le projet.

**Les indicateurs et les alertes sont calculés, jamais stockés.** Une alerte
disparaît d'elle-même dès que sa cause est traitée, ce qui évite les listes
d'alertes fantômes que produit tout système où il faut penser à les effacer.

**Le serveur tient l'état en mémoire, PostgreSQL fait foi.** Les écritures sont
sérialisées par une file d'attente : chaque commande s'applique sur une copie,
la différence part en base dans une transaction, puis le nouvel état est
publié. Cela permet d'exécuter côté serveur exactement les mêmes fonctions que
le navigateur, et rend les calculs d'indicateurs immédiats là où ils
demanderaient des dizaines de requêtes. En cas de doute, l'état se reconstruit
depuis les tables.

**Une écriture ne renvoie que ce qui a changé.** Le serveur calcule un patch
que l'interface applique à son état local : pas de rechargement de la base
entière après chaque saisie, ce qui compte sur une liaison lente.

### Le schéma de base

Les identifiants sont des chaînes applicatives (`eqp_0042`) plutôt que des
séquences : elles circulent inchangées du navigateur à la base, ce qui rend les
exports et les journaux lisibles.

Les dates sont stockées en `text` au format ISO. Le modèle mêle des dates
simples (échéance planifiée) et des horodatages (début réel d'intervention) sur
des champs voisins ; les conserver tels quels évite toute dérive de fuseau
entre le poste de saisie et le serveur. Les vues d'administration les exposent
converties en `date` et `timestamp`.

Les sous-structures toujours lues avec leur parent — opérations d'une gamme,
temps passés d'un ordre de travail, valeurs d'un relevé — sont en JSONB. Les
autres relations sont normalisées, avec clés étrangères et index.

---

## Choix assumés

**Les données restent dans l'établissement.** Aucun service externe, aucune
télémétrie. L'interface fonctionne en consultation sur le dernier état connu
quand le serveur ne répond pas — utile quand le réseau interne est
intermittent — mais toute écriture exige le serveur.

**Le code-barres des étiquettes est un Code 128 réellement encodé**, lisible
par les douchettes déjà présentes dans les magasins, plutôt qu'un QR code
exigeant un lecteur d'image.

**La monnaie de référence est le dollar américain**, usuelle pour les marchés
d'équipements hospitaliers en Afrique centrale.

**L'écriture concurrente est sérialisée.** À l'échelle d'un établissement —
quelques dizaines d'écritures par minute au plus fort — le coût est
négligeable et la cohérence totale. Ce choix ne conviendrait pas à un réseau de
plusieurs hôpitaux écrivant sur la même base ; il faudrait alors passer à des
transactions par agrégat.
