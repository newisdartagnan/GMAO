import type {
  BaseGMAO,
  CausePanne,
  DemandeIntervention,
  Equipement,
  OrdreTravail,
  PatchBase,
  PrioriteOT,
  StatutEquipement,
  StatutOT,
  TypeMaintenance,
  Utilisateur,
  ValeurReleve,
} from '@gmao/partage';

/**
 * Client de l'API.
 *
 * Chaque écriture renvoie un patch — la liste de ce qui a changé — que le
 * store applique à l'état local. L'interface n'a donc jamais à recharger la
 * base entière après une saisie, ce qui compte sur une liaison lente.
 */

const RACINE = import.meta.env.VITE_API_URL ?? '/api';
const CLE_JETON = 'gmao.jeton';

export class ErreurApi extends Error {
  statut: number;
  constructor(message: string, statut: number) {
    super(message);
    this.statut = statut;
  }
}

export function lireJeton(): string | null {
  try {
    return localStorage.getItem(CLE_JETON);
  } catch {
    return null;
  }
}

export function ecrireJeton(jeton: string | null): void {
  try {
    if (jeton) localStorage.setItem(CLE_JETON, jeton);
    else localStorage.removeItem(CLE_JETON);
  } catch {
    /* navigation privée : la session ne survivra pas au rechargement */
  }
}

export interface ReponseCommande<T> {
  resultat: T;
  patch: PatchBase;
}

async function requete<T>(chemin: string, options: RequestInit = {}): Promise<T> {
  const jeton = lireJeton();
  let reponse: Response;
  try {
    reponse = await fetch(`${RACINE}${chemin}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ErreurApi(
      'Le serveur est injoignable. Vérifiez la connexion au réseau de l’établissement.',
      0,
    );
  }

  if (reponse.status === 204) return undefined as T;

  const texte = await reponse.text();
  const corps = texte ? (JSON.parse(texte) as unknown) : null;

  if (!reponse.ok) {
    const message =
      (corps as { erreur?: string } | null)?.erreur ??
      `Le serveur a refusé la demande (code ${reponse.status}).`;
    throw new ErreurApi(message, reponse.status);
  }
  return corps as T;
}

const poster = <T>(chemin: string, corps?: unknown) =>
  requete<T>(chemin, { method: 'POST', body: JSON.stringify(corps ?? {}) });
const patcher = <T>(chemin: string, corps: unknown) =>
  requete<T>(chemin, { method: 'PATCH', body: JSON.stringify(corps) });
const supprimer = <T>(chemin: string) => requete<T>(chemin, { method: 'DELETE' });

export interface BrouillonEquipement {
  id: string;
  code: string;
  designation: string;
  familleId: string;
  marque: string;
  modele: string;
  numeroSerie: string;
  classeDM: Equipement['classeDM'];
  criticite: number;
  localId: string;
  dateAcquisition: string;
  dateMiseEnService: string;
  valeurAchat: number;
  finGarantie?: string;
  fournisseurId?: string;
  risqueInfectieux: boolean;
  notes?: string;
}

export const api = {
  /* ----------------------------- Session ----------------------------- */
  async connexion(email: string, motDePasse: string) {
    const r = await poster<{ jeton: string; utilisateur: Utilisateur }>('/auth/connexion', {
      email,
      motDePasse,
    });
    ecrireJeton(r.jeton);
    return r;
  },
  moi: () => requete<{ utilisateur: Utilisateur }>('/auth/moi'),
  changerMotDePasse: (ancien: string, nouveau: string) =>
    poster<{ ok: boolean }>('/auth/mot-de-passe', { ancien, nouveau }),
  deconnexion: () => ecrireJeton(null),

  /* ---------------------------- Lecture ------------------------------ */
  snapshot: () => requete<BaseGMAO>('/snapshot'),
  sante: () => requete<{ statut: string }>('/sante'),

  /* ------------------------------ Parc ------------------------------- */
  creerEquipement: (d: BrouillonEquipement) =>
    poster<ReponseCommande<Equipement>>('/equipements', d),
  modifierEquipement: (id: string, d: Partial<Equipement>) =>
    patcher<ReponseCommande<Equipement>>(`/equipements/${id}`, d),
  deplacerEquipement: (id: string, localId: string, motif: string) =>
    poster<ReponseCommande<void>>(`/equipements/${id}/deplacer`, { localId, motif }),
  releverCompteur: (id: string, valeur: number) =>
    poster<ReponseCommande<void>>(`/equipements/${id}/compteur`, { valeur }),
  changerStatutEquipement: (id: string, statut: StatutEquipement, motif?: string) =>
    poster<ReponseCommande<void>>(`/equipements/${id}/statut`, { statut, motif }),

  /* --------------------------- Demandes ------------------------------ */
  creerDemande: (d: {
    equipementId?: string;
    localId?: string;
    serviceId?: string;
    objet: string;
    description?: string;
    urgenceDeclaree?: PrioriteOT;
    impactPatient?: DemandeIntervention['impactPatient'];
    canal?: DemandeIntervention['canal'];
  }) => poster<ReponseCommande<DemandeIntervention>>('/demandes', d),
  refuserDemande: (id: string, motif: string) =>
    poster<ReponseCommande<void>>(`/demandes/${id}/refuser`, { motif }),
  analyserDemande: (id: string) => poster<ReponseCommande<void>>(`/demandes/${id}/analyser`),

  /* ------------------------ Ordres de travail ------------------------ */
  creerOT: (d: {
    type: TypeMaintenance;
    objet: string;
    description?: string;
    equipementId?: string;
    priorite: PrioriteOT;
    datePlanifiee?: string;
    equipeId?: string;
    technicienPrincipalId?: string;
    execution: 'interne' | 'prestataire';
    prestataireId?: string;
    gammeId?: string;
    demandeId?: string;
  }) => poster<ReponseCommande<OrdreTravail>>('/ordres-travail', d),
  changerStatutOT: (id: string, statut: StatutOT) =>
    poster<ReponseCommande<void>>(`/ordres-travail/${id}/statut`, { statut }),
  saisirTemps: (id: string, d: { technicienId: string; dureeMin: number; commentaire?: string }) =>
    poster<ReponseCommande<void>>(`/ordres-travail/${id}/temps`, d),
  retirerTemps: (id: string, index: number) =>
    supprimer<ReponseCommande<void>>(`/ordres-travail/${id}/temps/${index}`),
  ajouterPiece: (id: string, articleId: string, quantite: number) =>
    poster<ReponseCommande<void>>(`/ordres-travail/${id}/pieces`, { articleId, quantite }),
  retirerPiece: (id: string, index: number) =>
    supprimer<ReponseCommande<void>>(`/ordres-travail/${id}/pieces/${index}`),
  commenterOT: (id: string, texte: string) =>
    poster<ReponseCommande<void>>(`/ordres-travail/${id}/commentaire`, { texte }),
  affecterOT: (id: string, technicienId?: string, datePlanifiee?: string) =>
    poster<ReponseCommande<void>>(`/ordres-travail/${id}/affectation`, { technicienId, datePlanifiee }),
  renseignerOT: (
    id: string,
    d: Partial<Pick<OrdreTravail, 'diagnostic' | 'actionsRealisees' | 'arretEquipementMin' | 'coutPrestataire' | 'conformite' | 'securite' | 'mesures'>> & {
      causePanne?: CausePanne;
    },
  ) => patcher<ReponseCommande<OrdreTravail>>(`/ordres-travail/${id}`, d),
  cloturerOT: (
    id: string,
    d: {
      diagnostic?: string;
      causePanne?: CausePanne;
      actionsRealisees: string;
      arretEquipementMin: number;
      conformite: NonNullable<OrdreTravail['conformite']>;
      cloturer: boolean;
    },
  ) => poster<ReponseCommande<OrdreTravail>>(`/ordres-travail/${id}/cloture`, d),

  /* ---------------------------- Préventif ---------------------------- */
  genererPreventif: (horizonJours: number) =>
    poster<ReponseCommande<{ crees: number; numeros: string[] }>>('/preventif/generer', { horizonJours }),

  /* -------------------------- Réglementaire -------------------------- */
  enregistrerVisite: (
    controleId: string,
    d: {
      equipementId?: string;
      verdict: 'conforme' | 'conforme_avec_reserves' | 'non_conforme';
      numeroRapport?: string;
      reserve?: { libelle: string; gravite: 'mineure' | 'majeure' | 'critique' };
    },
  ) => poster<ReponseCommande<void>>(`/controles/${controleId}/visites`, d),
  leverReserve: (id: string, otId?: string) =>
    poster<ReponseCommande<void>>(`/reserves/${id}/lever`, { otId }),

  /* ----------------------------- Stocks ------------------------------ */
  mouvementerStock: (
    articleId: string,
    d: { type: 'entree' | 'sortie' | 'inventaire' | 'rebut' | 'retour'; quantite: number; motif: string },
  ) => poster<ReponseCommande<void>>(`/articles/${articleId}/mouvements`, d),
  genererReappro: () =>
    poster<ReponseCommande<{ crees: number; numeros: string[] }>>('/achats/reappro'),
  validerCommande: (id: string) => poster<ReponseCommande<void>>(`/bons-commande/${id}/valider`),
  receptionnerCommande: (id: string, partielle = false) =>
    poster<ReponseCommande<void>>(`/bons-commande/${id}/reception`, { partielle }),

  /* --------------------------- Vigilance ----------------------------- */
  declarerVigilance: (d: {
    equipementId: string;
    dateEvenement: string;
    description: string;
    gravite: 'mineur' | 'majeur' | 'critique' | 'deces';
    patientImplique: boolean;
    consequencePatient?: string;
    mesuresImmediates: string;
    declareAutorite: boolean;
    numeroDeclaration?: string;
    fabricantInforme: boolean;
  }) => poster<ReponseCommande<void>>('/vigilances', d),
  cloturerVigilance: (id: string, d: { analyseCause?: string; actionsCorrectives?: string[] }) =>
    poster<ReponseCommande<void>>(`/vigilances/${id}/cloturer`, d),
  traiterRappel: (rappelId: string, equipementId: string) =>
    poster<ReponseCommande<void>>(`/rappels/${rappelId}/equipements/${equipementId}`),

  /* --------------------------- Inspections --------------------------- */
  rondesDuJour: (date?: string) =>
    requete<{
      date: string;
      rondes: {
        ronde: import('@gmao/partage').RondeInspection;
        avancement: import('@gmao/partage').AvancementRonde;
        heureTheorique: string;
      }[];
    }>(`/inspections/aujourdhui${date ? `?date=${date}` : ''}`),
  indicateursRondes: (jours = 30) =>
    requete<import('@gmao/partage').IndicateursRondes>(`/inspections/indicateurs?jours=${jours}`),
  ouvrirRondes: (date?: string) =>
    poster<ReponseCommande<{ crees: number; numeros: string[] }>>('/inspections/generer', { date }),
  demarrerRonde: (id: string) =>
    poster<ReponseCommande<import('@gmao/partage').RondeInspection>>(`/inspections/rondes/${id}/demarrer`),
  saisirReleve: (
    rondeId: string,
    d: {
      equipementId: string;
      valeurs: Omit<ValeurReleve, 'conforme'>[];
      observation?: string;
      etatForce?: 'hors_service' | 'non_accessible';
    },
  ) =>
    poster<
      ReponseCommande<{
        releve: import('@gmao/partage').ReleveInspection;
        demandeCreee: { id: string; numero: string; objet: string } | null;
      }>
    >(`/inspections/rondes/${rondeId}/releves`, d),
  cloturerRonde: (id: string, observations?: string) =>
    poster<ReponseCommande<import('@gmao/partage').AvancementRonde>>(
      `/inspections/rondes/${id}/cloturer`,
      { observations },
    ),
  viserRonde: (id: string) =>
    poster<ReponseCommande<import('@gmao/partage').RondeInspection>>(`/inspections/rondes/${id}/viser`),

  /* ---------------------------- Comptes ------------------------------ */
  listerComptes: () =>
    requete<{
      utilisateurs: {
        id: string; matricule: string; nom: string; prenom: string; email: string;
        role: string; actif: boolean; acces_ouvert: boolean; derniere_connexion: string | null;
      }[];
    }>('/admin/utilisateurs'),
  creerCompte: (d: Record<string, unknown>) => poster<ReponseCommande<Utilisateur>>('/admin/utilisateurs', d),
  modifierCompte: (id: string, d: Record<string, unknown>) =>
    patcher<ReponseCommande<Utilisateur>>(`/admin/utilisateurs/${id}`, d),
  reinitialiserMotDePasse: (id: string, motDePasse: string) =>
    poster<{ ok: boolean }>(`/admin/utilisateurs/${id}/mot-de-passe`, { motDePasse }),
  statistiquesBase: () =>
    requete<{
      tables: { table: string; lignes: number }[];
      tailleBase: string;
      migrations: { version: string; applique_le: string }[];
    }>('/admin/statistiques'),
  rechargerServeur: () => poster<{ ok: boolean }>('/admin/recharger'),
};
