/**
 * Liens du QR code de signalement.
 *
 * Les mêmes fonctions servent des deux côtés : le serveur pour répondre à
 * `/api/integrations/lien/:code`, le navigateur pour dessiner le QR des
 * étiquettes. Si l'encodage changeait à un seul endroit, les étiquettes déjà
 * collées dans les services cesseraient de fonctionner — d'où la définition
 * unique.
 */

/** Réglage du QR, tel que le serveur le communique à l'interface. */
export interface ReglageQR {
  /**
   * Adresse publique de la GMAO. Renseignée, le QR passe par elle et la
   * destination se change sans réimprimer une seule étiquette.
   */
  baseRedirection?: string | null;
  /** Adresse du formulaire, quand le QR y mène directement. */
  url?: string | null;
  /** Paramètre d'URL qui reçoit le code d'inventaire. */
  paramCode?: string | null;
}

/** URL du formulaire pré-rempli avec le code d'inventaire de l'équipement. */
export function lienFormulaireExterne(
  baseFormulaire: string,
  champCode: string,
  codeEquipement: string,
): string {
  if (!baseFormulaire) return '';
  const separateur = baseFormulaire.includes('?') ? '&' : '?';
  return `${baseFormulaire}${separateur}${encodeURIComponent(champCode)}=${encodeURIComponent(codeEquipement)}`;
}

/** URL d'aiguillage servie par la GMAO, qui renvoie vers le formulaire actif. */
export function lienRedirection(base: string, codeEquipement?: string): string {
  if (!base) return '';
  const racine = base.replace(/\/+$/, '');
  return codeEquipement ? `${racine}/r/${encodeURIComponent(codeEquipement)}` : `${racine}/r`;
}

/**
 * Ce qu'encode le QR d'une étiquette.
 *
 * Deux montages, et le choix n'est pas qu'esthétique :
 *
 * — **par la GMAO**, si elle a une adresse que les téléphones savent
 *   joindre. Le QR devient un aiguillage : changer de fournisseur de
 *   formulaire, corriger une URL, passer plus tard à un formulaire interne
 *   ne demande qu'une variable d'environnement. Des centaines d'étiquettes
 *   déjà collées restent valables.
 *
 * — **droit sur le formulaire**, sinon. C'est le seul montage qui marche
 *   depuis un site isolé où le réseau de l'établissement n'arrive pas, au
 *   prix d'une destination figée dans l'autocollant.
 */
export function lienQrEtiquette(reglage: ReglageQR, codeEquipement: string): string {
  if (reglage.baseRedirection) return lienRedirection(reglage.baseRedirection, codeEquipement);
  if (reglage.url) return lienFormulaireExterne(reglage.url, reglage.paramCode ?? 'equipement', codeEquipement);
  return '';
}
