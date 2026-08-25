import type { ReactNode } from 'react';
import { Info as InfoIcone } from 'lucide-react';

/** Liste de définitions : le format le plus lisible pour une fiche d'entité. */
export function Definitions({
  items,
  colonnes = 2,
}: {
  items: { label: string; valeur: ReactNode; pleineLargeur?: boolean }[];
  colonnes?: 1 | 2 | 3;
}) {
  const grille = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }[colonnes];
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-3.5 ${grille}`}>
      {items.map((i) => (
        <div key={i.label} className={i.pleineLargeur ? 'sm:col-span-full' : ''}>
          <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{i.label}</dt>
          <dd className="mt-0.5 text-sm text-slate-800">{i.valeur ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Encart({
  ton = 'info',
  titre,
  children,
  icone,
}: {
  ton?: 'info' | 'attention' | 'danger' | 'succes';
  titre?: string;
  children: ReactNode;
  icone?: ReactNode;
}) {
  const tons = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    attention: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-rose-200 bg-rose-50 text-rose-900',
    succes: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return (
    <div className={`flex gap-3 rounded-lg border px-3.5 py-3 text-sm ${tons[ton]}`}>
      <span className="mt-0.5 shrink-0">{icone ?? <InfoIcone className="size-4" />}</span>
      <div className="min-w-0">
        {titre && <p className="font-semibold">{titre}</p>}
        <div className={titre ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </div>
  );
}

export function Vide({
  titre,
  description,
  icone,
  action,
}: {
  titre: string;
  description?: string;
  icone?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      {icone && <div className="text-slate-300">{icone}</div>}
      <p className="text-sm font-medium text-slate-700">{titre}</p>
      {description && <p className="max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Fil d'événements : historique d'un OT, journal d'audit d'un équipement. */
export function Chronologie({
  evenements,
}: {
  evenements: { id: string; date: string; titre: ReactNode; detail?: ReactNode; ton?: 'neutre' | 'marque' | 'danger' | 'succes' }[];
}) {
  const points = {
    neutre: 'bg-slate-300',
    marque: 'bg-marque-600',
    danger: 'bg-rose-500',
    succes: 'bg-emerald-500',
  };
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {evenements.map((e) => (
        <li key={e.id} className="relative">
          <span className={`absolute -left-[1.55rem] top-1.5 size-2.5 rounded-full ring-4 ring-white ${points[e.ton ?? 'neutre']}`} />
          <p className="text-xs text-slate-400 tabulaire">{e.date}</p>
          <p className="text-sm font-medium text-slate-800">{e.titre}</p>
          {e.detail && <div className="mt-0.5 text-sm text-slate-600">{e.detail}</div>}
        </li>
      ))}
    </ol>
  );
}
