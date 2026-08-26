import type { ReactNode } from 'react';

export function Carte({
  titre,
  sousTitre,
  actions,
  children,
  className = '',
  sansPadding = false,
  icone,
}: {
  titre?: ReactNode;
  sousTitre?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  sansPadding?: boolean;
  icone?: ReactNode;
}) {
  return (
    <section className={`carte flex flex-col ${className}`}>
      {(titre || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              {icone}
              {titre}
            </h2>
            {sousTitre && <p className="mt-0.5 text-xs text-slate-500">{sousTitre}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={sansPadding ? 'min-h-0 flex-1' : 'min-h-0 flex-1 p-4'}>{children}</div>
    </section>
  );
}

export function Section({
  titre,
  description,
  actions,
  children,
}: {
  titre: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800">{titre}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
