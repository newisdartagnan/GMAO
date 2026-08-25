import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variante = 'primaire' | 'secondaire' | 'discret' | 'danger' | 'fantome';
type Taille = 'sm' | 'md' | 'lg';

const VARIANTES: Record<Variante, string> = {
  primaire: 'bg-marque-700 text-white hover:bg-marque-800 shadow-sm disabled:bg-marque-700/50',
  secondaire: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 shadow-sm',
  discret: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
  fantome: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
};

const TAILLES: Record<Taille, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

const BASE =
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';

export function Bouton({
  variante = 'secondaire',
  taille = 'md',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; taille?: Taille }) {
  return (
    <button type="button" className={`${BASE} ${VARIANTES[variante]} ${TAILLES[taille]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function BoutonLien({
  to,
  variante = 'secondaire',
  taille = 'md',
  className = '',
  children,
}: {
  to: string;
  variante?: Variante;
  taille?: Taille;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={`${BASE} ${VARIANTES[variante]} ${TAILLES[taille]} ${className}`}>
      {children}
    </Link>
  );
}

/** Bouton carré ne portant qu'une icône ; `libelle` alimente aria-label. */
export function BoutonIcone({
  libelle,
  variante = 'fantome',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { libelle: string; variante?: Variante }) {
  return (
    <button
      type="button"
      aria-label={libelle}
      title={libelle}
      className={`${BASE} ${VARIANTES[variante]} size-8 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
