# GMAO Hospitalière

Gestion de maintenance assistée par ordinateur pour un hôpital général de
référence : parc d'équipements biomédicaux et techniques, ordres de travail,
maintenance préventive et réglementaire, matériovigilance, stocks et contrats.

L'application est écrite en **React 19 + TypeScript**, avec **Vite**, **Tailwind
CSS 4**, **React Router** et **Recharts**. Toute l'interface est en français.

## Démarrage

```bash
npm install
npm run dev      # http://localhost:5173
```

Autres commandes : `npm run build` (typecheck + bundle de production),
`npm run preview`, `npm run typecheck`, `npm run lint`.

Au premier lancement, l'application génère un jeu de données complet — un
hôpital de 480 lits, 30 services, environ 960 équipements et vingt mois
d'historique d'interventions — puis le conserve dans IndexedDB. Les écritures
suivantes sont persistées au fil de l'eau. `Paramètres → Base de données`
permet d'exporter, de réimporter ou de régénérer cette base.

## Ce que couvre l'application

**Pilotage**
- Tableau de bord : disponibilité du parc, MTBF, MTTR, part de préventif, coût
  du mois, conformité réglementaire, alertes critiques, interventions urgentes.
- Alertes recalculées en continu à partir des échéances, des seuils de stock,
  des capteurs et des engagements de service.
- Analyses : fiabilité, coûts par service et par domaine, diagramme de Pareto
  des causes de défaillance, plan de renouvellement chiffré, export CSV pour la
  direction.

**Interventions**
- Demandes d'intervention émises par les services de soins (web, code-barres,
  téléphone), qualifiées puis transformées en ordre de travail ou refusées avec
  motif.
- Ordres de travail correctifs, préventifs, réglementaires et métrologiques :
  workflow complet (planification, affectation, exécution, réalisation,
  clôture), saisie des temps et des pièces, relevés de mesure avec tolérances,
  préparation sécurité, réserves, signatures, fil d'échanges. Vue liste ou
  kanban.
- Planning hebdomadaire et plan de charge par technicien.

**Maintenance programmée**
- Gammes de maintenance : périodicité calendaire ou sur compteur d'usage,
  opérations détaillées avec valeurs attendues et tolérances, pièces prévues,
  consignes de sécurité, référence normative.
- Échéancier et génération automatique des ordres de travail sur un horizon
  choisi.
- Conformité réglementaire : obligations de contrôle (électricité, locaux à
  usage médical, sécurité électrique des DM, radioprotection, fluides médicaux,
  appareils à pression, stérilisation, salles propres, légionelles, eau de
  dialyse, ascenseurs, sécurité incendie, métrologie), échéancier, saisie des
  visites d'organismes agréés, suivi et levée des réserves, export du dossier
  d'audit.
- Maintenance prédictive : capteurs, seuils d'alerte et critiques, courbes de
  tendance et projection de la date de franchissement.

**Parc et sécurité**
- Fiche équipement complète : identification et classe de dispositif médical,
  implantation, cycle de vie et vétusté, compteurs, historique d'interventions,
  maintenance programmée applicable, coûts et arbitrage de renouvellement,
  pièces compatibles, documents, traçabilité des mouvements. Étiquette
  d'inventaire à code-barres Code 128 imprimable.
- Implantation arborescente site → bâtiment → service → local.
- Matériovigilance : déclaration d'incident, suivi des actions correctives de
  sécurité émises par les fabricants, avancement équipement par équipement.

**Logistique**
- Stocks : seuils min/max, couverture rapportée au délai d'approvisionnement,
  pièces critiques, mouvements tracés, lots et péremptions.
- Achats : bons de commande, validation, réception totale ou partielle avec
  recalcul du prix moyen pondéré, réapprovisionnement automatique depuis les
  seuils.
- Contrats et fournisseurs : engagements de service, échéances et préavis de
  reconduction, performance des prestataires mesurée sur les interventions
  réellement exécutées.

**Organisation**
- Équipes, compétences et habilitations réglementaires avec suivi de validité.
- Documentation technique rattachée aux équipements, contrats et contrôles.
- Journal d'audit de toutes les écritures, exportable.

## Architecture

```
src/
├── types/        modèle de domaine et libellés métier
├── data/         catalogues, générateur de données, persistance, actions métier
├── lib/          dates, formatage, indicateurs, échéances, alertes, code-barres
├── components/   composants d'interface et composants métier partagés
├── layouts/      structure de l'application et navigation
└── pages/        un écran par module
```

Trois principes guident le code :

1. **Les indicateurs et les alertes sont calculés, jamais stockés.** Une alerte
   disparaît d'elle-même dès que sa cause est traitée, ce qui évite les listes
   d'alertes fantômes que produit tout système où l'on doit penser à les
   effacer.
2. **Toutes les écritures passent par une même fonction de mutation**
   (`data/store.tsx`), qui journalise l'action et persiste l'état. C'est ce qui
   garantit une piste d'audit sans avoir à y penser au cas par cas.
3. **La persistance est isolée derrière une seule couche**
   (`data/persistance.ts`). Brancher une API REST ne demande de remplacer que ce
   fichier : les opérations métier de `data/actions.ts` travaillent sur un objet
   `BaseGMAO` et restent inchangées.

## Choix assumés

Les données vivent dans le navigateur : aucun serveur n'est nécessaire pour
faire tourner et démontrer l'application, ce qui convient à un déploiement en
site isolé et à une connectivité intermittente. L'export JSON tient lieu de
sauvegarde et de moyen de transfert entre postes. Pour un usage multi-postes
avec comptes nominatifs, il faudra ajouter un serveur — l'architecture ci-dessus
est prévue pour cela.

Le code-barres des étiquettes d'inventaire est un Code 128 (jeu B) réellement
encodé, lisible par les douchettes déjà présentes dans les magasins, plutôt
qu'un QR code exigeant un lecteur d'image.

La monnaie de référence est le dollar américain, usuelle pour les marchés
d'équipements hospitaliers en Afrique centrale.
