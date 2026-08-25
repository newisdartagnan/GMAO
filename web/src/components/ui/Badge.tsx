import type { ReactNode } from 'react';
import type { Ton } from '@gmao/partage';

const TONS: Record<Ton, string> = {
  neutre: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  succes: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  attention: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-rose-50 text-rose-800 ring-rose-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
  ardoise: 'bg-slate-200/70 text-slate-600 ring-slate-300',
};

const PASTILLES: Record<Ton, string> = {
  neutre: 'bg-slate-400',
  info: 'bg-sky-500',
  succes: 'bg-emerald-500',
  attention: 'bg-amber-500',
  danger: 'bg-rose-500',
  violet: 'bg-violet-500',
  ardoise: 'bg-slate-400',
};

export function Badge({
  ton = 'neutre',
  children,
  pastille = false,
  titre,
  compact = false,
}: {
  ton?: Ton;
  children: ReactNode;
  /** Affiche un point coloré : utile quand plusieurs badges se suivent. */
  pastille?: boolean;
  titre?: string;
  compact?: boolean;
}) {
  return (
    <span
      title={titre}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md ring-1 ring-inset font-medium whitespace-nowrap ${
        compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
      } ${TONS[ton]}`}
    >
      {pastille && <span className={`size-1.5 rounded-full ${PASTILLES[ton]}`} />}
      {children}
    </span>
  );
}

/** Pastille seule, pour les colonnes très denses. */
export function Pastille({ ton, titre }: { ton: Ton; titre?: string }) {
  return <span title={titre} className={`inline-block size-2.5 rounded-full ${PASTILLES[ton]}`} />;
}
