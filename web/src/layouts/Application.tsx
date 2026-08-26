import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, ScanLine, Search, WifiOff, X } from 'lucide-react';
import { NAVIGATION } from './navigation';
import { useGMAO } from '@/data/store';
import { compterAlertes } from '@gmao/partage';
import { estEnRetard, estOuvert } from '@gmao/partage';
import { Avatar } from '@/components/shared/Liens';
import { ROLE, aujourdHui, dateHeure, iso, statutEffectif } from '@gmao/partage';
import { RechercheGlobale } from '@/components/shared/RechercheGlobale';

export function Application() {
  const { base, alertes, utilisateur, horsLigne, dateInstantane, deconnexion, erreur, effacerErreur, rafraichir } = useGMAO();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  const [selecteurOuvert, setSelecteurOuvert] = useState(false);
  const emplacement = useLocation();

  const compteurs = useMemo(() => {
    const c = compterAlertes(alertes);
    return {
      demandes: base.demandes.filter((d) => d.statut === 'nouvelle' || d.statut === 'en_analyse').length,
      otOuverts: base.ordresTravail.filter(estOuvert).length,
      otRetard: base.ordresTravail.filter(estEnRetard).length,
      alertes: c.critiques + c.alertes,
      stockBas: base.articles.filter((a) => a.actif && a.stockActuel <= a.stockMin).length,
      reglementaireEchu: alertes.filter((a) => a.source === 'echeance_reglementaire' && (a.jours ?? 0) < 0).length,
      vigilances: base.vigilances.filter((v) => v.statut !== 'clos').length,
      rondesAFaire: base.rondes.filter(
        (r) => r.date === iso(aujourdHui()) && statutEffectif(base, r) !== 'terminee',
      ).length,
    };
  }, [base, alertes]);

  const critiques = alertes.filter((a) => a.niveau === 'critique').length;

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-100">
      {/* Voile de fermeture du menu sur mobile */}
      {menuOuvert && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setMenuOuvert(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          menuOuvert ? 'translate-x-0' : '-translate-x-full'
        } sans-impression`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-2.5" onClick={() => setMenuOuvert(false)}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-marque-700 text-white">
              <svg viewBox="0 0 24 24" className="size-4.5" fill="currentColor" aria-hidden>
                <path d="M10 2h4v6h6v4h-6v10h-4V12H4V8h6z" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-900">GMAO Hospitalière</span>
              <span className="block truncate text-[11px] text-slate-500">{base.sites[0].code}</span>
            </span>
          </Link>
          <button
            type="button"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setMenuOuvert(false)}
            aria-label="Fermer le menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {NAVIGATION.map((groupe) => (
            <div key={groupe.titre} className="mb-4">
              <p className="mb-1 px-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                {groupe.titre}
              </p>
              <ul className="space-y-0.5">
                {groupe.entrees.map((e) => {
                  const compteur = e.compteur ? compteurs[e.compteur] : 0;
                  return (
                    <li key={e.chemin}>
                      <NavLink
                        to={e.chemin}
                        end={e.chemin === '/'}
                        onClick={() => setMenuOuvert(false)}
                        title={e.description}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                            isActive
                              ? 'bg-marque-50 font-medium text-marque-800'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`
                        }
                      >
                        <e.icone className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{e.libelle}</span>
                        {compteur > 0 && (
                          <span
                            className={`tabulaire shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                              e.compteur === 'reglementaireEchu' || e.compteur === 'otRetard'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {compteur > 999 ? '999+' : compteur}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-slate-200 p-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSelecteurOuvert((v) => !v)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
            >
              <Avatar nom={utilisateur.nom} prenom={utilisateur.prenom} taille="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {utilisateur.prenom} {utilisateur.nom}
                </span>
                <span className="block truncate text-xs text-slate-500">{ROLE[utilisateur.role]}</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-slate-400" />
            </button>
            {selecteurOuvert && (
              <div className="absolute bottom-full left-0 mb-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <div className="border-b border-slate-100 px-3 py-2">
                  <p className="truncate text-xs text-slate-500">{utilisateur.email}</p>
                  <p className="text-[11px] text-slate-400">Matricule {utilisateur.matricule}</p>
                </div>
                <Link
                  to="/parametres"
                  onClick={() => setSelecteurOuvert(false)}
                  className="block px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  Changer mon mot de passe
                </Link>
                <button
                  type="button"
                  onClick={deconnexion}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                >
                  <LogOut className="size-4" /> Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sans-impression">
          <button
            type="button"
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setMenuOuvert(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu className="size-5" />
          </button>

          <button
            type="button"
            onClick={() => setRechercheOuverte(true)}
            className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400 hover:border-slate-300 hover:bg-white sm:max-w-md"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Rechercher un équipement, un OT, une pièce…</span>
            <kbd className="hidden rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:block">
              /
            </kbd>
          </button>

          <div className="flex-1" />

          <Link
            to="/scan"
            className="hidden h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 sm:flex"
            title="Saisir ou scanner un code d'inventaire"
          >
            <ScanLine className="size-4" />
            Scanner
          </Link>

          <Link
            to="/alertes"
            className="relative flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            title={`${compteurs.alertes} alerte(s) en cours`}
          >
            <Bell className="size-5" />
            {critiques > 0 && (
              <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-rose-600 text-[9px] font-bold text-white tabulaire">
                {critiques > 9 ? '9+' : critiques}
              </span>
            )}
          </Link>
        </header>

        {horsLigne && (
          <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sans-impression">
            <WifiOff className="size-4 shrink-0" />
            <p className="min-w-0 flex-1">
              Serveur injoignable — consultation du dernier état connu
              {dateInstantane ? ` (${dateHeure(dateInstantane)})` : ''}. Aucune saisie n’est possible.
            </p>
            <button type="button" onClick={() => void rafraichir()} className="shrink-0 font-medium underline">
              Réessayer
            </button>
          </div>
        )}

        {erreur && (
          <div className="flex items-center gap-3 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900 sans-impression">
            <p className="min-w-0 flex-1">{erreur}</p>
            <button type="button" onClick={effacerErreur} className="shrink-0 rounded p-1 hover:bg-rose-100">
              <X className="size-4" />
            </button>
          </div>
        )}

        <main key={emplacement.pathname} className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <RechercheGlobale ouverte={rechercheOuverte} onFermer={() => setRechercheOuverte(false)} />
    </div>
  );
}

/** En-tête de page, réutilisé par tous les écrans. */
export function EnTetePage({
  titre,
  description,
  actions,
  retour,
}: {
  titre: string;
  description?: string;
  actions?: React.ReactNode;
  retour?: { to: string; libelle: string };
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
      <div className="min-w-0">
        {retour && (
          <Link to={retour.to} className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-marque-700">
            ← {retour.libelle}
          </Link>
        )}
        <h1 className="truncate text-lg font-semibold text-slate-900">{titre}</h1>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sans-impression">{actions}</div>}
    </div>
  );
}

export function CorpsPage({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`space-y-4 p-4 sm:p-6 ${className}`}>{children}</div>;
}
