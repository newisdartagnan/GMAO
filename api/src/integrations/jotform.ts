import type { SoumissionFormulaire } from './formulaires.ts';
import { joindre } from './reseau.ts';

/**
 * Adaptateur JotForm.
 *
 * Ne fait qu'une chose : ramener ce que JotForm renvoie à la forme neutre
 * qu'interprète `formulaires.ts`. Les règles métier — appariement des
 * questions, lecture de l'urgence, résolution d'un local — sont là-bas, pas
 * ici, et servent aussi bien à Microsoft Forms.
 *
 * Deux entrées possibles selon ce que permet le réseau de l'établissement :
 * la récupération périodique, où le serveur sort interroger JotForm, et le
 * webhook, où JotForm pousse chaque réponse — ce qui suppose une adresse
 * publique.
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

export function normaliserSoumission(soumission: SoumissionJotForm): SoumissionFormulaire {
  return {
    source: SOURCE,
    id: soumission.id,
    formulaireId: soumission.form_id,
    date: soumission.created_at ? soumission.created_at.replace(' ', 'T') : undefined,
    reponses: Object.entries(soumission.answers ?? {}).map(([id, r]) => ({
      nom: r.name,
      libelle: r.text ?? r.name ?? `champ_${id}`,
      valeur: texteDe(r.answer),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Appel de l'API                                                      */
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
): Promise<{ soumissions: SoumissionFormulaire[]; dernierHorodatage?: string }> {
  const racine = options.base ?? 'https://api.jotform.com';
  const parametres = new URLSearchParams({
    apiKey: options.cleApi,
    limit: String(options.limite ?? 100),
    orderby: 'created_at',
  });
  if (options.depuis) {
    parametres.set('filter', JSON.stringify({ 'created_at:gt': options.depuis }));
  }

  const reponse = await joindre(`${racine}/form/${options.formulaireId}/submissions?${parametres}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });

  if (!reponse.ok) {
    const corps = await reponse.text().catch(() => '');
    throw new Error(`JotForm a répondu ${reponse.status} : ${corps.slice(0, 200) || 'réponse vide'}`);
  }

  const donnees = (await reponse.json()) as { content?: SoumissionJotForm[] };
  const brutes = (donnees.content ?? []).filter((s) => s.status !== 'DELETED');
  const dernierHorodatage = brutes.reduce<string | undefined>(
    (max, s) => (!max || s.created_at > max ? s.created_at : max),
    options.depuis,
  );
  return { soumissions: brutes.map(normaliserSoumission), dernierHorodatage };
}

/** Extrait la soumission d'une notification webhook JotForm. */
export function lireWebhook(corps: Record<string, unknown>): SoumissionFormulaire | null {
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

  return {
    source: SOURCE,
    id: submissionId,
    formulaireId: formId,
    date: corps.created_at ? String(corps.created_at).replace(' ', 'T') : undefined,
    reponses: Object.entries(reponses).map(([cle, valeur]) => ({
      // « q12_codeEquipement » → « codeEquipement »
      nom: cle.replace(/^q\d+_/, ''),
      valeur: texteDe(valeur),
    })),
  };
}
