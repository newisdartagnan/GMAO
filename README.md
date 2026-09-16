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

Vérifier que les quatre ports de la pile sont libres, puis démarrer :

```bash
./scripts/verifier-ports.sh
docker compose up -d
```

L'interface est disponible sur **http://localhost:8080** (ou l'adresse du
serveur sur le réseau de l'établissement).

Au premier démarrage, l'API applique les migrations puis peuple la base avec un
jeu de données de démonstration décrivant un hôpital complet — 30 services,
près de mille équipements, vingt mois d'historique d'interventions. Pour partir
d'une base vierge, mettre `SEED_AU_DEMARRAGE=false` avant le premier
lancement : il ne restera qu'à créer les comptes d'accès.

### Si un port est déjà pris

La pile publie quatre ports sur le serveur. Si l'un d'eux est occupé, Docker
refuse de démarrer le conteneur concerné :

```
Bind for 0.0.0.0:5434 failed: port is already allocated
```

Le port en cause est celui du message. Il suffit de changer la variable
correspondante dans `.env` et de relancer `docker compose up -d` — ces ports ne
servent qu'à joindre la pile depuis le poste, les conteneurs communiquent entre
eux par leur réseau interne.

| Variable | Défaut | À quoi il sert | Conflits fréquents |
|---|---|---|---|
| `WEB_PORT` | 8080 | Interface web — l'adresse que les agents ouvrent | Très fréquent : autre application web |
| `DB_PORT_HOTE` | 5434 | PostgreSQL pour pgAdmin, DBeaver, `psql` | 5432 : PostgreSQL local · 5433 : autre pile de conteneurs |
| `API_PORT_HOTE` | 3001 | Interroger l'API directement | Serveurs de développement Node |
| `ADMINER_PORT` | 8081 | Adminer, profil `admin` seulement | Autre outil d'administration |

Pour savoir ce qui occupe un port :

```bash
docker ps --format '{{.Names}}\t{{.Ports}}'   # un autre conteneur ?
sudo ss -tlnp | grep 5434                      # ou un service de la machine
```

Ni l'API ni Adminer n'ont besoin de `DB_PORT_HOTE` : ils joignent PostgreSQL
par le réseau des conteneurs. Ce port n'existe que pour brancher un outil
d'administration depuis le poste.

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

Deux outils démarrent :

| Outil | Adresse | Pour quoi faire |
|---|---|---|
| **pgAdmin 4** | http://localhost:8082 | Reprendre les données à la main : corriger, supprimer, importer |
| **Adminer** | http://localhost:8081 | Une requête ponctuelle, sans attendre le chargement de pgAdmin |

Les deux sont limités à la boucle locale du serveur : depuis un autre poste,
passer par un tunnel SSH. La base est aussi joignable par un pgAdmin installé
sur le poste, par DBeaver ou par `psql`, sur le port `DB_PORT_HOTE` (5434 par
défaut).

### pgAdmin 4

Le compte d'accès est celui de `PGADMIN_EMAIL` / `PGADMIN_PASSWORD`. La
connexion au serveur est déjà déclarée sous le nom « GMAO — base de
l'hôpital » : seul le mot de passe de la base (`DB_PASSWORD`) est demandé à la
première ouverture.

Les fichiers CSV à importer se téléversent depuis la fenêtre d'import de
pgAdmin (bouton **Upload**), et les exports se téléchargent par le navigateur.

**Si pgAdmin ne répond pas sur son port :**

```bash
docker compose ps -a                 # gmao-pgadmin existe-t-il, dans quel état ?
docker compose logs pgadmin --tail=40
./scripts/verifier-configuration.sh  # PGADMIN_PASSWORD est-il renseigné ?
./scripts/verifier-ports.sh          # le port est-il déjà pris ?
```

Trois causes, par ordre de fréquence : `PGADMIN_PASSWORD` vide — pgAdmin
refuse alors de démarrer et le dit dans son journal ; le port déjà occupé par
une autre application ; le premier démarrage encore en cours, qui prend une
bonne minute le temps que pgAdmin construise sa base de configuration.

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

`v_demandes_externes` s'ajoute à cette liste quand un formulaire de
signalement est branché (voir plus bas).

---

## Reprendre la base à la main

Oui, la base est entièrement modifiable depuis pgAdmin : c'est un PostgreSQL
ordinaire, sans surcouche propriétaire. Le schéma est en français, les tables
portent le nom des objets métier, et rien n'est chiffré. Trois précautions,
et une seule est propre à cette application.

**1. L'API garde l'état en mémoire.** Elle sert ses réponses depuis une copie
de la base, pour appliquer les mêmes règles de calcul que l'interface. Après
une écriture faite en SQL, il faut la lui faire relire, sinon elle continue
d'afficher l'ancien état — et la prochaine écriture depuis l'interface
réécrira par-dessus votre correction :

> **Paramètres → Base de données → Recharger depuis la base**

Pour une opération de masse, plus simple : `docker compose stop api`, on
travaille, puis `docker compose start api`.

**2. Certaines références vivent dans du JSONB** — les équipements couverts par
un contrat, les points d'une gamme, les lignes d'un bon de commande. Elles
échappent aux clés étrangères : supprimer un équipement laisse son
identifiant dans les contrats qui le citaient, sans que PostgreSQL ne dise
rien.

**3. Les dates sont du texte au format `AAAA-MM-JJ`**, jamais `JJ/MM/AAAA`.
C'est ce que lit le code métier.

Ces trois points se vérifient d'une requête, à lancer après toute reprise :

```sql
SELECT * FROM v_coherence ORDER BY gravite, controle;
```

La vue signale les références mortes, les dates inexploitables, les comptes
actifs sans mot de passe, une base sans administrateur, les seuils de stock
incohérents, les contrats qui finissent avant de commencer, les équipements
critiques sans gamme préventive. Ce qui est marqué `bloquant` empêche
l'application de fonctionner correctement ; `attention` et `information`
décrivent l'état du paramétrage.

### Vider le jeu de démonstration

```bash
./scripts/sauvegarder.sh          # d'abord. Une purge ne se rattrape pas.
docker compose stop api
```

Ouvrir `scripts/purger-donnees.sql` dans pgAdmin. Deux niveaux au choix,
tous deux commentés :

- **niveau 1** — efface l'activité (interventions, rondes, stocks, historique)
  et garde le référentiel : sites, services, locaux, familles, équipements,
  comptes. C'est ce qu'on veut après une période d'essai ;
- **niveau 2** — ne laisse que le schéma.

Le script s'exécute dans une transaction qui finit par `ROLLBACK` : la
première exécution ne change rien et affiche le compte exact de chaque table.
Quand le résultat convient, remplacer `ROLLBACK` par `COMMIT` et réexécuter.

Le jeu de démonstration ne revient pas de lui-même : la table `installation`
garde la trace du peuplement initial, et l'API ne peuple que sur une base qui
n'a jamais rien reçu.

### Repartir sur une base vierge

Après une purge de niveau 2, il faut au minimum un site, un bâtiment, un
local, un service et un compte administrateur pour que l'application
s'ouvre. `scripts/creer-administrateur.sql` les crée ; il reste à y coller le
mot de passe haché :

```bash
docker compose exec api node -e \
  "console.log(require('bcryptjs').hashSync('MotDePasseChoisi', 10))"
```

### Charger l'inventaire réel

`scripts/importer-equipements.sql` charge un CSV d'équipements. Le fichier
désigne les rattachements par leurs codes métier — code famille, code local,
code service — et non par des identifiants internes : c'est le script qui fait
la correspondance. Modèle de fichier : `scripts/modele-equipements.csv`.

Le script commence par un rapport de contrôle — lignes lues, codes en double,
familles inconnues, dates mal formées, criticités hors bornes — avant
d'écrire quoi que ce soit, et lui aussi finit par `ROLLBACK` tant qu'on ne
l'a pas remplacé par `COMMIT` :

```
 controle                         | valeur
----------------------------------+--------
 lignes lues                      | 6
 codes déjà présents dans la base | 1
 famille inconnue : ZZZ           | 1
 date non exploitable             | 1
 criticité hors 1-4               | 1
```

Les lignes signalées sont laissées de côté ; les autres passent. On corrige
le CSV et on recommence.

---

## Recevoir les demandes par formulaire

Un aide-soignant qui constate une panne à 3 h du matin n'ouvrira pas la GMAO :
il n'a pas de compte, et il a autre chose à faire. Il a un téléphone. Le
formulaire qu'il remplit devient une demande d'intervention, dans la file du
service technique.

Deux fournisseurs sont pris en charge : **Microsoft Forms** (via Power
Automate) et **JotForm**.

### Faut-il un QR par équipement, ou un seul QR pour tout ?

Les deux, et ce n'est pas un compromis : ils ne servent pas la même chose.

| | QR générique | QR par équipement |
|---|---|---|
| Où | Affiches de couloir, tableaux de service, arbre de canvas | Étiquette collée sur la machine |
| Pour quoi | Plomberie, maçonnerie, menuiserie, un éclairage de circulation — tout ce qui n'a pas de numéro d'inventaire | Les équipements inventoriés : biomédical, groupes, climatisation, compresseurs |
| Ce que le demandeur saisit | Bâtiment, salle, désignation | Rien de tout cela : le code est déjà là |
| Ce que la GMAO en fait | Une demande rattachée à un lieu | Une demande **rattachée à la machine** |

Le QR générique reste indispensable : une fuite dans un WC n'a pas de numéro
d'inventaire, et une étiquette peut être décollée ou illisible.

Mais tout ce qui est à l'inventaire mérite son propre QR, pour une raison qui
est la raison d'être d'une GMAO : **sans code, la demande ne s'attache à
aucune machine.** Or c'est l'historique par machine qui fait tout le reste —
le coût cumulé d'un climatiseur, son taux de panne, la décision de le
remplacer plutôt que de le réparer une cinquième fois, le déclenchement d'une
maintenance préventive. Une demande « climatiseur, MKL3, cuisine » est un
ticket ; « CLI-0142 » est une donnée de maintenance.

Accessoirement, cela retire trois questions au demandeur — bâtiment, salle,
équipement — et supprime l'ambiguïté : il y a quarante climatiseurs à
Monkole, et « le climatiseur de la cuisine » ne dit pas lequel.

**Le même formulaire sert les deux.** Il suffit de lui ajouter une question
qui reçoit le code, laissée vide quand on arrive par le QR générique.

### 1. Préparer le formulaire

Le formulaire de signalement en service convient tel quel. Une seule
modification est nécessaire pour les QR par équipement : ajouter une question

> **Code inventaire** *(rempli automatiquement — ne pas modifier)*

en texte court, non obligatoire, placée en tête.

Les questions sont reconnues **par leur libellé**, mot à mot. Celles du
formulaire de Monkole le sont déjà :

| Colonne du classeur | Ce qu'elle alimente |
|---|---|
| `Id_formulaire` | l'identifiant de réponse, et le repère de lecture |
| `Date de plainté` | l'horodatage de la demande |
| `Code inventaire` *(à ajouter)* | l'équipement, retrouvé à l'inventaire |
| `Nom du demandeur` | le déclarant |
| `Date de dèbut du probleme` | l'ancienneté, reportée dans la demande |
| `Secteur` | le corps de métier, reporté dans la demande |
| `Lieu` | le site ou le bâtiment |
| `Salle de lieu` | le local |
| `Équipement` | la désignation libre de l'objet en panne |
| `Description du problème` | la description, et l'objet en est tiré |
| `Priorité` | la priorité : Haute → P1, Moyenne → P3, Basse → P4 |

La première colonne porte l'identifiant, quel que soit son libellé. Les
colonnes de service que Forms ajoute — `ID`, `Heure de début`, `Heure de fin`,
`E-mail`, `Nom` — sont écartées des réponses : les lire comme des réponses
ferait passer l'heure de début pour la date d'apparition du problème.

L'onglet **Paramètres → Formulaire externe** affiche les noms acceptés pour
chaque case. Si un libellé change, `FORMULAIRE_CHAMPS` le raccorde sans
toucher au code :

```
FORMULAIRE_CHAMPS={"equipement":"Numéro GMAO","urgence":"Niveau de gravité"}
```

### 2. Relever le paramètre de pré-remplissage

Dans l'éditeur du formulaire : **… → Obtenir un lien pré-rempli**, remplir la
seule question « Code inventaire », copier le lien produit. Il ressemble à

```
https://forms.cloud.microsoft/r/u4qTeSeAUF?r8f3c1e0a4b24d0e9=TEST
                                            └──── à relever ────┘
```

Ce nom de paramètre est propre à la question ; il ne change pas tant que la
question n'est pas supprimée.

```ini
FORMULAIRE_SOURCE=microsoft
FORMULAIRE_URL=https://forms.cloud.microsoft/r/u4qTeSeAUF
FORMULAIRE_PARAM_CODE=r8f3c1e0a4b24d0e9
```

### 3. Laisser la GMAO lire le classeur des réponses

Microsoft Forms n'expose **aucune API de lecture des réponses** — c'est le mur
contre lequel on se cogne en cherchant de ce côté. En revanche, Forms recopie
de lui-même chaque réponse dans un classeur Excel sur OneDrive,
**nativement, sans automatisation**. C'est par là qu'on passe.

> L'autre voie — une action HTTP dans Power Automate qui appellerait la GMAO —
> est un connecteur **payant**, indisponible sur un compte Microsoft personnel,
> et elle suppose en plus que le serveur soit joignable depuis Internet. Elle
> reste possible (`MSFORMS_MODE=webhook`), mais ce n'est pas la voie par défaut.

#### Inscrire une application

Un compte Microsoft **personnel** (outlook.fr, hotmail.com, live.fr) n'a pas
de locataire où accorder des autorisations d'application. Le seul flux
possible est donc le flux **délégué** : la GMAO agit au nom du compte
propriétaire du classeur, qui l'autorise une fois.

Sur [entra.microsoft.com](https://entra.microsoft.com), connecté avec le
compte qui possède le classeur — **Inscriptions d'applications → Nouvelle
inscription** :

| Réglage | Valeur |
|---|---|
| Nom | `GMAO — lecture des signalements` |
| Types de comptes | **Comptes Microsoft personnels uniquement** (ou « … et comptes personnels ») |
| URI de redirection | aucune |

Puis, dans l'inscription créée :

- **Authentification** → *Paramètres avancés* → **Autoriser les flux client
  publics : Oui**. Sans cela, Microsoft réclame un secret client
  (`AADSTS7000218`) qu'une inscription de client public n'a pas.
- **API → Ajouter une autorisation → Microsoft Graph → autorisations
  DÉLÉGUÉES → `Files.Read`**. Des autorisations *d'application* ne
  fonctionneraient pas ici.
- **Ne pas** créer de secret client.

```ini
MSFORMS_MODE=graph
MSFORMS_AUTH=delegue
MSFORMS_TENANT_ID=consumers
MSFORMS_CLIENT_ID=<ID d'application>
MSFORMS_CLIENT_SECRET=
MSFORMS_CLASSEUR=me:/Maintenance/Formulaire maintenance -- Hôpital Monkole.xlsx
MSFORMS_TABLEAU=Tableau1
FORMULAIRE_INTERVALLE_MIN=5
```

Quatre écritures pour `MSFORMS_CLASSEUR` :

```
me:/Maintenance/reponses.xlsx          OneDrive du compte autorisé
item:<driveItemId>                     le même, par identifiant
drive:<driveId>:/chemin.xlsx           un autre OneDrive
site:<hôte>:/sites/<nom>:/chemin.xlsx  une bibliothèque SharePoint
```

La forme `item:` est la plus sûre : elle survit à un renommage et ne souffre
ni des accents ni des espaces — dont le nom du classeur de Monkole est
abondamment pourvu. L'identifiant se relève dans
[Graph Explorer](https://developer.microsoft.com/graph/graph-explorer) :

```
GET /me/drive/root:/Maintenance/Formulaire maintenance -- Hôpital Monkole.xlsx
```

#### Autoriser la GMAO, une seule fois

```bash
docker compose exec api npm run lier-microsoft --workspace=api
```

La commande affiche un code et une adresse. On ouvre l'adresse dans un
navigateur — depuis n'importe quel poste —, on se connecte avec le compte
propriétaire du classeur, on saisit le code. La GMAO reçoit son autorisation
et vérifie aussitôt qu'elle accède bien au classeur, en listant ses tableaux.

C'est le flux « code d'appareil », prévu pour les machines sans navigateur :
il évite d'avoir à exposer une adresse de redirection publique, que la GMAO
n'a pas.

> **Le jeton vit en base, pas dans `.env`.** Microsoft en délivre un nouveau à
> chaque renouvellement et invalide le précédent. S'il n'était conservé que
> dans le fichier de configuration, la collecte s'arrêterait au premier
> redémarrage suivant. La table `integrations_secrets` contient donc un secret
> en clair : une sauvegarde de la base doit être traitée en conséquence.
>
> Le jeton expire après 90 jours sans usage. Une collecte qui tourne toutes
> les cinq minutes le renouvelle bien avant. Après un long arrêt, relancer
> `lier-microsoft`.

### 4. Choisir où pointe le QR

Un QR code n'est qu'un pointeur vers une adresse : il ne peut pas envoyer la
réponse à deux endroits. Ce qu'il décide, c'est seulement quelle page s'ouvre.
Mais on peut décider **qui** décide :

| | Le QR pointe sur le formulaire | Le QR passe par la GMAO |
|---|---|---|
| `FORMULAIRE_BASE_QR` | vide | `https://gmao.monkole.cd` |
| Ce qu'encode l'étiquette | `forms.cloud.microsoft/r/u4qT?r8f3=REA-0020` | `gmao.monkole.cd/r/REA-0020` |
| Changer de formulaire | réimprimer et recoller tout le parc | une variable d'environnement |
| Marche hors du réseau de l'hôpital | oui | non |

La GMAO sert alors d'aiguillage : `/r/<code>` renvoie (302, sans mise en
cache) vers le formulaire du moment, code d'inventaire pré-rempli. `/r` tout
court sert le QR générique des couloirs. Chaque scan est journalisé, ce qui
donne au passage une mesure de l'usage réel des étiquettes.

**À ne choisir que si les téléphones des services savent joindre le serveur.**
Sur un site isolé où le réseau de l'établissement n'arrive pas — Kimbondo,
Kinvula, Moluka — le QR doit viser le formulaire directement.

### 5. Imprimer les étiquettes

Page **Équipements** → sélection → **Étiquettes**. Chaque étiquette porte deux
codes : le code-barres linéaire pour les douchettes du magasin, et le QR pour
les téléphones des services.

Le QR est encodé en correction « M » : sur une étiquette de deux centimètres,
ce qui décide de la lecture est la taille d'un module, pas la marge de
correction — la même URL demande 33 modules en « M » contre 45 en « H ».

### Ce qu'il advient d'une réponse

L'objet de la demande est tiré de la première phrase de la description, faute
de champ dédié. L'ancienneté, le secteur, le déclarant non reconnu, le lieu et
la désignation libre sont reportés dans la description plutôt que perdus.

L'urgence déclarée reste **déclarée** : elle n'est jamais relevée d'office,
même sur un équipement vital. C'est le service technique qui requalifie.

Un code d'inventaire inconnu ne fait pas perdre la demande : elle est créée
sans équipement, le code saisi reporté dans sa description. Une désignation
libre — « climatiseur », « robinet » — n'est pas prise pour un code.

Une réponse sans description **ni** objet est écartée : il n'y a rien à
transmettre. Le webhook répond quand même 200, sinon Power Automate la
représente indéfiniment.

Les réponses d'origine sont conservées telles quelles et dépliables dans le
panneau de détail de la demande. Quand l'interprétation est contestée — « ce
n'est pas ce que j'ai coché » — c'est là qu'on tranche.

### Le rattachement dépend du référentiel

Une réponse qui indique « MKL2 » ne se rattache à un bâtiment que si `MKL2`
existe dans les sites ou bâtiments de la GMAO. Tant que le référentiel n'est
pas celui de l'établissement, ces demandes reviennent au service du compte
`FORMULAIRE_COMPTE_SERVICE` — jamais au premier service de la liste, qui
fausserait les statistiques.

Charger les sites, bâtiments et locaux réels est donc le premier travail :
voir **Reprendre la base à la main**.

### Surveiller et rattraper

**Paramètres → Formulaire externe** montre l'état du connecteur, la dernière
réception, le repère atteint, la dernière erreur et les demandes reçues. En
mode classeur, deux boutons : « Récupérer maintenant » et « Rattraper les
7 derniers jours ». Relire une période déjà importée ne crée pas de doublon.

```sql
SELECT numero, equipement_code, objet, urgence_declaree, statut, reponses_brutes
  FROM v_demandes_externes ORDER BY recu_le DESC;

SELECT * FROM integrations_etat;      -- où en est la lecture
```

### Vérifier l'interprétation

Les règles d'appariement des questions et de lecture du vocabulaire d'urgence
sont éprouvées par un banc d'essai qui tourne sans base de données, sur les
libellés réels du formulaire :

```bash
npm run verifier-formulaires --workspace=api
```

À relancer après toute modification du formulaire ou de `FORMULAIRE_CHAMPS`.

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
