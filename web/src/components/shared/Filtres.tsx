import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';

export interface DefinitionFiltre {
  cle: string;
  label: string;
  valeur: string;
  options: { valeur: string; libelle: string }[];
  onChange: (v: string) => void;
}

export function BarreFiltres({
  recherche,
  onRecherche,
  placeholder = 'Rechercher…',
  filtres = [],
  actions,
  resultats,
}: {
  recherche: string;
  onRecherche: (v: string) => void;
  placeholder?: string;
  filtres?: DefinitionFiltre[];
  actions?: ReactNode;
  resultats?: ReactNode;
}) {
  const actifs = filtres.filter((f) => f.valeur !== '');
  const reinitialiser = () => {
    onRecherche('');
    for (const f of filtres) f.onChange('');
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={recherche}
            onChange={(e) => onRecherche(e.target.value)}
            placeholder={placeholder}
            className="champ pl-9"
          />
        </div>
        {filtres.map((f) => (
          <select
            key={f.cle}
            value={f.valeur}
            onChange={(e) => f.onChange(e.target.value)}
            aria-label={f.label}
            className={`champ h-9 w-auto min-w-[9rem] py-0 text-sm ${f.valeur ? 'border-marque-400 bg-marque-50 font-medium text-marque-900' : ''}`}
          >
            <option value="">{f.label} : tous</option>
            {f.options.map((o) => (
              <option key={o.valeur} value={o.valeur}>
                {o.libelle}
              </option>
            ))}
          </select>
        ))}
        {actions}
      </div>

      {(actifs.length > 0 || recherche) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {resultats && <span className="text-slate-500">{resultats}</span>}
          <button
            type="button"
            onClick={reinitialiser}
            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-slate-600 hover:bg-slate-200"
          >
            <X className="size-3" /> Réinitialiser les filtres
          </button>
        </div>
      )}
    </div>
  );
}
