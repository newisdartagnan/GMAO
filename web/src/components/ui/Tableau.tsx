import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Inbox } from 'lucide-react';
import { Bouton } from './Bouton';
import { telecharger, versCSV } from '@/data/persistance';

export interface Colonne<T> {
  cle: string;
  entete: ReactNode;
  /** Rendu de la cellule. */
  rendu: (ligne: T) => ReactNode;
  /** Valeur utilisée pour le tri ; absente = colonne non triable. */
  tri?: (ligne: T) => string | number;
  /** Valeur exportée en CSV ; par défaut la valeur de tri. */
  export?: (ligne: T) => string | number;
  largeur?: string;
  aDroite?: boolean;
  /** Colonne masquée sous md, pour garder la liste lisible sur tablette. */
  secondaire?: boolean;
}

export function Tableau<T>({
  lignes,
  colonnes,
  cleLigne,
  onClicLigne,
  triInitial,
  parPage = 25,
  vide = 'Aucun élément à afficher',
  nomExport,
  ligneClassName,
  compact = false,
}: {
  lignes: T[];
  colonnes: Colonne<T>[];
  cleLigne: (l: T) => string;
  onClicLigne?: (l: T) => void;
  triInitial?: { cle: string; sens: 'asc' | 'desc' };
  parPage?: number;
  vide?: ReactNode;
  /** Nom du fichier CSV ; absent = pas de bouton d'export. */
  nomExport?: string;
  ligneClassName?: (l: T) => string;
  compact?: boolean;
}) {
  const [tri, setTri] = useState(triInitial ?? null);
  const [page, setPage] = useState(0);

  const triees = useMemo(() => {
    if (!tri) return lignes;
    const col = colonnes.find((c) => c.cle === tri.cle);
    if (!col?.tri) return lignes;
    const facteur = tri.sens === 'asc' ? 1 : -1;
    return [...lignes].sort((a, b) => {
      const va = col.tri!(a);
      const vb = col.tri!(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * facteur;
      return String(va).localeCompare(String(vb), 'fr') * facteur;
    });
  }, [lignes, tri, colonnes]);

  const nbPages = Math.max(1, Math.ceil(triees.length / parPage));
  const pageSure = Math.min(page, nbPages - 1);
  const visibles = triees.slice(pageSure * parPage, (pageSure + 1) * parPage);

  const basculerTri = (cle: string) => {
    setPage(0);
    setTri((t) => (t?.cle === cle ? { cle, sens: t.sens === 'asc' ? 'desc' : 'asc' } : { cle, sens: 'asc' }));
  };

  const exporter = () => {
    const donnees = triees.map((l) => {
      const o: Record<string, unknown> = {};
      for (const c of colonnes) {
        const v = c.export?.(l) ?? c.tri?.(l);
        if (v !== undefined) o[typeof c.entete === 'string' ? c.entete : c.cle] = v;
      }
      return o;
    });
    telecharger(`${nomExport}.csv`, versCSV(donnees), 'text/csv');
  };

  if (!lignes.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
        <Inbox className="size-8 text-slate-300" />
        <p className="text-sm text-slate-500">{vide}</p>
      </div>
    );
  }

  const padding = compact ? 'px-3 py-1.5' : 'px-3 py-2.5';

  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200">
              {colonnes.map((c) => (
                <th
                  key={c.cle}
                  style={c.largeur ? { width: c.largeur } : undefined}
                  className={`${padding} text-left text-xs font-semibold tracking-wide text-slate-500 uppercase ${
                    c.aDroite ? 'text-right' : ''
                  } ${c.secondaire ? 'hidden lg:table-cell' : ''}`}
                >
                  {c.tri ? (
                    <button
                      type="button"
                      onClick={() => basculerTri(c.cle)}
                      className={`inline-flex items-center gap-1 hover:text-slate-800 ${c.aDroite ? 'flex-row-reverse' : ''}`}
                    >
                      {c.entete}
                      {tri?.cle === c.cle ? (
                        tri.sens === 'asc' ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3 text-slate-300" />
                      )}
                    </button>
                  ) : (
                    c.entete
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map((l) => (
              <tr
                key={cleLigne(l)}
                onClick={onClicLigne ? () => onClicLigne(l) : undefined}
                className={`${onClicLigne ? 'ligne-cliquable' : ''} ${ligneClassName?.(l) ?? ''}`}
              >
                {colonnes.map((c) => (
                  <td
                    key={c.cle}
                    className={`${padding} align-middle text-slate-700 ${c.aDroite ? 'text-right tabulaire' : ''} ${
                      c.secondaire ? 'hidden lg:table-cell' : ''
                    }`}
                  >
                    {c.rendu(l)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
        <span className="tabulaire">
          {triees.length.toLocaleString('fr-FR')} ligne{triees.length > 1 ? 's' : ''}
          {nbPages > 1 && ` — page ${pageSure + 1} sur ${nbPages}`}
        </span>
        <div className="flex items-center gap-2">
          {nomExport && (
            <Bouton taille="sm" variante="fantome" onClick={exporter}>
              <Download className="size-3.5" /> CSV
            </Bouton>
          )}
          {nbPages > 1 && (
            <div className="flex items-center gap-1">
              <Bouton taille="sm" variante="secondaire" disabled={pageSure === 0} onClick={() => setPage(pageSure - 1)}>
                Précédent
              </Bouton>
              <Bouton
                taille="sm"
                variante="secondaire"
                disabled={pageSure >= nbPages - 1}
                onClick={() => setPage(pageSure + 1)}
              >
                Suivant
              </Bouton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
