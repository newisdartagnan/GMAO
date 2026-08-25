import { useMemo, useState } from 'react';
import { FileSignature, Star, Users } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Badge } from '@/components/ui/Badge';
import { Segments } from '@/components/ui/Champs';
import { Indicateur, Jauge } from '@/components/ui/Indicateur';
import { Panneau } from '@/components/ui/Modale';
import { Definitions, Encart } from '@/components/ui/Info';
import { BarreFiltres } from '@/components/shared/Filtres';
import { LienEquipement, NomFournisseur } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import { coutTotal, estTermine } from '@/lib/kpi';
import { dateCourte, joursRestants, toDate } from '@/lib/dates';
import { montant, nombre, normaliser, pourcent } from '@/lib/format';
import { TYPE_CONTRAT, TYPE_TIERS } from '@/types/labels';
import type { Contrat, Fournisseur } from '@/types/domain';

export function PageContrats() {
  const { base, index } = useGMAO();
  const [vue, setVue] = useState<'contrats' | 'fournisseurs'>('contrats');
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState('');
  const [type, setType] = useState('');
  const [detail, setDetail] = useState<Contrat | null>(null);
  const [tiers, setTiers] = useState<Fournisseur | null>(null);

  const actifs = base.contrats.filter((c) => c.statut === 'actif');
  const echeantsSous90 = actifs.filter((c) => (joursRestants(c.dateFin) ?? 999) <= 90);
  const budgetAnnuel = actifs.reduce((s, c) => s + c.montantAnnuel, 0);
  const parcSousContrat = new Set(base.contrats.flatMap((c) => c.equipementIds)).size;

  /** Respect du SLA par prestataire, mesuré sur les OT réellement exécutés. */
  const performance = useMemo(() => {
    const m = new Map<string, { total: number; dansDelai: number; cout: number; delaiMoyenH: number }>();
    for (const ot of base.ordresTravail) {
      if (!ot.prestataireId || !estTermine(ot)) continue;
      const cur = m.get(ot.prestataireId) ?? { total: 0, dansDelai: 0, cout: 0, delaiMoyenH: 0 };
      cur.total += 1;
      cur.cout += coutTotal(ot);
      const creation = toDate(ot.dateCreation);
      const fin = toDate(ot.dateFin ?? ot.dateCloture);
      const echeance = toDate(ot.dateEcheanceSLA);
      if (creation && fin) cur.delaiMoyenH += (fin.getTime() - creation.getTime()) / 3_600_000;
      if (fin && echeance && fin <= echeance) cur.dansDelai += 1;
      m.set(ot.prestataireId, cur);
    }
    return m;
  }, [base.ordresTravail]);

  const contratsFiltres = useMemo(() => {
    const q = normaliser(recherche);
    return base.contrats.filter((c) => {
      if (statut && c.statut !== statut) return false;
      if (type && c.type !== type) return false;
      if (q && !normaliser(`${c.numero} ${c.libelle} ${index.fournisseurs.get(c.fournisseurId)?.raisonSociale ?? ''}`).includes(q))
        return false;
      return true;
    });
  }, [base.contrats, index, recherche, statut, type]);

  const colonnes: Colonne<Contrat>[] = [
    { cle: 'numero', entete: 'N°', largeur: '130px', tri: (c) => c.numero, rendu: (c) => <span className="font-mono text-xs">{c.numero}</span> },
    {
      cle: 'libelle',
      entete: 'Contrat',
      tri: (c) => c.libelle,
      rendu: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{c.libelle}</p>
          <p className="truncate text-xs text-slate-500">
            <NomFournisseur id={c.fournisseurId} /> · {TYPE_CONTRAT[c.type]}
          </p>
        </div>
      ),
    },
    {
      cle: 'perimetre',
      entete: 'Parc couvert',
      largeur: '110px',
      aDroite: true,
      secondaire: true,
      tri: (c) => c.equipementIds.length,
      rendu: (c) => nombre(c.equipementIds.length, 0),
    },
    {
      cle: 'sla',
      entete: 'SLA',
      largeur: '160px',
      secondaire: true,
      tri: (c) => c.slaDelaiInterventionH,
      export: (c) => `${c.slaDelaiInterventionH}h / ${c.slaDelaiRetablissementH}h`,
      rendu: (c) => (
        <span className="text-xs text-slate-600">
          {c.slaDelaiInterventionH} h → {c.slaDelaiRetablissementH} h · dispo. {c.slaTauxDisponibilite} %
        </span>
      ),
    },
    {
      cle: 'fin',
      entete: 'Échéance',
      largeur: '130px',
      tri: (c) => c.dateFin,
      rendu: (c) => {
        const j = joursRestants(c.dateFin);
        const proche = j !== null && j <= c.preavisJours;
        return (
          <div className={j !== null && j < 0 ? 'text-rose-600' : proche ? 'text-amber-700' : 'text-slate-600'}>
            <p className="text-xs tabulaire">{dateCourte(c.dateFin)}</p>
            <p className="text-[11px]">{j !== null && j < 0 ? `échu depuis ${-j} j` : `dans ${j} j`}</p>
          </div>
        );
      },
    },
    {
      cle: 'statut',
      entete: 'Statut',
      largeur: '110px',
      tri: (c) => c.statut,
      rendu: (c) => (
        <Badge ton={c.statut === 'actif' ? 'succes' : c.statut === 'echu' ? 'danger' : 'neutre'} pastille>
          {c.statut}
        </Badge>
      ),
    },
    { cle: 'montant', entete: 'Montant / an', largeur: '130px', aDroite: true, tri: (c) => c.montantAnnuel, rendu: (c) => montant(c.montantAnnuel) },
  ];

  const colonnesFournisseurs: Colonne<Fournisseur>[] = [
    { cle: 'code', entete: 'Code', largeur: '80px', tri: (f) => f.code, rendu: (f) => <span className="font-mono text-xs">{f.code}</span> },
    {
      cle: 'raison',
      entete: 'Raison sociale',
      tri: (f) => f.raisonSociale,
      rendu: (f) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{f.raisonSociale}</p>
          <p className="truncate text-xs text-slate-500">
            {f.types.map((t) => TYPE_TIERS[t]).join(', ')} · {f.pays}
          </p>
        </div>
      ),
    },
    {
      cle: 'certifications',
      entete: 'Certifications',
      secondaire: true,
      tri: (f) => f.certifications.join(','),
      rendu: (f) =>
        f.certifications.length ? (
          <div className="flex flex-wrap gap-1">
            {f.certifications.map((c) => (
              <Badge key={c} ton="info" compact>
                {c}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate-400">aucune déclarée</span>
        ),
    },
    {
      cle: 'contrats',
      entete: 'Contrats',
      largeur: '90px',
      aDroite: true,
      tri: (f) => base.contrats.filter((c) => c.fournisseurId === f.id).length,
      rendu: (f) => nombre(base.contrats.filter((c) => c.fournisseurId === f.id).length, 0),
    },
    {
      cle: 'interventions',
      entete: 'Interventions',
      largeur: '110px',
      aDroite: true,
      tri: (f) => performance.get(f.id)?.total ?? 0,
      rendu: (f) => nombre(performance.get(f.id)?.total ?? 0, 0),
    },
    {
      cle: 'sla',
      entete: 'Respect SLA',
      largeur: '130px',
      tri: (f) => {
        const p = performance.get(f.id);
        return p?.total ? p.dansDelai / p.total : -1;
      },
      export: (f) => {
        const p = performance.get(f.id);
        return p?.total ? Math.round((p.dansDelai / p.total) * 100) : '';
      },
      rendu: (f) => {
        const p = performance.get(f.id);
        if (!p?.total) return <span className="text-xs text-slate-400">—</span>;
        const taux = (p.dansDelai / p.total) * 100;
        return (
          <div>
            <p className={`text-xs tabulaire ${taux >= 90 ? 'text-emerald-700' : taux >= 70 ? 'text-amber-700' : 'text-rose-600'}`}>
              {pourcent(taux, 0)}
            </p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${taux >= 90 ? 'bg-emerald-500' : taux >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${taux}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      cle: 'note',
      entete: 'Note',
      largeur: '90px',
      aDroite: true,
      tri: (f) => f.notePerformance ?? 0,
      rendu: (f) =>
        f.notePerformance ? (
          <span className="inline-flex items-center gap-1 text-sm text-slate-700">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            {f.notePerformance.toFixed(1).replace('.', ',')}
          </span>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <>
      <EnTetePage
        titre="Contrats et fournisseurs"
        description="Engagements de maintenance externalisée, niveaux de service et performance des tiers"
        actions={
          <Segments
            valeur={vue}
            onChange={setVue}
            taille="sm"
            options={[
              { valeur: 'contrats', libelle: 'Contrats', compteur: base.contrats.length },
              { valeur: 'fournisseurs', libelle: 'Fournisseurs', compteur: base.fournisseurs.length },
            ]}
          />
        }
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur libelle="Contrats actifs" valeur={nombre(actifs.length, 0)} icone={<FileSignature className="size-4" />} />
          <Indicateur
            libelle="À renouveler sous 90 j"
            valeur={nombre(echeantsSous90.length, 0)}
            accent={echeantsSous90.length ? 'attention' : 'positif'}
            detail="préavis de résiliation à surveiller"
          />
          <Indicateur libelle="Budget contractuel annuel" valeur={montant(budgetAnnuel)} />
          <Indicateur
            libelle="Parc sous contrat"
            valeur={nombre(parcSousContrat, 0)}
            detail={`${pourcent((parcSousContrat / base.equipements.length) * 100, 0)} du parc`}
            icone={<Users className="size-4" />}
          />
        </div>

        {echeantsSous90.some((c) => c.reconductionTacite) && (
          <Encart ton="attention" titre="Reconductions tacites à décider">
            {echeantsSous90
              .filter((c) => c.reconductionTacite)
              .map((c) => `${c.numero} (préavis ${c.preavisJours} j, fin ${dateCourte(c.dateFin)})`)
              .join(' · ')}
            . Passé le préavis, le contrat est reconduit pour une période entière.
          </Encart>
        )}

        {vue === 'contrats' ? (
          <Carte sansPadding>
            <div className="border-b border-slate-200 p-4">
              <BarreFiltres
                recherche={recherche}
                onRecherche={setRecherche}
                placeholder="Numéro, libellé, fournisseur…"
                resultats={`${contratsFiltres.length} contrat(s)`}
                filtres={[
                  {
                    cle: 'statut',
                    label: 'Statut',
                    valeur: statut,
                    onChange: setStatut,
                    options: [
                      { valeur: 'actif', libelle: 'Actif' },
                      { valeur: 'echu', libelle: 'Échu' },
                      { valeur: 'resilie', libelle: 'Résilié' },
                      { valeur: 'en_negociation', libelle: 'En négociation' },
                    ],
                  },
                  {
                    cle: 'type',
                    label: 'Type',
                    valeur: type,
                    onChange: setType,
                    options: Object.entries(TYPE_CONTRAT).map(([v, l]) => ({ valeur: v, libelle: l })),
                  },
                ]}
              />
            </div>
            <Tableau
              lignes={contratsFiltres}
              colonnes={colonnes}
              cleLigne={(c) => c.id}
              onClicLigne={setDetail}
              triInitial={{ cle: 'fin', sens: 'asc' }}
              parPage={25}
              nomExport="contrats-maintenance"
              vide="Aucun contrat à afficher."
            />
          </Carte>
        ) : (
          <Carte sansPadding titre="Fournisseurs et prestataires" sousTitre="Performance mesurée sur les interventions réalisées">
            <Tableau
              lignes={base.fournisseurs}
              colonnes={colonnesFournisseurs}
              cleLigne={(f) => f.id}
              onClicLigne={setTiers}
              triInitial={{ cle: 'raison', sens: 'asc' }}
              parPage={25}
              nomExport="fournisseurs"
              vide="Aucun fournisseur enregistré."
            />
          </Carte>
        )}
      </CorpsPage>

      <Panneau ouvert={Boolean(detail)} onFermer={() => setDetail(null)} titre={detail?.libelle ?? ''} sousTitre={detail?.numero}>
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge ton={detail.statut === 'actif' ? 'succes' : 'danger'} pastille>
                {detail.statut}
              </Badge>
              <Badge ton="info">{TYPE_CONTRAT[detail.type]}</Badge>
              {detail.piecesIncluses && <Badge ton="succes">Pièces incluses</Badge>}
              {detail.reconductionTacite && <Badge ton="attention">Reconduction tacite</Badge>}
            </div>

            <Definitions
              items={[
                { label: 'Titulaire', valeur: <NomFournisseur id={detail.fournisseurId} /> },
                { label: 'Montant annuel', valeur: <strong>{montant(detail.montantAnnuel)}</strong> },
                { label: 'Période', valeur: `du ${dateCourte(detail.dateDebut)} au ${dateCourte(detail.dateFin)}` },
                { label: 'Préavis', valeur: `${detail.preavisJours} jours` },
                { label: 'Visites préventives incluses', valeur: `${detail.visitesIncluses} par an` },
                { label: 'Délai d’intervention', valeur: `${detail.slaDelaiInterventionH} h` },
                { label: 'Délai de rétablissement', valeur: `${detail.slaDelaiRetablissementH} h` },
                { label: 'Disponibilité garantie', valeur: `${detail.slaTauxDisponibilite} %` },
              ]}
            />

            {detail.notes && <Encart ton="info">{detail.notes}</Encart>}

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">
                Équipements couverts ({detail.equipementIds.length})
              </h3>
              <p className="mb-2 text-xs text-slate-500">
                Coût annuel rapporté à l’équipement :{' '}
                {montant(detail.montantAnnuel / Math.max(1, detail.equipementIds.length))}
              </p>
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
                {detail.equipementIds.slice(0, 60).map((id) => (
                  <li key={id} className="rounded-md bg-slate-50 px-3 py-1.5">
                    <LienEquipement id={id} />
                  </li>
                ))}
                {detail.equipementIds.length > 60 && (
                  <li className="px-3 py-1.5 text-xs text-slate-400">
                    + {detail.equipementIds.length - 60} autres équipements
                  </li>
                )}
              </ul>
            </section>
          </div>
        )}
      </Panneau>

      <Panneau ouvert={Boolean(tiers)} onFermer={() => setTiers(null)} titre={tiers?.raisonSociale ?? ''} sousTitre={tiers?.code}>
        {tiers && (
          <div className="space-y-5">
            <Definitions
              items={[
                { label: 'Types', valeur: tiers.types.map((t) => TYPE_TIERS[t]).join(', ') },
                { label: 'Pays', valeur: tiers.pays },
                { label: 'Contact', valeur: tiers.contactNom ?? '—' },
                { label: 'Courriel', valeur: tiers.email ?? '—' },
                { label: 'Téléphone', valeur: tiers.telephone ?? '—' },
                { label: 'Délai d’intervention contractuel', valeur: tiers.delaiInterventionH ? `${tiers.delaiInterventionH} h` : '—' },
                { label: 'Certifications', valeur: tiers.certifications.join(', ') || 'Aucune déclarée' },
              ]}
            />

            {(() => {
              const p = performance.get(tiers.id);
              if (!p?.total) return <p className="text-sm text-slate-500">Aucune intervention réalisée par ce tiers.</p>;
              const taux = (p.dansDelai / p.total) * 100;
              return (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-800">Performance mesurée</h3>
                  <Jauge valeur={taux} cible={90} libelle="Interventions dans le délai contractuel" />
                  <Definitions
                    items={[
                      { label: 'Interventions réalisées', valeur: nombre(p.total, 0) },
                      { label: 'Délai moyen constaté', valeur: `${nombre(p.delaiMoyenH / p.total, 0)} h` },
                      { label: 'Coût facturé cumulé', valeur: montant(p.cout) },
                      { label: 'Hors délai', valeur: nombre(p.total - p.dansDelai, 0) },
                    ]}
                  />
                  {taux < 80 && (
                    <Encart ton="attention" titre="Performance en deçà de l’engagement">
                      Le taux de respect des délais justifie un point contractuel, voire l’application des pénalités
                      prévues au marché.
                    </Encart>
                  )}
                </section>
              );
            })()}

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Contrats en portefeuille</h3>
              <ul className="space-y-1 text-sm">
                {base.contrats
                  .filter((c) => c.fournisseurId === tiers.id)
                  .map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-1.5">
                      <span className="min-w-0 truncate">{c.libelle}</span>
                      <span className="shrink-0 text-xs tabulaire text-slate-500">{montant(c.montantAnnuel)}/an</span>
                    </li>
                  ))}
                {!base.contrats.some((c) => c.fournisseurId === tiers.id) && (
                  <li className="text-sm text-slate-500">Aucun contrat en cours.</li>
                )}
              </ul>
            </section>
          </div>
        )}
      </Panneau>
    </>
  );
}
