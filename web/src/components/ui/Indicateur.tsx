import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TrendingDown, TrendingUp } from 'lucide-react';

type Accent = 'neutre' | 'positif' | 'attention' | 'negatif' | 'marque';

const ACCENTS: Record<Accent, { valeur: string; fond: string; icone: string }> = {
  neutre: { valeur: 'text-slate-900', fond: 'bg-slate-100', icone: 'text-slate-500' },
  positif: { valeur: 'text-emerald-700', fond: 'bg-emerald-50', icone: 'text-emerald-600' },
  attention: { valeur: 'text-amber-700', fond: 'bg-amber-50', icone: 'text-amber-600' },
  negatif: { valeur: 'text-rose-700', fond: 'bg-rose-50', icone: 'text-rose-600' },
  marque: { valeur: 'text-marque-800', fond: 'bg-marque-50', icone: 'text-marque-700' },
};

export function Indicateur({
  libelle,
  valeur,
  unite,
  detail,
  accent = 'neutre',
  icone,
  tendance,
  lien,
  aide,
}: {
  libelle: string;
  valeur: ReactNode;
  unite?: string;
  detail?: ReactNode;
  accent?: Accent;
  icone?: ReactNode;
  /** Variation en % par rapport à la période précédente. */
  tendance?: { valeur: number; bonSensEstBaisse?: boolean };
  lien?: string;
  aide?: string;
}) {
  const a = ACCENTS[accent];
  const contenu = (
    <div className="carte h-full p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase" title={aide}>
          {libelle}
        </p>
        {icone && <span className={`rounded-lg p-1.5 ${a.fond} ${a.icone}`}>{icone}</span>}
      </div>
      <p className={`mt-2 flex items-baseline gap-1 text-2xl font-semibold tabulaire ${a.valeur}`}>
        {valeur}
        {unite && <span className="text-sm font-normal text-slate-400">{unite}</span>}
      </p>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
        {tendance !== undefined && Number.isFinite(tendance.valeur) && (
          <span
            className={`inline-flex items-center gap-0.5 font-medium ${
              (tendance.bonSensEstBaisse ? tendance.valeur <= 0 : tendance.valeur >= 0)
                ? 'text-emerald-600'
                : 'text-rose-600'
            }`}
          >
            {tendance.valeur >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {Math.abs(tendance.valeur).toFixed(1).replace('.', ',')} %
          </span>
        )}
        {detail && <span className="truncate">{detail}</span>}
      </div>
    </div>
  );
  return lien ? (
    <Link to={lien} className="block h-full">
      {contenu}
    </Link>
  ) : (
    contenu
  );
}

/** Barre de progression avec seuil cible optionnel. */
export function Jauge({
  valeur,
  cible,
  inverse = false,
  hauteur = 'h-2',
  libelle,
}: {
  valeur: number;
  cible?: number;
  /** Une valeur basse est-elle une bonne nouvelle ? (retards, coûts…) */
  inverse?: boolean;
  hauteur?: string;
  libelle?: string;
}) {
  const v = Math.max(0, Math.min(100, valeur));
  const atteint = cible === undefined ? true : inverse ? v <= cible : v >= cible;
  const couleur = atteint ? 'bg-emerald-500' : v > (cible ?? 100) * 0.85 || inverse ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div>
      {libelle && (
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>{libelle}</span>
          <span className="tabulaire font-medium text-slate-700">{v.toFixed(1).replace('.', ',')} %</span>
        </div>
      )}
      <div className={`relative w-full overflow-hidden rounded-full bg-slate-200 ${hauteur}`}>
        <div className={`h-full rounded-full transition-all ${couleur}`} style={{ width: `${v}%` }} />
        {cible !== undefined && (
          <div
            className="absolute inset-y-0 w-0.5 bg-slate-700/60"
            style={{ left: `${Math.min(100, cible)}%` }}
            title={`Cible : ${cible} %`}
          />
        )}
      </div>
    </div>
  );
}

/** Répartition en une seule barre empilée (statuts, criticités…). */
export function BarreRepartition({
  segments,
  hauteur = 'h-2.5',
}: {
  segments: { libelle: string; valeur: number; classe: string }[];
  hauteur?: string;
}) {
  const total = segments.reduce((s, x) => s + x.valeur, 0) || 1;
  return (
    <div className={`flex w-full overflow-hidden rounded-full bg-slate-100 ${hauteur}`}>
      {segments
        .filter((s) => s.valeur > 0)
        .map((s) => (
          <div
            key={s.libelle}
            className={s.classe}
            style={{ width: `${(s.valeur / total) * 100}%` }}
            title={`${s.libelle} : ${s.valeur}`}
          />
        ))}
    </div>
  );
}
