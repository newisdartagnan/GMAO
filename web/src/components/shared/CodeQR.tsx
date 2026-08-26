import { useMemo } from 'react';
import { encoderQR } from '@/lib/qr';

/**
 * QR code en SVG, sans canvas ni image : il s'imprime net à n'importe quelle
 * taille, ce qui est la seule chose qui compte pour une étiquette.
 */
export function CodeQR({
  valeur,
  taille = 96,
  titre,
}: {
  valeur: string;
  taille?: number;
  titre?: string;
}) {
  const { cote, modules } = useMemo(() => encoderQR(valeur), [valeur]);

  // Marge silencieuse : la norme demande quatre modules tout autour, faute de
  // quoi certains lecteurs de téléphone ne verrouillent pas le code.
  const marge = 4;
  const total = cote + marge * 2;

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      width={taille}
      height={taille}
      role="img"
      aria-label={titre ?? `QR code ${valeur}`}
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="#fff" />
      {modules.map((m) => (
        <rect key={`${m.x}-${m.y}`} x={m.x + marge} y={m.y + marge} width={1} height={1} fill="#0f172a" />
      ))}
    </svg>
  );
}
