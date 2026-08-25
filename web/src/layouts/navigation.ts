import {
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Gauge,
  HeartPulse,
  History,
  Inbox,
  LayoutDashboard,
  Map,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface EntreeNav {
  chemin: string;
  libelle: string;
  icone: LucideIcon;
  /** Nom du compteur affiché en pastille, résolu par le layout. */
  compteur?: 'demandes' | 'otOuverts' | 'otRetard' | 'alertes' | 'stockBas' | 'reglementaireEchu' | 'vigilances' | 'rondesAFaire';
  description: string;
}

export interface GroupeNav {
  titre: string;
  entrees: EntreeNav[];
}

export const NAVIGATION: GroupeNav[] = [
  {
    titre: 'Pilotage',
    entrees: [
      { chemin: '/', libelle: 'Tableau de bord', icone: LayoutDashboard, description: 'Vue d’ensemble de la maintenance et de la disponibilité du parc' },
      { chemin: '/alertes', libelle: 'Alertes', icone: AlertTriangle, compteur: 'alertes', description: 'Échéances dépassées, seuils franchis, ruptures de stock' },
      { chemin: '/analyses', libelle: 'Analyses & indicateurs', icone: BarChart3, description: 'MTBF, MTTR, coûts, obsolescence et aide au renouvellement' },
    ],
  },
  {
    titre: 'Interventions',
    entrees: [
      { chemin: '/demandes', libelle: 'Demandes d’intervention', icone: Inbox, compteur: 'demandes', description: 'Signalements des services de soins à qualifier' },
      { chemin: '/ordres-travail', libelle: 'Ordres de travail', icone: ClipboardList, compteur: 'otOuverts', description: 'Interventions correctives, préventives et réglementaires' },
      { chemin: '/planning', libelle: 'Planning & charge', icone: CalendarClock, description: 'Affectation des techniciens et plan de charge hebdomadaire' },
      { chemin: '/inspections', libelle: 'Rondes d’inspection', icone: ClipboardCheck, compteur: 'rondesAFaire', description: 'Tour des installations critiques, matin et soir' },
    ],
  },
  {
    titre: 'Maintenance programmée',
    entrees: [
      { chemin: '/preventif', libelle: 'Gammes & échéancier', icone: Wrench, description: 'Plans de maintenance préventive et génération des OT' },
      { chemin: '/reglementaire', libelle: 'Conformité réglementaire', icone: ShieldCheck, compteur: 'reglementaireEchu', description: 'Contrôles obligatoires, visites d’organismes et réserves' },
      { chemin: '/predictif', libelle: 'Maintenance prédictive', icone: Activity, description: 'Capteurs, tendances et détection de dérive' },
    ],
  },
  {
    titre: 'Parc et sécurité',
    entrees: [
      { chemin: '/equipements', libelle: 'Parc d’équipements', icone: Gauge, description: 'Inventaire complet des dispositifs médicaux et techniques' },
      { chemin: '/implantation', libelle: 'Implantation', icone: Map, description: 'Répartition par site, bâtiment et service' },
      { chemin: '/vigilance', libelle: 'Matériovigilance', icone: HeartPulse, compteur: 'vigilances', description: 'Incidents, déclarations et rappels fabricants' },
    ],
  },
  {
    titre: 'Logistique',
    entrees: [
      { chemin: '/stocks', libelle: 'Stocks & pièces', icone: Boxes, compteur: 'stockBas', description: 'Magasin, seuils de réapprovisionnement et mouvements' },
      { chemin: '/achats', libelle: 'Achats & commandes', icone: ShoppingCart, description: 'Bons de commande et réceptions' },
      { chemin: '/contrats', libelle: 'Contrats & fournisseurs', icone: FileText, description: 'Contrats de maintenance, SLA et performance des tiers' },
    ],
  },
  {
    titre: 'Organisation',
    entrees: [
      { chemin: '/equipes', libelle: 'Équipes & habilitations', icone: Users, description: 'Techniciens, compétences et habilitations réglementaires' },
      { chemin: '/documents', libelle: 'Documentation', icone: FileText, description: 'Notices, certificats et rapports de contrôle' },
      { chemin: '/audit', libelle: 'Journal d’audit', icone: History, description: 'Traçabilité de toutes les écritures dans la GMAO' },
      { chemin: '/parametres', libelle: 'Paramètres', icone: Settings, description: 'Référentiels, sites, services et gestion de la base' },
    ],
  },
];
