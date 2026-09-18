import type { ModeleInspection, ReleveInspection, RondeInspection } from './inspections';

/**
 * Modèle de domaine GMAO hospitalière.
 *
 * Le vocabulaire suit celui du terrain biomédical et des services techniques :
 * équipement, ordre de travail (OT), demande d'intervention (DI), gamme de
 * maintenance, contrôle réglementaire, matériovigilance.
 */

export type ID = string;
export type ISODate = string; // AAAA-MM-JJ ou ISO complet

/* ------------------------------------------------------------------ */
/* Référentiels d'organisation                                         */
/* ------------------------------------------------------------------ */

export interface Site {
  id: ID;
  code: string;
  nom: string;
  adresse: string;
  ville: string;
  province: string;
  type: 'hopital' | 'clinique' | 'centre_sante' | 'plateau_technique' | 'entrepot';
  nbLits: number;
  telephone?: string;
  actif: boolean;
}

export interface Batiment {
  id: ID;
  siteId: ID;
  code: string;
  nom: string;
  nbEtages: number;
  anneeConstruction?: number;
}

/** Unité fonctionnelle : service de soins ou service support. */
export interface ServiceHospitalier {
  id: ID;
  code: string;
  nom: string;
  pole: string;
  siteId: ID;
  responsable: string;
  telephone?: string;
  /** 1 = vital (bloc, réa) … 4 = support administratif */
  criticite: NiveauCriticite;
  /** Un arrêt d'équipement y est-il tolérable en journée ? */
  continuite24_7: boolean;
}

/** Local physique : c'est là que l'équipement est implanté. */
export interface Local {
  id: ID;
  siteId: ID;
  batimentId: ID;
  serviceId: ID;
  etage: string;
  code: string;
  nom: string;
  /** Classe de propreté / zone à risque infectieux (ISO 14644 & guide CTIN). */
  zoneRisque: 'zone1_bas' | 'zone2_moyen' | 'zone3_haut' | 'zone4_tres_haut';
  surfaceM2?: number;
  /** Local à accès contrôlé (radioprotection, stupéfiants, technique). */
  accesControle: boolean;
}

/* ------------------------------------------------------------------ */
/* Personnes et organisations                                          */
/* ------------------------------------------------------------------ */

export type RoleUtilisateur =
  | 'admin'
  | 'responsable_biomedical'
  | 'responsable_technique'
  | 'technicien'
  | 'magasinier'
  | 'acheteur'
  | 'demandeur'
  | 'qualite'
  | 'direction'
  | 'prestataire';

export type DomaineTechnique =
  | 'biomedical'
  | 'technique_batiment'
  | 'fluides_medicaux'
  | 'informatique'
  | 'logistique'
  | 'securite_incendie';

export interface Utilisateur {
  id: ID;
  matricule: string;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  role: RoleUtilisateur;
  equipeId?: ID;
  siteId: ID;
  serviceId?: ID;
  competences: string[];
  /** Coût horaire chargé, en unité monétaire de l'établissement. */
  tauxHoraire: number;
  actif: boolean;
  dateEmbauche?: ISODate;
}

export interface Equipe {
  id: ID;
  code: string;
  nom: string;
  domaine: DomaineTechnique;
  responsableId: ID;
  siteId: ID;
  /** Heures ouvrées disponibles par semaine et par technicien. */
  heuresHebdo: number;
  astreinte: boolean;
}

/** Habilitation ou formation réglementaire d'un agent. */
export interface Habilitation {
  id: ID;
  utilisateurId: ID;
  intitule: string;
  reference: string;
  organisme: string;
  dateObtention: ISODate;
  dateExpiration?: ISODate;
  /** Une habilitation obligatoire bloque l'affectation si elle est périmée. */
  obligatoire: boolean;
}

export type TypeTiers =
  | 'fabricant'
  | 'distributeur'
  | 'prestataire_maintenance'
  | 'organisme_controle'
  | 'transporteur';

export interface Fournisseur {
  id: ID;
  code: string;
  raisonSociale: string;
  types: TypeTiers[];
  contactNom?: string;
  email?: string;
  telephone?: string;
  pays: string;
  /** Certification qualité déclarée (ISO 13485, ISO 9001, COFRAC…). */
  certifications: string[];
  /** Délai contractuel d'intervention sur site, en heures. */
  delaiInterventionH?: number;
  /** Note terrain 0–5, alimentée par les clôtures d'OT. */
  notePerformance?: number;
  actif: boolean;
}

/* ------------------------------------------------------------------ */
/* Parc d'équipements                                                  */
/* ------------------------------------------------------------------ */

/** 1 = vitale (arrêt = risque patient immédiat) … 4 = confort. */
export type NiveauCriticite = 1 | 2 | 3 | 4;

export type StatutEquipement =
  | 'en_service'
  | 'en_panne'
  | 'en_maintenance'
  | 'attente_pieces'
  | 'en_pret'
  | 'en_stock'
  | 'reforme';

/** Classe de risque du dispositif médical (règlement UE 2017/745). */
export type ClasseDM = 'I' | 'IIa' | 'IIb' | 'III' | 'DMDIV' | 'hors_DM';

export interface FamilleEquipement {
  id: ID;
  code: string;
  nom: string;
  domaine: DomaineTechnique;
  parentId?: ID;
  /** Durée d'amortissement conseillée, en années. */
  dureeVieAns: number;
}

export interface CompteurEquipement {
  type: 'heures' | 'cycles' | 'actes' | 'kilometres' | 'impressions';
  unite: string;
  valeur: number;
  dateReleve: ISODate;
}

export interface Equipement {
  id: ID;
  /** Numéro d'inventaire porté par l'étiquette et le QR code. */
  code: string;
  designation: string;
  familleId: ID;
  domaine: DomaineTechnique;
  marque: string;
  modele: string;
  numeroSerie: string;

  classeDM: ClasseDM;
  marquageCE: boolean;
  numeroCE?: string;
  /** Le dispositif doit-il faire l'objet d'une matériovigilance ? */
  soumisVigilance: boolean;

  fabricantId?: ID;
  fournisseurId?: ID;

  siteId: ID;
  batimentId: ID;
  localId: ID;
  serviceId: ID;

  statut: StatutEquipement;
  criticite: NiveauCriticite;
  /** Équipement de secours mobilisable si celui-ci tombe. */
  equipementSecoursId?: ID;

  dateAcquisition: ISODate;
  dateMiseEnService: ISODate;
  valeurAchat: number;
  dureeAmortissementAns: number;
  finGarantie?: ISODate;
  contratId?: ID;

  /** Sous-ensemble d'un équipement plus large (ex. injecteur d'un scanner). */
  parentId?: ID;

  compteurs: CompteurEquipement[];

  /** Contraintes d'environnement, utilisées par la préparation d'intervention. */
  risqueInfectieux: boolean;
  sourceRadioactive: boolean;
  gazMedicaux: boolean;
  /** Alimentation secourue par onduleur / groupe électrogène. */
  alimentationSecourue: boolean;

  /** Disponibilité cible contractuelle ou interne, en %. */
  objectifDisponibilite: number;

  notes?: string;
  photoUrl?: string;
  qrToken: string;
  actif: boolean;
}

/** Trace de chaque changement d'implantation, exigée en audit. */
export interface MouvementEquipement {
  id: ID;
  equipementId: ID;
  date: ISODate;
  localSourceId?: ID;
  localCibleId: ID;
  motif: string;
  utilisateurId: ID;
}

/* ------------------------------------------------------------------ */
/* Contrats et garanties                                               */
/* ------------------------------------------------------------------ */

export type TypeContrat =
  | 'maintenance_totale'
  | 'maintenance_preventive'
  | 'garantie_etendue'
  | 'controle_reglementaire'
  | 'assistance_technique'
  | 'location';

export interface Contrat {
  id: ID;
  numero: string;
  libelle: string;
  fournisseurId: ID;
  type: TypeContrat;
  dateDebut: ISODate;
  dateFin: ISODate;
  montantAnnuel: number;
  /** Nombre de visites préventives incluses par an. */
  visitesIncluses: number;
  piecesIncluses: boolean;
  /** Engagements de service opposables au prestataire. */
  slaDelaiInterventionH: number;
  slaDelaiRetablissementH: number;
  slaTauxDisponibilite: number;
  reconductionTacite: boolean;
  preavisJours: number;
  equipementIds: ID[];
  statut: 'actif' | 'echu' | 'resilie' | 'en_negociation';
  notes?: string;
}

/* ------------------------------------------------------------------ */
/* Maintenance préventive : gammes et opérations                       */
/* ------------------------------------------------------------------ */

export type TypeMaintenance =
  | 'correctif'
  | 'preventif'
  | 'predictif'
  | 'reglementaire'
  | 'metrologie'
  | 'amelioration'
  | 'installation'
  | 'reforme';

export type UnitePeriodicite = 'jours' | 'semaines' | 'mois' | 'annees';

export interface OperationGamme {
  id: ID;
  ordre: number;
  libelle: string;
  nature: 'controle_visuel' | 'mesure' | 'remplacement' | 'nettoyage' | 'test_fonctionnel' | 'etalonnage' | 'securite_electrique';
  /** Pour les opérations de mesure : valeur attendue et tolérance. */
  valeurAttendue?: number;
  unite?: string;
  toleranceMin?: number;
  toleranceMax?: number;
  obligatoire: boolean;
  dureeMin: number;
}

export interface GammeMaintenance {
  id: ID;
  code: string;
  libelle: string;
  type: TypeMaintenance;
  /** Portée : une famille entière et/ou une liste d'équipements. */
  familleId?: ID;
  equipementIds: ID[];
  /** Déclenchement calendaire ou sur compteur d'usage. */
  modeDeclenchement: 'calendaire' | 'compteur';
  periodiciteValeur: number;
  periodiciteUnite: UnitePeriodicite;
  compteurType?: CompteurEquipement['type'];
  compteurSeuil?: number;
  dureeEstimeeMin: number;
  competencesRequises: string[];
  equipeId?: ID;
  /** Réalisée en interne ou confiée au titulaire du contrat. */
  execution: 'interne' | 'prestataire';
  arretEquipementRequis: boolean;
  consignesSecurite: string;
  referenceNormative?: string;
  operations: OperationGamme[];
  piecesPrevues: { articleId: ID; quantite: number }[];
  /** Date de la dernière occurrence réalisée, tous équipements confondus. */
  actif: boolean;
}

/* ------------------------------------------------------------------ */
/* Demandes d'intervention et ordres de travail                        */
/* ------------------------------------------------------------------ */

export type PrioriteOT = 'P1' | 'P2' | 'P3' | 'P4';

export type StatutOT =
  | 'a_planifier'
  | 'planifie'
  | 'affecte'
  | 'en_cours'
  | 'attente_pieces'
  | 'attente_prestataire'
  | 'realise'
  | 'cloture'
  | 'annule';

export type StatutDI = 'nouvelle' | 'en_analyse' | 'acceptee' | 'refusee' | 'transformee';

/**
 * Provenance d'une demande créée hors de l'application — formulaire en ligne
 * rempli par un service de soins, passerelle d'un bureau de contrôle. Les
 * réponses d'origine sont conservées telles quelles : en cas de doute sur une
 * interprétation, on relit ce que le déclarant a réellement écrit.
 */
export interface OrigineExterne {
  source: string;
  formulaireId?: string;
  soumissionId: string;
  recuLe: ISODate;
  /**
   * Le nom que le demandeur a écrit, tel quel.
   *
   * La demande est portée par un compte de service — « Eugénie » n'a pas de
   * compte dans la GMAO, et lui en créer un à chaque signalement peuplerait
   * l'annuaire de fantômes. Mais afficher le compte de service dans la
   * colonne « Demandeur » donne le nom de quelqu'un qui n'a rien demandé, et
   * trois signalements de trois personnes se ressemblent alors comme trois
   * gouttes d'eau. Le nom déclaré est donc conservé à part, et c'est lui
   * qu'on montre.
   */
  declarant?: string;
  reponses: Record<string, string>;
}

export interface DemandeIntervention {
  id: ID;
  numero: string;
  dateCreation: ISODate;
  demandeurId: ID;
  serviceId: ID;
  localId?: ID;
  equipementId?: ID;
  objet: string;
  description: string;
  /** Ressenti du demandeur, pondéré ensuite par le biomédical. */
  urgenceDeclaree: PrioriteOT;
  impactPatient: 'aucun' | 'gene' | 'report_soin' | 'risque_vital';
  canal: 'web' | 'qr_code' | 'telephone' | 'api' | 'terrain';
  statut: StatutDI;
  otId?: ID;
  motifRefus?: string;
  traiteParId?: ID;
  dateTraitement?: ISODate;
  origineExterne?: OrigineExterne;
  /**
   * Corps de métier déduit du secteur déclaré sur le formulaire. Il ne décide
   * de rien : il présélectionne l'équipe au moment de créer l'ordre de
   * travail, et c'est le responsable qui tranche.
   */
  domaineSuggere?: DomaineTechnique;
  /**
   * Désignation libre de l'objet en panne, telle que le demandeur l'a écrite
   * — « climatiseur », « robinet du WC homme ». Conservée à part de la
   * description : c'est sur elle que s'appuie la recherche d'équipement.
   */
  designationLibre?: string;
}

export interface LigneTemps {
  technicienId: ID;
  date: ISODate;
  dureeMin: number;
  tauxHoraire: number;
  commentaire?: string;
}

export interface LignePiece {
  articleId: ID;
  quantite: number;
  prixUnitaire: number;
  /** Sortie de stock déjà passée en mouvement ? */
  sortieValidee: boolean;
}

export interface ReleveMesure {
  operationId: ID;
  valeur?: number;
  texte?: string;
  conforme: boolean;
  commentaire?: string;
}

export interface Reserve {
  id: ID;
  libelle: string;
  gravite: 'mineure' | 'majeure' | 'critique';
  dateEcheance?: ISODate;
  levee: boolean;
  dateLevee?: ISODate;
  otLeveeId?: ID;
}

export interface CommentaireOT {
  id: ID;
  auteurId: ID;
  date: ISODate;
  texte: string;
}

export interface OrdreTravail {
  id: ID;
  numero: string;
  type: TypeMaintenance;
  objet: string;
  description: string;

  equipementId?: ID;
  localId: ID;
  serviceId: ID;
  siteId: ID;

  demandeId?: ID;
  gammeId?: ID;
  controleId?: ID;
  /** OT généré par une alerte prédictive. */
  alerteId?: ID;

  priorite: PrioriteOT;
  statut: StatutOT;

  dateCreation: ISODate;
  datePlanifiee?: ISODate;
  dateEcheanceSLA?: ISODate;
  dateDebut?: ISODate;
  dateFin?: ISODate;
  dateCloture?: ISODate;

  equipeId?: ID;
  technicienPrincipalId?: ID;
  prestataireId?: ID;
  execution: 'interne' | 'prestataire';

  temps: LigneTemps[];
  pieces: LignePiece[];
  coutPrestataire: number;

  /** Indisponibilité réelle de l'équipement causée par l'intervention. */
  arretEquipementMin: number;

  diagnostic?: string;
  causePanne?: CausePanne;
  actionsRealisees?: string;

  mesures: ReleveMesure[];
  conformite?: 'conforme' | 'conforme_avec_reserves' | 'non_conforme';
  reserves: Reserve[];

  /** Préparation sécurité obligatoire avant intervention en zone de soins. */
  securite: {
    consignationElectrique: boolean;
    desinfectionPrealable: boolean;
    epiPortes: boolean;
    permisFeu: boolean;
    patientEvacue: boolean;
  };

  signatureTechnicien?: string;
  signatureDemandeur?: string;
  validePar?: ID;
  dateValidation?: ISODate;

  commentaires: CommentaireOT[];
  documentIds: ID[];
  photoUrls: string[];
}

export type CausePanne =
  | 'usure_normale'
  | 'defaut_fabrication'
  | 'mauvaise_utilisation'
  | 'defaut_alimentation'
  | 'encrassement'
  | 'choc_accident'
  | 'logiciel'
  | 'consommable_epuise'
  | 'environnement'
  | 'indeterminee';

/* ------------------------------------------------------------------ */
/* Conformité réglementaire                                            */
/* ------------------------------------------------------------------ */

export type Referentiel =
  | 'ISO_13485'
  | 'ISO_9001'
  | 'ISO_15189'
  | 'HAS_certification'
  | 'UE_2017_745'
  | 'NF_C15_100'
  | 'NF_C15_211'
  | 'radioprotection'
  | 'fluides_medicaux'
  | 'securite_incendie'
  | 'legionelle'
  | 'qualite_air'
  | 'metrologie'
  | 'ascenseurs'
  | 'appareils_pression';

/** Obligation périodique de contrôle applicable à un périmètre du parc. */
export interface ControleReglementaire {
  id: ID;
  code: string;
  libelle: string;
  referentiel: Referentiel;
  texteReference: string;
  /** Périmètre : familles et/ou équipements explicitement visés. */
  familleIds: ID[];
  equipementIds: ID[];
  periodiciteValeur: number;
  periodiciteUnite: UnitePeriodicite;
  organismeId?: ID;
  execution: 'interne' | 'organisme_agree';
  /** Le défaut de contrôle interdit-il l'exploitation ? */
  bloquant: boolean;
  actif: boolean;
}

/** Occurrence réalisée d'un contrôle réglementaire, avec son verdict. */
export interface VisiteControle {
  id: ID;
  controleId: ID;
  equipementId?: ID;
  localId?: ID;
  dateVisite: ISODate;
  dateProchaine: ISODate;
  organismeId?: ID;
  otId?: ID;
  verdict: 'conforme' | 'conforme_avec_reserves' | 'non_conforme';
  reserves: Reserve[];
  numeroRapport?: string;
  documentIds: ID[];
}

/* ------------------------------------------------------------------ */
/* Matériovigilance                                                    */
/* ------------------------------------------------------------------ */

export interface Vigilance {
  id: ID;
  numero: string;
  equipementId: ID;
  dateEvenement: ISODate;
  dateDeclaration?: ISODate;
  description: string;
  gravite: 'mineur' | 'majeur' | 'critique' | 'deces';
  patientImplique: boolean;
  consequencePatient?: string;
  mesuresImmediates: string;
  declareAutorite: boolean;
  numeroDeclaration?: string;
  fabricantInforme: boolean;
  analyseCause?: string;
  actionsCorrectives: string[];
  otId?: ID;
  statut: 'ouvert' | 'en_analyse' | 'clos';
  dateCloture?: ISODate;
  declarantId: ID;
}

/** Action corrective de sécurité émise par un fabricant (FSCA / FSN). */
export interface RappelFabricant {
  id: ID;
  reference: string;
  fabricantId: ID;
  dateReception: ISODate;
  objet: string;
  description: string;
  actionRequise: 'mise_a_jour' | 'retrait' | 'controle' | 'information' | 'remplacement';
  dateEcheance: ISODate;
  equipementIds: ID[];
  equipementsTraites: ID[];
  statut: 'a_traiter' | 'en_cours' | 'solde';
}

/* ------------------------------------------------------------------ */
/* Stocks et achats                                                    */
/* ------------------------------------------------------------------ */

export interface Magasin {
  id: ID;
  code: string;
  nom: string;
  siteId: ID;
  responsableId?: ID;
}

export interface Article {
  id: ID;
  code: string;
  designation: string;
  categorie: 'piece_detachee' | 'consommable' | 'accessoire' | 'outillage' | 'produit_technique';
  domaine: DomaineTechnique;
  unite: string;
  magasinId: ID;
  emplacement: string;
  stockActuel: number;
  stockMin: number;
  stockMax: number;
  /** Consommation moyenne mensuelle, recalculée sur l'historique. */
  consommationMensuelle: number;
  prixMoyenPondere: number;
  delaiApproJours: number;
  fournisseurPrincipalId?: ID;
  referenceFournisseur?: string;
  /** Une rupture immobilise-t-elle un équipement vital ? */
  critique: boolean;
  gestionLot: boolean;
  gestionPeremption: boolean;
  equipementsCompatibles: ID[];
  actif: boolean;
}

export interface LotStock {
  id: ID;
  articleId: ID;
  numeroLot: string;
  quantite: number;
  datePeremption?: ISODate;
}

export type TypeMouvement = 'entree' | 'sortie' | 'transfert' | 'inventaire' | 'retour' | 'rebut';

export interface MouvementStock {
  id: ID;
  date: ISODate;
  articleId: ID;
  type: TypeMouvement;
  quantite: number;
  prixUnitaire: number;
  stockApres: number;
  otId?: ID;
  bonCommandeId?: ID;
  numeroLot?: string;
  motif: string;
  utilisateurId: ID;
}

export interface LigneCommande {
  articleId?: ID;
  designationLibre?: string;
  quantite: number;
  quantiteRecue: number;
  prixUnitaire: number;
}

export interface BonCommande {
  id: ID;
  numero: string;
  fournisseurId: ID;
  dateCreation: ISODate;
  dateEnvoi?: ISODate;
  dateLivraisonPrevue?: ISODate;
  dateReception?: ISODate;
  lignes: LigneCommande[];
  /** Origine : réappro automatique, besoin d'un OT, ou saisie libre. */
  origine: 'reappro_auto' | 'ordre_travail' | 'manuelle' | 'contrat';
  otId?: ID;
  statut: 'brouillon' | 'a_valider' | 'validee' | 'envoyee' | 'partiellement_recue' | 'receptionnee' | 'annulee';
  demandeurId: ID;
  valideParId?: ID;
  notes?: string;
}

/* ------------------------------------------------------------------ */
/* Maintenance prédictive : capteurs et relevés                        */
/* ------------------------------------------------------------------ */

export type TypeMesure =
  | 'temperature'
  | 'vibration'
  | 'pression'
  | 'courant'
  | 'humidite'
  | 'debit'
  | 'heures_fonctionnement'
  | 'niveau_cuve'
  | 'concentration_o2'
  | 'particules';

export interface Capteur {
  id: ID;
  code: string;
  equipementId: ID;
  type: TypeMesure;
  unite: string;
  seuilBasCritique?: number;
  seuilBasAlerte?: number;
  seuilHautAlerte?: number;
  seuilHautCritique?: number;
  frequenceReleveMin: number;
  actif: boolean;
}

export interface Releve {
  id: ID;
  capteurId: ID;
  date: ISODate;
  valeur: number;
}

export type SourceAlerte =
  | 'capteur'
  | 'compteur'
  | 'stock_bas'
  | 'echeance_preventive'
  | 'echeance_reglementaire'
  | 'contrat_echu'
  | 'sla_depasse'
  | 'garantie_echue'
  | 'rappel_fabricant'
  | 'habilitation_expiree';

export interface Alerte {
  id: ID;
  date: ISODate;
  source: SourceAlerte;
  niveau: 'info' | 'alerte' | 'critique';
  titre: string;
  message: string;
  entiteType: 'equipement' | 'article' | 'contrat' | 'gamme' | 'controle' | 'ordre_travail' | 'utilisateur' | 'rappel';
  entiteId: ID;
  statut: 'nouvelle' | 'prise_en_compte' | 'traitee' | 'ignoree';
  otId?: ID;
  traiteParId?: ID;
}

/* ------------------------------------------------------------------ */
/* GED, audit, budget                                                  */
/* ------------------------------------------------------------------ */

export interface DocumentGED {
  id: ID;
  nom: string;
  categorie:
    | 'notice_utilisation'
    | 'manuel_technique'
    | 'schema'
    | 'certificat_ce'
    | 'rapport_controle'
    | 'certificat_etalonnage'
    | 'facture'
    | 'contrat'
    | 'procedure'
    | 'photo'
    | 'autre';
  entiteType: 'equipement' | 'ordre_travail' | 'contrat' | 'fournisseur' | 'controle' | 'vigilance' | 'general';
  entiteId?: ID;
  dateAjout: ISODate;
  ajouteParId: ID;
  version: string;
  tailleKo: number;
  /** Référence de stockage : URL externe ou data-URL locale. */
  url: string;
  /** Un document opposable en audit ne peut plus être supprimé. */
  opposable: boolean;
}

export interface EntreeAudit {
  id: ID;
  date: ISODate;
  utilisateurId: ID;
  action: 'creation' | 'modification' | 'suppression' | 'validation' | 'cloture' | 'connexion' | 'export' | 'generation';
  entiteType: string;
  entiteId: ID;
  libelle: string;
  details?: string;
}

export interface LigneBudget {
  id: ID;
  annee: number;
  serviceId?: ID;
  domaine: DomaineTechnique;
  poste: 'maintenance_interne' | 'contrats' | 'pieces' | 'investissement' | 'controles_reglementaires';
  montantAlloue: number;
}

/* ------------------------------------------------------------------ */
/* Agrégat racine persisté                                             */
/* ------------------------------------------------------------------ */

// Les rondes d'inspection ont leur propre module ; le type est réimporté ici
// pour que l'agrégat reste la seule description complète de la base.


export interface BaseGMAO {
  version: number;
  dateGeneration: ISODate;
  sites: Site[];
  batiments: Batiment[];
  services: ServiceHospitalier[];
  locaux: Local[];
  utilisateurs: Utilisateur[];
  equipes: Equipe[];
  habilitations: Habilitation[];
  fournisseurs: Fournisseur[];
  familles: FamilleEquipement[];
  equipements: Equipement[];
  mouvementsEquipement: MouvementEquipement[];
  contrats: Contrat[];
  gammes: GammeMaintenance[];
  demandes: DemandeIntervention[];
  ordresTravail: OrdreTravail[];
  controles: ControleReglementaire[];
  visitesControle: VisiteControle[];
  vigilances: Vigilance[];
  rappels: RappelFabricant[];
  magasins: Magasin[];
  articles: Article[];
  lots: LotStock[];
  mouvementsStock: MouvementStock[];
  bonsCommande: BonCommande[];
  capteurs: Capteur[];
  releves: Releve[];
  alertes: Alerte[];
  documents: DocumentGED[];
  audit: EntreeAudit[];
  budgets: LigneBudget[];
  modelesInspection: ModeleInspection[];
  rondes: RondeInspection[];
  relevesInspection: ReleveInspection[];
}
