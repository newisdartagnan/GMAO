import { useMemo } from 'react';
import { contenuEtiquette, encoderCode128B } from '@/lib/codebarres';

export function CodeBarres({
  valeur,
  hauteur = 48,
  moduleLargeur = 1.6,
  avecTexte = true,
}: {
  valeur: string;
  hauteur?: number;
  moduleLargeur?: number;
  avecTexte?: boolean;
}) {
  const { barres, largeurTotale } = useMemo(() => {
    const largeurs = encoderCode128B(valeur);
    let x = 0;
    const rects: { x: number; l: number }[] = [];
    largeurs.forEach((l, i) => {
      if (i % 2 === 0) rects.push({ x, l });
      x += l;
    });
    return { barres: rects, largeurTotale: x };
  }, [valeur]);

  const marge = 8;
  const largeur = largeurTotale * moduleLargeur + marge * 2;
  const hauteurTotale = hauteur + (avecTexte ? 14 : 0);

  return (
    <svg
      viewBox={`0 0 ${largeur} ${hauteurTotale}`}
      width={largeur}
      height={hauteurTotale}
      role="img"
      aria-label={`Code-barres ${valeur}`}
      className="max-w-full"
    >
      <rect width={largeur} height={hauteurTotale} fill="#fff" />
      {barres.map((b, i) => (
        <rect key={i} x={marge + b.x * moduleLargeur} y={0} width={b.l * moduleLargeur} height={hauteur} fill="#0f172a" />
      ))}
      {avecTexte && (
        <text
          x={largeur / 2}
          y={hauteurTotale - 2}
          textAnchor="middle"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
          fill="#0f172a"
          letterSpacing="1"
        >
          {valeur}
        </text>
      )}
    </svg>
  );
}

/** Étiquette d'inventaire prête à imprimer et à coller sur l'équipement. */
export function EtiquetteInventaire({
  code,
  designation,
  service,
  criticite,
}: {
  code: string;
  designation: string;
  service: string;
  criticite: string;
}) {
  return (
    <div className="w-[320px] rounded-lg border-2 border-slate-800 bg-white p-3">
      <div className="flex items-start justify-between gap-2 border-b border-slate-300 pb-1.5">
        <p className="text-[10px] font-bold tracking-wider text-slate-800 uppercase">HGR Kinshasa — Parc technique</p>
        <p className="text-[10px] font-semibold text-slate-600">{criticite}</p>
      </div>
      <p className="mt-1.5 truncate text-sm font-bold text-slate-900">{designation}</p>
      <p className="truncate text-[11px] text-slate-600">{service}</p>
      <div className="mt-1.5 flex justify-center">
        <CodeBarres valeur={contenuEtiquette(code)} hauteur={40} moduleLargeur={1.3} />
      </div>
      <p className="mt-1 text-center text-[9px] text-slate-500">
        Toute anomalie : composer le 2222 ou scanner cette étiquette dans la GMAO
      </p>
    </div>
  );
}
