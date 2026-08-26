/**
 * Liens vers le formulaire externe de signalement.
 *
 * La même fonction sert des deux côtés : le serveur pour répondre à
 * `/api/integrations/jotform/lien/:code`, le navigateur pour dessiner le QR
 * code des étiquettes. Si l'encodage du lien changeait à un seul endroit, les
 * étiquettes déjà collées dans les services cesseraient de fonctionner — d'où
 * la définition unique.
 */

/** URL du formulaire pré-rempli avec le code d'inventaire de l'équipement. */
export function lienFormulaireExterne(
  baseFormulaire: string,
  champCode: string,
  codeEquipement: string,
): string {
  const separateur = baseFormulaire.includes('?') ? '&' : '?';
  return `${baseFormulaire}${separateur}${encodeURIComponent(champCode)}=${encodeURIComponent(codeEquipement)}`;
}
