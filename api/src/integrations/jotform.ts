import type { BaseGMAO, DemandeIntervention, PrioriteOT } from '@gmao/partage';
import { aujourdHui, isoHeure, lienFormulaireExterne, normaliser, numeroSuivant, uid } from '@gmao/partage';

/**
 * Connecteur JotForm.
 *
 * Le principe est celui du terrain : une étiquette collée sur l'équipement
 * porte un QR code qui ouvre le formulaire, avec le numéro d'inventaire déjà
 * rempli. L'agent décrit la panne depuis son téléphone, la soumission arrive
 * ici et devient une demande d'intervention ordinaire — visible dans la file
 * du biomédical au même titre qu'un appel téléphonique.
 *
 * Deux façons de récupérer les soumissions, selon ce que permet le réseau de
 * l'établissement :
 *
 * — **Récupération périodique** (par défaut). L'API interroge JotForm toutes
 *   les quelques minutes. C'est le mode qui convient quand le serveur est
 *   derrière la box de l'hôpital, sans adresse publique : rien n'a besoin
 *   d'entrer, c'est le serveur qui sort.
 *
 * — **Webhook**. JotForm pousse chaque soumission dès qu'elle est remplie.
 *   Plus immédiat, mais exige que le serveur soit joignable depuis Internet.
 *
 * Les deux peuvent cohabiter : la contrainte d'unicité sur l'identifiant de
 * soumission garantit qu'une même réponse ne crée jamais deux demandes.
 */

export const SOURCE = 'jotform';

/** Réponse de l'API JotForm pour une soumission. */
export interface SoumissionJotForm {
  id: string;
  form_id: string;
  created_at: string;
  status?: string;
  answers?: Record<string, { name?: string; text?: string; type?: string; answer?: unknown }>;
}

/**
 * Correspondance entre les champs du formulaire et ceux d'une demande.
 *
 * Les valeurs sont les noms de champs JotForm (propriété « name » d'une
 * question, visible dans le constructeur de formulaire). Les valeurs par
 * défaut couvrent une nomenclature raisonnable ; `JOTFORM_CHAMPS` permet de
 * les redéfinir sans toucher au code.
 */
export interface CorrespondanceChamps {
  equipement: string[];
  objet: string[];
  description: string[];
  urgence: string[];
  impact: string[];
  service: string[];
  declarant: string[];
  local: string[];
}

export const CORRESPONDANCE_PAR_DEFAUT: CorrespondanceChamps = {
  equipement: ['equipement', 'codeEquipement', 'code', 'numeroInventaire', 'inventaire'],
  objet: ['objet', 'probleme', 'panne', 'sujet', 'titre'],
  description: ['description', 'details', 'constat', 'commentaire', 'message'],
  urgence: ['urgence', 'priorite', 'degreUrgence'],
  impact: ['impact', 'impactPatient', 'consequence'],
  service: ['service', 'unite', 'serviceDemandeur'],
  declarant: ['declarant', 'nom', 'demandeur', 'agent'],
  local: ['local', 'salle', 'chambre', 'localisation'],
};

export function chargerCorrespondance(json?: string): CorrespondanceChamps {
  if (!json) return CORRESPONDANCE_PAR_DEFAUT;
  try {
    const perso = JSON.parse(json) as Partial<Record<keyof CorrespondanceChamps, string | string[]>>;
    const sortie = { ...CORRESPONDANCE_PAR_DEFAUT };
    for (const [cle, valeur] of Object.entries(perso)) {
      if (!valeur) continue;
      // Les noms personnalisés passent devant, les défauts restent en secours.
      const liste = Array.isArray(valeur) ? valeur : [valeur];
      sortie[cle as keyof CorrespondanceChamps] = [
        ...liste,
        ...CORRESPONDANCE_PAR_DEFAUT[cle as keyof CorrespondanceChamps],
      ];
    }
    return sortie;
  } catch {
    return CORRESPONDANCE_PAR_DEFAUT;
  }
}

/** Valeur d'une réponse, ramenée à du texte. */
function texteDe(brut: unknown): string {
  if (brut === undefined || brut === null) return '';
  if (typeof brut === 'object') {
    // Les champs composés (nom, adresse, date) arrivent sous forme d'objet.
    return Object.values(brut as Record<string, unknown>)
      .filter((v) => v !== null && v !== undefined && v !== '')
      .join(' ')
      .trim();
  }
  return String(brut);
}

/**
 * Réponses d'une soumission, aplaties en couples nom → texte. Cette forme est
 * conservée telle quelle sur la demande : c'est l'original auquel se référer
 * quand une interprétation est contestée.
 */
export function aplatirReponses(soumission: SoumissionJotForm): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, reponse] of Object.entries(soumission.answers ?? {})) {
    const texte = texteDe(reponse.answer);
    if (!texte) continue;
    out[reponse.text || reponse.name || `champ_${id}`] = texte;
  }
  return out;
}

/**
 * Index de recherche d'une soumission.
 *
 * Chaque réponse est indexée deux fois : sous le nom technique du champ
 * (« q3_equipement » → « equipement »), qui fait foi, et sous son libellé
 * affiché, qui ne sert que de repli — un formulaire mal nommé reste
 * exploitable, mais un formulaire bien nommé n'est jamais pris en défaut.
 */
interface EntreeIndex {
  cle: string;
  /** Découpage en mots : « codeEquipement » → [code, equipement]. */
  mots: string[];
  valeur: string;
  /** Vrai si la clé vient du nom du champ et non de son libellé. */
  nomTechnique: boolean;
}

function decouper(cle: string): string[] {
  return normaliser(cle.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function indexer(soumission: SoumissionJotForm): EntreeIndex[] {
  const entrees: EntreeIndex[] = [];
  for (const [id, reponse] of Object.entries(soumission.answers ?? {})) {
    const valeur = texteDe(reponse.answer);
    if (!valeur) continue;
    const nom = reponse.name ?? `champ_${id}`;
    entrees.push({ cle: nom, mots: decouper(nom), valeur, nomTechnique: true });
    if (reponse.text && reponse.text !== nom) {
      entrees.push({ cle: reponse.text, mots: decouper(reponse.text), valeur, nomTechnique: false });
    }
  }
  // Les noms techniques passent avant les libellés, quel que soit l'ordre des
  // questions dans le formulaire.
  return entrees.sort((a, b) => Number(b.nomTechnique) - Number(a.nomTechnique));
}

/**
 * Cherche la valeur d'un champ parmi une liste de noms acceptés.
 *
 * La recherche est volontairement stricte : égalité sur le nom entier, puis
 * sur un mot du nom. Une correspondance par simple sous-chaîne serait
 * commode mais dangereuse — « Problème constaté » contient « constat », et
 * l'objet de la demande se retrouverait recopié dans sa description.
 *
 * Une réponse déjà attribuée à un champ n'est plus proposée pour un autre :
 * chaque question du formulaire alimente une seule case de la demande.
 */
function trouver(index: EntreeIndex[], noms: string[], consommees: Set<string>): string | undefined {
  const cibles = noms.map((n) => decouper(n).join(''));
  const libre = index.filter((e) => !consommees.has(e.cle));

  for (const cible of cibles) {
    for (const entree of libre) {
      if (entree.mots.join('') === cible) {
        consommees.add(entree.cle);
        return entree.valeur;
      }
    }
  }
  for (const cible of cibles) {
    for (const entree of libre) {
      if (entree.mots.includes(cible)) {
        consommees.add(entree.cle);
        return entree.valeur;
      }
    }
  }
  return undefined;
}

/** Traduit le vocabulaire du formulaire en priorité d'intervention. */
export function interpreterUrgence(texte: string | undefined, criticiteEquipement?: number): PrioriteOT {
  const t = normaliser(texte ?? '');
  if (/p1|vital|immediat|urgence vitale|tres urgent|arret total/.test(t)) return 'P1';
  if (/p2|urgent|bloquant|soin.*retard|degrade/.test(t)) return 'P2';
  if (/p4|planifi|quand possible|pas urgent|confort/.test(t)) return 'P4';
  if (/p3|normal|courant/.test(t)) return 'P3';
  // Sans indication, la criticité de l'équipement tranche : c'est le
  // biomédical qui requalifiera, mais un respirateur ne doit pas dormir en P4.
  return criticiteEquipement === 1 ? 'P2' : 'P3';
}

export function interpreterImpact(
  texte: string | undefined,
  priorite: PrioriteOT,
): DemandeIntervention['impactPatient'] {
  const t = normaliser(texte ?? '');
  if (/vital|deces|danger|grave/.test(t)) return 'risque_vital';
  if (/report|annul|retard.*soin|deprogramm/.test(t)) return 'report_soin';
  if (/gene|inconfort|desagrement/.test(t)) return 'gene';
  if (/aucun|sans impact|rien/.test(t)) return 'aucun';
  return priorite === 'P1' ? 'risque_vital' : priorite === 'P2' ? 'report_soin' : 'gene';
}

export interface ResultatConversion {
  demande?: Omit<DemandeIntervention, 'id' | 'numero'>;
  /** Pourquoi la soumission n'a pas pu être convertie. */
  rejet?: string;
  soumissionId: string;
}

/**
 * Transforme une soumission en demande d'intervention.
 *
 * L'équipement est retrouvé par son numéro d'inventaire, tel qu'il figure sur
 * l'étiquette. S'il est absent ou inconnu, la demande est tout de même créée —
 * rattachée au service — plutôt que perdue : un signalement qu'on ne sait pas
 * classer reste un signalement.
 */
export function convertirSoumission(
  base: BaseGMAO,
  soumission: SoumissionJotForm,
  correspondance: CorrespondanceChamps,
  demandeurParDefautId: string,
): ResultatConversion {
  const reponses = aplatirReponses(soumission);
  const index = indexer(soumission);
  // L'ordre des recherches fixe la priorité d'attribution : le code
  // d'inventaire d'abord, puis l'objet, puis le reste.
  const pris = new Set<string>();
  const champ = (noms: string[]) => trouver(index, noms, pris);

  const codeEquipement = champ(correspondance.equipement);
  const equipement = codeEquipement
    ? base.equipements.find(
        (e) =>
          normaliser(e.code) === normaliser(codeEquipement.replace(/^GMAO[-:]/i, '')) ||
          normaliser(e.numeroSerie) === normaliser(codeEquipement),
      )
    : undefined;

  const objet = champ(correspondance.objet);
  const description = champ(correspondance.description);
  if (!objet && !description) {
    return { soumissionId: soumission.id, rejet: 'Ni objet ni description : rien à transmettre au service technique.' };
  }

  const nomService = champ(correspondance.service);
  const service =
    equipement?.serviceId
      ? base.services.find((s) => s.id === equipement.serviceId)
      : nomService
        ? base.services.find(
            (s) => normaliser(s.nom).includes(normaliser(nomService)) || normaliser(s.code) === normaliser(nomService),
          )
        : undefined;

  const priorite = interpreterUrgence(champ(correspondance.urgence), equipement?.criticite);
  const impact = interpreterImpact(champ(correspondance.impact), priorite);
  const declarant = champ(correspondance.declarant);
  const local = champ(correspondance.local);

  // Le déclarant est identifié s'il figure dans l'annuaire, sinon la demande
  // est portée par le compte de service : son nom reste dans la description.
  const utilisateur = declarant
    ? base.utilisateurs.find(
        (u) =>
          normaliser(`${u.prenom} ${u.nom}`) === normaliser(declarant) ||
          normaliser(u.email) === normaliser(declarant),
      )
    : undefined;

  const contexte = [
    description ?? '',
    declarant && !utilisateur ? `Déclaré par : ${declarant}` : '',
    local && !equipement ? `Localisation indiquée : ${local}` : '',
    codeEquipement && !equipement ? `Code saisi, non trouvé à l’inventaire : ${codeEquipement}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    soumissionId: soumission.id,
    demande: {
      dateCreation: soumission.created_at ? soumission.created_at.replace(' ', 'T') : isoHeure(aujourdHui()),
      demandeurId: utilisateur?.id ?? demandeurParDefautId,
      serviceId: service?.id ?? base.services[0].id,
      localId: equipement?.localId,
      equipementId: equipement?.id,
      objet: objet ?? `Signalement — ${equipement?.designation ?? 'équipement non identifié'}`,
      description: contexte,
      urgenceDeclaree: priorite,
      impactPatient: impact,
      canal: 'qr_code',
      statut: 'nouvelle',
      origineExterne: {
        source: SOURCE,
        formulaireId: soumission.form_id,
        soumissionId: soumission.id,
        recuLe: isoHeure(aujourdHui()),
        reponses,
      },
    },
  };
}

/** Ajoute la demande à la base si la soumission n'a pas déjà été traitée. */
export function integrerDemande(
  base: BaseGMAO,
  conversion: ResultatConversion,
): DemandeIntervention | null {
  if (!conversion.demande) return null;
  const dejaVue = base.demandes.some(
    (d) => d.origineExterne?.source === SOURCE && d.origineExterne.soumissionId === conversion.soumissionId,
  );
  if (dejaVue) return null;

  const demande: DemandeIntervention = {
    ...conversion.demande,
    id: uid('dmi'),
    numero: numeroSuivant('DI', aujourdHui().getFullYear(), base.demandes.map((d) => d.numero)),
  };
  base.demandes.unshift(demande);
  return demande;
}

/* ------------------------------------------------------------------ */
/* Appel de l'API JotForm                                              */
/* ------------------------------------------------------------------ */

export interface OptionsRecuperation {
  cleApi: string;
  formulaireId: string;
  /** Ne récupérer que les soumissions postérieures à cet horodatage. */
  depuis?: string;
  limite?: number;
  base?: string;
}

export async function recupererSoumissions(
  options: OptionsRecuperation,
): Promise<{ soumissions: SoumissionJotForm[]; dernierHorodatage?: string }> {
  const racine = options.base ?? 'https://api.jotform.com';
  const parametres = new URLSearchParams({
    apiKey: options.cleApi,
    limit: String(options.limite ?? 100),
    orderby: 'created_at',
  });
  if (options.depuis) {
    parametres.set('filter', JSON.stringify({ 'created_at:gt': options.depuis }));
  }

  const reponse = await fetch(`${racine}/form/${options.formulaireId}/submissions?${parametres}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });

  if (!reponse.ok) {
    const corps = await reponse.text().catch(() => '');
    throw new Error(
      `JotForm a répondu ${reponse.status} : ${corps.slice(0, 200) || 'réponse vide'}`,
    );
  }

  const donnees = (await reponse.json()) as { content?: SoumissionJotForm[]; message?: string };
  const soumissions = (donnees.content ?? []).filter((s) => s.status !== 'DELETED');
  const dernierHorodatage = soumissions.reduce<string | undefined>(
    (max, s) => (!max || s.created_at > max ? s.created_at : max),
    options.depuis,
  );
  return { soumissions, dernierHorodatage };
}

/** Extrait la soumission d'une notification webhook JotForm. */
export function lireWebhook(corps: Record<string, unknown>): SoumissionJotForm | null {
  const brut = corps.rawRequest;
  const formId = String(corps.formID ?? corps.form_id ?? '');
  const submissionId = String(corps.submissionID ?? corps.submission_id ?? '');
  if (!submissionId) return null;

  // JotForm envoie les réponses dans « rawRequest », sous forme de chaîne JSON
  // dont les clés ressemblent à « q3_objet ».
  let reponses: Record<string, unknown> = {};
  if (typeof brut === 'string') {
    try {
      reponses = JSON.parse(brut) as Record<string, unknown>;
    } catch {
      reponses = {};
    }
  } else if (brut && typeof brut === 'object') {
    reponses = brut as Record<string, unknown>;
  }

  const answers: SoumissionJotForm['answers'] = {};
  let index = 0;
  for (const [cle, valeur] of Object.entries(reponses)) {
    index += 1;
    // « q12_codeEquipement » → « codeEquipement »
    const nom = cle.replace(/^q\d+_/, '');
    answers[String(index)] = { name: nom, answer: valeur };
  }

  return {
    id: submissionId,
    form_id: formId,
    created_at: String(corps.created_at ?? new Date().toISOString().slice(0, 19).replace('T', ' ')),
    answers,
  };
}

/** URL du formulaire pré-rempli, encodée dans le QR code de l'étiquette. */
export function lienFormulaire(baseFormulaire: string, champ: string, codeEquipement: string): string {
  return lienFormulaireExterne(baseFormulaire, champ, codeEquipement);
}
