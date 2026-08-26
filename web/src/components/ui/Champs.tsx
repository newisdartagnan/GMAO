import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';

export function Champ({
  label,
  aide,
  erreur,
  obligatoire,
  children,
  className = '',
}: {
  label: string;
  aide?: string;
  erreur?: string;
  obligatoire?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="etiquette-champ">
        {label}
        {obligatoire && <span className="ml-0.5 text-rose-600">*</span>}
      </label>
      {children}
      {aide && !erreur && <p className="mt-1 text-xs text-slate-500">{aide}</p>}
      {erreur && <p className="mt-1 text-xs font-medium text-rose-600">{erreur}</p>}
    </div>
  );
}

export function Saisie({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`champ ${className}`} {...props} />;
}

export function Zone({ className = '', rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={`champ resize-y ${className}`} {...props} />;
}

export function Liste({
  className = '',
  options,
  vide,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: { valeur: string; libelle: string }[];
  /** Libellé de l'option vide ; absent = pas d'option vide. */
  vide?: string;
}) {
  return (
    <select className={`champ ${className}`} {...props}>
      {vide !== undefined && <option value="">{vide}</option>}
      {options.map((o) => (
        <option key={o.valeur} value={o.valeur}>
          {o.libelle}
        </option>
      ))}
    </select>
  );
}

export function CaseACocher({
  label,
  description,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 rounded border-slate-300 text-marque-700 focus:ring-marque-500"
        {...props}
      />
      <label htmlFor={id} className="cursor-pointer select-none">
        <span className="text-sm text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </label>
    </div>
  );
}

/** Sélecteur segmenté : quelques options mutuellement exclusives, toujours visibles. */
export function Segments<T extends string>({
  valeur,
  onChange,
  options,
  taille = 'md',
}: {
  valeur: T;
  onChange: (v: T) => void;
  options: { valeur: T; libelle: string; compteur?: number }[];
  taille?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          onClick={() => onChange(o.valeur)}
          className={`rounded-md font-medium transition-colors ${taille === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${
            valeur === o.valeur ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {o.libelle}
          {o.compteur !== undefined && (
            <span className={`ml-1.5 tabulaire ${valeur === o.valeur ? 'text-marque-700' : 'text-slate-400'}`}>
              {o.compteur}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
