import type { ReactNode } from 'react';

export interface Onglet {
  cle: string;
  libelle: string;
  compteur?: number;
  icone?: ReactNode;
}

export function Onglets({
  onglets,
  actif,
  onChange,
}: {
  onglets: Onglet[];
  actif: string;
  onChange: (cle: string) => void;
}) {
  return (
    <div className="overflow-x-auto border-b border-slate-200">
      <nav className="flex gap-1" role="tablist">
        {onglets.map((o) => {
          const selectionne = o.cle === actif;
          return (
            <button
              key={o.cle}
              type="button"
              role="tab"
              aria-selected={selectionne}
              onClick={() => onChange(o.cle)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                selectionne
                  ? 'border-marque-700 text-marque-800'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
              }`}
            >
              {o.icone}
              {o.libelle}
              {o.compteur !== undefined && o.compteur > 0 && (
                <span
                  className={`tabulaire rounded-full px-1.5 py-0.5 text-[11px] ${
                    selectionne ? 'bg-marque-100 text-marque-800' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {o.compteur}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
