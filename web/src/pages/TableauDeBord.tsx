import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  Clock,
  Gauge,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Wrench,
} from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Indicateur, Jauge } from '@/components/ui/Indicateur';
import { Badge } from '@/components/ui/Badge';
import { ListeAlertes } from '@/components/shared/Alertes';
import { BadgeCriticite, BadgePriorite, BadgeStatutOT } from '@/components/shared/Etiquettes';
import { LienEquipement } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import {
  activite,
  conformite,
  coutTotal,
  echeancierPreventif,
  estEnRetard,
  estOuvert,
  fiabilite,
  palmaresEquipements,
  serieMensuelle,
} from '@gmao/partage';
import { dateCourte, echeanceRelative, toDate } from '@gmao/partage';
import { heures, montant, nombre, pourcent } from '@gmao/partage';
import { STATUT_EQUIPEMENT } from '@gmao/partage';

const COULEURS_STATUT: Record<string, string> = {
  en_service: '#10b981',
  en_panne: '#f43f5e',
  en_maintenance: '#f59e0b',
  attente_pieces: '#fb923c',
  en_pret: '#38bdf8',
  en_stock: '#94a3b8',
  reforme: '#64748b',
};

export function TableauDeBord() {
  const { base, alertes } = useGMAO();

  const stats = useMemo(() => {
    const parcActif = base.equipements.filter((e) => e.statut !== 'reforme');
    const vitaux = parcActif.filter((e) => e.criticite === 1);
    const vitauxIndispo = vitaux.filter((e) => e.statut === 'en_panne' || e.statut === 'attente_pieces');

    const act = activite(base.ordresTravail);
    const fiab = fiabilite(parcActif, base.ordresTravail, 365);
    const conf = conformite(base);

    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    const otDuMois = base.ordresTravail.filter((o) => (toDate(o.dateCreation)?.getTime() ?? 0) >= debutMois.getTime());
    const coutMois = otDuMois.reduce((s, o) => s + coutTotal(o), 0);

    // Comparaison à période équivalente : du 1er au même quantième du mois
    // précédent, sans quoi un mois en cours paraît toujours en effondrement.
    const debutMoisPrecedent = new Date(debutMois);
    debutMoisPrecedent.setMonth(debutMoisPrecedent.getMonth() - 1);
    const finPeriodeComparable = new Date(debutMoisPrecedent);
    finPeriodeComparable.setDate(Math.min(new Date().getDate(), 28));
    const otMoisPrecedent = base.ordresTravail.filter((o) => {
      const t = toDate(o.dateCreation)?.getTime() ?? 0;
      return t >= debutMoisPrecedent.getTime() && t < finPeriodeComparable.getTime();
    });
    const coutMoisPrecedent = otMoisPrecedent.reduce((s, o) => s + coutTotal(o), 0);

    const repartitionStatut = Object.entries(
      parcActif.reduce<Record<string, number>>((acc, e) => {
        acc[e.statut] = (acc[e.statut] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([statut, valeur]) => ({
      statut,
      nom: STATUT_EQUIPEMENT[statut as keyof typeof STATUT_EQUIPEMENT].libelle,
      valeur,
    }));

    const serie = serieMensuelle(base.ordresTravail, 12);

    const coutParDomaine = Object.entries(
      base.ordresTravail.reduce<Record<string, number>>((acc, o) => {
        const eq = o.equipementId ? base.equipements.find((e) => e.id === o.equipementId) : undefined;
        const d = eq?.domaine ?? 'autre';
        acc[d] = (acc[d] ?? 0) + coutTotal(o);
        return acc;
      }, {}),
    )
      .map(([domaine, valeur]) => ({
        domaine: domaine.replace(/_/g, ' '),
        valeur: Math.round(valeur),
      }))
      .sort((a, b) => b.valeur - a.valeur);

    return {
      parcActif,
      vitaux,
      vitauxIndispo,
      act,
      fiab,
      conf,
      coutMois,
      variationCout: coutMoisPrecedent ? ((coutMois - coutMoisPrecedent) / coutMoisPrecedent) * 100 : 0,
      repartitionStatut,
      serie,
      coutParDomaine,
    };
  }, [base]);

  const preventifProche = useMemo(() => echeancierPreventif(base, 14).slice(0, 8), [base]);
  const otUrgents = useMemo(
    () =>
      base.ordresTravail
        .filter((o) => estOuvert(o) && (o.priorite === 'P1' || o.priorite === 'P2'))
        .sort((a, b) => (a.dateEcheanceSLA ?? '').localeCompare(b.dateEcheanceSLA ?? ''))
        .slice(0, 7),
    [base],
  );
  const palmares = useMemo(() => palmaresEquipements(base, 'cout', 6), [base]);
  const alertesCritiques = alertes.filter((a) => a.niveau === 'critique');

  return (
    <>
      <EnTetePage
        titre="Tableau de bord"
        description={`${base.sites[0].nom} — situation au ${dateCourte(new Date())}`}
      />

      <CorpsPage>
        {stats.vitauxIndispo.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <AlertTriangle className="size-5 shrink-0 text-rose-600" />
            <p className="min-w-0 flex-1 text-sm text-rose-900">
              <strong>{stats.vitauxIndispo.length} équipement(s) de criticité vitale</strong> sont actuellement
              indisponibles :{' '}
              {stats.vitauxIndispo
                .slice(0, 3)
                .map((e) => `${e.code} ${e.designation}`)
                .join(', ')}
              {stats.vitauxIndispo.length > 3 && `, et ${stats.vitauxIndispo.length - 3} autre(s)`}.
            </p>
            <Link
              to="/equipements?statut=en_panne&criticite=1"
              className="shrink-0 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
            >
              Voir la liste
            </Link>
          </div>
        )}

        {/* Indicateurs de tête */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <Indicateur
            libelle="Disponibilité du parc"
            valeur={pourcent(stats.fiab.disponibilite ?? 0, 2)}
            detail="12 derniers mois"
            accent={(stats.fiab.disponibilite ?? 0) >= 97 ? 'positif' : 'attention'}
            icone={<Gauge className="size-4" />}
            aide="Temps de bon fonctionnement rapporté au temps d'ouverture du parc"
          />
          <Indicateur
            libelle="OT ouverts"
            valeur={nombre(stats.act.ouverts, 0)}
            detail={`dont ${stats.act.enRetard} hors délai`}
            accent={stats.act.enRetard > 0 ? 'attention' : 'neutre'}
            icone={<ClipboardList className="size-4" />}
            lien="/ordres-travail"
          />
          <Indicateur
            libelle="MTTR"
            valeur={heures(stats.fiab.mttr ?? 0)}
            detail="signalement → remise en service"
            accent="neutre"
            icone={<Clock className="size-4" />}
            aide="Temps moyen de réparation sur les 12 derniers mois"
          />
          <Indicateur
            libelle="MTBF"
            valeur={heures(stats.fiab.mtbf ?? 0)}
            detail={`${stats.fiab.defaillances} défaillances`}
            accent="neutre"
            icone={<Activity className="size-4" />}
            aide="Temps moyen entre deux défaillances, tous équipements confondus"
          />
          <Indicateur
            libelle="Part de préventif"
            valeur={pourcent(stats.act.tauxPreventif, 0)}
            detail="objectif ≥ 70 %"
            accent={stats.act.tauxPreventif >= 70 ? 'positif' : 'attention'}
            icone={<Wrench className="size-4" />}
            aide="Proportion d'interventions programmées parmi les OT réalisés"
          />
          <Indicateur
            libelle="Coût du mois en cours"
            valeur={montant(stats.coutMois)}
            accent="marque"
            icone={<Wallet className="size-4" />}
            tendance={{ valeur: stats.variationCout, bonSensEstBaisse: true }}
            aide="Variation par rapport à la même période du mois précédent"
            lien="/analyses"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          {/* Activité mensuelle */}
          <Carte
            titre="Activité de maintenance sur 12 mois"
            sousTitre="Répartition entre interventions correctives et programmées"
            className="xl:col-span-2"
            icone={<TrendingUp className="size-4 text-slate-400" />}
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.serie} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="gPrev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gCorr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="preventif"
                    name="Programmé"
                    stroke="#0d9488"
                    fill="url(#gPrev)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="correctif"
                    name="Correctif"
                    stroke="#f43f5e"
                    fill="url(#gCorr)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Carte>

          {/* État du parc */}
          <Carte titre="État du parc" sousTitre={`${stats.parcActif.length} équipements en exploitation`}>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.repartitionStatut}
                    dataKey="valeur"
                    nameKey="nom"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {stats.repartitionStatut.map((r) => (
                      <Cell key={r.statut} fill={COULEURS_STATUT[r.statut] ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1.5">
              {stats.repartitionStatut
                .sort((a, b) => b.valeur - a.valeur)
                .map((r) => (
                  <li key={r.statut} className="flex items-center gap-2 text-xs">
                    <span className="size-2.5 rounded-full" style={{ background: COULEURS_STATUT[r.statut] }} />
                    <span className="flex-1 text-slate-600">{r.nom}</span>
                    <span className="tabulaire font-medium text-slate-800">{r.valeur}</span>
                  </li>
                ))}
            </ul>
          </Carte>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          {/* Conformité */}
          <Carte
            titre="Conformité réglementaire"
            sousTitre="Obligations de contrôle sur le parc"
            icone={<ShieldCheck className="size-4 text-slate-400" />}
            actions={
              <Link to="/reglementaire" className="text-xs text-marque-700 hover:underline">
                Détail
              </Link>
            }
          >
            <Jauge valeur={stats.conf.taux} cible={100} libelle="Obligations à jour" />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-emerald-50 py-2">
                <p className="text-lg font-semibold text-emerald-700 tabulaire">{stats.conf.aJour}</p>
                <p className="text-[11px] text-emerald-700">à jour</p>
              </div>
              <div className="rounded-lg bg-amber-50 py-2">
                <p className="text-lg font-semibold text-amber-700 tabulaire">{stats.conf.imminentes}</p>
                <p className="text-[11px] text-amber-700">sous 30 j</p>
              </div>
              <div className="rounded-lg bg-rose-50 py-2">
                <p className="text-lg font-semibold text-rose-700 tabulaire">{stats.conf.depassees}</p>
                <p className="text-[11px] text-rose-700">échues</p>
              </div>
            </div>
            {stats.conf.reservesOuvertes > 0 && (
              <p className="mt-3 text-xs text-slate-600">
                <strong className="text-slate-800">{stats.conf.reservesOuvertes} réserves</strong> non levées, dont{' '}
                {stats.conf.reservesCritiques} critique(s).
              </p>
            )}
          </Carte>

          {/* Alertes critiques */}
          <Carte
            titre="Alertes critiques"
            sousTitre={`${alertesCritiques.length} situation(s) exigeant une décision`}
            sansPadding
            className="xl:col-span-2"
            actions={
              <Link to="/alertes" className="text-xs text-marque-700 hover:underline">
                Toutes les alertes
              </Link>
            }
          >
            <div className="max-h-72 overflow-y-auto">
              <ListeAlertes alertes={alertesCritiques} limite={7} compact />
            </div>
          </Carte>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {/* Interventions urgentes */}
          <Carte
            titre="Interventions urgentes en cours"
            sousTitre="Priorités P1 et P2 non clôturées"
            sansPadding
            actions={
              <Link to="/ordres-travail?priorite=P1" className="text-xs text-marque-700 hover:underline">
                Tous les OT
              </Link>
            }
          >
            {otUrgents.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Aucune intervention urgente en cours.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {otUrgents.map((ot) => {
                  const retard = estEnRetard(ot);
                  return (
                    <li key={ot.id}>
                      <Link
                        to={`/ordres-travail/${ot.id}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50"
                      >
                        <BadgePriorite priorite={ot.priorite} compact />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-slate-800">{ot.objet}</p>
                          <p className="truncate text-xs text-slate-500">
                            {ot.numero} · <LienEquipement id={ot.equipementId} avecDesignation={false} />
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <BadgeStatutOT statut={ot.statut} />
                          <p className={`mt-0.5 text-[11px] ${retard ? 'font-medium text-rose-600' : 'text-slate-500'}`}>
                            {retard ? 'échéance dépassée' : `échéance ${echeanceRelative(ot.dateEcheanceSLA)}`}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Carte>

          {/* Préventif à venir */}
          <Carte
            titre="Préventif en retard ou à réaliser sous 14 jours"
            sousTitre="Occurrences sans ordre de travail ouvert"
            sansPadding
            actions={
              <Link to="/preventif" className="text-xs text-marque-700 hover:underline">
                Échéancier complet
              </Link>
            }
          >
            {preventifProche.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Aucune échéance préventive dans les deux prochaines semaines.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {preventifProche.map((e) => {
                  const g = base.gammes.find((x) => x.id === e.gammeId);
                  const eq = base.equipements.find((x) => x.id === e.equipementId);
                  if (!g || !eq) return null;
                  return (
                    <li key={`${e.gammeId}-${e.equipementId}`} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-800">{g.libelle}</p>
                        <p className="truncate text-xs text-slate-500">
                          <LienEquipement id={eq.id} />
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <BadgeCriticite niveau={eq.criticite} compact />
                        <p
                          className={`mt-0.5 text-[11px] tabulaire ${
                            e.joursRestants < 0 ? 'font-medium text-rose-600' : 'text-slate-500'
                          }`}
                        >
                          {e.joursRestants < 0 ? `${-e.joursRestants} j de retard` : `dans ${e.joursRestants} j`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Carte>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {/* Coûts par domaine */}
          <Carte titre="Coût de maintenance par domaine" sousTitre="Cumul sur l'historique disponible">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.coutParDomaine} layout="vertical" margin={{ left: 40, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)} k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="domaine"
                    width={110}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(v: number) => [montant(v), 'Coût cumulé']}
                  />
                  <Bar dataKey="valeur" fill="#0d9488" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Carte>

          {/* Équipements les plus coûteux */}
          <Carte
            titre="Équipements les plus coûteux en maintenance"
            sousTitre="Candidats à l'arbitrage réparation / renouvellement"
            sansPadding
            actions={
              <Link to="/analyses" className="text-xs text-marque-700 hover:underline">
                Analyse complète
              </Link>
            }
          >
            <ul className="divide-y divide-slate-100">
              {palmares.map((p) => {
                const ratio = p.equipement.valeurAchat ? (p.valeur / p.equipement.valeurAchat) * 100 : 0;
                return (
                  <li key={p.equipement.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">
                        <LienEquipement id={p.equipement.id} />
                      </p>
                      <p className="text-xs text-slate-500">
                        {p.nbOT} intervention{p.nbOT > 1 ? 's' : ''} · valeur d’achat {montant(p.equipement.valeurAchat)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium text-slate-800 tabulaire">{montant(p.valeur)}</p>
                      <Badge ton={ratio > 60 ? 'danger' : ratio > 35 ? 'attention' : 'neutre'} compact>
                        {pourcent(ratio, 0)} de la valeur
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Carte>
        </div>
      </CorpsPage>
    </>
  );
}
