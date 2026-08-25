import { useMemo, useState } from 'react';
import { AlertOctagon, FileCheck2, ShieldCheck } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Bouton } from '@/components/ui/Bouton';
import { Badge } from '@/components/ui/Badge';
import { Champ, Liste, Saisie, Segments } from '@/components/ui/Champs';
import { Indicateur, Jauge } from '@/components/ui/Indicateur';
import { Modale, Panneau } from '@/components/ui/Modale';
import { Definitions, Encart } from '@/components/ui/Info';
import { BadgeConformite } from '@/components/shared/Etiquettes';
import { LienEquipement, NomFournisseur } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import { api } from '@/data/api';
import { conformite, equipementsDuControle } from '@gmao/partage';
import { prochaineEcheanceControle } from '@gmao/partage';
import { dateCourte, joursRestants, libellePeriodicite } from '@gmao/partage';
import { nombre } from '@gmao/partage';
import { REFERENTIEL } from '@gmao/partage';
import type { ControleReglementaire, ID, Reserve } from '@gmao/partage';
import { telecharger, versCSV } from '@/data/persistance';

interface LigneEcheance {
  cle: string;
  controle: ControleReglementaire;
  equipementId: ID;
  date: string | null;
  jours: number | null;
}

export function PageReglementaire() {
  const { base, index, commander } = useGMAO();
  const [vue, setVue] = useState<'echeances' | 'obligations' | 'reserves'>('echeances');
  const [filtreEtat, setFiltreEtat] = useState('');
  const [detail, setDetail] = useState<ControleReglementaire | null>(null);
  const [saisie, setSaisie] = useState<{ controleId: ID; equipementId: ID } | null>(null);

  const conf = useMemo(() => conformite(base), [base]);

  const echeances = useMemo<LigneEcheance[]>(() => {
    const out: LigneEcheance[] = [];
    for (const c of base.controles.filter((x) => x.actif)) {
      for (const eq of equipementsDuControle(base, c.id)) {
        const date = prochaineEcheanceControle(base, c.id, eq.id);
        out.push({ cle: `${c.id}-${eq.id}`, controle: c, equipementId: eq.id, date, jours: joursRestants(date) });
      }
    }
    return out.sort((a, b) => (a.jours ?? 0) - (b.jours ?? 0));
  }, [base]);

  const echeancesFiltrees = echeances.filter((e) => {
    if (filtreEtat === 'echu') return (e.jours ?? 0) < 0;
    if (filtreEtat === 'imminent') return (e.jours ?? 0) >= 0 && (e.jours ?? 0) <= 30;
    if (filtreEtat === 'bloquant') return e.controle.bloquant && (e.jours ?? 0) < 0;
    return true;
  });

  const reserves = useMemo(() => {
    const out: { reserve: Reserve; contexte: string; equipementId?: ID; date: string }[] = [];
    for (const v of base.visitesControle) {
      for (const r of v.reserves) {
        out.push({
          reserve: r,
          contexte: base.controles.find((c) => c.id === v.controleId)?.libelle ?? 'Contrôle',
          equipementId: v.equipementId,
          date: v.dateVisite,
        });
      }
    }
    for (const o of base.ordresTravail) {
      for (const r of o.reserves) {
        out.push({ reserve: r, contexte: o.objet, equipementId: o.equipementId, date: o.dateFin ?? o.dateCreation });
      }
    }
    return out.sort((a, b) => Number(a.reserve.levee) - Number(b.reserve.levee) || a.date.localeCompare(b.date));
  }, [base]);

  const colonnesEcheances: Colonne<LigneEcheance>[] = [
    {
      cle: 'date',
      entete: 'Échéance',
      largeur: '130px',
      tri: (l) => l.jours ?? 9999,
      export: (l) => l.date ?? '',
      rendu: (l) => (
        <div className={(l.jours ?? 0) < 0 ? 'text-rose-600' : (l.jours ?? 0) <= 30 ? 'text-amber-700' : 'text-slate-700'}>
          <p className="text-sm tabulaire">{dateCourte(l.date)}</p>
          <p className="text-[11px]">{l.jours === null ? '—' : l.jours < 0 ? `${-l.jours} j de retard` : `dans ${l.jours} j`}</p>
        </div>
      ),
    },
    {
      cle: 'controle',
      entete: 'Obligation',
      tri: (l) => l.controle.libelle,
      rendu: (l) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-slate-800">
            {l.controle.libelle}
            {l.controle.bloquant && <Badge ton="danger" compact>bloquant</Badge>}
          </p>
          <p className="truncate text-xs text-slate-500">{REFERENTIEL[l.controle.referentiel]}</p>
        </div>
      ),
    },
    {
      cle: 'equipement',
      entete: 'Équipement',
      tri: (l) => index.equipements.get(l.equipementId)?.code ?? '',
      export: (l) => index.equipements.get(l.equipementId)?.code ?? '',
      rendu: (l) => <LienEquipement id={l.equipementId} />,
    },
    {
      cle: 'organisme',
      entete: 'Organisme',
      largeur: '190px',
      secondaire: true,
      tri: (l) => index.fournisseurs.get(l.controle.organismeId ?? '')?.raisonSociale ?? 'Interne',
      rendu: (l) => (
        <span className="block truncate text-xs text-slate-600">
          {l.controle.execution === 'interne' ? (
            <span className="text-slate-500">Réalisé en interne</span>
          ) : (
            <NomFournisseur id={l.controle.organismeId} />
          )}
        </span>
      ),
    },
    {
      cle: 'action',
      entete: '',
      largeur: '110px',
      aDroite: true,
      rendu: (l) => (
        <Bouton
          taille="sm"
          className="whitespace-nowrap"
          onClick={(e) => {
            e.stopPropagation();
            setSaisie({ controleId: l.controle.id, equipementId: l.equipementId });
          }}
        >
          Saisir
        </Bouton>
      ),
    },
  ];

  const colonnesObligations: Colonne<ControleReglementaire>[] = [
    { cle: 'code', entete: 'Code', largeur: '120px', tri: (c) => c.code, rendu: (c) => <span className="font-mono text-xs">{c.code}</span> },
    {
      cle: 'libelle',
      entete: 'Obligation',
      tri: (c) => c.libelle,
      rendu: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{c.libelle}</p>
          <p className="truncate text-xs text-slate-500">{c.texteReference}</p>
        </div>
      ),
    },
    { cle: 'referentiel', entete: 'Référentiel', secondaire: true, tri: (c) => c.referentiel, export: (c) => REFERENTIEL[c.referentiel], rendu: (c) => <span className="text-xs">{REFERENTIEL[c.referentiel]}</span> },
    {
      cle: 'periodicite',
      entete: 'Périodicité',
      largeur: '150px',
      tri: (c) => c.periodiciteValeur,
      export: (c) => libellePeriodicite(c.periodiciteValeur, c.periodiciteUnite),
      rendu: (c) => <span className="text-xs">{libellePeriodicite(c.periodiciteValeur, c.periodiciteUnite)}</span>,
    },
    {
      cle: 'perimetre',
      entete: 'Parc visé',
      largeur: '100px',
      aDroite: true,
      tri: (c) => equipementsDuControle(base, c.id).length,
      rendu: (c) => nombre(equipementsDuControle(base, c.id).length, 0),
    },
    {
      cle: 'retard',
      entete: 'Échus',
      largeur: '90px',
      aDroite: true,
      tri: (c) => echeances.filter((e) => e.controle.id === c.id && (e.jours ?? 0) < 0).length,
      rendu: (c) => {
        const n = echeances.filter((e) => e.controle.id === c.id && (e.jours ?? 0) < 0).length;
        return n ? <Badge ton="danger" compact>{n}</Badge> : <span className="text-emerald-600">0</span>;
      },
    },
    { cle: 'bloquant', entete: 'Bloquant', largeur: '90px', tri: (c) => Number(c.bloquant), rendu: (c) => (c.bloquant ? <Badge ton="danger" compact>oui</Badge> : <span className="text-slate-400">non</span>) },
  ];

  const exporterDossierAudit = () => {
    const lignes = echeances.map((e) => {
      const eq = index.equipements.get(e.equipementId);
      const derniere = base.visitesControle
        .filter((v) => v.controleId === e.controle.id && v.equipementId === e.equipementId)
        .sort((a, b) => a.dateVisite.localeCompare(b.dateVisite))
        .at(-1);
      return {
        'Code obligation': e.controle.code,
        Obligation: e.controle.libelle,
        Référentiel: REFERENTIEL[e.controle.referentiel],
        'Texte de référence': e.controle.texteReference,
        Périodicité: libellePeriodicite(e.controle.periodiciteValeur, e.controle.periodiciteUnite),
        'Code inventaire': eq?.code ?? '',
        Équipement: eq?.designation ?? '',
        Service: index.services.get(eq?.serviceId ?? '')?.nom ?? '',
        'Dernière visite': derniere?.dateVisite ?? 'jamais',
        Verdict: derniere?.verdict ?? '',
        'Rapport n°': derniere?.numeroRapport ?? '',
        'Prochaine échéance': e.date ?? '',
        Situation: (e.jours ?? 0) < 0 ? 'ÉCHU' : (e.jours ?? 0) <= 30 ? 'imminent' : 'à jour',
        Bloquant: e.controle.bloquant ? 'oui' : 'non',
      };
    });
    telecharger('dossier-conformite-reglementaire.csv', versCSV(lignes), 'text/csv');
  };

  return (
    <>
      <EnTetePage
        titre="Conformité réglementaire"
        description="Contrôles obligatoires, visites d’organismes agréés et levée des réserves"
        actions={
          <>
            <Segments
              valeur={vue}
              onChange={setVue}
              taille="sm"
              options={[
                { valeur: 'echeances', libelle: 'Échéances' },
                { valeur: 'obligations', libelle: 'Obligations' },
                { valeur: 'reserves', libelle: 'Réserves', compteur: reserves.filter((r) => !r.reserve.levee).length },
              ]}
            />
            <Bouton variante="primaire" onClick={exporterDossierAudit}>
              <FileCheck2 className="size-4" /> Dossier d’audit
            </Bouton>
          </>
        }
      />

      <CorpsPage>
        <div className="grid gap-3 lg:grid-cols-4">
          <Carte className="lg:col-span-2">
            <Jauge valeur={conf.taux} cible={100} libelle="Taux de conformité du parc" hauteur="h-3" />
            <p className="mt-3 text-sm text-slate-600">
              {conf.depassees === 0
                ? 'Toutes les obligations périodiques recensées sont à jour.'
                : `${conf.depassees} obligation(s) sont échues sur ${conf.total} recensées. C’est le premier chiffre qu’un auditeur demande.`}
            </p>
          </Carte>
          <Indicateur
            libelle="Échéances dépassées"
            valeur={nombre(conf.depassees, 0)}
            accent={conf.depassees ? 'negatif' : 'positif'}
            icone={<AlertOctagon className="size-4" />}
            detail={`dont ${echeances.filter((e) => e.controle.bloquant && (e.jours ?? 0) < 0).length} bloquantes`}
          />
          <Indicateur
            libelle="Réserves non levées"
            valeur={nombre(conf.reservesOuvertes, 0)}
            accent={conf.reservesCritiques ? 'negatif' : conf.reservesOuvertes ? 'attention' : 'positif'}
            detail={`${conf.reservesCritiques} critique(s)`}
            icone={<ShieldCheck className="size-4" />}
          />
        </div>

        {echeances.some((e) => e.controle.bloquant && (e.jours ?? 0) < 0) && (
          <Encart ton="danger" titre="Contrôles bloquants échus" icone={<AlertOctagon className="size-4" />}>
            Certaines obligations dont le défaut interdit l’exploitation sont dépassées. Les équipements concernés
            devraient être retirés du service tant que le contrôle n’a pas été réalisé et le rapport archivé.
          </Encart>
        )}

        {vue === 'echeances' && (
          <Carte
            sansPadding
            titre="Échéancier réglementaire"
            sousTitre={`${echeancesFiltrees.length} obligation(s) × équipement`}
            actions={
              <Liste
                value={filtreEtat}
                onChange={(e) => setFiltreEtat(e.target.value)}
                className="h-8 w-auto py-0 text-xs"
                vide="Toutes les situations"
                options={[
                  { valeur: 'echu', libelle: 'Échues' },
                  { valeur: 'bloquant', libelle: 'Échues et bloquantes' },
                  { valeur: 'imminent', libelle: 'Sous 30 jours' },
                ]}
              />
            }
          >
            <Tableau
              lignes={echeancesFiltrees}
              colonnes={colonnesEcheances}
              cleLigne={(l) => l.cle}
              triInitial={{ cle: 'date', sens: 'asc' }}
              parPage={30}
              nomExport="echeancier-reglementaire"
              vide="Aucune échéance pour ce filtre."
              ligneClassName={(l) => ((l.jours ?? 0) < 0 ? 'bg-rose-50/40' : '')}
            />
          </Carte>
        )}

        {vue === 'obligations' && (
          <Carte sansPadding titre="Obligations recensées" sousTitre="Textes applicables à l’établissement">
            <Tableau
              lignes={base.controles}
              colonnes={colonnesObligations}
              cleLigne={(c) => c.id}
              onClicLigne={setDetail}
              triInitial={{ cle: 'code', sens: 'asc' }}
              parPage={25}
              nomExport="obligations-reglementaires"
              vide="Aucune obligation enregistrée."
            />
          </Carte>
        )}

        {vue === 'reserves' && (
          <Carte sansPadding titre="Réserves" sousTitre="Points relevés lors des contrôles et des interventions">
            <ul className="divide-y divide-slate-100">
              {reserves.map((r) => (
                <li key={r.reserve.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Badge
                    ton={r.reserve.gravite === 'critique' ? 'danger' : r.reserve.gravite === 'majeure' ? 'attention' : 'neutre'}
                  >
                    {r.reserve.gravite}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">{r.reserve.libelle}</p>
                    <p className="truncate text-xs text-slate-500">
                      {r.contexte} · relevée le {dateCourte(r.date)}
                      {r.equipementId && (
                        <>
                          {' · '}
                          <LienEquipement id={r.equipementId} avecDesignation={false} />
                        </>
                      )}
                    </p>
                  </div>
                  {r.reserve.levee ? (
                    <Badge ton="succes">Levée le {dateCourte(r.reserve.dateLevee)}</Badge>
                  ) : (
                    <>
                      <span className={`text-xs tabulaire ${(joursRestants(r.reserve.dateEcheance) ?? 0) < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                        échéance {dateCourte(r.reserve.dateEcheance)}
                      </span>
                      <Bouton taille="sm" onClick={() => void commander(() => api.leverReserve(r.reserve.id))}>
                        Lever
                      </Bouton>
                    </>
                  )}
                </li>
              ))}
              {reserves.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-slate-500">Aucune réserve enregistrée.</li>
              )}
            </ul>
          </Carte>
        )}
      </CorpsPage>

      <Panneau ouvert={Boolean(detail)} onFermer={() => setDetail(null)} titre={detail?.libelle ?? ''} sousTitre={detail?.code}>
        {detail && (
          <div className="space-y-5">
            <Definitions
              items={[
                { label: 'Référentiel', valeur: REFERENTIEL[detail.referentiel] },
                { label: 'Périodicité', valeur: libellePeriodicite(detail.periodiciteValeur, detail.periodiciteUnite) },
                { label: 'Exécution', valeur: detail.execution === 'interne' ? 'Interne' : 'Organisme agréé' },
                { label: 'Organisme', valeur: <NomFournisseur id={detail.organismeId} /> },
                { label: 'Caractère bloquant', valeur: detail.bloquant ? 'Oui — exploitation interdite en cas de défaut' : 'Non' },
                { label: 'Parc visé', valeur: nombre(equipementsDuControle(base, detail.id).length, 0) },
                { label: 'Texte de référence', valeur: detail.texteReference, pleineLargeur: true },
              ]}
            />

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Dernières visites enregistrées</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {base.visitesControle
                  .filter((v) => v.controleId === detail.id)
                  .sort((a, b) => b.dateVisite.localeCompare(a.dateVisite))
                  .slice(0, 15)
                  .map((v) => (
                    <li key={v.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-800">
                          <LienEquipement id={v.equipementId} />
                        </p>
                        <p className="text-xs text-slate-500">
                          {dateCourte(v.dateVisite)} · rapport {v.numeroRapport ?? '—'}
                        </p>
                      </div>
                      <BadgeConformite conformite={v.verdict} />
                    </li>
                  ))}
                {!base.visitesControle.some((v) => v.controleId === detail.id) && (
                  <li className="px-3 py-6 text-center text-sm text-slate-500">Aucune visite enregistrée.</li>
                )}
              </ul>
            </section>
          </div>
        )}
      </Panneau>

      {saisie && (
        <ModaleVisite
          controleId={saisie.controleId}
          equipementId={saisie.equipementId}
          onFermer={() => setSaisie(null)}
          onValider={async (donnees) => {
            await commander(() =>
              api.enregistrerVisite(saisie.controleId, { equipementId: saisie.equipementId, ...donnees }),
            );
            setSaisie(null);
          }}
        />
      )}
    </>
  );
}

function ModaleVisite({
  controleId,
  equipementId,
  onFermer,
  onValider,
}: {
  controleId: ID;
  equipementId: ID;
  onFermer: () => void;
  onValider: (d: {
    verdict: 'conforme' | 'conforme_avec_reserves' | 'non_conforme';
    numeroRapport?: string;
    reserve?: { libelle: string; gravite: 'mineure' | 'majeure' | 'critique' };
  }) => void;
}) {
  const { base, index } = useGMAO();
  const [verdict, setVerdict] = useState<'conforme' | 'conforme_avec_reserves' | 'non_conforme'>('conforme');
  const [rapport, setRapport] = useState('');
  const [reserve, setReserve] = useState('');
  const [gravite, setGravite] = useState<'mineure' | 'majeure' | 'critique'>('mineure');

  const ctrl = base.controles.find((c) => c.id === controleId);
  const eq = index.equipements.get(equipementId);

  return (
    <Modale
      ouverte
      onFermer={onFermer}
      titre="Enregistrer une visite de contrôle"
      sousTitre={eq ? `${eq.code} — ${eq.designation}` : ctrl?.libelle}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="primaire"
            onClick={() =>
              onValider({
                verdict,
                numeroRapport: rapport || undefined,
                reserve: verdict !== 'conforme' && reserve.trim() ? { libelle: reserve, gravite } : undefined,
              })
            }
          >
            Enregistrer
          </Bouton>
        </>
      }
    >
      <div className="space-y-4">
        <Champ label="Verdict">
          <Liste
            value={verdict}
            onChange={(e) => setVerdict(e.target.value as typeof verdict)}
            options={[
              { valeur: 'conforme', libelle: 'Conforme' },
              { valeur: 'conforme_avec_reserves', libelle: 'Conforme avec réserves' },
              { valeur: 'non_conforme', libelle: 'Non conforme' },
            ]}
          />
        </Champ>
        <Champ label="Numéro de rapport" aide="Référence du rapport remis par l’organisme, à archiver dans la GED">
          <Saisie value={rapport} onChange={(e) => setRapport(e.target.value)} placeholder="APAVE/2026/00412" />
        </Champ>
        {verdict !== 'conforme' && (
          <>
            <Champ label="Réserve relevée">
              <Saisie value={reserve} onChange={(e) => setReserve(e.target.value)} placeholder="Continuité de terre non assurée sur la prise n° 3" />
            </Champ>
            <Champ label="Gravité">
              <Liste
                value={gravite}
                onChange={(e) => setGravite(e.target.value as typeof gravite)}
                options={[
                  { valeur: 'mineure', libelle: 'Mineure' },
                  { valeur: 'majeure', libelle: 'Majeure' },
                  { valeur: 'critique', libelle: 'Critique' },
                ]}
              />
            </Champ>
          </>
        )}
        <Encart ton="info">
          La prochaine échéance est recalculée automatiquement à partir de la périodicité de l’obligation.
        </Encart>
      </div>
    </Modale>
  );
}
