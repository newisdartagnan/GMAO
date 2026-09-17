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

### Après un `git pull`

```bash
./scripts/mettre-a-jour.sh
```

**`docker compose up -d` ne suffit pas.** Compose constate que les conteneurs
tournent et ne fait rien : le code fraîchement récupéré reste sur le disque
sans jamais entrer dans la pile, et l'application continue de servir
l'ancienne version — sans le dire. Les symptômes trompent :

| Ce qu'on voit | Ce que c'est |
|---|---|
| `ERROR: relation "v_coherence" does not exist` | une migration du dépôt n'est pas dans l'image servie |
| `npm error Missing script: "lier-microsoft"` | idem, le `package.json` du conteneur est l'ancien |
| une correction poussée qui ne change rien à l'écran | idem |

Le script reconstruit, redémarre, puis **vérifie** que les migrations du
dépôt sont bien celles qu'a la base — c'est ce contrôle qui distingue une
pile à jour d'une pile qui en a l'air.

À la main, si besoin :

```bash
docker compose build api web && docker compose up -d
```

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

Deux fournisseurs sont pris en charge : **Microsoft Forms** et **JotForm**.

### Rien à changer au formulaire ni au QR

Le formulaire en service et le QR code déjà distribué restent **tels quels**.
Les treize techniciens et le chef de service continuent de travailler comme
avant ; la GMAO se branche en lecture, derrière.

```
  QR existant  →  formulaire Microsoft  →  classeur Excel  →  GMAO
  (inchangé)      (inchangé)              (rempli par         demande
                                           Forms, nativement)  d'intervention
```

Ce que cela implique, dit franchement : **le formulaire ne demande pas de
numéro d'inventaire**, donc une demande n'arrive rattachée à aucune machine.
Or l'historique par machine est ce qui fait la valeur d'une GMAO — le coût
cumulé d'un climatiseur, son taux de panne, la décision de le remplacer
plutôt que de le réparer une cinquième fois.

Plutôt que d'exiger un code que personne n'ira chercher à 3 h du matin, la
GMAO **propose** :

| Ce que le formulaire donne | Ce que la GMAO en fait |
|---|---|
| `Secteur` = « Gaz Médicaux » | corps de métier → présélectionne l'équipe sur l'ordre de travail |
| `Lieu` = « MKL2 » | rattache la demande au bon service |
| `Salle de lieu` = « Bloc opératoire » | rattache au local s'il existe, sinon reste en clair |
| `Équipement` = « prise murale oxygène » | cherche dans l'inventaire et propose les candidats |
| `Priorité` = « Haute » | P1, avec risque patient |
| `Date de plainté` | l'heure réelle du signalement |

Dans le panneau de la demande, un bloc « Aucun équipement rattaché » liste
les machines qui peuvent correspondre, **avec la raison de chaque
proposition** — les mots employés, le local, le corps de métier. Un clic sur
« Rattacher » et l'intervention entre dans l'historique de la bonne machine.

Rien n'est rattaché automatiquement. Un rapprochement qui se trompe en
silence coûte plus cher que pas de rapprochement du tout : c'est pourquoi la
GMAO propose et le responsable tranche.

> **Plus tard, si vous le souhaitez.** Ajouter au formulaire une question
> « Code inventaire » et coller un QR par équipement supprimerait cette étape
> — la demande arriverait déjà rattachée. Ce n'est pas nécessaire pour que la
> chaîne fonctionne, et cela perturberait l'existant. Le connecteur reconnaît
> la question si elle apparaît un jour, sans autre réglage.

### Le référentiel des vingt lieux

Pour que `Lieu` et `Secteur` se rattachent, les vingt lieux du formulaire et
les neuf secteurs doivent exister dans la GMAO. Un script les crée :

```bash
docker compose exec -T db psql -U gmao gmao < scripts/referentiel-monkole.sql
```

Il s'exécute d'abord en lecture — `ROLLBACK` à la fin — et affiche ce qu'il
créerait. Quand le récapitulatif convient, remplacer `ROLLBACK` par `COMMIT`
et réexécuter. Le script est rejouable : ce qui existe déjà n'est pas touché.

C'est un point de départ. Les lieux sont créés à plat, un service et un
bâtiment chacun, parce que la liste du formulaire ne dit pas lesquels sont
des sites distincts et lesquels sont des bâtiments du campus. À réorganiser
depuis pgAdmin une fois la structure réelle arrêtée.

Sans ce référentiel, tout fonctionne quand même : les demandes arrivent, avec
le lieu en clair dans leur description, et reviennent au service du compte de
service.

### 1. Ce que la GMAO lit dans le classeur

Les colonnes sont reconnues **par leur libellé**, mot à mot. Celles du
classeur en service le sont déjà, sans rien y changer :

| Colonne du classeur | Ce qu'elle alimente |
|---|---|
| `Id_formulaire` | l'identifiant de réponse, et le repère de lecture |
| `Date de plainté` | l'horodatage de la demande |
| `Nom du demandeur` | le déclarant |
| `Date de dèbut du probleme` | l'ancienneté, reportée dans la demande |
| `Secteur` | le corps de métier, qui présélectionne l'équipe |
| `Lieu` | le service, parmi les vingt lieux |
| `Salle de lieu` | le local, s'il existe à l'inventaire |
| `Équipement` | la désignation libre, qui sert à proposer des machines |
| `Description du problème` | la description, et l'objet en est tiré |
| `Priorité` | la priorité : Haute → P1, Moyenne → P3, Basse → P4 |

La première colonne porte l'identifiant, quel que soit son libellé. Les
colonnes de service que Forms ajoute — `ID`, `Heure de début`, `Heure de
fin`, `E-mail`, `Nom` — sont écartées des réponses : les lire comme des
réponses ferait passer l'heure de début pour la date d'apparition du
problème.

Si un libellé change, `FORMULAIRE_CHAMPS` le raccorde sans toucher au code ;
l'onglet **Paramètres → Formulaire externe** affiche les noms acceptés.

```
FORMULAIRE_CHAMPS={"equipement":"Numéro GMAO","urgence":"Niveau de gravité"}
```

### 2. Déclarer le formulaire

```ini
FORMULAIRE_SOURCE=microsoft
FORMULAIRE_URL=https://forms.cloud.microsoft/r/u4qTeSeAUF
```

`FORMULAIRE_URL` ne sert qu'à afficher le lien dans l'interface : le QR
existant reste celui qui est distribué.

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

L'inscription et les données **n'ont pas à être dans le même compte**. Une
inscription n'est qu'une identité : créez-la dans l'Entra ID de
l'établissement — elle appartient alors à l'hôpital, et non à une personne —
même si le formulaire vit dans un compte Microsoft personnel.

Sur [entra.microsoft.com](https://entra.microsoft.com) — **Inscriptions
d'applications → Nouvelle inscription** :

| Réglage | Valeur |
|---|---|
| Nom | `GMAO — lecture des signalements` |
| Types de comptes | **Comptes dans un annuaire organisationnel quelconque *et* comptes Microsoft personnels** |
| URI de redirection | **laisser entièrement vide** — ne pas choisir « Web », ne rien saisir |

> **Ne mettez rien dans « URI de redirection ».** La page annonce qu'« une
> valeur est requise pour la plupart des scénarios d'authentification » : ce
> n'est pas le nôtre. Le flux par code d'appareil n'utilise aucune
> redirection, et la GMAO n'a de toute façon pas d'adresse publique où être
> renvoyée.
>
> Ce champ attend l'adresse à laquelle **votre application** reçoit la
> réponse d'authentification — jamais l'adresse du formulaire ni celle du
> classeur. Y coller un lien OneDrive ou Forms fait échouer la création :
>
> ```
> Failed to create … application. Error detail: URL may not contain a query string.
> ```
>
> Le lien du formulaire se met dans `FORMULAIRE_URL`, dans le fichier `.env`.

Puis, dans l'inscription créée — **l'étape suivante n'est pas facultative** :

- **Authentification** → *Paramètres avancés* → **Autoriser les flux client
  publics : Oui** → **Enregistrer**.

  C'est ce réglage qui rend le code d'appareil possible. Sans lui :

  ```
  AADSTS70002: The provided client is not supported for this feature.
  The client application must be marked as 'mobile.'
  ```

  et, selon les cas, une réclamation de secret client (`AADSTS7000218`)
  qu'une inscription de client public n'a pas. Si la bascule n'apparaît pas,
  ajoutez d'abord **Ajouter une plateforme → Applications mobiles et de
  bureau**, cochez `https://login.microsoftonline.com/common/oauth2/nativeclient`,
  puis revenez à *Paramètres avancés*.

  Laisser « URI de redirection » vide à la création n'empêche rien : c'est
  ici, après coup, que l'inscription devient un client public.
- **API → Ajouter une autorisation → Microsoft Graph → autorisations
  DÉLÉGUÉES → `Files.Read`** — ou `Files.Read.All` si le classeur appartient
  à un autre compte (voir plus bas).
- **Ne pas** créer de secret client.

```ini
MSFORMS_MODE=graph
MSFORMS_AUTH=delegue
MSFORMS_TENANT_ID=common
MSFORMS_CLIENT_ID=<ID d'application>
MSFORMS_CLIENT_SECRET=
FORMULAIRE_INTERVALLE_MIN=5
```

> **`MSFORMS_TENANT_ID` décrit qui se connecte, pas où l'application est
> inscrite.** Y mettre l'identifiant du locataire de l'hôpital empêche un
> compte personnel de s'authentifier, alors même que c'est lui qui détient le
> formulaire. `common` accepte les deux.

Une fois l'inscription créée, l'**ID d'application (client)** figure sur sa
page d'aperçu : c'est `MSFORMS_CLIENT_ID`.

#### Autoriser la GMAO, une seule fois

```bash
docker compose exec api npm run lier-microsoft --workspace=api
```

La commande affiche un code et une adresse. On ouvre l'adresse dans un
navigateur — depuis n'importe quel poste —, **on se connecte avec le compte
qui voit le classeur des réponses**, on saisit le code.

C'est le flux « code d'appareil », prévu pour les machines sans navigateur :
il évite d'exposer une adresse de redirection publique, que la GMAO n'a pas.

#### Quel compte, et quel classeur

Deux montages, selon le compte avec lequel on autorise.

**a) Autoriser avec le compte propriétaire du formulaire.** Le plus simple :
le classeur est dans son propre OneDrive, rien à partager.

```ini
MSFORMS_PORTEE=Files.Read
MSFORMS_CLASSEUR=item:<driveItemId>
```

**b) Autoriser avec un autre compte** — celui de l'établissement, par
exemple. Le classeur n'est alors pas dans son OneDrive : le propriétaire doit
le lui **partager** (lecture seule suffit), et la portée doit couvrir ce que
les autres lui ont ouvert.

```ini
MSFORMS_PORTEE=Files.Read.All
MSFORMS_CLASSEUR=drive:<driveId>:item:<itemId>
```

Dans les deux cas, **ne saisissez pas le chemin à la main**. Le nom du
classeur porte des accents, des espaces et des tirets dont la forme exacte se
devine mal, et un fichier partagé n'a pas de chemin du tout. Après
l'autorisation :

```bash
docker compose exec api npm run trouver-classeur --workspace=api
```

```
Partagés avec le compte autorisé
────────────────────────────────

  Formulaire maintenance -- Hôpital Monkole.xlsx
    de rtm2021@outlook.fr
    modifié le 2026-09-16 08:30
    MSFORMS_CLASSEUR=drive:b!aZ12…:item:01ABC…
```

Il n'y a plus qu'à copier la ligne. `lier-microsoft` affiche la même liste
quand `MSFORMS_CLASSEUR` n'est pas encore renseigné, ou quand la valeur
donnée ne mène nulle part.

#### Si la liste est vide

`trouver-classeur` ne montre que ce que le compte autorisé peut lire. Une
liste vide veut dire l'une de deux choses.

**Le classeur ne vous a pas été partagé.** C'est le cas le plus courant quand
le formulaire appartient à quelqu'un d'autre. Le propriétaire doit, depuis son
OneDrive : clic droit sur le classeur des réponses → **Partager** → saisir
votre adresse → régler sur **Peut afficher** → Envoyer. Le fichier apparaît
alors dans votre *Partagés avec moi*, et `trouver-classeur` le voit.

**Vous vous êtes autorisé avec le mauvais compte.** `lier-microsoft` affiche
en tête le compte qu'il vient de lier ; relancez-le et connectez-vous avec
celui qui voit le classeur.

En dernier recours, la référence se relève à la main dans
[Graph Explorer](https://developer.microsoft.com/graph/graph-explorer),
connecté avec le compte autorisé :

```
GET https://graph.microsoft.com/v1.0/me/drive/sharedWithMe
```

Dans la réponse, repérer l'entrée dont `remoteItem.name` est le classeur des
réponses, puis composer :

```
MSFORMS_CLASSEUR=drive:<remoteItem.parentReference.driveId>:item:<remoteItem.id>
```

Pour un classeur qui est dans votre propre OneDrive, c'est plus court :

```
GET https://graph.microsoft.com/v1.0/me/drive/root/search(q='Formulaire')
MSFORMS_CLASSEUR=item:<id>
```

Cinq écritures sont acceptées :

```
me:/Maintenance/reponses.xlsx          OneDrive du compte autorisé
item:<driveItemId>                     le même, par identifiant
drive:<driveId>:item:<itemId>          un fichier d'un autre compte, partagé
drive:<driveId>:/chemin.xlsx           un autre OneDrive, par chemin
site:<hôte>:/sites/<nom>:/chemin.xlsx  une bibliothèque SharePoint
```

Les formes par identifiant sont les plus sûres : elles survivent à un
renommage — ce que les systèmes bâtis sur Power Query interdisent souvent
formellement, les liens entre classeurs se rompant au moindre changement de
nom.

> **Le jeton vit en base, pas dans `.env`.** Microsoft en délivre un nouveau à
> chaque renouvellement et invalide le précédent. S'il n'était conservé que
> dans le fichier de configuration, la collecte s'arrêterait au premier
> redémarrage suivant. La table `integrations_secrets` contient donc un secret
> en clair : une sauvegarde de la base doit être traitée en conséquence.
>
> Le jeton expire après 90 jours sans usage. Une collecte qui tourne toutes
> les cinq minutes le renouvelle bien avant. Après un long arrêt, relancer
> `lier-microsoft`.

### 4. Étiquettes par équipement — facultatif, plus tard

Tout ce qui précède fonctionne sans toucher au QR distribué. Si un jour vous
voulez qu'une demande arrive déjà rattachée à sa machine, deux réglages
existent, indépendants l'un de l'autre :

- **`FORMULAIRE_PARAM_CODE`** — le paramètre d'URL qui pré-remplit le numéro
  d'inventaire, relevé dans l'éditeur du formulaire par *… → Obtenir un lien
  pré-rempli*. Suppose une question « Code inventaire » dans le formulaire.
- **`FORMULAIRE_BASE_QR`** — l'adresse publique de la GMAO. Renseignée,
  l'étiquette encode `gmao.monkole.cd/r/<code>`, que la GMAO redirige vers le
  formulaire du moment : changer de destination ne demande alors plus de
  recoller le parc. À ne choisir que si les téléphones des services savent
  joindre le serveur — ce qui exclut les sites isolés.

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

### Du secteur à l'équipe

Le secteur déclaré donne un corps de métier, qui présélectionne l'équipe au
moment de créer l'ordre de travail :

| Secteur du formulaire | Corps de métier |
|---|---|
| Plomberie, Électricité, Climatisation, Menuiserie, Maçonnerie | Technique bâtiment |
| Gaz Médicaux | Fluides médicaux |
| Biomédical | Biomédical |
| It/réseau | Informatique |
| Autres | déduit des mots de la demande, sinon laissé au responsable |

« Autres » est le choix de qui ne sait pas où se ranger : les mots de la
demande prennent alors le relais. « Robinet qui fuit » n'a pas besoin qu'on
précise « Plomberie ».

La présélection ne décide de rien — le domaine de l'équipement, une fois
celui-ci rattaché, l'emporte sur le secteur déclaré : le demandeur dit ce
qu'il croit, l'inventaire dit ce qui est.

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
