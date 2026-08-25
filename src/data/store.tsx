/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  ServiceHospitalier,
  Site,
  Utilisateur,
} from '@/types/domain';
import { chargerBase, effacerBase, enregistrerBase } from './persistance';
import { construireBaseDemo } from './seed';
import { calculerAlertes } from '@/lib/alertes';
import type { AlerteCalculee } from '@/lib/alertes';
import { isoHeure, aujourdHui } from '@/lib/dates';
import { uid } from '@/lib/id';

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
}

export interface ContexteGMAO {
  base: BaseGMAO;
  pret: boolean;
  index: IndexGMAO;
  alertes: AlerteCalculee[];
  utilisateur: Utilisateur;
  changerUtilisateur: (id: ID) => void;
  /**
   * Applique une mutation sur une copie de la base et journalise l'action.
   * Toute écriture passe par ici : c'est ce qui garantit la piste d'audit.
   */
  muter: (
    libelle: string,
    fn: (b: BaseGMAO) => void,
    trace?: { action: AuditAction; entiteType: string; entiteId: ID; details?: string },
  ) => void;
  remplacerBase: (b: BaseGMAO) => void;
  reinitialiser: () => Promise<void>;
}

type AuditAction = 'creation' | 'modification' | 'suppression' | 'validation' | 'cloture' | 'connexion' | 'export' | 'generation';

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
  };
}

const CLE_UTILISATEUR = 'gmao.utilisateur';

export function FournisseurGMAO({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<BaseGMAO | null>(null);
  const [utilisateurId, setUtilisateurId] = useState<ID | null>(null);
  const sauvegardeEnAttente = useRef<number | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      const existante = await chargerBase();
      const b = existante ?? construireBaseDemo();
      if (annule) return;
      setBase(b);
      if (!existante) void enregistrerBase(b);
      const memorise = localStorage.getItem(CLE_UTILISATEUR);
      const trouve = b.utilisateurs.find((u) => u.id === memorise && u.actif);
      setUtilisateurId(trouve?.id ?? b.utilisateurs.find((u) => u.role === 'responsable_biomedical')?.id ?? b.utilisateurs[0].id);
    })();
    return () => {
      annule = true;
    };
  }, []);

  /** Sauvegarde différée : on n'écrit dans IndexedDB qu'après une accalmie. */
  const planifierSauvegarde = useCallback((b: BaseGMAO) => {
    if (sauvegardeEnAttente.current) window.clearTimeout(sauvegardeEnAttente.current);
    sauvegardeEnAttente.current = window.setTimeout(() => {
      void enregistrerBase(b);
    }, 400);
  }, []);

  const muter = useCallback<ContexteGMAO['muter']>(
    (libelle, fn, trace) => {
      setBase((precedent) => {
        if (!precedent) return precedent;
        const copie = structuredClone(precedent) as BaseGMAO;
        fn(copie);
        copie.audit = [
          {
            id: uid('aud'),
            date: isoHeure(aujourdHui()),
            utilisateurId: utilisateurId ?? 'inconnu',
            action: trace?.action ?? 'modification',
            entiteType: trace?.entiteType ?? 'base',
            entiteId: trace?.entiteId ?? '-',
            libelle,
            details: trace?.details,
          },
          ...copie.audit,
        ].slice(0, 4000);
        planifierSauvegarde(copie);
        return copie;
      });
    },
    [planifierSauvegarde, utilisateurId],
  );

  const remplacerBase = useCallback(
    (b: BaseGMAO) => {
      setBase(b);
      void enregistrerBase(b);
      if (!b.utilisateurs.some((u) => u.id === utilisateurId)) setUtilisateurId(b.utilisateurs[0]?.id ?? null);
    },
    [utilisateurId],
  );

  const reinitialiser = useCallback(async () => {
    await effacerBase();
    const b = construireBaseDemo();
    setBase(b);
    setUtilisateurId(b.utilisateurs.find((u) => u.role === 'responsable_biomedical')?.id ?? b.utilisateurs[0].id);
    await enregistrerBase(b);
  }, []);

  const changerUtilisateur = useCallback((id: ID) => {
    setUtilisateurId(id);
    localStorage.setItem(CLE_UTILISATEUR, id);
  }, []);

  const index = useMemo(() => (base ? construireIndex(base) : null), [base]);
  const alertes = useMemo(() => (base ? calculerAlertes(base) : []), [base]);

  const valeur = useMemo<ContexteGMAO | null>(() => {
    if (!base || !index || !utilisateurId) return null;
    const utilisateur = index.utilisateurs.get(utilisateurId) ?? base.utilisateurs[0];
    return { base, pret: true, index, alertes, utilisateur, changerUtilisateur, muter, remplacerBase, reinitialiser };
  }, [base, index, alertes, utilisateurId, changerUtilisateur, muter, remplacerBase, reinitialiser]);

  if (!valeur) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50 text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
          <p className="text-sm">Chargement de la base GMAO…</p>
        </div>
      </div>
    );
  }

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useGMAO(): ContexteGMAO {
  const c = useContext(Contexte);
  if (!c) throw new Error('useGMAO doit être utilisé dans <FournisseurGMAO>');
  return c;
}
