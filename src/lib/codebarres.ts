/**
 * Encodage Code 128 (jeu B) pour les étiquettes d'inventaire.
 *
 * Le choix du code-barres linéaire plutôt que d'un QR est délibéré : les
 * douchettes filaires déjà présentes dans les magasins hospitaliers le lisent
 * sans matériel supplémentaire, et l'étiquette reste lisible même partiellement
 * abîmée par les produits de désinfection.
 */

/** Largeurs de barres/espaces pour les 107 symboles du Code 128. */
const MOTIFS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '233111',
];

const DEBUT_B = 104;
const STOP = 106;

/**
 * Retourne la suite des largeurs de modules à tracer, en alternant
 * barre / espace à partir d'une barre.
 */
export function encoderCode128B(texte: string): number[] {
  const valeurs: number[] = [DEBUT_B];
  for (const c of texte) {
    const code = c.charCodeAt(0);
    // Hors du jeu B : on substitue un tiret plutôt que de produire un code illisible.
    valeurs.push(code >= 32 && code <= 126 ? code - 32 : 13);
  }
  let somme = DEBUT_B;
  for (let i = 1; i < valeurs.length; i += 1) somme += valeurs[i] * i;
  valeurs.push(somme % 103, STOP);

  const largeurs: number[] = [];
  for (const v of valeurs) for (const ch of MOTIFS[v]) largeurs.push(Number(ch));
  largeurs.push(2); // barre de fin
  return largeurs;
}

/** Chaîne encodée dans l'étiquette : préfixe applicatif + code d'inventaire. */
export function contenuEtiquette(codeEquipement: string): string {
  return `GMAO-${codeEquipement}`;
}
