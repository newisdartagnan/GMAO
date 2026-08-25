import type {
  CausePanne,
  ClasseDM,
  DomaineTechnique,
  NiveauCriticite,
  PrioriteOT,
  Referentiel,
  RoleUtilisateur,
  SourceAlerte,
  StatutDI,
  StatutEquipement,
  StatutOT,
  TypeContrat,
  TypeMaintenance,
  TypeMesure,
  TypeMouvement,
  TypeTiers,
} from './domain';

/** Palette de tons réutilisée par les badges ; voir components/ui/Badge. */
export type Ton = 'neutre' | 'info' | 'succes' | 'attention' | 'danger' | 'violet' | 'ardoise';

export interface Etiquette {
  libelle: string;
  ton: Ton;
  /** Description affichée en info-bulle là où le sens n'est pas évident. */
  aide?: string;
}

export const CRITICITE: Record<NiveauCriticite, Etiquette> = {
  1: { libelle: 'Vitale', ton: 'danger', aide: "L'arrêt met en jeu le pronostic vital d'un patient" },
  2: { libelle: 'Critique', ton: 'attention', aide: 'Report ou dégradation de prise en charge' },
  3: { libelle: 'Importante', ton: 'info', aide: 'Gêne organisationnelle, solution de contournement existante' },
  4: { libelle: 'Secondaire', ton: 'neutre', aide: 'Confort, aucun impact sur les soins' },
};

export const STATUT_EQUIPEMENT: Record<StatutEquipement, Etiquette> = {
  en_service: { libelle: 'En service', ton: 'succes' },
  en_panne: { libelle: 'En panne', ton: 'danger' },
  en_maintenance: { libelle: 'En maintenance', ton: 'attention' },
  attente_pieces: { libelle: 'Attente pièces', ton: 'attention' },
  en_pret: { libelle: 'En prêt', ton: 'info' },
  en_stock: { libelle: 'En stock', ton: 'neutre' },
  reforme: { libelle: 'Réformé', ton: 'ardoise' },
};

export const STATUT_OT: Record<StatutOT, Etiquette> = {
  a_planifier: { libelle: 'À planifier', ton: 'neutre' },
  planifie: { libelle: 'Planifié', ton: 'info' },
  affecte: { libelle: 'Affecté', ton: 'info' },
  en_cours: { libelle: 'En cours', ton: 'violet' },
  attente_pieces: { libelle: 'Attente pièces', ton: 'attention' },
  attente_prestataire: { libelle: 'Attente prestataire', ton: 'attention' },
  realise: { libelle: 'Réalisé', ton: 'succes' },
  cloture: { libelle: 'Clôturé', ton: 'ardoise' },
  annule: { libelle: 'Annulé', ton: 'ardoise' },
};

/** Statuts pour lesquels l'OT est encore du travail à faire. */
export const STATUTS_OT_OUVERTS: StatutOT[] = [
  'a_planifier',
  'planifie',
  'affecte',
  'en_cours',
  'attente_pieces',
  'attente_prestataire',
];

export const PRIORITE: Record<PrioriteOT, Etiquette & { delaiPriseEnChargeH: number; delaiResolutionH: number }> = {
  P1: {
    libelle: 'P1 — Vitale',
    ton: 'danger',
    aide: 'Équipement vital immobilisé, prise en charge immédiate',
    delaiPriseEnChargeH: 1,
    delaiResolutionH: 4,
  },
  P2: {
    libelle: 'P2 — Urgente',
    ton: 'attention',
    aide: 'Activité de soins dégradée',
    delaiPriseEnChargeH: 4,
    delaiResolutionH: 24,
  },
  P3: { libelle: 'P3 — Normale', ton: 'info', delaiPriseEnChargeH: 24, delaiResolutionH: 72 },
  P4: { libelle: 'P4 — Planifiée', ton: 'neutre', delaiPriseEnChargeH: 72, delaiResolutionH: 336 },
};

export const TYPE_MAINTENANCE: Record<TypeMaintenance, Etiquette> = {
  correctif: { libelle: 'Correctif', ton: 'danger', aide: 'Remise en état après défaillance' },
  preventif: { libelle: 'Préventif', ton: 'succes', aide: 'Planifié avant défaillance' },
  predictif: { libelle: 'Prédictif', ton: 'violet', aide: 'Déclenché par l’état réel mesuré' },
  reglementaire: { libelle: 'Réglementaire', ton: 'info', aide: 'Obligation légale ou normative' },
  metrologie: { libelle: 'Métrologie', ton: 'info', aide: 'Étalonnage et raccordement' },
  amelioration: { libelle: 'Amélioration', ton: 'ardoise' },
  installation: { libelle: 'Installation', ton: 'ardoise' },
  reforme: { libelle: 'Réforme', ton: 'neutre' },
};

export const STATUT_DI: Record<StatutDI, Etiquette> = {
  nouvelle: { libelle: 'Nouvelle', ton: 'attention' },
  en_analyse: { libelle: 'En analyse', ton: 'info' },
  acceptee: { libelle: 'Acceptée', ton: 'succes' },
  refusee: { libelle: 'Refusée', ton: 'ardoise' },
  transformee: { libelle: 'Transformée en OT', ton: 'violet' },
};

export const DOMAINE: Record<DomaineTechnique, Etiquette> = {
  biomedical: { libelle: 'Biomédical', ton: 'info' },
  technique_batiment: { libelle: 'Technique / bâtiment', ton: 'ardoise' },
  fluides_medicaux: { libelle: 'Fluides médicaux', ton: 'violet' },
  informatique: { libelle: 'Informatique', ton: 'neutre' },
  logistique: { libelle: 'Logistique', ton: 'neutre' },
  securite_incendie: { libelle: 'Sécurité incendie', ton: 'danger' },
};

export const CLASSE_DM: Record<ClasseDM, Etiquette> = {
  I: { libelle: 'Classe I', ton: 'neutre', aide: 'Risque faible' },
  IIa: { libelle: 'Classe IIa', ton: 'info', aide: 'Risque modéré' },
  IIb: { libelle: 'Classe IIb', ton: 'attention', aide: 'Risque élevé' },
  III: { libelle: 'Classe III', ton: 'danger', aide: 'Risque très élevé' },
  DMDIV: { libelle: 'DM-DIV', ton: 'violet', aide: 'Diagnostic in vitro' },
  hors_DM: { libelle: 'Hors DM', ton: 'ardoise', aide: 'Non soumis au règlement DM' },
};

export const ROLE: Record<RoleUtilisateur, string> = {
  admin: 'Administrateur',
  responsable_biomedical: 'Responsable biomédical',
  responsable_technique: 'Responsable services techniques',
  technicien: 'Technicien',
  magasinier: 'Magasinier',
  acheteur: 'Acheteur',
  demandeur: 'Demandeur (service de soins)',
  qualite: 'Qualité / gestion des risques',
  direction: 'Direction',
  prestataire: 'Prestataire externe',
};

export const TYPE_CONTRAT: Record<TypeContrat, string> = {
  maintenance_totale: 'Maintenance totale',
  maintenance_preventive: 'Préventif seul',
  garantie_etendue: 'Garantie étendue',
  controle_reglementaire: 'Contrôle réglementaire',
  assistance_technique: 'Assistance technique',
  location: 'Location / mise à disposition',
};

export const TYPE_TIERS: Record<TypeTiers, string> = {
  fabricant: 'Fabricant',
  distributeur: 'Distributeur',
  prestataire_maintenance: 'Prestataire de maintenance',
  organisme_controle: 'Organisme de contrôle agréé',
  transporteur: 'Transporteur',
};

export const REFERENTIEL: Record<Referentiel, string> = {
  ISO_13485: 'ISO 13485 — dispositifs médicaux',
  ISO_9001: 'ISO 9001 — management de la qualité',
  ISO_15189: 'ISO 15189 — laboratoires de biologie médicale',
  HAS_certification: 'Certification HAS des établissements',
  UE_2017_745: 'Règlement (UE) 2017/745 — DM',
  NF_C15_100: 'NF C 15-100 — installations électriques BT',
  NF_C15_211: 'NF C 15-211 — locaux à usage médical',
  radioprotection: 'Radioprotection — contrôle qualité des installations',
  fluides_medicaux: 'Fluides médicaux — NF EN ISO 7396-1',
  securite_incendie: 'Sécurité incendie — type U',
  legionelle: 'Prévention des légionelles — réseaux d’eau chaude',
  qualite_air: 'Qualité de l’air — salles propres ISO 14644',
  metrologie: 'Métrologie — raccordement aux étalons',
  ascenseurs: 'Ascenseurs et monte-charges',
  appareils_pression: 'Équipements sous pression',
};

export const CAUSE_PANNE: Record<CausePanne, string> = {
  usure_normale: 'Usure normale',
  defaut_fabrication: 'Défaut de fabrication',
  mauvaise_utilisation: 'Mauvaise utilisation',
  defaut_alimentation: 'Défaut d’alimentation électrique',
  encrassement: 'Encrassement / défaut d’entretien',
  choc_accident: 'Choc ou accident',
  logiciel: 'Défaut logiciel',
  consommable_epuise: 'Consommable épuisé',
  environnement: 'Conditions d’environnement',
  indeterminee: 'Indéterminée',
};

export const TYPE_MOUVEMENT: Record<TypeMouvement, Etiquette> = {
  entree: { libelle: 'Entrée', ton: 'succes' },
  sortie: { libelle: 'Sortie', ton: 'danger' },
  transfert: { libelle: 'Transfert', ton: 'info' },
  inventaire: { libelle: 'Inventaire', ton: 'violet' },
  retour: { libelle: 'Retour', ton: 'info' },
  rebut: { libelle: 'Rebut', ton: 'ardoise' },
};

export const TYPE_MESURE: Record<TypeMesure, { libelle: string; unite: string }> = {
  temperature: { libelle: 'Température', unite: '°C' },
  vibration: { libelle: 'Vibration', unite: 'mm/s' },
  pression: { libelle: 'Pression', unite: 'bar' },
  courant: { libelle: 'Courant', unite: 'A' },
  humidite: { libelle: 'Humidité', unite: '%HR' },
  debit: { libelle: 'Débit', unite: 'm³/h' },
  heures_fonctionnement: { libelle: 'Heures de fonctionnement', unite: 'h' },
  niveau_cuve: { libelle: 'Niveau de cuve', unite: '%' },
  concentration_o2: { libelle: 'Concentration O₂', unite: '%' },
  particules: { libelle: 'Particules', unite: 'part./m³' },
};

export const SOURCE_ALERTE: Record<SourceAlerte, string> = {
  capteur: 'Seuil capteur franchi',
  compteur: 'Seuil de compteur atteint',
  stock_bas: 'Stock sous le minimum',
  echeance_preventive: 'Échéance préventive',
  echeance_reglementaire: 'Échéance réglementaire',
  contrat_echu: 'Contrat arrivé à échéance',
  sla_depasse: 'Engagement de délai dépassé',
  garantie_echue: 'Fin de garantie',
  rappel_fabricant: 'Rappel fabricant à traiter',
  habilitation_expiree: 'Habilitation expirée',
};
