import { useMemo } from 'react';
import { lienQrEtiquette } from '@gmao/partage';
import type { ReglageQR } from '@gmao/partage';
import { contenuEtiquette, encoderCode128B } from '@/lib/codebarres';
import { CodeQR } from './CodeQR';

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

/**
 * Étiquette d'inventaire prête à imprimer et à coller sur l'équipement.
 *
 * Elle porte deux codes parce qu'elle sert deux publics. Le code-barres
 * linéaire s'adresse aux douchettes du magasin et de la biomédicale, qui
 * cherchent une référence dans l'inventaire. Le QR code s'adresse aux
 * téléphones des services de soins : il ouvre le formulaire de signalement,
 * numéro d'inventaire déjà rempli, sans que personne ait à ouvrir la GMAO ni
 * à connaître son adresse. Sans formulaire configuré, le QR disparaît et
 * l'étiquette reprend sa mise en page d'origine.
 */
export function EtiquetteInventaire({
  code,
  designation,
  service,
  criticite,
  formulaire,
}: {
  code: string;
  designation: string;
  service: string;
  criticite: string;
  /** Formulaire externe de signalement, s'il est branché. */
  formulaire?: ReglageQR | null;
}) {
  const lien = formulaire ? lienQrEtiquette(formulaire, code) || null : null;

  return (
    <div className="w-[320px] rounded-lg border-2 border-slate-800 bg-white p-3">
      <div className="flex items-center justify-between gap-2 border-b border-slate-300 pb-1.5">
        {/* Sur une étiquette imprimée en série, un en-tête qui passe à la ligne
            décale tout ce qui suit : il est tenu sur une seule ligne. */}
        <p className="truncate text-[10px] font-bold tracking-wider whitespace-nowrap text-slate-800 uppercase">
          HGR Kinshasa — Parc technique
        </p>
        <p className="shrink-0 text-[10px] font-semibold text-slate-600">{criticite}</p>
      </div>
      <p className="mt-1.5 truncate text-sm font-bold text-slate-900">{designation}</p>
      <p className="truncate text-[11px] text-slate-600">{service}</p>

      {lien ? (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <CodeBarres valeur={contenuEtiquette(code)} hauteur={40} moduleLargeur={0.8} />
          </div>
          <div className="flex shrink-0 flex-col items-center">
            <CodeQR valeur={lien} taille={88} titre={`Signaler une panne sur ${code}`} />
            <p className="mt-0.5 text-center text-[8px] leading-tight font-semibold text-slate-700">
              SIGNALER
              <br />
              UNE PANNE
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 flex justify-center">
          <CodeBarres valeur={contenuEtiquette(code)} hauteur={40} moduleLargeur={1.3} />
        </div>
      )}

      <p className="mt-1 text-center text-[9px] text-slate-500">
        {lien
          ? 'Anomalie : scannez le QR avec votre téléphone, ou composez le 2222'
          : 'Toute anomalie : composer le 2222 ou scanner cette étiquette dans la GMAO'}
      </p>
    </div>
  );
}
