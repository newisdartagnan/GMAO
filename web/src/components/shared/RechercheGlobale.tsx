import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boxes, ClipboardList, FileText, Gauge, Inbox, Search, Users } from 'lucide-react';
import { useGMAO } from '@/data/store';
import { normaliser } from '@gmao/partage';

interface Resultat {
  id: string;
  categorie: string;
  titre: string;
  detail: string;
  chemin: string;
  icone: React.ReactNode;
}

const LIMITE_PAR_CATEGORIE = 5;

export function RechercheGlobale({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const { base, index } = useGMAO();
  const [terme, setTerme] = useState('');
  const [selection, setSelection] = useState(0);
  const naviguer = useNavigate();

  useEffect(() => {
    if (ouverte) {
      setTerme('');
      setSelection(0);
    }
  }, [ouverte]);

  // Le raccourci « / » ouvre la recherche depuis n'importe quel écran.
  useEffect(() => {
    const onTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ouverte) onFermer();
    };
    document.addEventListener('keydown', onTouche);
    return () => document.removeEventListener('keydown', onTouche);
  }, [ouverte, onFermer]);

  const resultats = useMemo<Resultat[]>(() => {
    const q = normaliser(terme);
    if (q.length < 2) return [];
    const out: Resultat[] = [];

    for (const e of base.equipements) {
      if (out.filter((r) => r.categorie === 'Équipements').length >= LIMITE_PAR_CATEGORIE) break;
      if (
        normaliser(e.code).includes(q) ||
        normaliser(e.designation).includes(q) ||
        normaliser(`${e.marque} ${e.modele}`).includes(q) ||
        normaliser(e.numeroSerie).includes(q)
      ) {
        out.push({
          id: e.id,
          categorie: 'Équipements',
          titre: `${e.code} — ${e.designation}`,
          detail: `${e.marque} ${e.modele} · ${index.services.get(e.serviceId)?.nom ?? ''}`,
          chemin: `/equipements/${e.id}`,
          icone: <Gauge className="size-4" />,
        });
      }
    }

    for (const o of base.ordresTravail) {
      if (out.filter((r) => r.categorie === 'Ordres de travail').length >= LIMITE_PAR_CATEGORIE) break;
      if (normaliser(o.numero).includes(q) || normaliser(o.objet).includes(q)) {
        out.push({
          id: o.id,
          categorie: 'Ordres de travail',
          titre: `${o.numero} — ${o.objet}`,
          detail: `${o.type} · ${o.statut.replace(/_/g, ' ')}`,
          chemin: `/ordres-travail/${o.id}`,
          icone: <ClipboardList className="size-4" />,
        });
      }
    }

    for (const a of base.articles) {
      if (out.filter((r) => r.categorie === 'Articles').length >= LIMITE_PAR_CATEGORIE) break;
      if (normaliser(a.code).includes(q) || normaliser(a.designation).includes(q)) {
        out.push({
          id: a.id,
          categorie: 'Articles',
          titre: `${a.code} — ${a.designation}`,
          detail: `${a.stockActuel} ${a.unite} en stock`,
          chemin: '/stocks',
          icone: <Boxes className="size-4" />,
        });
      }
    }

    for (const d of base.demandes) {
      if (out.filter((r) => r.categorie === 'Demandes').length >= 3) break;
      if (normaliser(d.numero).includes(q) || normaliser(d.objet).includes(q)) {
        out.push({
          id: d.id,
          categorie: 'Demandes',
          titre: `${d.numero} — ${d.objet}`,
          detail: index.services.get(d.serviceId)?.nom ?? '',
          chemin: '/demandes',
          icone: <Inbox className="size-4" />,
        });
      }
    }

    for (const f of base.fournisseurs) {
      if (out.filter((r) => r.categorie === 'Fournisseurs').length >= 3) break;
      if (normaliser(f.raisonSociale).includes(q) || normaliser(f.code).includes(q)) {
        out.push({
          id: f.id,
          categorie: 'Fournisseurs',
          titre: f.raisonSociale,
          detail: f.types.map((t) => t.replace(/_/g, ' ')).join(', '),
          chemin: '/contrats',
          icone: <Users className="size-4" />,
        });
      }
    }

    for (const c of base.contrats) {
      if (out.filter((r) => r.categorie === 'Contrats').length >= 3) break;
      if (normaliser(c.numero).includes(q) || normaliser(c.libelle).includes(q)) {
        out.push({
          id: c.id,
          categorie: 'Contrats',
          titre: `${c.numero} — ${c.libelle}`,
          detail: index.fournisseurs.get(c.fournisseurId)?.raisonSociale ?? '',
          chemin: '/contrats',
          icone: <FileText className="size-4" />,
        });
      }
    }

    return out;
  }, [terme, base, index]);

  if (!ouverte) return null;

  const ouvrir = (r: Resultat) => {
    naviguer(r.chemin);
    onFermer();
  };

  const categories = [...new Set(resultats.map((r) => r.categorie))];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-[10vh] backdrop-blur-[2px]" onClick={onFermer}>
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <Search className="size-5 shrink-0 text-slate-400" />
          <input
            autoFocus
            value={terme}
            onChange={(e) => {
              setTerme(e.target.value);
              setSelection(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelection((s) => Math.min(s + 1, resultats.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelection((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter' && resultats[selection]) {
                ouvrir(resultats[selection]);
              }
            }}
            placeholder="Code d’inventaire, numéro d’OT, désignation, fournisseur…"
            className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {terme.length < 2 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Saisissez au moins deux caractères pour lancer la recherche.
            </p>
          ) : resultats.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Aucun résultat pour « {terme} ».
            </p>
          ) : (
            categories.map((cat) => (
              <div key={cat}>
                <p className="bg-slate-50 px-4 py-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  {cat}
                </p>
                {resultats
                  .filter((r) => r.categorie === cat)
                  .map((r) => {
                    const i = resultats.indexOf(r);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onMouseEnter={() => setSelection(i)}
                        onClick={() => ouvrir(r)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                          i === selection ? 'bg-marque-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-slate-400">{r.icone}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-800">{r.titre}</span>
                          <span className="block truncate text-xs text-slate-500">{r.detail}</span>
                        </span>
                      </button>
                    );
                  })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          <span>↑ ↓ pour naviguer</span>
          <span>↵ pour ouvrir</span>
          <span>Échap pour fermer</span>
        </div>
      </div>
    </div>
  );
}
