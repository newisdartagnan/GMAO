import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { BarChart3, Download, Recycle, TrendingDown } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Bouton } from '@/components/ui/Bouton';
import { Badge } from '@/components/ui/Badge';
import { Liste, Segments } from '@/components/ui/Champs';
import { Indicateur } from '@/components/ui/Indicateur';
import { Encart } from '@/components/ui/Info';
import { LienEquipement } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import {
  activite,
  coutTotal,
  fiabilite,
  serieMensuelle,
  tauxRenouvellement,
  tauxVetuste,
  valeurNetteComptable,
} from '@gmao/partage';
import { toDate } from '@gmao/partage';
import { heures, montant, nombre, pourcent, tronquer } from '@gmao/partage';
import { CAUSE_PANNE, DOMAINE } from '@gmao/partage';
import { telecharger, versCSV } from '@/data/persistance';
import type { CausePanne, Equipement } from '@gmao/partage';

interface LigneRenouvellement {
  equipement: Equipement;
  vetuste: number;
  ratioCout: number;
  coutCumule: number;
  nbPannes: number;
  score: number;
}

export function PageAnalyses() {
  const { base, index } = useGMAO();
  const [vue, setVue] = useState<'performance' | 'couts' | 'renouvellement' | 'defaillances'>('performance');
  const [domaine, setDomaine] = useState('');

  const parc = useMemo(
    () => base.equipements.filter((e) => e.statut !== 'reforme' && (!domaine || e.domaine === domaine)),
    [base.equipements, domaine],
  );
  const idsParc = useMemo(() => new Set(parc.map((e) => e.id)), [parc]);
  const ots = useMemo(
    () => base.ordresTravail.filter((o) => !o.equipementId || idsParc.has(o.equipementId)),
    [base.ordresTravail, idsParc],
  );

  const fiab = useMemo(() => fiabilite(parc, ots, 365), [parc, ots]);
  const act = useMemo(() => activite(ots), [ots]);
  const serie = useMemo(() => serieMensuelle(ots, 12, (o) => coutTotal(o)), [ots]);

  /* --- Coûts par service --- */
  const parService = useMemo(() => {
    const m = new Map<string, { nom: string; cout: number; ot: number; arretH: number }>();
    for (const o of ots) {
      const cur = m.get(o.serviceId) ?? {
        nom: index.services.get(o.serviceId)?.nom ?? 'Inconnu',
        cout: 0,
        ot: 0,
        arretH: 0,
      };
      cur.cout += coutTotal(o);
      cur.ot += 1;
      cur.arretH += (o.arretEquipementMin || 0) / 60;
      m.set(o.serviceId, cur);
    }
    return [...m.values()].sort((a, b) => b.cout - a.cout).slice(0, 12);
  }, [ots, index]);

  /* --- Pareto des causes de défaillance --- */
  const causes = useMemo(() => {
    const m = new Map<CausePanne, { nb: number; cout: number; arretH: number }>();
    for (const o of ots) {
      if (o.type !== 'correctif' || !o.causePanne) continue;
      const cur = m.get(o.causePanne) ?? { nb: 0, cout: 0, arretH: 0 };
      cur.nb += 1;
      cur.cout += coutTotal(o);
      cur.arretH += (o.arretEquipementMin || 0) / 60;
      m.set(o.causePanne, cur);
    }
    const total = [...m.values()].reduce((s, v) => s + v.nb, 0) || 1;
    let cumul = 0;
    return [...m.entries()]
      .sort((a, b) => b[1].nb - a[1].nb)
      .map(([cause, v]) => {
        cumul += (v.nb / total) * 100;
        return { cause: CAUSE_PANNE[cause], nb: v.nb, cout: Math.round(v.cout), arretH: Math.round(v.arretH), cumul: Math.round(cumul) };
      });
  }, [ots]);

  /* --- Aide au renouvellement --- */
  const renouvellement = useMemo<LigneRenouvellement[]>(() => {
    return parc
      .map((e) => {
        const otsEq = base.ordresTravail.filter((o) => o.equipementId === e.id);
        const coutCumule = otsEq.reduce((s, o) => s + coutTotal(o), 0);
        const vetuste = tauxVetuste(e);
        const ratioCout = tauxRenouvellement(base, e.id) ?? 0;
        const nbPannes = otsEq.filter((o) => o.type === 'correctif').length;
        // Score composite : vétusté, poids financier de la maintenance, fréquence
        // des pannes, pondérés par la criticité pour le soin.
        const score =
          Math.min(100, vetuste) * 0.35 +
          Math.min(100, ratioCout) * 0.4 +
          Math.min(100, nbPannes * 8) * 0.15 +
          (5 - e.criticite) * 2.5;
        return { equipement: e, vetuste, ratioCout, coutCumule, nbPannes, score };
      })
      .filter((r) => r.score > 45)
      .sort((a, b) => b.score - a.score);
  }, [parc, base]);

  const budgetRenouvellement = renouvellement.slice(0, 15).reduce((s, r) => s + r.equipement.valeurAchat, 0);

  const nuage = useMemo(
    () =>
      parc
        .filter((e) => e.valeurAchat > 0)
        .map((e) => {
          const ratio = Math.round(tauxRenouvellement(base, e.id) ?? 0);
          return {
            x: Math.round(tauxVetuste(e)),
            // Au-delà de 200 %, la valeur exacte n'apporte plus rien à la
            // décision : l'équipement est de toute façon à remplacer.
            y: Math.min(200, ratio),
            reel: ratio,
            z: e.valeurAchat,
            nom: `${e.code} ${e.designation}`,
            criticite: e.criticite,
          };
        })
        .filter((p) => p.y > 0)
        .slice(0, 500),
    [parc, base],
  );

  const colonnesRenouvellement: Colonne<LigneRenouvellement>[] = [
    {
      cle: 'equipement',
      entete: 'Équipement',
      tri: (r) => r.equipement.designation,
      export: (r) => `${r.equipement.code} ${r.equipement.designation}`,
      rendu: (r) => (
        <div className="min-w-0">
          <p className="truncate">
            <LienEquipement id={r.equipement.id} />
          </p>
          <p className="truncate text-xs text-slate-500">
            {r.equipement.marque} {r.equipement.modele} · {index.services.get(r.equipement.serviceId)?.nom}
          </p>
        </div>
      ),
    },
    {
      cle: 'vetuste',
      entete: 'Vétusté',
      largeur: '100px',
      aDroite: true,
      tri: (r) => r.vetuste,
      export: (r) => Math.round(r.vetuste),
      rendu: (r) => <span className={r.vetuste >= 100 ? 'text-rose-600' : ''}>{nombre(r.vetuste, 0)} %</span>,
    },
    {
      cle: 'ratio',
      entete: 'Coût / valeur',
      largeur: '120px',
      aDroite: true,
      tri: (r) => r.ratioCout,
      export: (r) => Math.round(r.ratioCout),
      rendu: (r) => <span className={r.ratioCout >= 60 ? 'font-medium text-rose-600' : ''}>{nombre(r.ratioCout, 0)} %</span>,
    },
    { cle: 'pannes', entete: 'Pannes', largeur: '80px', aDroite: true, tri: (r) => r.nbPannes, rendu: (r) => nombre(r.nbPannes, 0) },
    { cle: 'cout', entete: 'Coût cumulé', largeur: '120px', aDroite: true, tri: (r) => r.coutCumule, export: (r) => Math.round(r.coutCumule), rendu: (r) => montant(r.coutCumule) },
    {
      cle: 'valeur',
      entete: 'Remplacement',
      largeur: '130px',
      aDroite: true,
      tri: (r) => r.equipement.valeurAchat,
      export: (r) => r.equipement.valeurAchat,
      rendu: (r) => montant(r.equipement.valeurAchat),
    },
    {
      cle: 'score',
      entete: 'Priorité',
      largeur: '110px',
      tri: (r) => r.score,
      export: (r) => Math.round(r.score),
      rendu: (r) => (
        <Badge ton={r.score > 75 ? 'danger' : r.score > 55 ? 'attention' : 'neutre'}>
          {r.score > 75 ? 'À remplacer' : r.score > 55 ? 'À arbitrer' : 'À surveiller'}
        </Badge>
      ),
    },
  ];

  const exporterSyntheseDirection = () => {
    const lignes = base.services.map((s) => {
      const otsService = base.ordresTravail.filter((o) => o.serviceId === s.id);
      const eqService = base.equipements.filter((e) => e.serviceId === s.id && e.statut !== 'reforme');
      const f = fiabilite(eqService, otsService, 365);
      return {
        Service: s.nom,
        Pôle: s.pole,
        Équipements: eqService.length,
        'Valeur nette du parc': Math.round(eqService.reduce((x, e) => x + valeurNetteComptable(e), 0)),
        'OT sur 12 mois': otsService.length,
        'Coût de maintenance': Math.round(otsService.reduce((x, o) => x + coutTotal(o), 0)),
        'MTBF (h)': f.mtbf ? Math.round(f.mtbf) : '',
        'MTTR (h)': f.mttr ? Math.round(f.mttr * 10) / 10 : '',
        'Disponibilité (%)': f.disponibilite ? Math.round(f.disponibilite * 100) / 100 : '',
        'Heures d’arrêt': Math.round(f.heuresArret),
      };
    });
    telecharger('synthese-maintenance-par-service.csv', versCSV(lignes), 'text/csv');
  };

  return (
    <>
      <EnTetePage
        titre="Analyses et indicateurs"
        description="Fiabilité, coûts, causes de défaillance et aide à la décision de renouvellement"
        actions={
          <>
            <Liste
              value={domaine}
              onChange={(e) => setDomaine(e.target.value)}
              className="h-9 w-auto py-0 text-sm"
              vide="Tous les domaines"
              options={Object.entries(DOMAINE).map(([v, d]) => ({ valeur: v, libelle: d.libelle }))}
            />
            <Bouton variante="primaire" onClick={exporterSyntheseDirection}>
              <Download className="size-4" /> Synthèse direction
            </Bouton>
          </>
        }
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Indicateur libelle="Parc analysé" valeur={nombre(parc.length, 0)} icone={<BarChart3 className="size-4" />} />
          <Indicateur libelle="MTBF" valeur={heures(fiab.mtbf ?? 0)} detail={`${fiab.defaillances} défaillances`} />
          <Indicateur libelle="MTTR" valeur={heures(fiab.mttr ?? 0)} />
          <Indicateur libelle="Prise en charge" valeur={heures(fiab.mtta ?? 0)} detail="signalement → début" />
          <Indicateur
            libelle="Disponibilité"
            valeur={pourcent(fiab.disponibilite ?? 0, 2)}
            accent={(fiab.disponibilite ?? 0) >= 97 ? 'positif' : 'attention'}
          />
          <Indicateur libelle="Coût total" valeur={montant(act.coutTotal)} detail={`${nombre(act.tempsPasseH, 0)} h passées`} />
        </div>

        <Segments
          valeur={vue}
          onChange={setVue}
          options={[
            { valeur: 'performance', libelle: 'Performance' },
            { valeur: 'couts', libelle: 'Coûts' },
            { valeur: 'defaillances', libelle: 'Causes de défaillance' },
            { valeur: 'renouvellement', libelle: 'Renouvellement' },
          ]}
        />

        {vue === 'performance' && (
          <div className="grid gap-4 xl:grid-cols-2">
            <Carte titre="Répartition du travail" sousTitre="Correctif contre programmé sur 12 mois">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serieMensuelle(ots, 12)} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="preventif" name="Programmé" stackId="a" fill="#0d9488" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="correctif" name="Correctif" stackId="a" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-base font-semibold text-slate-800 tabulaire">{pourcent(act.tauxPreventif, 0)}</p>
                  <p className="text-slate-500">part de programmé</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-base font-semibold text-slate-800 tabulaire">{pourcent(act.respectPlanning, 0)}</p>
                  <p className="text-slate-500">respect du planning</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-base font-semibold text-slate-800 tabulaire">{pourcent(act.respectSLA, 0)}</p>
                  <p className="text-slate-500">respect des délais</p>
                </div>
              </div>
            </Carte>

            <Carte titre="Indisponibilité par service" sousTitre="Heures d’arrêt cumulées et coût associé">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={parService} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="nom"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                      angle={-38}
                      textAnchor="end"
                      interval={0}
                      height={96}
                      tickFormatter={(v: string) => tronquer(v, 22)}
                    />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
                    <Bar yAxisId="left" dataKey="arretH" name="Heures d’arrêt" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="ot" name="Nombre d’OT" stroke="#0d9488" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Carte>
          </div>
        )}

        {vue === 'couts' && (
          <div className="grid gap-4 xl:grid-cols-2">
            <Carte titre="Dépense mensuelle de maintenance" sousTitre="Coût total des OT créés dans le mois">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={serie} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `${Math.round(v / 1000)} k`}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                      formatter={(v: number) => [montant(v), 'Coût']}
                    />
                    <Bar dataKey="valeur" name="Coût" fill="#0d9488" radius={[3, 3, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-base font-semibold text-slate-800 tabulaire">{montant(act.coutMainOeuvre)}</p>
                  <p className="text-slate-500">main-d’œuvre</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-base font-semibold text-slate-800 tabulaire">{montant(act.coutPieces)}</p>
                  <p className="text-slate-500">pièces</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-base font-semibold text-slate-800 tabulaire">{montant(act.coutPrestataire)}</p>
                  <p className="text-slate-500">prestations</p>
                </div>
              </div>
            </Carte>

            <Carte titre="Coût par service" sousTitre="Les douze services les plus consommateurs">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={parService} layout="vertical" margin={{ left: 60, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `${Math.round(v / 1000)} k`}
                    />
                    <YAxis type="category" dataKey="nom" width={150} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                      formatter={(v: number) => [montant(v), 'Coût']}
                    />
                    <Bar dataKey="cout" fill="#0f766e" radius={[0, 3, 3, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Carte>

            <Carte
              className="xl:col-span-2"
              titre="Budget alloué et consommé"
              sousTitre="Comparaison entre la dotation et la dépense constatée"
            >
              <table className="w-full text-sm">
                <thead className="text-xs tracking-wide text-slate-500 uppercase">
                  <tr className="border-b border-slate-200">
                    <th className="py-2 text-left">Domaine</th>
                    <th className="py-2 text-right">Dotation {new Date().getFullYear()}</th>
                    <th className="py-2 text-right">Dépense constatée</th>
                    <th className="py-2 text-right">Écart</th>
                    <th className="py-2 pl-4 text-left">Consommation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.keys(DOMAINE).map((d) => {
                    const alloue = base.budgets
                      .filter((b) => b.domaine === d && b.annee === new Date().getFullYear())
                      .reduce((s, b) => s + b.montantAlloue, 0);
                    const consomme = base.ordresTravail
                      .filter((o) => {
                        const eq = o.equipementId ? index.equipements.get(o.equipementId) : undefined;
                        return eq?.domaine === d && (toDate(o.dateCreation)?.getFullYear() ?? 0) === new Date().getFullYear();
                      })
                      .reduce((s, o) => s + coutTotal(o), 0);
                    const pct = alloue ? (consomme / alloue) * 100 : 0;
                    return (
                      <tr key={d}>
                        <td className="py-2 text-slate-800">{DOMAINE[d as keyof typeof DOMAINE].libelle}</td>
                        <td className="py-2 text-right tabulaire">{montant(alloue)}</td>
                        <td className="py-2 text-right tabulaire">{montant(consomme)}</td>
                        <td className={`py-2 text-right tabulaire ${consomme > alloue ? 'text-rose-600' : 'text-emerald-700'}`}>
                          {montant(alloue - consomme)}
                        </td>
                        <td className="w-64 py-2 pl-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full rounded-full ${pct > 100 ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <span className="w-12 text-right text-xs tabulaire text-slate-500">{Math.round(pct)} %</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Carte>
          </div>
        )}

        {vue === 'defaillances' && (
          <div className="grid gap-4 xl:grid-cols-2">
            <Carte titre="Causes de défaillance — diagramme de Pareto" sousTitre="80 % des pannes proviennent souvent de trois causes">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={causes} margin={{ top: 5, right: 5, bottom: 60, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="cause"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                      angle={-40}
                      textAnchor="end"
                      interval={0}
                      height={100}
                      tickFormatter={(v: string) => tronquer(v, 24)}
                    />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Bar yAxisId="left" dataKey="nb" name="Occurrences" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="cumul" name="Cumul %" stroke="#0f766e" strokeWidth={2} dot={{ r: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Carte>

            <Carte sansPadding titre="Détail des causes" sousTitre="Coût et immobilisation associés">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Cause</th>
                    <th className="px-3 py-2 text-right">Pannes</th>
                    <th className="px-3 py-2 text-right">Heures d’arrêt</th>
                    <th className="px-4 py-2 text-right">Coût</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {causes.map((c) => (
                    <tr key={c.cause}>
                      <td className="px-4 py-2 text-slate-800">{c.cause}</td>
                      <td className="px-3 py-2 text-right tabulaire">{c.nb}</td>
                      <td className="px-3 py-2 text-right tabulaire">{nombre(c.arretH, 0)}</td>
                      <td className="px-4 py-2 text-right tabulaire">{montant(c.cout)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {causes.length > 0 && (
                <div className="border-t border-slate-200 p-4">
                  <Encart ton="info" titre="Lecture">
                    Les causes « encrassement » et « défaut d’alimentation » relèvent de l’exploitation plus que du
                    matériel : renforcer la maintenance préventive et sécuriser l’alimentation électrique y répond mieux
                    qu’un renouvellement d’équipement.
                  </Encart>
                </div>
              )}
            </Carte>
          </div>
        )}

        {vue === 'renouvellement' && (
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-3">
              <Indicateur
                libelle="Équipements à arbitrer"
                valeur={nombre(renouvellement.length, 0)}
                accent="attention"
                icone={<Recycle className="size-4" />}
              />
              <Indicateur
                libelle="Priorité haute"
                valeur={nombre(renouvellement.filter((r) => r.score > 75).length, 0)}
                accent="negatif"
                detail="score supérieur à 75"
              />
              <Indicateur
                libelle="Enveloppe des 15 premiers"
                valeur={montant(budgetRenouvellement)}
                detail="valeur de remplacement à neuf"
                icone={<TrendingDown className="size-4" />}
              />
            </div>

            <Carte
              titre="Vétusté et coût de maintenance"
              sousTitre="Chaque point est un équipement ; la taille figure la valeur d’achat"
            >
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="Vétusté"
                      unit=" %"
                      domain={[0, 200]}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      label={{ value: 'Amortissement consommé (%)', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#64748b' }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Coût / valeur"
                      unit=" %"
                      domain={[0, 200]}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      label={{ value: 'Coût cumulé / valeur (%)', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }}
                    />
                    <ZAxis type="number" dataKey="z" range={[20, 240]} />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                      formatter={(v: number, n: string) => [`${v} ${n === 'Vétusté' || n === 'Coût / valeur' ? '%' : ''}`, n]}
                      labelFormatter={() => ''}
                    />
                    <Scatter data={nuage} name="Équipements">
                      {nuage.map((p, i) => (
                        <Cell
                          key={i}
                          fill={p.criticite === 1 ? '#e11d48' : p.criticite === 2 ? '#f59e0b' : '#0d9488'}
                          fillOpacity={0.55}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Le quadrant supérieur droit — amortissement dépassé et coût de maintenance supérieur à 60 % de la valeur
                d’achat — rassemble les candidats naturels au remplacement. Les points rouges sont des équipements de
                criticité vitale : leur renouvellement prime sur le seul critère financier. Les valeurs sont écrêtées à
                200 % pour garder l’échelle lisible.
              </p>
            </Carte>

            <Carte
              sansPadding
              titre="Plan de renouvellement proposé"
              sousTitre="Score composite : vétusté, poids financier, fréquence des pannes, criticité"
            >
              <Tableau
                lignes={renouvellement}
                colonnes={colonnesRenouvellement}
                cleLigne={(r) => r.equipement.id}
                triInitial={{ cle: 'score', sens: 'desc' }}
                parPage={20}
                nomExport="plan-renouvellement"
                vide="Aucun équipement ne dépasse le seuil d’arbitrage."
              />
            </Carte>
          </div>
        )}
      </CorpsPage>
    </>
  );
}
