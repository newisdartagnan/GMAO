/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  Article,
  Batiment,
  BaseGMAO,
  Contrat,
  Equipe,
  Equipement,
  FamilleEquipement,
  Fournisseur,
  GammeMaintenance,
  ID,
  Local,
  Magasin,
  ModeleInspection,
  ServiceHospitalier,
  Site,
  Utilisateur,
} from '@gmao/partage';
import { appliquerPatch, calculerAlertes } from '@gmao/partage';
import type { AlerteCalculee } from '@gmao/partage';
import { ErreurApi, api, ecrireJeton, lireJeton } from './api';
import type { ReponseCommande } from './api';
import { ecrireCache, lireCache, viderCache } from './persistance';

/** Index par identifiant, pour éviter les `find` en O(n) dans les rendus. */
export interface IndexGMAO {
  sites: Map<ID, Site>;
  batiments: Map<ID, Batiment>;
  services: Map<ID, ServiceHospitalier>;
  locaux: Map<ID, Local>;
  utilisateurs: Map<ID, Utilisateur>;
  equipes: Map<ID, Equipe>;
  fournisseurs: Map<ID, Fournisseur>;
  familles: Map<ID, FamilleEquipement>;
  equipements: Map<ID, Equipement>;
  contrats: Map<ID, Contrat>;
  gammes: Map<ID, GammeMaintenance>;
  articles: Map<ID, Article>;
  magasins: Map<ID, Magasin>;
  modelesInspection: Map<ID, ModeleInspection>;
}

export interface ContexteGMAO {
  base: BaseGMAO;
  index: IndexGMAO;
  alertes: AlerteCalculee[];
  utilisateur: Utilisateur;
  /** L'état vient du cache local : consultation seule, écriture impossible. */
  horsLigne: boolean;
  dateInstantane: string | null;
  /**
   * Exécute une écriture sur le serveur et applique le patch renvoyé.
   * Toute la logique de droits et de cohérence est vérifiée côté API : c'est
   * le serveur qui décide, l'interface se contente de refléter sa réponse.
   */
  commander: <T>(appel: () => Promise<ReponseCommande<T>>) => Promise<T>;
  rafraichir: () => Promise<void>;
  deconnexion: () => void;
  /** Dernière erreur d'écriture, à afficher puis effacer. */
  erreur: string | null;
  effacerErreur: () => void;
  ecritureEnCours: boolean;
}

const Contexte = createContext<ContexteGMAO | null>(null);

function construireIndex(base: BaseGMAO): IndexGMAO {
  const m = <T extends { id: ID }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]));
  return {
    sites: m(base.sites),
    batiments: m(base.batiments),
    services: m(base.services),
    locaux: m(base.locaux),
    utilisateurs: m(base.utilisateurs),
    equipes: m(base.equipes),
    fournisseurs: m(base.fournisseurs),
    familles: m(base.familles),
    equipements: m(base.equipements),
    contrats: m(base.contrats),
    gammes: m(base.gammes),
    articles: m(base.articles),
    magasins: m(base.magasins),
    modelesInspection: m(base.modelesInspection),
  };
}

export function FournisseurGMAO({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<BaseGMAO | null>(null);
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [chargement, setChargement] = useState(true);
  const [horsLigne, setHorsLigne] = useState(false);
  const [dateInstantane, setDateInstantane] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ecritureEnCours, setEcritureEnCours] = useState(false);
  const [erreurConnexion, setErreurConnexion] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const [{ utilisateur: profil }, instantane] = await Promise.all([api.moi(), api.snapshot()]);
      setUtilisateur(profil);
      setBase(instantane);
      setHorsLigne(false);
      setDateInstantane(new Date().toISOString());
      void ecrireCache(instantane);
    } catch (e) {
      if (e instanceof ErreurApi && (e.statut === 401 || e.statut === 403)) {
        ecrireJeton(null);
        setUtilisateur(null);
        setBase(null);
      } else {
        // Serveur injoignable : on ouvre en consultation sur le dernier
        // instantané connu plutôt que d'afficher une page blanche.
        const cache = await lireCache();
        if (cache) {
          setBase(cache.base);
          setDateInstantane(cache.date);
          setHorsLigne(true);
          const jeton = lireJeton();
          if (jeton) {
            const sub = JSON.parse(atob(jeton.split('.')[1] ?? 'e30=')).sub as string | undefined;
            setUtilisateur(cache.base.utilisateurs.find((u) => u.id === sub) ?? cache.base.utilisateurs[0]);
          }
        } else {
          setErreurConnexion(e instanceof Error ? e.message : 'Serveur injoignable');
        }
      }
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    if (lireJeton()) void charger();
    else setChargement(false);
  }, [charger]);

  const commander = useCallback(async <T,>(appel: () => Promise<ReponseCommande<T>>): Promise<T> => {
    setEcritureEnCours(true);
    setErreur(null);
    try {
      const { resultat, patch } = await appel();
      setBase((precedent) => {
        if (!precedent) return precedent;
        const suivant = appliquerPatch(precedent, patch);
        void ecrireCache(suivant);
        return suivant;
      });
      return resultat;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Écriture impossible';
      setErreur(message);
      if (e instanceof ErreurApi && e.statut === 401) {
        ecrireJeton(null);
        setUtilisateur(null);
      }
      throw e;
    } finally {
      setEcritureEnCours(false);
    }
  }, []);

  const deconnexion = useCallback(() => {
    api.deconnexion();
    void viderCache();
    setUtilisateur(null);
    setBase(null);
  }, []);

  const index = useMemo(() => (base ? construireIndex(base) : null), [base]);
  const alertes = useMemo(() => (base ? calculerAlertes(base) : []), [base]);

  const valeur = useMemo<ContexteGMAO | null>(() => {
    if (!base || !index || !utilisateur) return null;
    return {
      base,
      index,
      alertes,
      utilisateur,
      horsLigne,
      dateInstantane,
      commander,
      rafraichir: charger,
      deconnexion,
      erreur,
      effacerErreur: () => setErreur(null),
      ecritureEnCours,
    };
  }, [base, index, alertes, utilisateur, horsLigne, dateInstantane, commander, charger, deconnexion, erreur, ecritureEnCours]);

  if (chargement) return <EcranChargement />;
  if (!valeur) {
    return (
      <EcranConnexion
        erreurInitiale={erreurConnexion}
        onConnecte={async () => {
          setErreurConnexion(null);
          await charger();
        }}
      />
    );
  }

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

function EcranChargement() {
  return (
    <div className="flex h-dvh items-center justify-center bg-slate-100 text-slate-500">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-marque-600 border-t-transparent" />
        <p className="text-sm">Chargement de la base GMAO…</p>
      </div>
    </div>
  );
}

function EcranConnexion({
  onConnecte,
  erreurInitiale,
}: {
  onConnecte: () => Promise<void>;
  erreurInitiale: string | null;
}) {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(erreurInitiale);
  const [enCours, setEnCours] = useState(false);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setEnCours(true);
          setErreur(null);
          try {
            await api.connexion(email.trim(), motDePasse);
            await onConnecte();
          } catch (err) {
            setErreur(err instanceof Error ? err.message : 'Connexion impossible');
          } finally {
            setEnCours(false);
          }
        }}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-marque-700 text-white">
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
              <path d="M10 2h4v6h6v4h-6v10h-4V12H4V8h6z" />
            </svg>
          </span>
          <div>
            <h1 className="text-base font-semibold text-slate-900">GMAO Hospitalière</h1>
            <p className="text-xs text-slate-500">Service technique et biomédical</p>
          </div>
        </div>

        <label className="etiquette-champ" htmlFor="email">
          Adresse électronique
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="champ mb-4"
          placeholder="prenom.nom@hgr-kinshasa.cd"
        />

        <label className="etiquette-champ" htmlFor="mdp">
          Mot de passe
        </label>
        <input
          id="mdp"
          type="password"
          autoComplete="current-password"
          required
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          className="champ"
        />

        {erreur && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {erreur}
          </p>
        )}

        <button
          type="submit"
          disabled={enCours || !email || !motDePasse}
          className="mt-5 flex h-10 w-full items-center justify-center rounded-lg bg-marque-700 text-sm font-medium text-white transition-colors hover:bg-marque-800 disabled:opacity-60"
        >
          {enCours ? 'Connexion…' : 'Se connecter'}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          En cas d’oubli, l’administrateur du système réinitialise le mot de passe.
        </p>
      </form>
    </div>
  );
}

export function useGMAO(): ContexteGMAO {
  const c = useContext(Contexte);
  if (!c) throw new Error('useGMAO doit être utilisé dans <FournisseurGMAO>');
  return c;
}
