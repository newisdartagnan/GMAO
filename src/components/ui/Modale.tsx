import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { BoutonIcone } from './Bouton';

export function Modale({
  ouverte,
  onFermer,
  titre,
  sousTitre,
  children,
  pied,
  largeur = 'md',
}: {
  ouverte: boolean;
  onFermer: () => void;
  titre: string;
  sousTitre?: string;
  children: ReactNode;
  pied?: ReactNode;
  largeur?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!ouverte) return;
    const onTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer();
    };
    document.addEventListener('keydown', onTouche);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onTouche);
      document.body.style.overflow = '';
    };
  }, [ouverte, onFermer]);

  if (!ouverte) return null;

  const largeurs = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-[2px] sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        className={`my-auto w-full ${largeurs[largeur]} overflow-hidden rounded-xl bg-white shadow-2xl`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{titre}</h2>
            {sousTitre && <p className="mt-0.5 text-sm text-slate-500">{sousTitre}</p>}
          </div>
          <BoutonIcone libelle="Fermer" onClick={onFermer}>
            <X className="size-4" />
          </BoutonIcone>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {pied && <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{pied}</footer>}
      </div>
    </div>
  );
}

/** Panneau latéral, pour consulter un détail sans quitter la liste. */
export function Panneau({
  ouvert,
  onFermer,
  titre,
  sousTitre,
  children,
  pied,
}: {
  ouvert: boolean;
  onFermer: () => void;
  titre: string;
  sousTitre?: ReactNode;
  children: ReactNode;
  pied?: ReactNode;
}) {
  useEffect(() => {
    if (!ouvert) return;
    const onTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer();
    };
    document.addEventListener('keydown', onTouche);
    return () => document.removeEventListener('keydown', onTouche);
  }, [ouvert, onFermer]);

  if (!ouvert) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onFermer}>
      <aside
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">{titre}</h2>
            {sousTitre && <div className="mt-0.5 text-sm text-slate-500">{sousTitre}</div>}
          </div>
          <BoutonIcone libelle="Fermer" onClick={onFermer}>
            <X className="size-4" />
          </BoutonIcone>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {pied && <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{pied}</footer>}
      </aside>
    </div>
  );
}
