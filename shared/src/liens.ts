/**
 * Liens vers le formulaire externe de signalement.
 *
 * La même fonction sert des deux côtés : le serveur pour répondre à
 * `/api/integrations/lien/:code`, le navigateur pour dessiner le QR code des
 * étiquettes. Si l'encodage changeait à un seul endroit, les étiquettes déjà
 * collées dans les services cesseraient de fonctionner — d'où la définition
 * unique.
 *
 * Le nom du paramètre dépend du fournisseur. JotForm accepte le nom de la
 * question (`?equipement=REA-0020`). Microsoft Forms attribue à chaque
 * question un identifiant opaque, que l'éditeur du formulaire donne par
 * « Obtenir un lien pré-rempli » — d'où un nom de paramètre configurable
 * plutôt que deviné.
 */

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
