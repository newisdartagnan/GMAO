import { CLES_COLLECTIONS } from '@gmao/partage';
import type { CleCollection } from '@gmao/partage';

/**
 * Table associée à chaque collection de l'agrégat. La liste des collections
 * elle-même vient du code partagé : ajouter une entité au modèle sans lui
 * donner de table provoque une erreur de typage ici, et non une donnée
 * silencieusement perdue à l'écriture.
 */
const TABLES: Record<CleCollection, string> = {
  sites: 'sites',
  batiments: 'batiments',
  services: 'services',
  locaux: 'locaux',
  equipes: 'equipes',
  utilisateurs: 'utilisateurs',
  habilitations: 'habilitations',
  fournisseurs: 'fournisseurs',
  familles: 'familles',
  contrats: 'contrats',
  equipements: 'equipements',
  mouvementsEquipement: 'mouvements_equipement',
  gammes: 'gammes',
  controles: 'controles',
  demandes: 'demandes',
  ordresTravail: 'ordres_travail',
  visitesControle: 'visites_controle',
  vigilances: 'vigilances',
  rappels: 'rappels',
  magasins: 'magasins',
  articles: 'articles',
  lots: 'lots',
  bonsCommande: 'bons_commande',
  mouvementsStock: 'mouvements_stock',
  capteurs: 'capteurs',
  releves: 'releves',
  alertes: 'alertes',
  documents: 'documents',
  audit: 'journal_audit',
  budgets: 'budgets',
  modelesInspection: 'modeles_inspection',
  rondes: 'rondes',
  relevesInspection: 'releves_inspection',
};

export interface Collection {
  cle: CleCollection;
  table: string;
}

export const COLLECTIONS: Collection[] = CLES_COLLECTIONS.map((cle) => ({ cle, table: TABLES[cle] }));

export function tablePour(cle: CleCollection): string {
  return TABLES[cle];
}
