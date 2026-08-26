import qrcode from 'qrcode-generator';

/**
 * QR code des étiquettes d'inventaire.
 *
 * L'étiquette porte deux codes qui ne s'adressent pas aux mêmes gens : le
 * code-barres linéaire pour les douchettes du magasin et de la biomédicale,
 * le QR pour les téléphones des services de soins. Un aide-soignant qui
 * constate une panne scanne le QR, le formulaire s'ouvre avec le numéro
 * d'inventaire déjà rempli, et sa demande arrive dans la GMAO.
 *
 * Le niveau de correction retenu est « M » (15 % de la surface récupérable),
 * et non le maximum. Sur une étiquette de deux centimètres, ce qui décide de
 * la lecture est la taille d'un module, pas la marge de correction : la même
 * URL demande 33 modules en « M » contre 45 en « H », soit des carrés un tiers
 * plus grands à surface égale. Le QR le plus robuste est celui que le
 * téléphone accroche du premier coup.
 */

export interface GrilleQR {
  /** Côté de la grille, en modules. */
  cote: number;
  /** Modules noirs, en coordonnées de grille. */
  modules: { x: number; y: number }[];
}

export function encoderQR(texte: string): GrilleQR {
  // Type 0 : la bibliothèque choisit la plus petite version qui contienne le
  // texte, ce qui garde les modules aussi gros que possible à surface égale.
  const qr = qrcode(0, 'M');
  qr.addData(texte);
  qr.make();

  const cote = qr.getModuleCount();
  const modules: { x: number; y: number }[] = [];
  for (let y = 0; y < cote; y += 1) {
    for (let x = 0; x < cote; x += 1) if (qr.isDark(y, x)) modules.push({ x, y });
  }
  return { cote, modules };
}
