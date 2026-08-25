import type {
  Alerte,
  Article,
  Batiment,
  BaseGMAO,
  BonCommande,
  Capteur,
  Contrat,
  ControleReglementaire,
  DemandeIntervention,
  DocumentGED,
  Equipe,
  Equipement,
  EntreeAudit,
  FamilleEquipement,
  Fournisseur,
  GammeMaintenance,
  Habilitation,
  ID,
  LigneBudget,
  Local,
  LotStock,
  Magasin,
  MouvementEquipement,
  MouvementStock,
  OperationGamme,
  OrdreTravail,
  RappelFabricant,
  Releve,
  ServiceHospitalier,
  Site,
  Utilisateur,
  Vigilance,
  VisiteControle,
} from '@/types/domain';
import { PRIORITE } from '@/types/labels';
import { CATALOGUE, CAPTEURS_TYPES, FAMILLES, NOMS, PRENOMS } from './catalogues';
import type { ModeleCatalogue } from './catalogues';
import { addDays, addMonths, aujourdHui, iso, isoHeure, toDate } from '@/lib/dates';

/* ------------------------------------------------------------------ */
/* Générateur pseudo-aléatoire déterministe                            */
/* ------------------------------------------------------------------ */

function mulberry32(graine: number) {
  let a = graine;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const alea = mulberry32(20260825);

const ent = (min: number, max: number) => Math.floor(alea() * (max - min + 1)) + min;
const dec = (min: number, max: number, d = 1) => Number((alea() * (max - min) + min).toFixed(d));
const choix = <T>(arr: readonly T[]): T => arr[Math.floor(alea() * arr.length)];
const chance = (p: number) => alea() < p;
const melanger = <T>(arr: T[]): T[] => {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i -= 1) {
    const j = Math.floor(alea() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
};
const echantillon = <T>(arr: T[], n: number): T[] => melanger(arr).slice(0, Math.min(n, arr.length));

const AUJ = aujourdHui();
const jourRelatif = (jours: number) => iso(addDays(AUJ, jours));
const heureRelative = (jours: number, heure = 9) => {
  const d = addDays(AUJ, jours);
  d.setHours(heure, ent(0, 59), 0, 0);
  return isoHeure(d);
};

/* ------------------------------------------------------------------ */
/* Référentiel d'organisation                                          */
/* ------------------------------------------------------------------ */

const DEF_SERVICES: { code: string; nom: string; pole: string; criticite: 1 | 2 | 3 | 4; continu: boolean }[] = [
  { code: 'URG', nom: 'Urgences', pole: 'Urgences & réanimation', criticite: 1, continu: true },
  { code: 'REA', nom: 'Réanimation polyvalente', pole: 'Urgences & réanimation', criticite: 1, continu: true },
  { code: 'BLO', nom: 'Bloc opératoire', pole: 'Chirurgie', criticite: 1, continu: true },
  { code: 'MAT', nom: 'Maternité — salle d’accouchement', pole: 'Mère-enfant', criticite: 1, continu: true },
  { code: 'NEO', nom: 'Néonatologie', pole: 'Mère-enfant', criticite: 1, continu: true },
  { code: 'PED', nom: 'Pédiatrie', pole: 'Mère-enfant', criticite: 2, continu: true },
  { code: 'MED', nom: 'Médecine interne', pole: 'Médecine', criticite: 2, continu: true },
  { code: 'CHI', nom: 'Chirurgie — hospitalisation', pole: 'Chirurgie', criticite: 2, continu: true },
  { code: 'CAR', nom: 'Cardiologie', pole: 'Médecine', criticite: 2, continu: true },
  { code: 'ONC', nom: 'Oncologie — hôpital de jour', pole: 'Médecine', criticite: 2, continu: false },
  { code: 'DIA', nom: 'Néphrologie — dialyse', pole: 'Médecine', criticite: 1, continu: false },
  { code: 'IMG', nom: 'Imagerie médicale', pole: 'Plateau technique', criticite: 1, continu: true },
  { code: 'LAB', nom: 'Laboratoire de biologie médicale', pole: 'Plateau technique', criticite: 1, continu: true },
  { code: 'ANA', nom: 'Anatomie et cytologie pathologiques', pole: 'Plateau technique', criticite: 3, continu: false },
  { code: 'BSG', nom: 'Banque de sang', pole: 'Plateau technique', criticite: 1, continu: true },
  { code: 'PHA', nom: 'Pharmacie hospitalière', pole: 'Plateau technique', criticite: 2, continu: false },
  { code: 'STE', nom: 'Stérilisation centrale', pole: 'Plateau technique', criticite: 1, continu: false },
  { code: 'EXP', nom: 'Explorations fonctionnelles', pole: 'Plateau technique', criticite: 3, continu: false },
  { code: 'DEN', nom: 'Odontostomatologie', pole: 'Consultations', criticite: 3, continu: false },
  { code: 'OPH', nom: 'Ophtalmologie', pole: 'Consultations', criticite: 3, continu: false },
  { code: 'ORL', nom: 'Oto-rhino-laryngologie', pole: 'Consultations', criticite: 3, continu: false },
  { code: 'KIN', nom: 'Kinésithérapie et rééducation', pole: 'Consultations', criticite: 4, continu: false },
  { code: 'CSA', nom: 'Consultations externes', pole: 'Consultations', criticite: 3, continu: false },
  { code: 'PSY', nom: 'Psychiatrie', pole: 'Médecine', criticite: 3, continu: true },
  { code: 'MOR', nom: 'Morgue', pole: 'Support', criticite: 3, continu: true },
  { code: 'TEC', nom: 'Services techniques', pole: 'Support', criticite: 2, continu: true },
  { code: 'BLA', nom: 'Blanchisserie', pole: 'Support', criticite: 3, continu: false },
  { code: 'CUI', nom: 'Cuisine et restauration', pole: 'Support', criticite: 3, continu: false },
  { code: 'DSI', nom: 'Système d’information', pole: 'Support', criticite: 2, continu: true },
  { code: 'ADM', nom: 'Administration et direction', pole: 'Support', criticite: 4, continu: false },
];

const DEF_BATIMENTS = [
  { code: 'A', nom: 'Bâtiment A — Plateau technique', etages: 4, annee: 1998 },
  { code: 'B', nom: 'Bâtiment B — Hospitalisation médecine', etages: 5, annee: 2004 },
  { code: 'C', nom: 'Bâtiment C — Mère-enfant', etages: 3, annee: 2012 },
  { code: 'D', nom: 'Bâtiment D — Consultations externes', etages: 2, annee: 2009 },
  { code: 'E', nom: 'Bâtiment E — Logistique et énergie', etages: 1, annee: 1998 },
];

const AFFECTATION_BATIMENT: Record<string, string> = {
  URG: 'A', REA: 'A', BLO: 'A', IMG: 'A', LAB: 'A', BSG: 'A', STE: 'A', ANA: 'A', PHA: 'A',
  MED: 'B', CHI: 'B', CAR: 'B', ONC: 'B', DIA: 'B', PSY: 'B', EXP: 'B',
  MAT: 'C', NEO: 'C', PED: 'C',
  DEN: 'D', OPH: 'D', ORL: 'D', KIN: 'D', CSA: 'D', ADM: 'D',
  TEC: 'E', BLA: 'E', CUI: 'E', DSI: 'E', MOR: 'E',
};

const ZONE_PAR_SERVICE: Record<string, Local['zoneRisque']> = {
  BLO: 'zone4_tres_haut', REA: 'zone4_tres_haut', NEO: 'zone4_tres_haut', STE: 'zone3_haut',
  MAT: 'zone3_haut', ONC: 'zone3_haut', DIA: 'zone3_haut', URG: 'zone3_haut', BSG: 'zone3_haut',
  LAB: 'zone3_haut', PHA: 'zone2_moyen', IMG: 'zone2_moyen', MED: 'zone2_moyen', CHI: 'zone2_moyen',
  CAR: 'zone2_moyen', PED: 'zone2_moyen', PSY: 'zone2_moyen', EXP: 'zone2_moyen', ANA: 'zone2_moyen',
};

/* ------------------------------------------------------------------ */
/* Fournisseurs                                                        */
/* ------------------------------------------------------------------ */

const DEF_FOURNISSEURS: Omit<Fournisseur, 'id'>[] = [
  { code: 'F001', raisonSociale: 'Siemens Healthineers Afrique', types: ['fabricant', 'prestataire_maintenance'], pays: 'Afrique du Sud', certifications: ['ISO 13485', 'ISO 9001'], delaiInterventionH: 48, notePerformance: 4.2, actif: true, contactNom: 'Service client Johannesburg', email: 'support.africa@siemens-healthineers.example', telephone: '+27 11 652 00 00' },
  { code: 'F002', raisonSociale: 'GE HealthCare EMEA', types: ['fabricant', 'prestataire_maintenance'], pays: 'France', certifications: ['ISO 13485'], delaiInterventionH: 72, notePerformance: 3.9, actif: true, email: 'service.emea@gehealthcare.example' },
  { code: 'F003', raisonSociale: 'Dräger Medical Central Africa', types: ['fabricant', 'prestataire_maintenance'], pays: 'Allemagne', certifications: ['ISO 13485', 'ISO 9001'], delaiInterventionH: 96, notePerformance: 4.5, actif: true },
  { code: 'F004', raisonSociale: 'Philips Healthcare RDC', types: ['fabricant', 'distributeur'], pays: 'Pays-Bas', certifications: ['ISO 13485'], delaiInterventionH: 72, notePerformance: 4.0, actif: true },
  { code: 'F005', raisonSociale: 'Mindray Medical Kinshasa', types: ['distributeur', 'prestataire_maintenance'], pays: 'Chine', certifications: ['ISO 13485'], delaiInterventionH: 24, notePerformance: 3.6, actif: true },
  { code: 'F006', raisonSociale: 'BioMed Congo SARL', types: ['distributeur', 'prestataire_maintenance'], pays: 'RD Congo', certifications: ['ISO 9001'], delaiInterventionH: 8, notePerformance: 4.1, actif: true, contactNom: 'Ir. Kalala Mutombo', telephone: '+243 81 000 11 22' },
  { code: 'F007', raisonSociale: 'Technomed Services', types: ['prestataire_maintenance'], pays: 'RD Congo', certifications: [], delaiInterventionH: 12, notePerformance: 3.2, actif: true },
  { code: 'F008', raisonSociale: 'Getinge France', types: ['fabricant'], pays: 'France', certifications: ['ISO 13485'], delaiInterventionH: 120, notePerformance: 4.3, actif: true },
  { code: 'F009', raisonSociale: 'Fresenius Medical Care Afrique', types: ['fabricant', 'prestataire_maintenance'], pays: 'Allemagne', certifications: ['ISO 13485'], delaiInterventionH: 72, notePerformance: 4.4, actif: true },
  { code: 'F010', raisonSociale: 'B.Braun Medical', types: ['fabricant', 'distributeur'], pays: 'Allemagne', certifications: ['ISO 13485'], delaiInterventionH: 96, notePerformance: 4.0, actif: true },
  { code: 'F011', raisonSociale: 'Roche Diagnostics RDC', types: ['fabricant', 'prestataire_maintenance'], pays: 'Suisse', certifications: ['ISO 13485'], delaiInterventionH: 48, notePerformance: 4.6, actif: true },
  { code: 'F012', raisonSociale: 'Oxymat Afrique Centrale', types: ['fabricant', 'prestataire_maintenance'], pays: 'Danemark', certifications: ['ISO 13485', 'ISO 7396-1'], delaiInterventionH: 48, notePerformance: 4.2, actif: true },
  { code: 'F013', raisonSociale: 'Caterpillar Congo — Tractafric', types: ['distributeur', 'prestataire_maintenance'], pays: 'RD Congo', certifications: ['ISO 9001'], delaiInterventionH: 12, notePerformance: 4.3, actif: true },
  { code: 'F014', raisonSociale: 'Schneider Electric RDC', types: ['fabricant', 'prestataire_maintenance'], pays: 'France', certifications: ['ISO 9001'], delaiInterventionH: 24, notePerformance: 4.1, actif: true },
  { code: 'F015', raisonSociale: 'Otis Ascenseurs Congo', types: ['prestataire_maintenance'], pays: 'RD Congo', certifications: ['ISO 9001'], delaiInterventionH: 24, notePerformance: 3.8, actif: true },
  { code: 'F016', raisonSociale: 'APAVE International', types: ['organisme_controle'], pays: 'France', certifications: ['COFRAC', 'ISO 17020'], delaiInterventionH: 240, notePerformance: 4.4, actif: true, email: 'planification@apave.example' },
  { code: 'F017', raisonSociale: 'Bureau Veritas RDC', types: ['organisme_controle'], pays: 'RD Congo', certifications: ['ISO 17020', 'COFRAC'], delaiInterventionH: 240, notePerformance: 4.2, actif: true },
  { code: 'F018', raisonSociale: 'Laboratoire national de métrologie', types: ['organisme_controle'], pays: 'RD Congo', certifications: ['ISO 17025'], delaiInterventionH: 336, notePerformance: 3.5, actif: true },
  { code: 'F019', raisonSociale: 'CNPRI — Radioprotection', types: ['organisme_controle'], pays: 'RD Congo', certifications: [], delaiInterventionH: 336, notePerformance: 3.4, actif: true },
  { code: 'F020', raisonSociale: 'Clim & Froid Services', types: ['prestataire_maintenance'], pays: 'RD Congo', certifications: [], delaiInterventionH: 8, notePerformance: 3.7, actif: true },
  { code: 'F021', raisonSociale: 'Kin Électro Industrie', types: ['prestataire_maintenance', 'distributeur'], pays: 'RD Congo', certifications: [], delaiInterventionH: 6, notePerformance: 3.3, actif: true },
  { code: 'F022', raisonSociale: 'Sicli Protection Incendie', types: ['prestataire_maintenance', 'organisme_controle'], pays: 'RD Congo', certifications: ['APSAD'], delaiInterventionH: 48, notePerformance: 4.0, actif: true },
  { code: 'F023', raisonSociale: 'Karl Storz Endoskope', types: ['fabricant'], pays: 'Allemagne', certifications: ['ISO 13485'], delaiInterventionH: 168, notePerformance: 4.5, actif: true },
  { code: 'F024', raisonSociale: 'Hillrom / Baxter Afrique', types: ['fabricant', 'distributeur'], pays: 'États-Unis', certifications: ['ISO 13485'], delaiInterventionH: 168, notePerformance: 3.8, actif: true },
  { code: 'F025', raisonSociale: 'Congo Pharma Logistique', types: ['distributeur', 'transporteur'], pays: 'RD Congo', certifications: [], delaiInterventionH: 24, notePerformance: 3.6, actif: true },
];

/* ------------------------------------------------------------------ */
/* Articles de magasin                                                 */
/* ------------------------------------------------------------------ */

const DEF_ARTICLES: {
  designation: string;
  categorie: Article['categorie'];
  domaine: Article['domaine'];
  unite: string;
  prix: [number, number];
  min: [number, number];
  critique?: boolean;
  peremption?: boolean;
  pour?: string[];
}[] = [
  { designation: 'Filtre antibactérien respirateur', categorie: 'consommable', domaine: 'biomedical', unite: 'pce', prix: [2, 6], min: [80, 150], critique: true, peremption: true, pour: ['Respirateur de réanimation', 'Respirateur de transport', "Respirateur d'anesthésie"] },
  { designation: 'Circuit patient adulte stérile', categorie: 'consommable', domaine: 'biomedical', unite: 'pce', prix: [8, 18], min: [40, 80], critique: true, peremption: true, pour: ['Respirateur de réanimation'] },
  { designation: 'Cellule oxygène respirateur', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [95, 180], min: [4, 10], critique: true, peremption: true, pour: ['Respirateur de réanimation', "Respirateur d'anesthésie"] },
  { designation: 'Batterie Li-Ion respirateur', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [210, 420], min: [3, 8], critique: true, pour: ['Respirateur de réanimation', 'Respirateur de transport'] },
  { designation: 'Batterie plomb défibrillateur', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [120, 260], min: [4, 10], critique: true, pour: ['Défibrillateur semi-automatique'] },
  { designation: 'Électrodes de défibrillation adulte', categorie: 'consommable', domaine: 'biomedical', unite: 'paire', prix: [22, 48], min: [20, 40], critique: true, peremption: true, pour: ['Défibrillateur semi-automatique'] },
  { designation: 'Brassard PNI adulte réutilisable', categorie: 'accessoire', domaine: 'biomedical', unite: 'pce', prix: [18, 42], min: [10, 25], pour: ['Moniteur multiparamétrique'] },
  { designation: 'Capteur SpO₂ adulte', categorie: 'accessoire', domaine: 'biomedical', unite: 'pce', prix: [45, 120], min: [8, 20], critique: true, pour: ['Moniteur multiparamétrique'] },
  { designation: 'Capteur SpO₂ néonatal', categorie: 'accessoire', domaine: 'biomedical', unite: 'pce', prix: [60, 150], min: [4, 10], critique: true, pour: ['Moniteur multiparamétrique', 'Couveuse néonatale'] },
  { designation: 'Câble ECG 5 brins', categorie: 'accessoire', domaine: 'biomedical', unite: 'pce', prix: [55, 130], min: [6, 15], pour: ['Moniteur multiparamétrique', 'Électrocardiographe 12 dérivations'] },
  { designation: 'Papier thermique ECG 210 mm', categorie: 'consommable', domaine: 'biomedical', unite: 'rouleau', prix: [3, 8], min: [30, 60], pour: ['Électrocardiographe 12 dérivations'] },
  { designation: 'Kit de révision pousse-seringue', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'kit', prix: [65, 140], min: [8, 20], pour: ['Pousse-seringue électrique'] },
  { designation: 'Moteur d’entraînement pompe à perfusion', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [180, 380], min: [2, 5], pour: ['Pompe à perfusion volumétrique'] },
  { designation: 'Joint de porte autoclave', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [220, 480], min: [1, 4], critique: true, pour: ['Autoclave à vapeur 600 L'] },
  { designation: 'Purgeur de vapeur', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [90, 220], min: [2, 5], pour: ['Autoclave à vapeur 600 L'] },
  { designation: 'Test Bowie-Dick', categorie: 'consommable', domaine: 'biomedical', unite: 'boîte', prix: [45, 90], min: [4, 10], critique: true, peremption: true, pour: ['Autoclave à vapeur 600 L'] },
  { designation: 'Indicateur biologique stérilisation', categorie: 'consommable', domaine: 'biomedical', unite: 'boîte', prix: [55, 110], min: [3, 8], critique: true, peremption: true, pour: ['Autoclave à vapeur 600 L'] },
  { designation: 'Détergent-désinfectant laveur', categorie: 'produit_technique', domaine: 'biomedical', unite: 'bidon 5 L', prix: [28, 65], min: [6, 15], peremption: true, pour: ['Laveur-désinfecteur'] },
  { designation: 'Dialyseur haute perméabilité', categorie: 'consommable', domaine: 'biomedical', unite: 'pce', prix: [12, 28], min: [120, 250], critique: true, peremption: true, pour: ["Générateur d'hémodialyse"] },
  { designation: 'Ligne artério-veineuse dialyse', categorie: 'consommable', domaine: 'biomedical', unite: 'kit', prix: [8, 18], min: [120, 250], critique: true, peremption: true, pour: ["Générateur d'hémodialyse"] },
  { designation: 'Cartouche de bicarbonate', categorie: 'consommable', domaine: 'biomedical', unite: 'pce', prix: [6, 14], min: [80, 160], peremption: true, pour: ["Générateur d'hémodialyse"] },
  { designation: 'Membrane osmoseur', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [320, 680], min: [1, 3], critique: true, pour: ['Station de traitement d’eau par osmose inverse'] },
  { designation: 'Filtre HEPA H14', categorie: 'piece_detachee', domaine: 'technique_batiment', unite: 'pce', prix: [180, 420], min: [4, 10], critique: true, pour: ['Centrale de traitement d’air bloc opératoire', 'Hotte à flux laminaire'] },
  { designation: 'Préfiltre G4 CTA', categorie: 'consommable', domaine: 'technique_batiment', unite: 'pce', prix: [22, 55], min: [12, 30], pour: ['Centrale de traitement d’air bloc opératoire'] },
  { designation: 'Courroie trapézoïdale CTA', categorie: 'piece_detachee', domaine: 'technique_batiment', unite: 'pce', prix: [18, 45], min: [6, 15], pour: ['Centrale de traitement d’air bloc opératoire'] },
  { designation: 'Filtre à huile groupe électrogène', categorie: 'consommable', domaine: 'technique_batiment', unite: 'pce', prix: [35, 85], min: [4, 12], critique: true, pour: ['Groupe électrogène 500 kVA'] },
  { designation: 'Filtre à gasoil groupe électrogène', categorie: 'consommable', domaine: 'technique_batiment', unite: 'pce', prix: [28, 65], min: [4, 12], critique: true, pour: ['Groupe électrogène 500 kVA'] },
  { designation: 'Huile moteur 15W40', categorie: 'produit_technique', domaine: 'technique_batiment', unite: 'fût 20 L', prix: [75, 160], min: [3, 8], pour: ['Groupe électrogène 500 kVA'] },
  { designation: 'Batterie de démarrage 12 V 100 Ah', categorie: 'piece_detachee', domaine: 'technique_batiment', unite: 'pce', prix: [130, 280], min: [2, 6], critique: true, pour: ['Groupe électrogène 500 kVA'] },
  { designation: 'Bloc batteries onduleur 12 V 9 Ah', categorie: 'piece_detachee', domaine: 'technique_batiment', unite: 'pce', prix: [45, 95], min: [12, 40], critique: true, pour: ['Onduleur ASI 60 kVA'] },
  { designation: 'Ventilateur de refroidissement ASI', categorie: 'piece_detachee', domaine: 'technique_batiment', unite: 'pce', prix: [60, 140], min: [2, 6], pour: ['Onduleur ASI 60 kVA'] },
  { designation: 'Gaz réfrigérant R410A', categorie: 'produit_technique', domaine: 'technique_batiment', unite: 'bouteille 10 kg', prix: [180, 380], min: [2, 6], pour: ['Climatiseur split mural', 'Groupe froid à eau glacée'] },
  { designation: 'Condensateur de démarrage climatiseur', categorie: 'piece_detachee', domaine: 'technique_batiment', unite: 'pce', prix: [8, 22], min: [15, 40], pour: ['Climatiseur split mural'] },
  { designation: 'Carte électronique split', categorie: 'piece_detachee', domaine: 'technique_batiment', unite: 'pce', prix: [45, 130], min: [4, 10], pour: ['Climatiseur split mural'] },
  { designation: 'Charbon actif filtration O₂', categorie: 'consommable', domaine: 'fluides_medicaux', unite: 'sac 25 kg', prix: [120, 260], min: [2, 6], critique: true, pour: ['Centrale de production d’oxygène PSA'] },
  { designation: 'Tamis moléculaire zéolithe', categorie: 'piece_detachee', domaine: 'fluides_medicaux', unite: 'kg', prix: [45, 95], min: [20, 60], critique: true, pour: ['Centrale de production d’oxygène PSA'] },
  { designation: 'Cartouche filtrante air médical', categorie: 'consommable', domaine: 'fluides_medicaux', unite: 'pce', prix: [65, 160], min: [4, 12], critique: true, pour: ['Compresseur d’air médical'] },
  { designation: 'Prise murale O₂ AFNOR', categorie: 'piece_detachee', domaine: 'fluides_medicaux', unite: 'pce', prix: [55, 120], min: [8, 20], pour: ['Tableau de détente et d’alarme fluides'] },
  { designation: 'Détendeur O₂ 200 bar', categorie: 'piece_detachee', domaine: 'fluides_medicaux', unite: 'pce', prix: [90, 220], min: [4, 10], pour: ['Tableau de détente et d’alarme fluides'] },
  { designation: 'Lampe scialytique LED', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [220, 520], min: [2, 6], pour: ['Éclairage opératoire (scialytique)'] },
  { designation: 'Plaque neutre bistouri à usage unique', categorie: 'consommable', domaine: 'biomedical', unite: 'pce', prix: [3, 8], min: [100, 200], peremption: true, pour: ['Bistouri électrique'] },
  { designation: 'Vérin électrique table d’opération', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [480, 1_100], min: [1, 3], pour: ["Table d'opération électrique"] },
  { designation: 'Moteur de lit médicalisé', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [140, 320], min: [4, 12], pour: ['Lit médicalisé électrique'] },
  { designation: 'Roulette pivotante à frein Ø125', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [12, 32], min: [20, 60], pour: ['Lit médicalisé électrique', 'Chariot d’urgence', 'Table de réveil / brancard hydraulique'] },
  { designation: 'Télécommande filaire de lit', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [55, 130], min: [6, 15], pour: ['Lit médicalisé électrique'] },
  { designation: 'Matelas anti-escarres', categorie: 'accessoire', domaine: 'biomedical', unite: 'pce', prix: [180, 480], min: [5, 15], pour: ['Lit médicalisé électrique'] },
  { designation: 'Sonde échographique convexe', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [1_800, 4_500], min: [1, 3], critique: true, pour: ['Échographe'] },
  { designation: 'Gel de contact échographique', categorie: 'consommable', domaine: 'biomedical', unite: 'bidon 5 L', prix: [12, 28], min: [10, 25], peremption: true, pour: ['Échographe'] },
  { designation: 'Tube radiogène de remplacement', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [28_000, 65_000], min: [0, 1], critique: true, pour: ['Scanner 64 barrettes', 'Table de radiologie numérique'] },
  { designation: 'Cassette de détecteur plan', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [12_000, 28_000], min: [0, 1], pour: ['Table de radiologie numérique'] },
  { designation: 'Compresseur hermétique froid médical', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [420, 980], min: [1, 4], critique: true, pour: ['Congélateur -80 °C', 'Réfrigérateur à poches de sang'] },
  { designation: 'Sonde de température PT100 étalonnée', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [85, 220], min: [4, 12], pour: ['Congélateur -80 °C', 'Réfrigérateur à poches de sang', 'Réfrigérateur à vaccins'] },
  { designation: 'Réactif de contrôle qualité biochimie', categorie: 'consommable', domaine: 'biomedical', unite: 'kit', prix: [180, 420], min: [2, 6], peremption: true, pour: ['Automate de biochimie'] },
  { designation: 'Lampe halogène microscope', categorie: 'piece_detachee', domaine: 'biomedical', unite: 'pce', prix: [15, 45], min: [8, 20], pour: ['Microscope binoculaire'] },
  { designation: 'Câble réseau RJ45 catégorie 6', categorie: 'consommable', domaine: 'informatique', unite: 'pce', prix: [3, 12], min: [40, 100] },
  { designation: 'Disque dur SAS 2,4 To', categorie: 'piece_detachee', domaine: 'informatique', unite: 'pce', prix: [320, 680], min: [2, 6], critique: true, pour: ['Serveur de virtualisation', 'Serveur PACS imagerie'] },
  { designation: 'Fusible cartouche 10x38 gG', categorie: 'consommable', domaine: 'technique_batiment', unite: 'pce', prix: [1, 4], min: [50, 150] },
  { designation: 'Disjoncteur différentiel 30 mA', categorie: 'piece_detachee', domaine: 'technique_batiment', unite: 'pce', prix: [25, 75], min: [10, 30] },
  { designation: 'Tube LED 1 200 mm', categorie: 'consommable', domaine: 'technique_batiment', unite: 'pce', prix: [6, 18], min: [60, 150] },
  { designation: 'Bloc autonome d’éclairage de sécurité', categorie: 'piece_detachee', domaine: 'securite_incendie', unite: 'pce', prix: [35, 90], min: [10, 30] },
  { designation: 'Détecteur optique de fumée', categorie: 'piece_detachee', domaine: 'securite_incendie', unite: 'pce', prix: [28, 70], min: [10, 30], pour: ['Système de sécurité incendie (SSI cat. A)'] },
  { designation: 'Poudre extinctrice ABC 6 kg', categorie: 'consommable', domaine: 'securite_incendie', unite: 'pce', prix: [18, 42], min: [10, 25], pour: ['Extincteur portatif'] },
  { designation: 'Gants nitrile non stériles', categorie: 'consommable', domaine: 'biomedical', unite: 'boîte 100', prix: [6, 14], min: [40, 100], peremption: true },
  { designation: 'Désinfectant de surface haut niveau', categorie: 'produit_technique', domaine: 'biomedical', unite: 'bidon 5 L', prix: [22, 48], min: [8, 20], peremption: true },
  { designation: 'Multimètre de sécurité électrique', categorie: 'outillage', domaine: 'biomedical', unite: 'pce', prix: [1_200, 2_800], min: [0, 1] },
  { designation: 'Analyseur de gaz anesthésiques', categorie: 'outillage', domaine: 'biomedical', unite: 'pce', prix: [3_500, 7_500], min: [0, 1] },
  { designation: 'Simulateur de patient multiparamétrique', categorie: 'outillage', domaine: 'biomedical', unite: 'pce', prix: [2_800, 6_000], min: [0, 1] },
];

/* ------------------------------------------------------------------ */
/* Contrôles réglementaires de référence                               */
/* ------------------------------------------------------------------ */

const DEF_CONTROLES: {
  code: string;
  libelle: string;
  referentiel: ControleReglementaire['referentiel'];
  texte: string;
  familles: string[];
  periode: [number, ControleReglementaire['periodiciteUnite']];
  execution: ControleReglementaire['execution'];
  bloquant: boolean;
  organisme?: string;
}[] = [
  { code: 'CR-ELEC', libelle: 'Vérification périodique des installations électriques', referentiel: 'NF_C15_100', texte: 'Contrôle annuel obligatoire — organisme agréé', familles: ['ELE'], periode: [1, 'annees'], execution: 'organisme_agree', bloquant: true, organisme: 'F016' },
  { code: 'CR-MED', libelle: 'Contrôle des locaux à usage médical (régime IT médical)', referentiel: 'NF_C15_211', texte: 'Contrôle des schémas IT médicaux et des dispositifs de surveillance d’isolement', familles: ['ELE'], periode: [1, 'annees'], execution: 'organisme_agree', bloquant: true, organisme: 'F016' },
  { code: 'CR-SECU-DM', libelle: 'Contrôle de sécurité électrique des dispositifs médicaux', referentiel: 'UE_2017_745', texte: 'NF EN 62353 — courants de fuite, continuité de terre', familles: ['REA', 'MON', 'BLO', 'DIA', 'NEO', 'EXP'], periode: [1, 'annees'], execution: 'interne', bloquant: true },
  { code: 'CR-RADIO', libelle: 'Contrôle qualité des installations de radiologie', referentiel: 'radioprotection', texte: 'Contrôle qualité externe des générateurs de rayons X', familles: ['IMG'], periode: [1, 'annees'], execution: 'organisme_agree', bloquant: true, organisme: 'F019' },
  { code: 'CR-RADIOPROT', libelle: 'Contrôle de radioprotection des locaux', referentiel: 'radioprotection', texte: 'Mesure des débits de dose aux postes de travail et en périphérie', familles: ['IMG'], periode: [3, 'annees'], execution: 'organisme_agree', bloquant: true, organisme: 'F019' },
  { code: 'CR-FLUID', libelle: 'Contrôle des réseaux de fluides médicaux', referentiel: 'fluides_medicaux', texte: 'NF EN ISO 7396-1 — pureté, débit, pression, alarmes', familles: ['FLU'], periode: [1, 'annees'], execution: 'organisme_agree', bloquant: true, organisme: 'F017' },
  { code: 'CR-O2', libelle: 'Analyse de la qualité de l’oxygène produit', referentiel: 'fluides_medicaux', texte: 'Pharmacopée — titre O₂, CO, CO₂, H₂O, huile', familles: ['FLU'], periode: [6, 'mois'], execution: 'organisme_agree', bloquant: true, organisme: 'F017' },
  { code: 'CR-AUTO', libelle: 'Requalification des appareils à pression (autoclaves)', referentiel: 'appareils_pression', texte: 'Requalification périodique et inspection des générateurs de vapeur', familles: ['STE'], periode: [18, 'mois'], execution: 'organisme_agree', bloquant: true, organisme: 'F016' },
  { code: 'CR-STER', libelle: 'Qualification des performances de stérilisation', referentiel: 'ISO_13485', texte: 'NF EN ISO 17665 — validation annuelle des cycles', familles: ['STE'], periode: [1, 'annees'], execution: 'organisme_agree', bloquant: true, organisme: 'F008' },
  { code: 'CR-AIR', libelle: 'Contrôle de l’empoussièrement des salles propres', referentiel: 'qualite_air', texte: 'ISO 14644 — classe particulaire, cinétique de décontamination', familles: ['CVC'], periode: [6, 'mois'], execution: 'organisme_agree', bloquant: true, organisme: 'F017' },
  { code: 'CR-LEGIO', libelle: 'Recherche de légionelles sur le réseau d’eau chaude', referentiel: 'legionelle', texte: 'Prélèvements et analyse — seuil 1 000 UFC/L', familles: ['EAU'], periode: [6, 'mois'], execution: 'organisme_agree', bloquant: true, organisme: 'F017' },
  { code: 'CR-EAU-DIAL', libelle: 'Contrôle bactériologique de l’eau pour hémodialyse', referentiel: 'ISO_15189', texte: 'Pharmacopée européenne — eau pour dilution des solutions', familles: ['DIA'], periode: [3, 'mois'], execution: 'organisme_agree', bloquant: true, organisme: 'F017' },
  { code: 'CR-ASC', libelle: 'Contrôle technique des ascenseurs', referentiel: 'ascenseurs', texte: 'Contrôle quinquennal et entretien obligatoire', familles: ['LEV'], periode: [5, 'annees'], execution: 'organisme_agree', bloquant: true, organisme: 'F016' },
  { code: 'CR-SSI', libelle: 'Vérification du système de sécurité incendie', referentiel: 'securite_incendie', texte: 'Établissement de type U — vérification annuelle', familles: ['SSI'], periode: [1, 'annees'], execution: 'organisme_agree', bloquant: true, organisme: 'F022' },
  { code: 'CR-EXTINC', libelle: 'Vérification des extincteurs', referentiel: 'securite_incendie', texte: 'Règle APSAD R4 — vérification annuelle, épreuve décennale', familles: ['SSI'], periode: [1, 'annees'], execution: 'organisme_agree', bloquant: false, organisme: 'F022' },
  { code: 'CR-METRO', libelle: 'Étalonnage raccordé des instruments de mesure', referentiel: 'metrologie', texte: 'ISO 17025 — raccordement aux étalons nationaux', familles: ['LAB', 'FRO'], periode: [1, 'annees'], execution: 'organisme_agree', bloquant: false, organisme: 'F018' },
  { code: 'CR-GE', libelle: 'Essai en charge du groupe électrogène', referentiel: 'securite_incendie', texte: 'Essai mensuel à vide, essai semestriel en charge', familles: ['ELE'], periode: [6, 'mois'], execution: 'interne', bloquant: true },
  { code: 'CR-BIOMED-INV', libelle: 'Inventaire physique et contrôle de traçabilité du parc',referentiel: 'HAS_certification', texte: 'Critère de certification — inventaire annuel des DM', familles: ['REA', 'MON', 'BLO', 'IMG', 'LAB', 'DIA', 'NEO', 'STE', 'EXP', 'FRO', 'MOB'], periode: [1, 'annees'], execution: 'interne', bloquant: false },
];

/* ------------------------------------------------------------------ */
/* Construction de la base                                             */
/* ------------------------------------------------------------------ */

export function construireBaseDemo(): BaseGMAO {
  /* --- Sites, bâtiments, services, locaux --- */
  const sites: Site[] = [
    {
      id: 'site_hgr', code: 'HGR-KIN', nom: 'Hôpital Général de Référence de Kinshasa',
      adresse: 'Avenue de l’Hôpital, Gombe', ville: 'Kinshasa', province: 'Kinshasa',
      type: 'hopital', nbLits: 480, telephone: '+243 81 200 00 00', actif: true,
    },
    {
      id: 'site_ann', code: 'CSA-NDJ', nom: 'Centre de santé annexe de N’djili',
      adresse: 'Quartier 7, N’djili', ville: 'Kinshasa', province: 'Kinshasa',
      type: 'centre_sante', nbLits: 60, telephone: '+243 81 200 00 42', actif: true,
    },
  ];

  const batiments: Batiment[] = DEF_BATIMENTS.map((b) => ({
    id: `bat_${b.code}`, siteId: 'site_hgr', code: b.code, nom: b.nom,
    nbEtages: b.etages, anneeConstruction: b.annee,
  }));
  batiments.push({ id: 'bat_F', siteId: 'site_ann', code: 'F', nom: 'Centre annexe — bâtiment unique', nbEtages: 2, anneeConstruction: 2016 });

  const services: ServiceHospitalier[] = DEF_SERVICES.map((s) => ({
    id: `srv_${s.code}`, code: s.code, nom: s.nom, pole: s.pole, siteId: 'site_hgr',
    responsable: `Dr ${choix(PRENOMS)} ${choix(NOMS)}`,
    telephone: `+243 81 ${ent(200, 999)} ${ent(10, 99)} ${ent(10, 99)}`,
    criticite: s.criticite, continuite24_7: s.continu,
  }));
  services.push({
    id: 'srv_ANX', code: 'ANX', nom: 'Centre annexe — soins généraux', pole: 'Réseau',
    siteId: 'site_ann', responsable: `Dr ${choix(PRENOMS)} ${choix(NOMS)}`,
    criticite: 2, continuite24_7: true,
  });

  const locaux: Local[] = [];
  for (const s of services) {
    const batCode = s.siteId === 'site_ann' ? 'F' : (AFFECTATION_BATIMENT[s.code] ?? 'B');
    const bat = batiments.find((b) => b.code === batCode)!;
    const nb = s.criticite === 1 ? ent(5, 8) : s.criticite === 2 ? ent(4, 6) : ent(2, 4);
    for (let i = 1; i <= nb; i += 1) {
      const etage = String(ent(0, Math.max(0, bat.nbEtages - 1)));
      locaux.push({
        id: `loc_${s.code}_${i}`,
        siteId: s.siteId, batimentId: bat.id, serviceId: s.id,
        etage, code: `${batCode}${etage}-${s.code}${String(i).padStart(2, '0')}`,
        nom: nomDeLocal(s.code, i),
        zoneRisque: ZONE_PAR_SERVICE[s.code] ?? 'zone1_bas',
        surfaceM2: ent(12, 65),
        accesControle: ['BLO', 'REA', 'STE', 'PHA', 'IMG', 'TEC', 'DSI', 'BSG'].includes(s.code),
      });
    }
  }

  /* --- Équipes et personnel --- */
  const equipes: Equipe[] = [
    { id: 'eq_bio', code: 'BIO', nom: 'Service biomédical', domaine: 'biomedical', responsableId: 'usr_002', siteId: 'site_hgr', heuresHebdo: 40, astreinte: true },
    { id: 'eq_tec', code: 'TEC', nom: 'Services techniques — électricité & bâtiment', domaine: 'technique_batiment', responsableId: 'usr_003', siteId: 'site_hgr', heuresHebdo: 45, astreinte: true },
    { id: 'eq_flu', code: 'FLU', nom: 'Fluides médicaux et froid', domaine: 'fluides_medicaux', responsableId: 'usr_004', siteId: 'site_hgr', heuresHebdo: 40, astreinte: true },
    { id: 'eq_dsi', code: 'DSI', nom: 'Informatique hospitalière', domaine: 'informatique', responsableId: 'usr_005', siteId: 'site_hgr', heuresHebdo: 40, astreinte: false },
    { id: 'eq_ssi', code: 'SSI', nom: 'Sécurité incendie et sûreté', domaine: 'securite_incendie', responsableId: 'usr_006', siteId: 'site_hgr', heuresHebdo: 40, astreinte: true },
  ];

  const utilisateurs: Utilisateur[] = [
    utilisateur('usr_001', 'Mbuyi', 'Antoine', 'admin', undefined, 'ADM', 22),
    utilisateur('usr_002', 'Tshibangu', 'Céline', 'responsable_biomedical', 'eq_bio', 'TEC', 28),
    utilisateur('usr_003', 'Ilunga', 'Michel', 'responsable_technique', 'eq_tec', 'TEC', 26),
    utilisateur('usr_004', 'Nsimba', 'Bernard', 'responsable_technique', 'eq_flu', 'TEC', 24),
    utilisateur('usr_005', 'Kalonji', 'Serge', 'responsable_technique', 'eq_dsi', 'DSI', 24),
    utilisateur('usr_006', 'Mukendi', 'Patrick', 'responsable_technique', 'eq_ssi', 'TEC', 22),
    utilisateur('usr_007', 'Kabongo', 'Alain', 'qualite', undefined, 'ADM', 25),
    utilisateur('usr_008', 'Mwamba', 'Grâce', 'acheteur', undefined, 'ADM', 20),
    utilisateur('usr_009', 'Lukusa', 'Didier', 'magasinier', 'eq_bio', 'TEC', 14),
    utilisateur('usr_010', 'Ngoy', 'Bernadette', 'direction', undefined, 'ADM', 40),
  ];

  const repartitionTech: [ID, number][] = [['eq_bio', 8], ['eq_tec', 7], ['eq_flu', 3], ['eq_dsi', 3], ['eq_ssi', 2]];
  let n = 11;
  for (const [eqId, nb] of repartitionTech) {
    for (let i = 0; i < nb; i += 1) {
      utilisateurs.push(utilisateur(`usr_${String(n).padStart(3, '0')}`, choix(NOMS), choix(PRENOMS), 'technicien', eqId, 'TEC', ent(9, 18)));
      n += 1;
    }
  }
  // Demandeurs : un cadre de santé par service de soins.
  for (const s of DEF_SERVICES.filter((x) => !['TEC', 'ADM', 'DSI', 'BLA', 'CUI'].includes(x.code))) {
    utilisateurs.push(utilisateur(`usr_${String(n).padStart(3, '0')}`, choix(NOMS), choix(PRENOMS), 'demandeur', undefined, s.code, 0));
    n += 1;
  }

  const techniciens = utilisateurs.filter((u) => u.role === 'technicien');
  const demandeurs = utilisateurs.filter((u) => u.role === 'demandeur');

  const CATALOGUE_HABILITATIONS = [
    { intitule: 'Habilitation électrique B2V BR BC', reference: 'NF C 18-510', organisme: 'APAVE International', duree: 3, obligatoire: true },
    { intitule: 'Personne compétente en radioprotection', reference: 'PCR', organisme: 'CNPRI', duree: 5, obligatoire: true },
    { intitule: 'Manipulation des fluides frigorigènes — catégorie I', reference: 'Attestation d’aptitude', organisme: 'Bureau Veritas RDC', duree: 5, obligatoire: true },
    { intitule: 'Travail en hauteur et port du harnais', reference: 'R408', organisme: 'APAVE International', duree: 2, obligatoire: true },
    { intitule: 'Sécurité électrique des dispositifs médicaux (NF EN 62353)', reference: 'Formation constructeur', organisme: 'Dräger Medical', duree: 3, obligatoire: false },
    { intitule: 'Maintenance des générateurs d’hémodialyse', reference: 'Formation constructeur', organisme: 'Fresenius Medical Care', duree: 4, obligatoire: false },
    { intitule: 'Hygiène hospitalière et prévention du risque infectieux', reference: 'Formation interne', organisme: 'Équipe opérationnelle d’hygiène', duree: 2, obligatoire: true },
    { intitule: 'Habilitation gaz médicaux', reference: 'NF EN ISO 7396-1', organisme: 'Oxymat Afrique Centrale', duree: 3, obligatoire: true },
  ];

  const habilitations: Habilitation[] = [];
  let hid = 1;
  for (const t of techniciens) {
    for (const h of echantillon(CATALOGUE_HABILITATIONS, ent(2, 4))) {
      const obtention = addDays(AUJ, -ent(60, h.duree * 365 + 200));
      habilitations.push({
        id: `hab_${String(hid).padStart(3, '0')}`,
        utilisateurId: t.id, intitule: h.intitule, reference: h.reference, organisme: h.organisme,
        dateObtention: iso(obtention),
        dateExpiration: iso(addDays(obtention, h.duree * 365)),
        obligatoire: h.obligatoire,
      });
      hid += 1;
      t.competences.push(h.intitule.split('—')[0].trim());
    }
  }

  /* --- Fournisseurs --- */
  const fournisseurs: Fournisseur[] = DEF_FOURNISSEURS.map((f, i) => ({ id: `fou_${String(i + 1).padStart(3, '0')}`, ...f }));
  const parRaison = new Map(fournisseurs.map((f) => [f.raisonSociale, f]));
  const parCode = new Map(fournisseurs.map((f) => [f.code, f]));

  /* --- Familles --- */
  const familles: FamilleEquipement[] = FAMILLES.map((f) => ({
    id: `fam_${f.code}`, code: f.code, nom: f.nom, domaine: f.domaine, dureeVieAns: f.dureeVieAns,
  }));

  /* --- Équipements --- */
  const equipements: Equipement[] = [];
  const mouvementsEquipement: MouvementEquipement[] = [];
  let eqSeq = 1;

  for (const modele of CATALOGUE) {
    const quantite = ent(modele.quantite[0], modele.quantite[1]);
    const localsEligibles = locauxPour(locaux, services, modele);
    for (let i = 0; i < quantite; i += 1) {
      const [marque, mdl] = choix(modele.marques).split('|');
      const local = choix(localsEligibles);
      const service = services.find((s) => s.id === local.serviceId)!;
      const ageAns = dec(0.2, Math.min(modele.dureeVieAns * 1.3, 16), 1);
      const miseEnService = addDays(AUJ, -Math.round(ageAns * 365));
      const acquisition = addDays(miseEnService, -ent(20, 180));
      const prix = ent(modele.prix[0], modele.prix[1]);
      const statut = tirerStatut(modele.criticite);
      const code = `${modele.famille}-${String(eqSeq).padStart(4, '0')}`;
      const fab = parRaison.get(`${marque}`) ?? fournisseurs.find((f) => f.raisonSociale.startsWith(marque.split(' ')[0]));

      equipements.push({
        id: `eqp_${String(eqSeq).padStart(4, '0')}`,
        code,
        designation: modele.designation,
        familleId: `fam_${modele.famille}`,
        domaine: modele.domaine,
        marque, modele: mdl,
        numeroSerie: `${marque.slice(0, 3).toUpperCase()}${ent(100000, 999999)}`,
        classeDM: modele.classeDM,
        marquageCE: modele.classeDM !== 'hors_DM',
        numeroCE: modele.classeDM !== 'hors_DM' && modele.classeDM !== 'I' ? `CE ${ent(1000, 2999)}` : undefined,
        soumisVigilance: modele.soumisVigilance ?? ['IIb', 'III'].includes(modele.classeDM),
        fabricantId: fab?.id,
        fournisseurId: fab?.id ?? choix(fournisseurs.filter((f) => f.types.includes('distributeur'))).id,
        siteId: local.siteId, batimentId: local.batimentId, localId: local.id, serviceId: service.id,
        statut,
        criticite: modele.criticite,
        dateAcquisition: iso(acquisition),
        dateMiseEnService: iso(miseEnService),
        valeurAchat: prix,
        dureeAmortissementAns: modele.dureeVieAns,
        finGarantie: iso(addDays(miseEnService, ent(365, 1095))),
        compteurs: modele.compteur
          ? [{
              type: modele.compteur.type,
              unite: modele.compteur.unite,
              valeur: Math.round(ageAns * modele.compteur.parAn * dec(0.75, 1.15, 2)),
              dateReleve: jourRelatif(-ent(1, 40)),
            }]
          : [],
        risqueInfectieux: modele.risqueInfectieux ?? false,
        sourceRadioactive: modele.sourceRadioactive ?? false,
        gazMedicaux: modele.gazMedicaux ?? false,
        alimentationSecourue: modele.criticite <= 2,
        objectifDisponibilite: modele.criticite === 1 ? 99 : modele.criticite === 2 ? 97 : 95,
        qrToken: `GMAO:${code}`,
        actif: statut !== 'reforme',
        notes: chance(0.12) ? choix([
          'Équipement issu d’un don — documentation constructeur incomplète.',
          'Notice d’utilisation disponible en anglais uniquement.',
          'Alimentation à surveiller : le service subit des microcoupures.',
          'Pièces détachées à long délai d’approvisionnement (import).',
        ]) : undefined,
      });
      eqSeq += 1;
    }
  }

  // Quelques équipements de secours désignés sur les familles vitales.
  for (const eq of equipements.filter((e) => e.criticite === 1)) {
    const jumeaux = equipements.filter((x) => x.designation === eq.designation && x.id !== eq.id && x.statut === 'en_service');
    if (jumeaux.length && chance(0.5)) eq.equipementSecoursId = choix(jumeaux).id;
  }

  // Historique de mouvements d'implantation.
  for (const eq of echantillon(equipements, Math.round(equipements.length * 0.12))) {
    const cible = choix(locaux.filter((l) => l.serviceId === eq.serviceId));
    mouvementsEquipement.push({
      id: `mve_${eq.id}`,
      equipementId: eq.id,
      date: jourRelatif(-ent(30, 700)),
      localCibleId: cible.id,
      motif: choix(['Réaffectation de service', 'Retour de prêt', 'Réorganisation des lits', 'Sortie d’atelier après réparation']),
      utilisateurId: choix(techniciens).id,
    });
  }

  /* --- Magasins et articles --- */
  const magasins: Magasin[] = [
    { id: 'mag_bio', code: 'MAG-BIO', nom: 'Magasin biomédical — atelier', siteId: 'site_hgr', responsableId: 'usr_009' },
    { id: 'mag_tec', code: 'MAG-TEC', nom: 'Magasin technique — bâtiment E', siteId: 'site_hgr', responsableId: 'usr_009' },
    { id: 'mag_anx', code: 'MAG-ANX', nom: 'Magasin du centre annexe', siteId: 'site_ann' },
  ];

  const articles: Article[] = DEF_ARTICLES.map((a, i) => {
    const min = ent(a.min[0], a.min[1]);
    const max = Math.round(min * dec(2.2, 4, 1)) + 2;
    const pmp = ent(a.prix[0], a.prix[1]);
    const compatibles = a.pour
      ? equipements.filter((e) => a.pour!.includes(e.designation)).map((e) => e.id)
      : [];
    const stock = chance(0.14) ? ent(0, Math.max(0, min - 1)) : ent(min, max);
    const fournisseur = choix(fournisseurs.filter((f) => f.types.includes('distributeur') || f.types.includes('fabricant')));
    return {
      id: `art_${String(i + 1).padStart(3, '0')}`,
      code: `A${String(i + 1).padStart(4, '0')}`,
      designation: a.designation,
      categorie: a.categorie,
      domaine: a.domaine,
      unite: a.unite,
      magasinId: a.domaine === 'biomedical' ? 'mag_bio' : 'mag_tec',
      emplacement: `${choix(['A', 'B', 'C', 'D'])}${ent(1, 9)}-${ent(1, 6)}`,
      stockActuel: stock,
      stockMin: min,
      stockMax: max,
      consommationMensuelle: Math.max(1, Math.round(min / dec(1.5, 3.5, 1))),
      prixMoyenPondere: pmp,
      delaiApproJours: a.domaine === 'biomedical' ? ent(21, 90) : ent(7, 45),
      fournisseurPrincipalId: fournisseur.id,
      referenceFournisseur: `${fournisseur.code}-${ent(10000, 99999)}`,
      critique: a.critique ?? false,
      gestionLot: a.peremption ?? false,
      gestionPeremption: a.peremption ?? false,
      equipementsCompatibles: compatibles,
      actif: true,
    };
  });

  const lots: LotStock[] = [];
  for (const a of articles.filter((x) => x.gestionLot && x.stockActuel > 0)) {
    const nbLots = ent(1, 3);
    let reste = a.stockActuel;
    for (let i = 0; i < nbLots; i += 1) {
      const q = i === nbLots - 1 ? reste : Math.max(1, Math.round(reste / (nbLots - i)));
      reste -= q;
      lots.push({
        id: `lot_${a.id}_${i}`,
        articleId: a.id,
        numeroLot: `L${ent(2024, 2026)}${String(ent(1, 999)).padStart(3, '0')}`,
        quantite: q,
        datePeremption: jourRelatif(ent(-45, 720)),
      });
      if (reste <= 0) break;
    }
  }

  /* --- Contrats --- */
  const contrats: Contrat[] = [];
  const DEF_CONTRATS: { libelle: string; fou: string; type: Contrat['type']; designations: string[]; visites: number; pieces: boolean; sla: [number, number, number]; montant: [number, number] }[] = [
    { libelle: 'Maintenance full-service scanner et IRM', fou: 'F001', type: 'maintenance_totale', designations: ['Scanner 64 barrettes', 'IRM 1,5 T'], visites: 4, pieces: true, sla: [48, 96, 95], montant: [90_000, 150_000] },
    { libelle: 'Maintenance préventive respirateurs et anesthésie', fou: 'F003', type: 'maintenance_preventive', designations: ['Respirateur de réanimation', "Respirateur d'anesthésie", 'Respirateur de transport'], visites: 2, pieces: false, sla: [96, 168, 97], montant: [28_000, 46_000] },
    { libelle: 'Contrat générateurs d’hémodialyse et traitement d’eau', fou: 'F009', type: 'maintenance_totale', designations: ["Générateur d'hémodialyse", 'Station de traitement d’eau par osmose inverse'], visites: 3, pieces: true, sla: [72, 120, 98], montant: [42_000, 68_000] },
    { libelle: 'Maintenance automates de laboratoire', fou: 'F011', type: 'maintenance_totale', designations: ['Automate de biochimie', "Automate d'hématologie", 'Analyseur de gaz du sang'], visites: 4, pieces: true, sla: [48, 72, 97], montant: [35_000, 60_000] },
    { libelle: 'Exploitation de la centrale d’oxygène et des réseaux de fluides', fou: 'F012', type: 'maintenance_totale', designations: ['Centrale de production d’oxygène PSA', 'Compresseur d’air médical', 'Centrale de vide médical', 'Tableau de détente et d’alarme fluides'], visites: 12, pieces: true, sla: [24, 48, 99], montant: [55_000, 85_000] },
    { libelle: 'Maintenance groupes électrogènes', fou: 'F013', type: 'maintenance_preventive', designations: ['Groupe électrogène 500 kVA'], visites: 4, pieces: false, sla: [12, 24, 99], montant: [18_000, 32_000] },
    { libelle: 'Maintenance onduleurs et TGBT', fou: 'F014', type: 'maintenance_preventive', designations: ['Onduleur ASI 60 kVA', 'Tableau général basse tension', 'Transformateur 630 kVA'], visites: 2, pieces: false, sla: [24, 48, 98], montant: [15_000, 26_000] },
    { libelle: 'Entretien des ascenseurs', fou: 'F015', type: 'maintenance_totale', designations: ['Ascenseur brancardier 1 600 kg'], visites: 12, pieces: true, sla: [24, 48, 97], montant: [12_000, 22_000] },
    { libelle: 'Maintenance stérilisation centrale', fou: 'F008', type: 'maintenance_totale', designations: ['Autoclave à vapeur 600 L', 'Laveur-désinfecteur'], visites: 3, pieces: true, sla: [72, 120, 96], montant: [30_000, 52_000] },
    { libelle: 'Contrat climatisation et traitement d’air', fou: 'F020', type: 'maintenance_preventive', designations: ['Climatiseur split mural', 'Centrale de traitement d’air bloc opératoire', 'Groupe froid à eau glacée'], visites: 4, pieces: false, sla: [8, 24, 95], montant: [24_000, 40_000] },
    { libelle: 'Vérifications réglementaires bâtiment et électricité', fou: 'F016', type: 'controle_reglementaire', designations: ['Tableau général basse tension', 'Ascenseur brancardier 1 600 kg', 'Autoclave à vapeur 600 L'], visites: 1, pieces: false, sla: [240, 480, 90], montant: [9_000, 16_000] },
    { libelle: 'Maintenance SSI et moyens de secours', fou: 'F022', type: 'maintenance_totale', designations: ['Système de sécurité incendie (SSI cat. A)', 'Extincteur portatif'], visites: 2, pieces: true, sla: [48, 96, 96], montant: [11_000, 19_000] },
    { libelle: 'Support et maintenance du PACS', fou: 'F002', type: 'assistance_technique', designations: ['Serveur PACS imagerie'], visites: 2, pieces: false, sla: [24, 48, 99], montant: [18_000, 30_000] },
    { libelle: 'Maintenance monitorage et perfusion', fou: 'F005', type: 'maintenance_preventive', designations: ['Moniteur multiparamétrique', 'Pousse-seringue électrique', 'Pompe à perfusion volumétrique'], visites: 2, pieces: false, sla: [24, 72, 96], montant: [22_000, 38_000] },
  ];

  DEF_CONTRATS.forEach((c, i) => {
    const fou = parCode.get(c.fou)!;
    const cibles = equipements.filter((e) => c.designations.includes(e.designation) && e.statut !== 'reforme');
    const debut = addMonths(AUJ, -ent(4, 30));
    const fin = addMonths(debut, choix([12, 24, 36]));
    const contrat: Contrat = {
      id: `ctr_${String(i + 1).padStart(3, '0')}`,
      numero: `CTR-${debut.getFullYear()}-${String(i + 1).padStart(3, '0')}`,
      libelle: c.libelle,
      fournisseurId: fou.id,
      type: c.type,
      dateDebut: iso(debut),
      dateFin: iso(fin),
      montantAnnuel: ent(c.montant[0], c.montant[1]),
      visitesIncluses: c.visites,
      piecesIncluses: c.pieces,
      slaDelaiInterventionH: c.sla[0],
      slaDelaiRetablissementH: c.sla[1],
      slaTauxDisponibilite: c.sla[2],
      reconductionTacite: chance(0.6),
      preavisJours: choix([30, 60, 90]),
      equipementIds: cibles.map((e) => e.id),
      statut: fin < AUJ ? 'echu' : 'actif',
      notes: chance(0.3) ? 'Pénalités de retard prévues à l’article 8 en cas de dépassement du délai de rétablissement.' : undefined,
    };
    contrats.push(contrat);
    for (const e of cibles) e.contratId = contrat.id;
  });

  /* --- Gammes de maintenance --- */
  const gammes: GammeMaintenance[] = [];
  const DEF_GAMMES: { libelle: string; designations: string[]; type: GammeMaintenance['type']; periode: [number, GammeMaintenance['periodiciteUnite']]; duree: number; execution: 'interne' | 'prestataire'; arret: boolean; norme?: string; ops: [string, OperationGamme['nature'], number, (number | undefined)?, (string | undefined)?, (number | undefined)?, (number | undefined)?][]; pieces?: string[]; compteur?: [GammeMaintenance['compteurType'], number] }[] = [
    {
      libelle: 'Visite préventive respirateur de réanimation',
      designations: ['Respirateur de réanimation', 'Respirateur de transport'],
      type: 'preventif', periode: [6, 'mois'], duree: 120, execution: 'interne', arret: true,
      norme: 'NF EN 62353 / recommandations constructeur',
      ops: [
        ['Contrôle visuel du châssis, des câbles et des flexibles', 'controle_visuel', 10],
        ['Nettoyage et désinfection externe', 'nettoyage', 15],
        ['Remplacement du filtre antibactérien', 'remplacement', 10],
        ['Test d’étanchéité du circuit patient', 'test_fonctionnel', 15, 0, 'mL/min', 0, 50],
        ['Vérification de la cellule oxygène (21 % / 100 %)', 'mesure', 15, 21, '%', 20, 22],
        ['Contrôle du volume courant délivré', 'mesure', 20, 500, 'mL', 475, 525],
        ['Test d’autonomie sur batterie (30 min minimum)', 'test_fonctionnel', 20, 30, 'min', 30, 240],
        ['Contrôle de sécurité électrique — courant de fuite', 'securite_electrique', 15, 0.1, 'mA', 0, 0.5],
      ],
      pieces: ['Filtre antibactérien respirateur'],
    },
    {
      libelle: 'Contrôle qualité moniteur multiparamétrique',
      designations: ['Moniteur multiparamétrique'],
      type: 'preventif', periode: [12, 'mois'], duree: 60, execution: 'interne', arret: true,
      norme: 'NF EN 62353',
      ops: [
        ['Contrôle visuel et nettoyage', 'nettoyage', 10],
        ['Vérification des accessoires (brassard, SpO₂, ECG)', 'controle_visuel', 10],
        ['Test ECG au simulateur — fréquence 60 bpm', 'mesure', 10, 60, 'bpm', 59, 61],
        ['Test SpO₂ au simulateur — 95 %', 'mesure', 10, 95, '%', 93, 97],
        ['Test PNI — 120/80 mmHg', 'mesure', 10, 120, 'mmHg', 116, 124],
        ['Contrôle de sécurité électrique', 'securite_electrique', 10, 0.1, 'mA', 0, 0.5],
      ],
    },
    {
      libelle: 'Maintenance préventive pousse-seringue',
      designations: ['Pousse-seringue électrique', 'Pompe à perfusion volumétrique'],
      type: 'preventif', periode: [12, 'mois'], duree: 45, execution: 'interne', arret: true,
      norme: 'NF EN 60601-2-24',
      ops: [
        ['Nettoyage et désinfection', 'nettoyage', 10],
        ['Contrôle de la précision du débit à 25 mL/h', 'mesure', 15, 25, 'mL/h', 23.75, 26.25],
        ['Test de l’alarme d’occlusion', 'test_fonctionnel', 10],
        ['Test d’autonomie batterie', 'test_fonctionnel', 5, 6, 'h', 4, 24],
        ['Contrôle de sécurité électrique', 'securite_electrique', 5, 0.1, 'mA', 0, 0.5],
      ],
      pieces: ['Kit de révision pousse-seringue'],
    },
    {
      libelle: 'Vérification mensuelle du chariot d’urgence et du défibrillateur',
      designations: ['Défibrillateur semi-automatique', 'Chariot d’urgence'],
      type: 'preventif', periode: [1, 'mois'], duree: 20, execution: 'interne', arret: false,
      ops: [
        ['Contrôle de l’autotest quotidien', 'controle_visuel', 5],
        ['Vérification de la date de péremption des électrodes', 'controle_visuel', 5],
        ['Test de charge et de délivrance à 200 J', 'mesure', 5, 200, 'J', 190, 210],
        ['Contrôle du niveau de charge batterie', 'controle_visuel', 5],
      ],
      pieces: ['Électrodes de défibrillation adulte'],
    },
    {
      libelle: 'Préventif semestriel couveuse néonatale',
      designations: ['Couveuse néonatale', 'Table radiante de réanimation néonatale'],
      type: 'preventif', periode: [6, 'mois'], duree: 90, execution: 'interne', arret: true,
      norme: 'NF EN 60601-2-19',
      ops: [
        ['Désinfection complète de l’habitacle', 'nettoyage', 25],
        ['Contrôle de la régulation de température à 36 °C', 'mesure', 20, 36, '°C', 35.5, 36.5],
        ['Contrôle de l’hygrométrie', 'mesure', 10, 60, '%HR', 50, 70],
        ['Test des alarmes de température haute et basse', 'test_fonctionnel', 15],
        ['Vérification du niveau sonore intérieur', 'mesure', 10, 45, 'dB(A)', 0, 60],
        ['Contrôle de sécurité électrique', 'securite_electrique', 10, 0.1, 'mA', 0, 0.5],
      ],
    },
    {
      libelle: 'Maintenance trimestrielle générateur d’hémodialyse',
      designations: ["Générateur d'hémodialyse"],
      type: 'preventif', periode: [3, 'mois'], duree: 150, execution: 'prestataire', arret: true,
      norme: 'Recommandations constructeur / bonnes pratiques de dialyse',
      ops: [
        ['Désinfection thermochimique du circuit hydraulique', 'nettoyage', 40],
        ['Contrôle de la conductivité du dialysat', 'mesure', 20, 14, 'mS/cm', 13.5, 14.5],
        ['Contrôle de la température du dialysat', 'mesure', 15, 37, '°C', 36.5, 37.5],
        ['Test du détecteur d’air', 'test_fonctionnel', 15],
        ['Contrôle du débit sang à 300 mL/min', 'mesure', 20, 300, 'mL/min', 285, 315],
        ['Test de l’alarme de fuite de sang', 'test_fonctionnel', 20],
        ['Contrôle de sécurité électrique', 'securite_electrique', 20, 0.1, 'mA', 0, 0.5],
      ],
    },
    {
      libelle: 'Entretien mensuel autoclave',
      designations: ['Autoclave à vapeur 600 L'],
      type: 'preventif', periode: [1, 'mois'], duree: 120, execution: 'interne', arret: true,
      norme: 'NF EN ISO 17665',
      ops: [
        ['Test de Bowie-Dick', 'test_fonctionnel', 25],
        ['Contrôle du joint de porte', 'controle_visuel', 15],
        ['Purge et nettoyage du générateur de vapeur', 'nettoyage', 30],
        ['Contrôle du vide (test de fuite)', 'mesure', 25, 1.3, 'mbar/min', 0, 1.3],
        ['Vérification de l’enregistreur de cycle', 'controle_visuel', 10],
        ['Contrôle des soupapes de sécurité', 'test_fonctionnel', 15],
      ],
      pieces: ['Test Bowie-Dick', 'Joint de porte autoclave'],
    },
    {
      libelle: 'Préventif sur compteur — autoclave (cycles)',
      designations: ['Autoclave à vapeur 600 L'],
      type: 'preventif', periode: [1, 'annees'], duree: 240, execution: 'prestataire', arret: true,
      compteur: ['cycles', 1000],
      ops: [
        ['Remplacement des joints et garnitures', 'remplacement', 90],
        ['Révision des purgeurs de vapeur', 'remplacement', 60],
        ['Contrôle métrologique des sondes de température', 'etalonnage', 60],
        ['Requalification opérationnelle du cycle 134 °C', 'test_fonctionnel', 30, 134, '°C', 134, 137],
      ],
      pieces: ['Joint de porte autoclave', 'Purgeur de vapeur'],
    },
    {
      libelle: 'Essai mensuel du groupe électrogène',
      designations: ['Groupe électrogène 500 kVA'],
      type: 'preventif', periode: [1, 'mois'], duree: 60, execution: 'interne', arret: false,
      ops: [
        ['Contrôle des niveaux (huile, liquide de refroidissement, gasoil)', 'controle_visuel', 15],
        ['Essai de démarrage automatique sur coupure simulée', 'test_fonctionnel', 20],
        ['Mesure du temps de basculement', 'mesure', 5, 10, 's', 0, 15],
        ['Contrôle de la tension et de la fréquence en charge', 'mesure', 10, 400, 'V', 380, 420],
        ['Purge du décanteur de gasoil', 'nettoyage', 10],
      ],
    },
    {
      libelle: 'Révision annuelle groupe électrogène (compteur horaire)',
      designations: ['Groupe électrogène 500 kVA'],
      type: 'preventif', periode: [1, 'annees'], duree: 300, execution: 'prestataire', arret: true,
      compteur: ['heures', 500],
      ops: [
        ['Vidange moteur et remplacement des filtres', 'remplacement', 120],
        ['Remplacement du filtre à air', 'remplacement', 30],
        ['Contrôle et test de la batterie de démarrage', 'mesure', 30, 12.6, 'V', 12.2, 13.2],
        ['Contrôle du circuit de refroidissement', 'controle_visuel', 40],
        ['Essai en charge 4 h avec banc de charge', 'test_fonctionnel', 80],
      ],
      pieces: ['Filtre à huile groupe électrogène', 'Filtre à gasoil groupe électrogène', 'Huile moteur 15W40'],
    },
    {
      libelle: 'Maintenance semestrielle onduleur ASI',
      designations: ['Onduleur ASI 60 kVA'],
      type: 'preventif', periode: [6, 'mois'], duree: 120, execution: 'prestataire', arret: false,
      ops: [
        ['Dépoussiérage et contrôle des ventilateurs', 'nettoyage', 30],
        ['Contrôle de la tension de chaque bloc batterie', 'mesure', 40, 13.5, 'V', 12.8, 13.8],
        ['Test d’autonomie en décharge', 'test_fonctionnel', 30, 20, 'min', 15, 60],
        ['Contrôle de la température ambiante du local', 'mesure', 10, 24, '°C', 18, 28],
        ['Relevé des alarmes et du journal', 'controle_visuel', 10],
      ],
      pieces: ['Bloc batteries onduleur 12 V 9 Ah'],
    },
    {
      libelle: 'Entretien trimestriel centrale de traitement d’air',
      designations: ['Centrale de traitement d’air bloc opératoire'],
      type: 'preventif', periode: [3, 'mois'], duree: 180, execution: 'prestataire', arret: true,
      norme: 'ISO 14644 / NF S 90-351',
      ops: [
        ['Remplacement des préfiltres G4', 'remplacement', 40],
        ['Contrôle de l’encrassement des filtres HEPA', 'mesure', 30, 200, 'Pa', 0, 450],
        ['Contrôle de la surpression de la salle', 'mesure', 20, 15, 'Pa', 10, 25],
        ['Contrôle du taux de brassage', 'mesure', 30, 25, 'vol/h', 20, 40],
        ['Contrôle des courroies et de l’alignement des poulies', 'controle_visuel', 30],
        ['Désinfection du caisson et des batteries', 'nettoyage', 30],
      ],
      pieces: ['Préfiltre G4 CTA', 'Courroie trapézoïdale CTA'],
    },
    {
      libelle: 'Entretien semestriel climatiseur split',
      designations: ['Climatiseur split mural'],
      type: 'preventif', periode: [6, 'mois'], duree: 45, execution: 'prestataire', arret: false,
      ops: [
        ['Nettoyage des filtres et de l’échangeur', 'nettoyage', 20],
        ['Contrôle de la charge en fluide frigorigène', 'mesure', 10, 8, 'bar', 6, 10],
        ['Contrôle de l’écoulement des condensats', 'controle_visuel', 5],
        ['Mesure du ΔT soufflage / reprise', 'mesure', 10, 10, '°C', 7, 14],
      ],
    },
    {
      libelle: 'Maintenance mensuelle centrale d’oxygène',
      designations: ['Centrale de production d’oxygène PSA', 'Compresseur d’air médical', 'Centrale de vide médical'],
      type: 'preventif', periode: [1, 'mois'], duree: 150, execution: 'prestataire', arret: false,
      norme: 'NF EN ISO 7396-1',
      ops: [
        ['Relevé du titre en oxygène produit', 'mesure', 20, 94, '%', 93, 96],
        ['Purge des condensats et contrôle des sécheurs', 'nettoyage', 30],
        ['Contrôle de la pression de distribution', 'mesure', 20, 4.5, 'bar', 4, 5],
        ['Test des alarmes de la centrale et des reports', 'test_fonctionnel', 30],
        ['Contrôle du niveau sonore et des vibrations compresseur', 'mesure', 20, 3, 'mm/s', 0, 4.5],
        ['Vérification de l’autonomie de la réserve de secours', 'controle_visuel', 30],
      ],
      pieces: ['Cartouche filtrante air médical'],
    },
    {
      libelle: 'Vérification annuelle des prises de fluides médicaux',
      designations: ['Tableau de détente et d’alarme fluides'],
      type: 'preventif', periode: [12, 'mois'], duree: 90, execution: 'prestataire', arret: false,
      norme: 'NF EN ISO 7396-1',
      ops: [
        ['Test de non-interchangeabilité des prises', 'test_fonctionnel', 30],
        ['Contrôle du débit à la prise', 'mesure', 20, 60, 'L/min', 40, 100],
        ['Contrôle de l’étanchéité du réseau', 'test_fonctionnel', 20],
        ['Test des alarmes de pression', 'test_fonctionnel', 20],
      ],
      pieces: ['Prise murale O₂ AFNOR'],
    },
    {
      libelle: 'Préventif annuel échographe',
      designations: ['Échographe'],
      type: 'preventif', periode: [12, 'mois'], duree: 75, execution: 'interne', arret: true,
      ops: [
        ['Contrôle visuel des sondes (câbles, lentilles)', 'controle_visuel', 20],
        ['Nettoyage et désinfection des sondes', 'nettoyage', 15],
        ['Test de qualité image sur fantôme', 'test_fonctionnel', 20],
        ['Contrôle des ventilateurs et dépoussiérage', 'nettoyage', 10],
        ['Contrôle de sécurité électrique', 'securite_electrique', 10, 0.1, 'mA', 0, 0.5],
      ],
    },
    {
      libelle: 'Préventif semestriel lit médicalisé',
      designations: ['Lit médicalisé électrique'],
      type: 'preventif', periode: [6, 'mois'], duree: 30, execution: 'interne', arret: false,
      ops: [
        ['Contrôle des roulettes et des freins', 'controle_visuel', 5],
        ['Test des moteurs et de la télécommande', 'test_fonctionnel', 10],
        ['Contrôle des barrières de sécurité', 'controle_visuel', 5],
        ['Contrôle du cordon d’alimentation', 'securite_electrique', 5],
        ['Nettoyage et lubrification des articulations', 'nettoyage', 5],
      ],
      pieces: ['Roulette pivotante à frein Ø125'],
    },
    {
      libelle: 'Contrôle trimestriel des réfrigérateurs médicaux',
      designations: ['Réfrigérateur à poches de sang', 'Congélateur -80 °C', 'Réfrigérateur à vaccins'],
      type: 'preventif', periode: [3, 'mois'], duree: 45, execution: 'interne', arret: false,
      ops: [
        ['Contrôle du joint de porte et de la fermeture', 'controle_visuel', 10],
        ['Dépoussiérage du condenseur', 'nettoyage', 10],
        ['Vérification de la sonde de température par comparaison', 'mesure', 15, 4, '°C', 2, 6],
        ['Test de l’alarme de température et du report', 'test_fonctionnel', 10],
      ],
    },
    {
      libelle: 'Visite annuelle bloc opératoire — table et scialytique',
      designations: ["Table d'opération électrique", 'Éclairage opératoire (scialytique)'],
      type: 'preventif', periode: [12, 'mois'], duree: 120, execution: 'interne', arret: true,
      ops: [
        ['Contrôle des vérins et des articulations', 'controle_visuel', 30],
        ['Test de toutes les positions et de la commande de secours', 'test_fonctionnel', 30],
        ['Mesure de l’éclairement au champ opératoire', 'mesure', 20, 130_000, 'lux', 100_000, 160_000],
        ['Contrôle de la température de couleur', 'mesure', 10, 4300, 'K', 3900, 4700],
        ['Contrôle de sécurité électrique', 'securite_electrique', 20, 0.1, 'mA', 0, 0.5],
        ['Contrôle de la batterie de secours de la table', 'mesure', 10, 24, 'V', 22, 26],
      ],
      pieces: ['Lampe scialytique LED'],
    },
    {
      libelle: 'Métrologie — étalonnage des instruments de mesure du laboratoire',
      designations: ['Automate de biochimie', "Automate d'hématologie", 'Analyseur de gaz du sang', 'Centrifugeuse de paillasse'],
      type: 'metrologie', periode: [12, 'mois'], duree: 90, execution: 'prestataire', arret: true,
      norme: 'ISO 17025 — raccordement aux étalons',
      ops: [
        ['Vérification de la vitesse de rotation', 'etalonnage', 30, 3000, 'tr/min', 2900, 3100],
        ['Étalonnage des sondes de température', 'etalonnage', 30, 37, '°C', 36.5, 37.5],
        ['Contrôle des volumes pipetés', 'etalonnage', 30, 100, 'µL', 98, 102],
      ],
    },
    {
      libelle: 'Contrôle trimestriel des ascenseurs',
      designations: ['Ascenseur brancardier 1 600 kg'],
      type: 'preventif', periode: [3, 'mois'], duree: 90, execution: 'prestataire', arret: true,
      ops: [
        ['Contrôle des câbles et de la suspension', 'controle_visuel', 25],
        ['Essai des dispositifs de sécurité (parachute, limiteur)', 'test_fonctionnel', 25],
        ['Contrôle du nivelage aux paliers', 'mesure', 15, 0, 'mm', -10, 10],
        ['Test de la téléalarme et de l’éclairage de secours', 'test_fonctionnel', 15],
        ['Graissage des guides', 'nettoyage', 10],
      ],
    },
    {
      libelle: 'Vérification mensuelle des extincteurs et du désenfumage',
      designations: ['Extincteur portatif', 'Système de sécurité incendie (SSI cat. A)'],
      type: 'preventif', periode: [1, 'mois'], duree: 25, execution: 'interne', arret: false,
      ops: [
        ['Contrôle de la présence et de l’accessibilité', 'controle_visuel', 5],
        ['Contrôle de la pression et du plombage', 'controle_visuel', 10],
        ['Test des détecteurs par zone', 'test_fonctionnel', 10],
      ],
    },
    {
      libelle: 'Maintenance préventive serveurs et sauvegardes',
      designations: ['Serveur de virtualisation', 'Serveur PACS imagerie'],
      type: 'preventif', periode: [3, 'mois'], duree: 90, execution: 'interne', arret: false,
      ops: [
        ['Contrôle de l’état des disques et des RAID', 'controle_visuel', 20],
        ['Test de restauration d’une sauvegarde', 'test_fonctionnel', 40],
        ['Dépoussiérage et contrôle de la ventilation', 'nettoyage', 15],
        ['Contrôle de la température de la salle serveur', 'mesure', 15, 22, '°C', 18, 27],
      ],
    },
    {
      libelle: 'Révision ambulance (kilométrage)',
      designations: ['Ambulance de réanimation type C'],
      type: 'preventif', periode: [6, 'mois'], duree: 180, execution: 'prestataire', arret: true,
      compteur: ['kilometres', 10_000],
      ops: [
        ['Vidange et remplacement des filtres', 'remplacement', 60],
        ['Contrôle du système de freinage', 'controle_visuel', 40],
        ['Contrôle des équipements médicaux embarqués', 'test_fonctionnel', 40],
        ['Contrôle de l’onduleur et du convertisseur 12/230 V', 'mesure', 40, 230, 'V', 220, 240],
      ],
    },
  ];

  DEF_GAMMES.forEach((g, i) => {
    const cibles = equipements.filter((e) => g.designations.includes(e.designation) && e.statut !== 'reforme');
    if (!cibles.length) return;
    const operations: OperationGamme[] = g.ops.map((o, k) => ({
      id: `opg_${i + 1}_${k + 1}`,
      ordre: k + 1,
      libelle: o[0],
      nature: o[1],
      dureeMin: o[2],
      valeurAttendue: o[3],
      unite: o[4],
      toleranceMin: o[5],
      toleranceMax: o[6],
      obligatoire: o[1] === 'securite_electrique' || o[1] === 'test_fonctionnel' || k < 3,
    }));
    gammes.push({
      id: `gam_${String(i + 1).padStart(3, '0')}`,
      code: `GAM-${String(i + 1).padStart(3, '0')}`,
      libelle: g.libelle,
      type: g.type,
      equipementIds: cibles.map((e) => e.id),
      modeDeclenchement: g.compteur ? 'compteur' : 'calendaire',
      periodiciteValeur: g.periode[0],
      periodiciteUnite: g.periode[1],
      compteurType: g.compteur?.[0],
      compteurSeuil: g.compteur?.[1],
      dureeEstimeeMin: g.duree,
      competencesRequises: g.ops.some((o) => o[1] === 'securite_electrique') ? ['Habilitation électrique B2V BR BC'] : [],
      equipeId: equipePourDomaine(equipes, cibles[0].domaine),
      execution: g.execution,
      arretEquipementRequis: g.arret,
      consignesSecurite: consigneSecurite(cibles[0]),
      referenceNormative: g.norme,
      operations,
      piecesPrevues: (g.pieces ?? [])
        .map((d) => articles.find((a) => a.designation === d))
        .filter((a): a is Article => Boolean(a))
        .map((a) => ({ articleId: a.id, quantite: 1 })),
      actif: true,
    });
  });

  /* --- Contrôles réglementaires --- */
  const controles: ControleReglementaire[] = DEF_CONTROLES.map((c, i) => ({
    id: `crg_${String(i + 1).padStart(3, '0')}`,
    code: c.code,
    libelle: c.libelle,
    referentiel: c.referentiel,
    texteReference: c.texte,
    familleIds: c.familles.map((f) => `fam_${f}`),
    equipementIds: [],
    periodiciteValeur: c.periode[0],
    periodiciteUnite: c.periode[1],
    organismeId: c.organisme ? parCode.get(c.organisme)?.id : undefined,
    execution: c.execution,
    bloquant: c.bloquant,
    actif: true,
  }));

  /* --- Historique des visites de contrôle --- */
  const visitesControle: VisiteControle[] = [];
  let vcSeq = 1;
  for (const ctrl of controles) {
    const cibles = equipements.filter(
      (e) => e.statut !== 'reforme' && ctrl.familleIds.includes(e.familleId),
    );
    // On ne trace pas chaque extincteur individuellement : échantillon représentatif.
    for (const eq of echantillon(cibles, Math.min(cibles.length, 25))) {
      if (chance(0.12)) continue; // équipement jamais contrôlé : c'est un écart réel
      const jours = joursPeriode(ctrl.periodiciteValeur, ctrl.periodiciteUnite);
      const derniere = addDays(AUJ, -ent(Math.round(jours * 0.1), Math.round(jours * 1.15)));
      const verdict = chance(0.78) ? 'conforme' : chance(0.7) ? 'conforme_avec_reserves' : 'non_conforme';
      visitesControle.push({
        id: `vct_${String(vcSeq).padStart(4, '0')}`,
        controleId: ctrl.id,
        equipementId: eq.id,
        dateVisite: iso(derniere),
        dateProchaine: iso(addDays(derniere, jours)),
        organismeId: ctrl.organismeId,
        verdict,
        reserves:
          verdict === 'conforme'
            ? []
            : [{
                id: `res_${vcSeq}`,
                libelle: choix([
                  'Absence de continuité de terre sur une prise du local',
                  'Étiquetage réglementaire manquant ou illisible',
                  'Rapport de contrôle précédent non archivé',
                  'Écart de mesure hors tolérance à reprendre',
                  'Défaut d’accessibilité de l’organe de coupure',
                  'Registre de sécurité non tenu à jour',
                  'Dispositif de sécurité neutralisé lors du contrôle',
                ]),
                gravite: verdict === 'non_conforme' ? (chance(0.4) ? 'critique' : 'majeure') : 'mineure',
                dateEcheance: iso(addDays(derniere, ent(30, 180))),
                levee: chance(0.45),
                dateLevee: undefined,
              }],
        numeroRapport: `${ctrl.code}/${derniere.getFullYear()}/${String(vcSeq).padStart(4, '0')}`,
        documentIds: [],
      });
      vcSeq += 1;
    }
  }

  /* --- Demandes d'intervention et ordres de travail --- */
  const demandes: DemandeIntervention[] = [];
  const ordresTravail: OrdreTravail[] = [];
  const mouvementsStock: MouvementStock[] = [];
  let otSeq = 1;
  let diSeq = 1;
  let mvtSeq = 1;

  const MOIS_HISTORIQUE = 20;
  const equipementsActifs = equipements.filter((e) => e.statut !== 'reforme');

  for (let m = MOIS_HISTORIQUE; m >= 0; m -= 1) {
    const nbCorrectifs = ent(24, 40);
    for (let k = 0; k < nbCorrectifs; k += 1) {
      const jourBase = -m * 30 + ent(0, 29);
      if (jourBase > 0) continue;
      const eq = choix(equipementsActifs);
      const { ot, di } = genererCorrectif(eq, jourBase);
      if (di) demandes.push(di);
      ordresTravail.push(ot);
    }
  }

  // Occurrences préventives passées, pour alimenter l'historique des gammes.
  for (const g of gammes) {
    const cibles = equipements.filter((e) => g.equipementIds.includes(e.id));
    const jours = joursPeriode(g.periodiciteValeur, g.periodiciteUnite);
    const nbOccurrences = Math.min(4, Math.floor((MOIS_HISTORIQUE * 30) / jours));
    for (const eq of echantillon(cibles, Math.min(cibles.length, g.periodiciteUnite === 'mois' && g.periodiciteValeur === 1 ? 6 : 14))) {
      for (let o = nbOccurrences; o >= 1; o -= 1) {
        if (chance(0.15)) continue; // occurrence non réalisée : retard assumé dans l'historique
        const jour = -(o * jours) + ent(-4, 6);
        if (jour > -2) continue;
        ordresTravail.push(genererPreventif(g, eq, jour));
      }
    }
  }

  // OT préventifs à venir déjà planifiés sur les 30 prochains jours.
  for (const g of echantillon(gammes, 14)) {
    const cibles = equipements.filter((e) => g.equipementIds.includes(e.id));
    for (const eq of echantillon(cibles, ent(1, 4))) {
      const ot = genererPreventif(g, eq, ent(1, 30));
      ot.statut = chance(0.5) ? 'planifie' : 'affecte';
      ot.dateDebut = undefined;
      ot.dateFin = undefined;
      ot.dateCloture = undefined;
      ot.temps = [];
      ot.pieces = [];
      ot.mesures = [];
      ot.conformite = undefined;
      ot.actionsRealisees = undefined;
      ordresTravail.push(ot);
    }
  }

  // Demandes d'intervention encore en attente de traitement.
  for (let i = 0; i < 22; i += 1) {
    const eq = choix(equipementsActifs);
    const demandeur = choix(demandeurs);
    const jour = -ent(0, 12);
    demandes.push({
      id: `dmi_${String(diSeq).padStart(4, '0')}`,
      numero: `DI-${AUJ.getFullYear()}-${String(diSeq).padStart(5, '0')}`,
      dateCreation: heureRelative(jour, ent(7, 20)),
      demandeurId: demandeur.id,
      serviceId: demandeur.serviceId ?? eq.serviceId,
      localId: eq.localId,
      equipementId: eq.id,
      objet: objetPanne(eq),
      description: descriptionPanne(eq),
      urgenceDeclaree: eq.criticite === 1 ? choix(['P1', 'P2'] as const) : choix(['P2', 'P3', 'P3', 'P4'] as const),
      impactPatient: eq.criticite === 1 ? choix(['report_soin', 'risque_vital', 'gene'] as const) : choix(['aucun', 'gene', 'report_soin'] as const),
      canal: choix(['web', 'qr_code', 'telephone', 'terrain'] as const),
      statut: chance(0.55) ? 'nouvelle' : 'en_analyse',
    });
    diSeq += 1;
  }

  /* --- Capteurs et relevés --- */
  const capteurs: Capteur[] = [];
  const releves: Releve[] = [];
  let capSeq = 1;
  for (const [designation, defs] of Object.entries(CAPTEURS_TYPES)) {
    const cibles = equipements.filter((e) => e.designation === designation && e.statut !== 'reforme');
    for (const eq of cibles) {
      for (const d of defs) {
        const cap: Capteur = {
          id: `cap_${String(capSeq).padStart(4, '0')}`,
          code: `C${String(capSeq).padStart(4, '0')}`,
          equipementId: eq.id,
          type: d.type,
          unite: d.unite,
          seuilBasCritique: d.seuils[0],
          seuilBasAlerte: d.seuils[1],
          seuilHautAlerte: d.seuils[2],
          seuilHautCritique: d.seuils[3],
          frequenceReleveMin: 60,
          actif: true,
        };
        capteurs.push(cap);
        // 30 jours de relevés à raison de 4 par jour, avec une dérive possible.
        const derive = chance(0.18) ? dec(0.4, 1.6, 2) : 0;
        for (let j = 30; j >= 0; j -= 1) {
          for (const h of [2, 8, 14, 20]) {
            const progression = ((30 - j) / 30) * derive;
            const brut = dec(d.plage[0], d.plage[1], 2) + progression * (d.plage[1] - d.plage[0]) * 0.5;
            releves.push({
              id: `rel_${cap.id}_${j}_${h}`,
              capteurId: cap.id,
              date: heureRelative(-j, h),
              valeur: Number(brut.toFixed(2)),
            });
          }
        }
        capSeq += 1;
      }
    }
  }

  /* --- Matériovigilance et rappels --- */
  const vigilances: Vigilance[] = [];
  const candidatsVigilance = equipements.filter((e) => e.soumisVigilance && e.statut !== 'reforme');
  const INCIDENTS = [
    { desc: 'Arrêt inopiné en cours de ventilation, alarme sonore muette', gravite: 'critique' as const, mesure: 'Patient basculé sur un respirateur de secours, équipement retiré du service.' },
    { desc: 'Écart de température de 4 °C par rapport à la consigne', gravite: 'majeur' as const, mesure: 'Produits transférés, sonde de contrôle installée en parallèle.' },
    { desc: 'Débit délivré supérieur de 18 % à la consigne', gravite: 'majeur' as const, mesure: 'Perfusion arrêtée, contrôle métrologique immédiat de tout le parc.' },
    { desc: 'Décharge du défibrillateur impossible malgré charge complète', gravite: 'critique' as const, mesure: 'Défibrillateur de secours mis en place, retour constructeur.' },
    { desc: 'Brûlure superficielle au site de la plaque neutre', gravite: 'majeur' as const, mesure: 'Contrôle du générateur et formation de l’équipe rappelée.' },
    { desc: 'Alarme de fuite de sang non déclenchée lors du test', gravite: 'critique' as const, mesure: 'Générateur consigné, séances reportées sur les autres postes.' },
    { desc: 'Écran figé pendant l’examen, perte du tracé', gravite: 'mineur' as const, mesure: 'Redémarrage, mise à jour logicielle programmée.' },
    { desc: 'Rupture d’un vérin de table en cours d’intervention', gravite: 'majeur' as const, mesure: 'Intervention terminée sur une autre salle, table consignée.' },
  ];
  echantillon(candidatsVigilance, 14).forEach((eq, i) => {
    const inc = choix(INCIDENTS);
    const jour = -ent(20, 500);
    const clos = chance(0.6);
    vigilances.push({
      id: `vig_${String(i + 1).padStart(3, '0')}`,
      numero: `MV-${addDays(AUJ, jour).getFullYear()}-${String(i + 1).padStart(4, '0')}`,
      equipementId: eq.id,
      dateEvenement: jourRelatif(jour),
      dateDeclaration: jourRelatif(jour + ent(0, 3)),
      description: inc.desc,
      gravite: inc.gravite,
      patientImplique: inc.gravite !== 'mineur',
      consequencePatient: inc.gravite === 'critique' ? 'Prise en charge poursuivie sans séquelle grâce au dispositif de secours.' : undefined,
      mesuresImmediates: inc.mesure,
      declareAutorite: inc.gravite !== 'mineur',
      numeroDeclaration: inc.gravite !== 'mineur' ? `DGM/${addDays(AUJ, jour).getFullYear()}/${ent(1000, 9999)}` : undefined,
      fabricantInforme: true,
      analyseCause: clos ? choix([
        'Défaillance d’un composant électronique confirmée par le fabricant.',
        'Défaut d’entretien : filtre non remplacé lors de la visite précédente.',
        'Erreur d’utilisation liée à une formation insuffisante du personnel.',
        'Conditions d’environnement : microcoupures répétées sur le réseau électrique.',
      ]) : undefined,
      actionsCorrectives: clos
        ? echantillon([
            'Remplacement du composant sous garantie',
            'Renforcement de la périodicité de maintenance préventive',
            'Session de formation des utilisateurs organisée',
            'Raccordement de l’équipement sur circuit ondulé',
            'Mise à jour du logiciel embarqué',
          ], ent(1, 3))
        : [],
      statut: clos ? 'clos' : chance(0.5) ? 'en_analyse' : 'ouvert',
      dateCloture: clos ? jourRelatif(jour + ent(15, 90)) : undefined,
      declarantId: choix(demandeurs).id,
    });
  });

  const rappels: RappelFabricant[] = [
    {
      id: 'rap_001',
      reference: 'FSCA-2026-014',
      fabricantId: parCode.get('F003')!.id,
      dateReception: jourRelatif(-38),
      objet: 'Mise à jour logicielle obligatoire — gestion de l’alarme de désadaptation',
      description:
        'Le fabricant signale un cas où l’alarme de désadaptation patient peut être retardée de plusieurs secondes. Une mise à jour du logiciel embarqué est requise sur tous les appareils du parc.',
      actionRequise: 'mise_a_jour',
      dateEcheance: jourRelatif(22),
      equipementIds: equipements.filter((e) => e.designation === 'Respirateur de réanimation').map((e) => e.id),
      equipementsTraites: [],
      statut: 'en_cours',
    },
    {
      id: 'rap_002',
      reference: 'FSN-2026-007',
      fabricantId: parCode.get('F010')!.id,
      dateReception: jourRelatif(-71),
      objet: 'Contrôle du système de fixation de la seringue',
      description:
        'Un défaut de verrouillage peut entraîner un désamorçage silencieux. Contrôle visuel et test de traction à réaliser sur chaque appareil, remplacement du berceau si jeu constaté.',
      actionRequise: 'controle',
      dateEcheance: jourRelatif(-6),
      equipementIds: equipements.filter((e) => e.designation === 'Pousse-seringue électrique').map((e) => e.id),
      equipementsTraites: [],
      statut: 'en_cours',
    },
    {
      id: 'rap_003',
      reference: 'FSCA-2025-231',
      fabricantId: parCode.get('F024')!.id,
      dateReception: jourRelatif(-210),
      objet: 'Remplacement des barrières latérales — risque de coincement',
      description:
        'Rappel portant sur un lot de barrières latérales dont l’espacement ne respecte pas la norme NF EN 60601-2-52.',
      actionRequise: 'remplacement',
      dateEcheance: jourRelatif(-40),
      equipementIds: echantillon(equipements.filter((e) => e.designation === 'Lit médicalisé électrique'), 28).map((e) => e.id),
      equipementsTraites: [],
      statut: 'en_cours',
    },
    {
      id: 'rap_004',
      reference: 'INFO-2026-002',
      fabricantId: parCode.get('F005')!.id,
      dateReception: jourRelatif(-15),
      objet: 'Information de sécurité — compatibilité des capteurs SpO₂ néonatals',
      description:
        'Certains capteurs tiers ne garantissent pas la précision annoncée sur la population néonatale. Utiliser exclusivement les références validées par le fabricant.',
      actionRequise: 'information',
      dateEcheance: jourRelatif(45),
      equipementIds: equipements.filter((e) => e.designation === 'Moniteur multiparamétrique' && ['srv_NEO', 'srv_MAT'].includes(e.serviceId)).map((e) => e.id),
      equipementsTraites: [],
      statut: 'a_traiter',
    },
  ];
  for (const r of rappels) {
    r.equipementsTraites = echantillon(r.equipementIds, Math.floor(r.equipementIds.length * dec(0.2, 0.75, 2)));
  }

  /* --- Bons de commande --- */
  const bonsCommande: BonCommande[] = [];
  for (let i = 0; i < 34; i += 1) {
    const fou = choix(fournisseurs.filter((f) => f.types.includes('distributeur') || f.types.includes('fabricant')));
    const lignesArticles = echantillon(articles.filter((a) => a.fournisseurPrincipalId === fou.id), ent(1, 4));
    const source = lignesArticles.length ? lignesArticles : echantillon(articles, ent(1, 3));
    const jour = -ent(2, 320);
    const statut: BonCommande['statut'] = jour < -120 ? 'receptionnee' : choix(['a_valider', 'validee', 'envoyee', 'partiellement_recue', 'receptionnee'] as const);
    bonsCommande.push({
      id: `bcd_${String(i + 1).padStart(3, '0')}`,
      numero: `BC-${addDays(AUJ, jour).getFullYear()}-${String(i + 1).padStart(4, '0')}`,
      fournisseurId: fou.id,
      dateCreation: jourRelatif(jour),
      dateEnvoi: statut !== 'a_valider' ? jourRelatif(jour + ent(1, 6)) : undefined,
      dateLivraisonPrevue: jourRelatif(jour + ent(20, 90)),
      dateReception: statut === 'receptionnee' ? jourRelatif(jour + ent(25, 110)) : undefined,
      lignes: source.map((a) => {
        const q = ent(1, Math.max(2, Math.round(a.stockMax - a.stockMin)));
        return {
          articleId: a.id,
          quantite: q,
          quantiteRecue: statut === 'receptionnee' ? q : statut === 'partiellement_recue' ? Math.floor(q / 2) : 0,
          prixUnitaire: Math.round(a.prixMoyenPondere * dec(0.9, 1.2, 2)),
        };
      }),
      origine: chance(0.5) ? 'reappro_auto' : chance(0.5) ? 'ordre_travail' : 'manuelle',
      statut,
      demandeurId: 'usr_009',
      valideParId: ['a_valider'].includes(statut) ? undefined : 'usr_008',
    });
  }

  /* --- Mouvements de stock d'entrée liés aux réceptions --- */
  for (const bc of bonsCommande.filter((b) => b.dateReception)) {
    for (const l of bc.lignes.filter((x) => x.quantiteRecue > 0 && x.articleId)) {
      const art = articles.find((a) => a.id === l.articleId)!;
      mouvementsStock.push({
        id: `mvs_${String(mvtSeq).padStart(5, '0')}`,
        date: bc.dateReception!,
        articleId: art.id,
        type: 'entree',
        quantite: l.quantiteRecue,
        prixUnitaire: l.prixUnitaire,
        stockApres: art.stockActuel,
        bonCommandeId: bc.id,
        motif: `Réception ${bc.numero}`,
        utilisateurId: 'usr_009',
      });
      mvtSeq += 1;
    }
  }

  /* --- Documents --- */
  const documents: DocumentGED[] = [];
  let docSeq = 1;
  for (const eq of echantillon(equipements, 180)) {
    for (const cat of echantillon(['notice_utilisation', 'manuel_technique', 'certificat_ce', 'facture'] as const, ent(1, 3))) {
      documents.push({
        id: `doc_${String(docSeq).padStart(4, '0')}`,
        nom: `${nomDocument(cat)} — ${eq.marque} ${eq.modele}.pdf`,
        categorie: cat,
        entiteType: 'equipement',
        entiteId: eq.id,
        dateAjout: jourRelatif(-ent(30, 900)),
        ajouteParId: choix(techniciens).id,
        version: `v${ent(1, 3)}.${ent(0, 9)}`,
        tailleKo: ent(180, 9800),
        url: '#',
        opposable: cat === 'certificat_ce',
      });
      docSeq += 1;
    }
  }
  for (const v of echantillon(visitesControle, 120)) {
    const doc: DocumentGED = {
      id: `doc_${String(docSeq).padStart(4, '0')}`,
      nom: `Rapport de contrôle ${v.numeroRapport}.pdf`,
      categorie: 'rapport_controle',
      entiteType: 'controle',
      entiteId: v.controleId,
      dateAjout: v.dateVisite,
      ajouteParId: 'usr_007',
      version: 'v1.0',
      tailleKo: ent(320, 4200),
      url: '#',
      opposable: true,
    };
    documents.push(doc);
    v.documentIds.push(doc.id);
    docSeq += 1;
  }
  for (const c of contrats) {
    documents.push({
      id: `doc_${String(docSeq).padStart(4, '0')}`,
      nom: `${c.numero} — ${c.libelle}.pdf`,
      categorie: 'contrat',
      entiteType: 'contrat',
      entiteId: c.id,
      dateAjout: c.dateDebut,
      ajouteParId: 'usr_008',
      version: 'v1.0',
      tailleKo: ent(400, 2600),
      url: '#',
      opposable: true,
    });
    docSeq += 1;
  }

  /* --- Budgets --- */
  const budgets: LigneBudget[] = [];
  const annee = AUJ.getFullYear();
  for (const an of [annee - 1, annee]) {
    for (const domaine of ['biomedical', 'technique_batiment', 'fluides_medicaux', 'informatique', 'securite_incendie'] as const) {
      for (const poste of ['maintenance_interne', 'contrats', 'pieces', 'investissement', 'controles_reglementaires'] as const) {
        budgets.push({
          id: `bud_${an}_${domaine}_${poste}`,
          annee: an,
          domaine,
          poste,
          montantAlloue: ent(15_000, 320_000),
        });
      }
    }
  }

  /* --- Alertes persistées (décisions humaines) --- */
  const alertes: Alerte[] = [];

  /* --- Journal d'audit initial --- */
  const audit: EntreeAudit[] = [
    {
      id: 'aud_init',
      date: isoHeure(AUJ),
      utilisateurId: 'usr_001',
      action: 'generation',
      entiteType: 'base',
      entiteId: '-',
      libelle: 'Initialisation de la base GMAO',
      details: `${equipements.length} équipements, ${ordresTravail.length} ordres de travail, ${articles.length} articles.`,
    },
  ];

  return {
    version: 1,
    dateGeneration: isoHeure(AUJ),
    sites, batiments, services, locaux,
    utilisateurs, equipes, habilitations,
    fournisseurs, familles, equipements, mouvementsEquipement,
    contrats, gammes,
    demandes, ordresTravail,
    controles, visitesControle,
    vigilances, rappels,
    magasins, articles, lots, mouvementsStock, bonsCommande,
    capteurs, releves, alertes,
    documents, audit, budgets,
  };

  /* ---------------------------------------------------------------- */
  /* Fabriques internes                                               */
  /* ---------------------------------------------------------------- */

  function utilisateur(
    id: string, nom: string, prenom: string,
    role: Utilisateur['role'], equipeId: ID | undefined, serviceCode: string, taux: number,
  ): Utilisateur {
    return {
      id, matricule: `M${id.slice(-3)}`, nom, prenom,
      email: `${prenom.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.${nom.toLowerCase()}@hgr-kinshasa.cd`,
      telephone: `+243 8${ent(1, 9)} ${ent(100, 999)} ${ent(10, 99)} ${ent(10, 99)}`,
      role, equipeId, siteId: 'site_hgr', serviceId: `srv_${serviceCode}`,
      competences: [], tauxHoraire: taux, actif: true,
      dateEmbauche: jourRelatif(-ent(200, 5000)),
    };
  }

  function genererCorrectif(eq: Equipement, jourCreation: number): { ot: OrdreTravail; di?: DemandeIntervention } {
    const demandeur = choix(demandeurs);
    const priorite: OrdreTravail['priorite'] =
      eq.criticite === 1 ? choix(['P1', 'P1', 'P2'] as const)
      : eq.criticite === 2 ? choix(['P2', 'P2', 'P3'] as const)
      : choix(['P3', 'P3', 'P4'] as const);
    const sla = PRIORITE[priorite];
    const creation = heureRelative(jourCreation, ent(6, 21));
    const echeance = isoHeure(new Date(toDate(creation)!.getTime() + sla.delaiResolutionH * 3_600_000));

    let di: DemandeIntervention | undefined;
    if (chance(0.72)) {
      di = {
        id: `dmi_${String(diSeq).padStart(4, '0')}`,
        numero: `DI-${addDays(AUJ, jourCreation).getFullYear()}-${String(diSeq).padStart(5, '0')}`,
        dateCreation: creation,
        demandeurId: demandeur.id,
        serviceId: eq.serviceId,
        localId: eq.localId,
        equipementId: eq.id,
        objet: objetPanne(eq),
        description: descriptionPanne(eq),
        urgenceDeclaree: priorite,
        impactPatient: eq.criticite === 1 ? choix(['report_soin', 'risque_vital'] as const) : choix(['aucun', 'gene', 'report_soin'] as const),
        canal: choix(['web', 'qr_code', 'telephone', 'terrain'] as const),
        statut: 'transformee',
        traiteParId: 'usr_002',
        dateTraitement: creation,
      };
      diSeq += 1;
    }

    const equipeId = equipePourDomaine(equipes, eq.domaine);
    const techniciensEquipe = techniciens.filter((t) => t.equipeId === equipeId);
    const tech = techniciensEquipe.length ? choix(techniciensEquipe) : choix(techniciens);
    const contrat = eq.contratId ? contrats.find((c) => c.id === eq.contratId) : undefined;
    const parPrestataire = Boolean(contrat) && chance(0.45);

    // Un OT récent peut encore être ouvert ; les anciens sont clôturés.
    const encoreOuvert = jourCreation > -25 && chance(0.55);
    const dureeReelleH = parPrestataire ? dec(6, 96, 1) : dec(0.5, sla.delaiResolutionH * dec(0.4, 2.2, 2), 1);
    const debut = new Date(toDate(creation)!.getTime() + dec(0.2, sla.delaiPriseEnChargeH * 1.6, 1) * 3_600_000);
    const fin = new Date(debut.getTime() + dureeReelleH * 3_600_000);

    const statut: OrdreTravail['statut'] = encoreOuvert
      ? choix(['a_planifier', 'affecte', 'en_cours', 'en_cours', 'attente_pieces', 'attente_prestataire'] as const)
      : chance(0.85) ? 'cloture' : 'realise';

    const termine = statut === 'cloture' || statut === 'realise';
    const tempsMin = Math.round(Math.min(dureeReelleH * 60, ent(30, 480)));
    const piecesUtilisees = choisirPieces(eq, termine);

    const ot: OrdreTravail = {
      id: `ord_${String(otSeq).padStart(5, '0')}`,
      numero: `OT-${addDays(AUJ, jourCreation).getFullYear()}-${String(otSeq).padStart(5, '0')}`,
      type: 'correctif',
      objet: di?.objet ?? objetPanne(eq),
      description: di?.description ?? descriptionPanne(eq),
      equipementId: eq.id,
      localId: eq.localId,
      serviceId: eq.serviceId,
      siteId: eq.siteId,
      demandeId: di?.id,
      priorite,
      statut,
      dateCreation: creation,
      datePlanifiee: jourRelatif(jourCreation + ent(0, 3)),
      dateEcheanceSLA: echeance,
      dateDebut: statut === 'a_planifier' ? undefined : isoHeure(debut),
      dateFin: termine ? isoHeure(fin) : undefined,
      dateCloture: statut === 'cloture' ? isoHeure(new Date(fin.getTime() + ent(1, 72) * 3_600_000)) : undefined,
      equipeId,
      technicienPrincipalId: statut === 'a_planifier' ? undefined : tech.id,
      prestataireId: parPrestataire ? contrat?.fournisseurId : undefined,
      execution: parPrestataire ? 'prestataire' : 'interne',
      temps: statut === 'a_planifier' ? [] : [{
        technicienId: tech.id,
        date: iso(debut),
        dureeMin: tempsMin,
        tauxHoraire: tech.tauxHoraire,
        commentaire: chance(0.25) ? 'Diagnostic sur site puis reprise en atelier.' : undefined,
      }],
      pieces: piecesUtilisees,
      coutPrestataire: parPrestataire && termine ? (contrat?.piecesIncluses ? 0 : ent(150, 4500)) : 0,
      arretEquipementMin: termine ? Math.round(dureeReelleH * 60 * dec(0.6, 1.8, 2)) : Math.round(dec(1, 200, 0) * 60),
      diagnostic: termine ? diagnostic(eq) : undefined,
      causePanne: termine ? choix(['usure_normale', 'usure_normale', 'defaut_alimentation', 'encrassement', 'mauvaise_utilisation', 'consommable_epuise', 'choc_accident', 'logiciel', 'environnement', 'indeterminee'] as const) : undefined,
      actionsRealisees: termine ? actionRealisee(eq) : undefined,
      mesures: [],
      conformite: termine ? (chance(0.9) ? 'conforme' : 'conforme_avec_reserves') : undefined,
      reserves: [],
      securite: {
        consignationElectrique: eq.domaine === 'technique_batiment' && chance(0.7),
        desinfectionPrealable: eq.risqueInfectieux || ['BLO', 'REA', 'NEO', 'STE'].includes(serviceCode(eq)),
        epiPortes: true,
        permisFeu: chance(0.05),
        patientEvacue: eq.criticite <= 2 && chance(0.4),
      },
      signatureTechnicien: termine ? `${tech.prenom} ${tech.nom}` : undefined,
      signatureDemandeur: statut === 'cloture' ? `${demandeur.prenom} ${demandeur.nom}` : undefined,
      validePar: statut === 'cloture' ? 'usr_002' : undefined,
      dateValidation: statut === 'cloture' ? iso(addDays(fin, 1)) : undefined,
      commentaires: chance(0.3)
        ? [{
            id: `cmt_${otSeq}`,
            auteurId: tech.id,
            date: isoHeure(debut),
            texte: choix([
              'Pièce non disponible en magasin, commande passée auprès du fournisseur.',
              'Intervention reportée : bloc en activité, créneau redemandé au cadre.',
              'Panne récurrente sur cet équipement, une analyse de fond est à prévoir.',
              'Le service a été formé à nouveau sur la procédure de mise en marche.',
              'Prestataire contacté, intervention prévue sous 48 h.',
            ]),
          }]
        : [],
      documentIds: [],
      photoUrls: [],
    };

    // Consommation de pièces : mouvements de sortie de stock associés.
    if (termine) {
      for (const p of ot.pieces) {
        mouvementsStock.push({
          id: `mvs_${String(mvtSeq).padStart(5, '0')}`,
          date: iso(fin),
          articleId: p.articleId,
          type: 'sortie',
          quantite: p.quantite,
          prixUnitaire: p.prixUnitaire,
          stockApres: 0,
          otId: ot.id,
          motif: `Consommation sur ${ot.numero}`,
          utilisateurId: 'usr_009',
        });
        mvtSeq += 1;
      }
    }

    // Cohérence : un équipement en panne doit avoir un OT ouvert.
    if (!termine && (eq.statut === 'en_service') && chance(0.5)) {
      eq.statut = ot.statut === 'attente_pieces' ? 'attente_pieces' : 'en_panne';
    }

    otSeq += 1;
    return { ot, di };
  }

  function genererPreventif(g: GammeMaintenance, eq: Equipement, jour: number): OrdreTravail {
    const equipeId = g.equipeId ?? equipePourDomaine(equipes, eq.domaine);
    const techniciensEquipe = techniciens.filter((t) => t.equipeId === equipeId);
    const tech = techniciensEquipe.length ? choix(techniciensEquipe) : choix(techniciens);
    const debut = new Date(addDays(AUJ, jour).setHours(ent(7, 15), 0, 0, 0));
    const duree = Math.round(g.dureeEstimeeMin * dec(0.7, 1.5, 2));
    const fin = new Date(debut.getTime() + duree * 60_000);
    const passe = jour < 0;
    const contrat = eq.contratId ? contrats.find((c) => c.id === eq.contratId) : undefined;

    const mesures = g.operations.map((op) => {
      if (op.valeurAttendue === undefined) return { operationId: op.id, conforme: chance(0.96) };
      const min = op.toleranceMin ?? op.valeurAttendue * 0.9;
      const max = op.toleranceMax ?? op.valeurAttendue * 1.1;
      const dansTolerance = chance(0.93);
      const valeur = dansTolerance
        ? Number(dec(min, max, 2))
        : Number(dec(max, max * 1.25 + 0.01, 2));
      return { operationId: op.id, valeur, conforme: dansTolerance };
    });
    const nonConformes = mesures.filter((m) => !m.conforme).length;

    const ot: OrdreTravail = {
      id: `ord_${String(otSeq).padStart(5, '0')}`,
      numero: `OT-${addDays(AUJ, jour).getFullYear()}-${String(otSeq).padStart(5, '0')}`,
      type: g.type,
      objet: `${g.libelle} — ${eq.code}`,
      description: `Exécution de la gamme ${g.code} sur ${eq.designation} ${eq.marque} ${eq.modele}.`,
      equipementId: eq.id,
      localId: eq.localId,
      serviceId: eq.serviceId,
      siteId: eq.siteId,
      gammeId: g.id,
      priorite: eq.criticite === 1 ? 'P3' : 'P4',
      statut: passe ? (chance(0.9) ? 'cloture' : 'realise') : 'planifie',
      dateCreation: iso(addDays(debut, -ent(3, 20))),
      datePlanifiee: iso(debut),
      dateDebut: passe ? isoHeure(debut) : undefined,
      dateFin: passe ? isoHeure(fin) : undefined,
      dateCloture: passe ? isoHeure(addDays(fin, 1)) : undefined,
      equipeId,
      technicienPrincipalId: tech.id,
      prestataireId: g.execution === 'prestataire' ? contrat?.fournisseurId : undefined,
      execution: g.execution,
      temps: passe ? [{ technicienId: tech.id, date: iso(debut), dureeMin: duree, tauxHoraire: tech.tauxHoraire }] : [],
      pieces: passe
        ? g.piecesPrevues.map((p) => {
            const art = articles.find((a) => a.id === p.articleId)!;
            return { articleId: p.articleId, quantite: p.quantite, prixUnitaire: art.prixMoyenPondere, sortieValidee: true };
          })
        : [],
      coutPrestataire: g.execution === 'prestataire' && passe && !contrat?.piecesIncluses ? ent(80, 1_200) : 0,
      arretEquipementMin: g.arretEquipementRequis && passe ? duree : 0,
      actionsRealisees: passe ? `Gamme exécutée intégralement. ${nonConformes ? `${nonConformes} point(s) hors tolérance relevé(s).` : 'Tous les points sont conformes.'}` : undefined,
      mesures: passe ? mesures : [],
      conformite: passe ? (nonConformes === 0 ? 'conforme' : nonConformes <= 1 ? 'conforme_avec_reserves' : 'non_conforme') : undefined,
      reserves: passe && nonConformes > 0
        ? [{
            id: `res_ot_${otSeq}`,
            libelle: `${nonConformes} mesure(s) hors tolérance — contre-visite à programmer`,
            gravite: nonConformes > 1 ? 'majeure' : 'mineure',
            dateEcheance: iso(addDays(fin, 30)),
            levee: chance(0.5),
          }]
        : [],
      securite: {
        consignationElectrique: g.operations.some((o) => o.nature === 'securite_electrique'),
        desinfectionPrealable: eq.risqueInfectieux,
        epiPortes: true,
        permisFeu: false,
        patientEvacue: g.arretEquipementRequis,
      },
      signatureTechnicien: passe ? `${tech.prenom} ${tech.nom}` : undefined,
      validePar: passe ? 'usr_002' : undefined,
      dateValidation: passe ? iso(addDays(fin, 1)) : undefined,
      commentaires: [],
      documentIds: [],
      photoUrls: [],
    };

    if (passe) {
      for (const p of ot.pieces) {
        mouvementsStock.push({
          id: `mvs_${String(mvtSeq).padStart(5, '0')}`,
          date: iso(fin),
          articleId: p.articleId,
          type: 'sortie',
          quantite: p.quantite,
          prixUnitaire: p.prixUnitaire,
          stockApres: 0,
          otId: ot.id,
          motif: `Préventif ${ot.numero}`,
          utilisateurId: 'usr_009',
        });
        mvtSeq += 1;
      }
    }

    otSeq += 1;
    return ot;
  }

  function choisirPieces(eq: Equipement, termine: boolean) {
    if (!termine || chance(0.45)) return [];
    const compatibles = articles.filter((a) => a.equipementsCompatibles.includes(eq.id));
    const source = compatibles.length ? compatibles : articles.filter((a) => a.domaine === eq.domaine);
    if (!source.length) return [];
    return echantillon(source, ent(1, 2)).map((a) => ({
      articleId: a.id,
      quantite: ent(1, 3),
      prixUnitaire: a.prixMoyenPondere,
      sortieValidee: true,
    }));
  }

  function serviceCode(eq: Equipement): string {
    return services.find((s) => s.id === eq.serviceId)?.code ?? '';
  }
}

/* ------------------------------------------------------------------ */
/* Utilitaires de génération                                           */
/* ------------------------------------------------------------------ */

function nomDeLocal(codeService: string, i: number): string {
  const modeles: Record<string, string[]> = {
    BLO: ['Salle d’opération', 'Salle de réveil', 'Arsenal stérile', 'Sas d’entrée', 'Local de lavage'],
    REA: ['Box de réanimation', 'Salle de soins', 'Local matériel', 'Chambre d’isolement'],
    URG: ['Salle d’accueil des urgences vitales', 'Box de consultation', 'Salle de plâtre', 'Salle d’attente'],
    IMG: ['Salle de scanner', 'Salle de radiologie', 'Salle d’échographie', 'Console de traitement', 'Salle IRM'],
    LAB: ['Paillasse de biochimie', 'Paillasse d’hématologie', 'Salle de prélèvement', 'Local des automates'],
    STE: ['Zone de lavage', 'Zone de conditionnement', 'Zone de stérilisation', 'Arsenal stérile'],
    DIA: ['Salle de dialyse', 'Local de traitement d’eau', 'Salle d’isolement'],
    NEO: ['Unité de soins intensifs néonatals', 'Salle de photothérapie', 'Nurserie'],
    MAT: ['Salle d’accouchement', 'Salle de pré-travail', 'Bloc obstétrical'],
    TEC: ['Atelier biomédical', 'Local groupe électrogène', 'Local TGBT', 'Centrale de fluides', 'Local CTA', 'Atelier technique'],
    BSG: ['Chambre froide', 'Laboratoire d’immuno-hématologie', 'Salle de distribution'],
  };
  const liste = modeles[codeService] ?? ['Chambre', 'Salle de soins', 'Bureau', 'Local de rangement', 'Salle d’examen'];
  return `${liste[(i - 1) % liste.length]} ${Math.ceil(i / liste.length) > 1 ? Math.ceil(i / liste.length) : i}`;
}

function locauxPour(locaux: Local[], services: ServiceHospitalier[], modele: ModeleCatalogue): Local[] {
  if (modele.services?.length) {
    const ids = services.filter((s) => modele.services!.includes(s.code)).map((s) => s.id);
    const filtres = locaux.filter((l) => ids.includes(l.serviceId));
    if (filtres.length) return filtres;
  }
  const soins = services.filter((s) => !['ADM', 'BLA', 'CUI'].includes(s.code)).map((s) => s.id);
  return locaux.filter((l) => soins.includes(l.serviceId));
}

function tirerStatut(criticite: number): Equipement['statut'] {
  const r = alea();
  if (criticite === 1) {
    if (r < 0.9) return 'en_service';
    if (r < 0.94) return 'en_maintenance';
    if (r < 0.97) return 'en_panne';
    if (r < 0.99) return 'attente_pieces';
    return 'reforme';
  }
  if (r < 0.84) return 'en_service';
  if (r < 0.88) return 'en_maintenance';
  if (r < 0.92) return 'en_panne';
  if (r < 0.95) return 'attente_pieces';
  if (r < 0.97) return 'en_stock';
  return 'reforme';
}

function equipePourDomaine(equipes: Equipe[], domaine: Equipement['domaine']): ID {
  return equipes.find((e) => e.domaine === domaine)?.id ?? equipes[0].id;
}

function consigneSecurite(eq: Equipement): string {
  const parts: string[] = [];
  if (eq.risqueInfectieux) parts.push('Désinfection préalable du dispositif selon le protocole de l’équipe opérationnelle d’hygiène.');
  if (eq.sourceRadioactive) parts.push('Vérifier l’absence d’émission avant intervention ; port du dosimètre obligatoire.');
  if (eq.gazMedicaux) parts.push('Purger et isoler le réseau ; interdiction absolue de corps gras au contact de l’oxygène.');
  if (eq.criticite === 1) parts.push('Prévenir le cadre de santé et mettre en place l’équipement de secours avant l’arrêt.');
  parts.push('Consignation électrique et pose de l’étiquette de condamnation avant toute ouverture de capot.');
  return parts.join(' ');
}

function objetPanne(eq: Equipement): string {
  const generiques = [
    `${eq.designation} ne s’allume plus`,
    `Alarme permanente sur ${eq.designation}`,
    `${eq.designation} — arrêt intempestif en cours d’utilisation`,
    `Message d’erreur bloquant sur ${eq.designation}`,
    `Bruit anormal et surchauffe — ${eq.designation}`,
    `${eq.designation} : affichage illisible`,
    `Fuite constatée sur ${eq.designation}`,
    `${eq.designation} ne tient plus la charge sur batterie`,
    `Câble d’alimentation détérioré — ${eq.designation}`,
    `Dérive des mesures constatée sur ${eq.designation}`,
  ];
  return choix(generiques);
}

function descriptionPanne(eq: Equipement): string {
  return choix([
    `Signalé par l’équipe de nuit. L’appareil a été retiré de la chambre et mis de côté dans le local matériel. Le service demande une intervention rapide, il ne reste pas d’appareil de remplacement disponible.`,
    `Le défaut apparaît de façon intermittente depuis environ une semaine, et devient systématique depuis ce matin. Aucun choc ni chute n’est signalé.`,
    `Constaté lors de la vérification quotidienne du chariot. L’équipement a été isolé et étiqueté « hors service » en attendant l’intervention.`,
    `Défaut apparu après la coupure de courant de la nuit dernière. Le service signale que plusieurs appareils du même local sont concernés.`,
    `Le personnel signale une dérive des valeurs affichées par rapport au contrôle manuel. Utilisation suspendue par précaution.`,
    `L’appareil est utilisé en continu depuis plusieurs mois sans interruption. Le bruit s’est nettement accentué ces derniers jours.`,
  ]) + ` Équipement concerné : ${eq.code} — ${eq.marque} ${eq.modele}, n° de série ${eq.numeroSerie}.`;
}

function diagnostic(eq: Equipement): string {
  return choix([
    'Carte d’alimentation défectueuse : condensateurs gonflés côté secondaire.',
    'Batterie en fin de vie, capacité résiduelle mesurée à moins de 40 %.',
    'Encrassement important des filtres et du système de ventilation.',
    'Capteur hors tolérance, dérive confirmée par comparaison avec l’étalon.',
    'Connecteur oxydé sur le faisceau principal : contact intermittent.',
    'Usure mécanique des roulements, jeu axial hors spécification.',
    'Fuite au niveau d’un raccord, joint torique déformé.',
    'Défaut logiciel connu du constructeur, corrigé par la mise à jour du micrologiciel.',
    'Surtension consécutive à la reprise du réseau : protection d’entrée détruite.',
    'Aucune anomalie reproductible : erreur d’utilisation confirmée avec l’équipe soignante.',
  ]) + (eq.criticite === 1 ? ' Équipement de secours mis en place pendant la durée de l’immobilisation.' : '');
}

function actionRealisee(eq: Equipement): string {
  return choix([
    'Remplacement du composant défectueux, essais complets réalisés, appareil remis en service.',
    'Nettoyage complet, remplacement des filtres, contrôle de sécurité électrique conforme.',
    'Réétalonnage effectué, écarts ramenés dans la tolérance constructeur.',
    'Réfection de la connectique, tests de fonctionnement sur l’ensemble des modes.',
    'Mise à jour du micrologiciel puis vérification des paramètres critiques.',
    'Réparation provisoire en attendant la pièce commandée ; suivi programmé.',
    'Formation rapide de l’équipe soignante à la bonne procédure de démarrage.',
  ]) + ` Contrôle final effectué en présence du référent du service (${eq.code}).`;
}

function joursPeriode(valeur: number, unite: string): number {
  switch (unite) {
    case 'jours': return valeur;
    case 'semaines': return valeur * 7;
    case 'mois': return Math.round(valeur * 30.44);
    default: return Math.round(valeur * 365.25);
  }
}

function nomDocument(cat: string): string {
  const map: Record<string, string> = {
    notice_utilisation: 'Notice d’utilisation',
    manuel_technique: 'Manuel technique de maintenance',
    certificat_ce: 'Déclaration de conformité CE',
    facture: 'Facture d’acquisition',
  };
  return map[cat] ?? 'Document';
}
