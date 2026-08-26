import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { List, Plus } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Bouton } from '@/components/ui/Bouton';
import { Badge } from '@/components/ui/Badge';
import { Segments } from '@/components/ui/Champs';
import { Indicateur } from '@/components/ui/Indicateur';
import { BarreFiltres } from '@/components/shared/Filtres';
import {
  BadgePriorite,
  BadgeStatutOT,
  BadgeTypeMaintenance,
} from '@/components/shared/Etiquettes';
import { LienEquipement, NomUtilisateur } from '@/components/shared/Liens';
import { ModaleCreationOT } from './EquipementDetail';
import { useGMAO } from '@/data/store';
import { activite, coutTotal, estEnRetard, estOuvert, estTermine, tempsPasseMin } from '@gmao/partage';
import { dateCourte, echeanceRelative } from '@gmao/partage';
import { duree, montant, nombre, normaliser, pourcent } from '@gmao/partage';
import { PRIORITE, STATUT_OT, TYPE_MAINTENANCE } from '@gmao/partage';
import type { OrdreTravail, StatutOT } from '@gmao/partage';

const COLONNES_KANBAN: StatutOT[] = ['a_planifier', 'planifie', 'affecte', 'en_cours', 'attente_pieces', 'attente_prestataire'];

export function PageOrdresTravail() {
  const { base, index } = useGMAO();
  const naviguer = useNavigate();
  const [params, setParams] = useSearchParams();
  const [recherche, setRecherche] = useState('');
  const [vue, setVue] = useState<'liste' | 'kanban'>('liste');
  const [perimetre, setPerimetre] = useState<'ouverts' | 'retard' | 'tous' | 'mois'>('ouverts');
  const [creation, setCreation] = useState(false);

  const lire = (cle: string) => params.get(cle) ?? '';
  const ecrire = (cle: string) => (v: string) => {
    const suivant = new URLSearchParams(params);
    if (v) suivant.set(cle, v);
    else suivant.delete(cle);
    setParams(suivant, { replace: true });
  };

  const filtres = useMemo(() => {
    const q = normaliser(recherche);
    const type = params.get('type') ?? '';
    const priorite = params.get('priorite') ?? '';
    const statut = params.get('statut') ?? '';
    const equipeId = params.get('equipe') ?? '';
    const serviceId = params.get('service') ?? '';
    const execution = params.get('execution') ?? '';
    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);

    return base.ordresTravail.filter((o) => {
      if (perimetre === 'ouverts' && !estOuvert(o)) return false;
      if (perimetre === 'retard' && !estEnRetard(o)) return false;
      if (perimetre === 'mois' && o.dateCreation < debutMois.toISOString().slice(0, 10)) return false;
      if (type && o.type !== type) return false;
      if (priorite && o.priorite !== priorite) return false;
      if (statut && o.statut !== statut) return false;
      if (equipeId && o.equipeId !== equipeId) return false;
      if (serviceId && o.serviceId !== serviceId) return false;
      if (execution && o.execution !== execution) return false;
      if (q) {
        const eq = o.equipementId ? index.equipements.get(o.equipementId) : undefined;
        if (!normaliser(`${o.numero} ${o.objet} ${o.description} ${eq?.code ?? ''} ${eq?.designation ?? ''}`).includes(q))
          return false;
      }
      return true;
    });
  }, [base.ordresTravail, index, recherche, params, perimetre]);

  const stats = useMemo(() => activite(base.ordresTravail), [base.ordresTravail]);
  const nbOuverts = base.ordresTravail.filter(estOuvert).length;
  const nbRetard = base.ordresTravail.filter(estEnRetard).length;

  const colonnes: Colonne<OrdreTravail>[] = [
    {
      cle: 'numero',
      entete: 'N°',
      largeur: '125px',
      tri: (o) => o.numero,
      rendu: (o) => (
        <span className="font-mono text-xs text-slate-600">
          {o.numero}
          {estEnRetard(o) && <span className="ml-1 text-rose-600">•</span>}
        </span>
      ),
    },
    {
      cle: 'objet',
      entete: 'Objet',
      tri: (o) => o.objet,
      rendu: (o) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{o.objet}</p>
          <p className="truncate text-xs text-slate-500">
            <LienEquipement id={o.equipementId} /> · {index.services.get(o.serviceId)?.nom}
          </p>
        </div>
      ),
    },
    {
      cle: 'type',
      entete: 'Type',
      largeur: '125px',
      tri: (o) => o.type,
      export: (o) => TYPE_MAINTENANCE[o.type].libelle,
      rendu: (o) => <BadgeTypeMaintenance type={o.type} compact />,
    },
    {
      cle: 'priorite',
      entete: 'Prio.',
      largeur: '75px',
      tri: (o) => o.priorite,
      rendu: (o) => <BadgePriorite priorite={o.priorite} compact />,
    },
    {
      cle: 'statut',
      entete: 'Statut',
      largeur: '150px',
      tri: (o) => o.statut,
      export: (o) => STATUT_OT[o.statut].libelle,
      rendu: (o) => <BadgeStatutOT statut={o.statut} />,
    },
    {
      cle: 'technicien',
      entete: 'Affecté à',
      largeur: '170px',
      secondaire: true,
      tri: (o) => index.utilisateurs.get(o.technicienPrincipalId ?? '')?.nom ?? 'zzz',
      export: (o) => {
        const u = index.utilisateurs.get(o.technicienPrincipalId ?? '');
        return u ? `${u.prenom} ${u.nom}` : '';
      },
      rendu: (o) =>
        o.execution === 'prestataire' ? (
          <span className="text-xs text-slate-600">{index.fournisseurs.get(o.prestataireId ?? '')?.raisonSociale ?? 'Prestataire'}</span>
        ) : (
          <NomUtilisateur id={o.technicienPrincipalId} />
        ),
    },
    {
      cle: 'echeance',
      entete: 'Échéance',
      largeur: '120px',
      tri: (o) => o.dateEcheanceSLA ?? o.datePlanifiee ?? '',
      export: (o) => o.dateEcheanceSLA ?? o.datePlanifiee ?? '',
      rendu: (o) => {
        const cible = o.dateEcheanceSLA ?? o.datePlanifiee;
        const retard = estEnRetard(o);
        return (
          <div className={retard ? 'text-rose-600' : 'text-slate-600'}>
            <p className="text-xs tabulaire">{dateCourte(cible)}</p>
            {estOuvert(o) && <p className="text-[11px]">{echeanceRelative(cible)}</p>}
          </div>
        );
      },
    },
    {
      cle: 'temps',
      entete: 'Temps',
      largeur: '90px',
      aDroite: true,
      secondaire: true,
      tri: (o) => tempsPasseMin(o),
      export: (o) => tempsPasseMin(o),
      rendu: (o) => (tempsPasseMin(o) ? duree(tempsPasseMin(o)) : '—'),
    },
    {
      cle: 'cout',
      entete: 'Coût',
      largeur: '105px',
      aDroite: true,
      tri: (o) => coutTotal(o),
      export: (o) => Math.round(coutTotal(o)),
      rendu: (o) => (coutTotal(o) ? montant(coutTotal(o)) : '—'),
    },
  ];

  return (
    <>
      <EnTetePage
        titre="Ordres de travail"
        description="Bons d’intervention correctifs, préventifs et réglementaires"
        actions={
          <>
            <Segments
              valeur={vue}
              onChange={setVue}
              taille="sm"
              options={[
                { valeur: 'liste', libelle: 'Liste' },
                { valeur: 'kanban', libelle: 'Kanban' },
              ]}
            />
            <Bouton variante="primaire" onClick={() => setCreation(true)}>
              <Plus className="size-4" /> Nouvel OT
            </Bouton>
          </>
        }
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Indicateur libelle="OT ouverts" valeur={nombre(nbOuverts, 0)} icone={<List className="size-4" />} />
          <Indicateur
            libelle="Hors délai"
            valeur={nombre(nbRetard, 0)}
            accent={nbRetard ? 'negatif' : 'positif'}
            detail="engagement de service dépassé"
          />
          <Indicateur
            libelle="Respect des délais"
            valeur={pourcent(stats.respectSLA, 0)}
            accent={stats.respectSLA >= 90 ? 'positif' : 'attention'}
            detail="correctifs clos dans les temps"
          />
          <Indicateur
            libelle="Respect du planning"
            valeur={pourcent(stats.respectPlanning, 0)}
            accent={stats.respectPlanning >= 85 ? 'positif' : 'attention'}
            detail="préventifs réalisés à la date prévue"
          />
          <Indicateur libelle="Temps passé cumulé" valeur={`${nombre(stats.tempsPasseH, 0)} h`} detail={montant(stats.coutTotal)} />
        </div>

        <Carte sansPadding>
          <div className="space-y-3 border-b border-slate-200 p-4">
            <Segments
              valeur={perimetre}
              onChange={setPerimetre}
              options={[
                { valeur: 'ouverts', libelle: 'En cours', compteur: nbOuverts },
                { valeur: 'retard', libelle: 'Hors délai', compteur: nbRetard },
                { valeur: 'mois', libelle: 'Créés ce mois-ci' },
                { valeur: 'tous', libelle: 'Tous', compteur: base.ordresTravail.length },
              ]}
            />
            <BarreFiltres
              recherche={recherche}
              onRecherche={setRecherche}
              placeholder="Numéro d’OT, objet, équipement…"
              resultats={`${filtres.length} ordre(s) de travail`}
              filtres={[
                {
                  cle: 'type',
                  label: 'Type',
                  valeur: lire('type'),
                  onChange: ecrire('type'),
                  options: Object.entries(TYPE_MAINTENANCE).map(([v, e]) => ({ valeur: v, libelle: e.libelle })),
                },
                {
                  cle: 'priorite',
                  label: 'Priorité',
                  valeur: lire('priorite'),
                  onChange: ecrire('priorite'),
                  options: Object.entries(PRIORITE).map(([v, e]) => ({ valeur: v, libelle: e.libelle })),
                },
                {
                  cle: 'statut',
                  label: 'Statut',
                  valeur: lire('statut'),
                  onChange: ecrire('statut'),
                  options: Object.entries(STATUT_OT).map(([v, e]) => ({ valeur: v, libelle: e.libelle })),
                },
                {
                  cle: 'equipe',
                  label: 'Équipe',
                  valeur: lire('equipe'),
                  onChange: ecrire('equipe'),
                  options: base.equipes.map((e) => ({ valeur: e.id, libelle: e.nom })),
                },
                {
                  cle: 'service',
                  label: 'Service',
                  valeur: lire('service'),
                  onChange: ecrire('service'),
                  options: base.services.map((s) => ({ valeur: s.id, libelle: s.nom })),
                },
                {
                  cle: 'execution',
                  label: 'Exécution',
                  valeur: lire('execution'),
                  onChange: ecrire('execution'),
                  options: [
                    { valeur: 'interne', libelle: 'Interne' },
                    { valeur: 'prestataire', libelle: 'Prestataire' },
                  ],
                },
              ]}
            />
          </div>

          {vue === 'liste' ? (
            <Tableau
              lignes={filtres}
              colonnes={colonnes}
              cleLigne={(o) => o.id}
              onClicLigne={(o) => naviguer(`/ordres-travail/${o.id}`)}
              triInitial={{ cle: 'echeance', sens: 'asc' }}
              parPage={30}
              nomExport="ordres-travail"
              vide="Aucun ordre de travail ne correspond aux critères."
              ligneClassName={(o) => (estEnRetard(o) ? 'bg-rose-50/40' : '')}
            />
          ) : (
            <VueKanban ots={filtres} onOuvrir={(id) => naviguer(`/ordres-travail/${id}`)} />
          )}
        </Carte>
      </CorpsPage>

      <ModaleCreationOT ouverte={creation} onFermer={() => setCreation(false)} />
    </>
  );
}

function VueKanban({ ots, onOuvrir }: { ots: OrdreTravail[]; onOuvrir: (id: string) => void }) {
  const { index } = useGMAO();
  const termines = ots.filter(estTermine);

  return (
    <div className="flex gap-3 overflow-x-auto p-4">
      {[...COLONNES_KANBAN, 'termines' as const].map((cle) => {
        const liste =
          cle === 'termines' ? termines : ots.filter((o) => o.statut === cle);
        const titre = cle === 'termines' ? 'Réalisés / clôturés' : STATUT_OT[cle].libelle;
        return (
          <div key={cle} className="flex w-72 shrink-0 flex-col rounded-lg bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase">{titre}</p>
              <span className="tabulaire rounded-full bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                {liste.length}
              </span>
            </div>
            <div className="max-h-[60vh] min-h-24 space-y-2 overflow-y-auto p-2">
              {liste.slice(0, 40).map((o) => {
                const retard = estEnRetard(o);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onOuvrir(o.id)}
                    className={`w-full rounded-lg border bg-white p-2.5 text-left shadow-sm transition-shadow hover:shadow-md ${
                      retard ? 'border-rose-300' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-slate-500">{o.numero}</span>
                      <BadgePriorite priorite={o.priorite} compact />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-800">{o.objet}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {o.equipementId ? index.equipements.get(o.equipementId)?.code : '—'} ·{' '}
                      {index.services.get(o.serviceId)?.nom}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <BadgeTypeMaintenance type={o.type} compact />
                      {retard ? (
                        <Badge ton="danger" compact>
                          hors délai
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-slate-400">{echeanceRelative(o.dateEcheanceSLA ?? o.datePlanifiee)}</span>
                      )}
                    </div>
                  </button>
                );
              })}
              {liste.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">Rien à afficher</p>}
              {liste.length > 40 && (
                <p className="px-2 py-2 text-center text-xs text-slate-400">+ {liste.length - 40} autres</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
