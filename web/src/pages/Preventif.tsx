import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, ListChecks, Wrench } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Bouton } from '@/components/ui/Bouton';
import { Badge } from '@/components/ui/Badge';
import { Champ, Liste, Saisie, Segments } from '@/components/ui/Champs';
import { Indicateur } from '@/components/ui/Indicateur';
import { Modale, Panneau } from '@/components/ui/Modale';
import { Definitions, Encart } from '@/components/ui/Info';
import { BadgeCriticite, BadgeTypeMaintenance } from '@/components/shared/Etiquettes';
import { LienEquipement, LienOT } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import { api } from '@/data/api';
import { echeancierPreventif, equipementsDeLaGamme } from '@gmao/partage';
import type { EcheancePreventive } from '@gmao/partage';
import { seuilCompteurSuivant } from '@gmao/partage';
import { dateCourte, libellePeriodicite } from '@gmao/partage';
import { duree, nombre, pluriel } from '@gmao/partage';
import type { GammeMaintenance } from '@gmao/partage';

export function PagePreventif() {
  const { base, index, commander } = useGMAO();
  const naviguer = useNavigate();
  const [vue, setVue] = useState<'echeancier' | 'gammes'>('echeancier');
  const [horizon, setHorizon] = useState(60);
  const [generation, setGeneration] = useState(false);
  const [gammeSelection, setGammeSelection] = useState<GammeMaintenance | null>(null);
  const [resultat, setResultat] = useState<number | null>(null);

  const echeances = useMemo(() => echeancierPreventif(base, horizon), [base, horizon]);
  const enRetard = echeances.filter((e) => e.joursRestants < 0);
  const chargeHeures = echeances.reduce((s, e) => s + e.dureeMin, 0) / 60;

  const colonnesEcheances: Colonne<EcheancePreventive>[] = [
    {
      cle: 'date',
      entete: 'Échéance',
      largeur: '130px',
      tri: (e) => e.date,
      rendu: (e) => (
        <div className={e.joursRestants < 0 ? 'text-rose-600' : 'text-slate-700'}>
          <p className="text-sm tabulaire">{dateCourte(e.date)}</p>
          <p className="text-[11px]">
            {e.joursRestants < 0 ? `${-e.joursRestants} j de retard` : `dans ${e.joursRestants} j`}
          </p>
        </div>
      ),
    },
    {
      cle: 'gamme',
      entete: 'Gamme',
      tri: (e) => index.gammes.get(e.gammeId)?.libelle ?? '',
      export: (e) => index.gammes.get(e.gammeId)?.libelle ?? '',
      rendu: (e) => {
        const g = index.gammes.get(e.gammeId);
        return (
          <div className="min-w-0">
            <p className="truncate text-slate-800">{g?.libelle}</p>
            <p className="text-xs text-slate-500">
              {g?.code} · {g && libellePeriodicite(g.periodiciteValeur, g.periodiciteUnite)}
            </p>
          </div>
        );
      },
    },
    {
      cle: 'equipement',
      entete: 'Équipement',
      tri: (e) => index.equipements.get(e.equipementId)?.code ?? '',
      export: (e) => index.equipements.get(e.equipementId)?.code ?? '',
      rendu: (e) => <LienEquipement id={e.equipementId} />,
    },
    {
      cle: 'service',
      entete: 'Service',
      secondaire: true,
      tri: (e) => index.services.get(index.equipements.get(e.equipementId)?.serviceId ?? '')?.nom ?? '',
      rendu: (e) => index.services.get(index.equipements.get(e.equipementId)?.serviceId ?? '')?.nom ?? '—',
    },
    {
      cle: 'criticite',
      entete: 'Criticité',
      largeur: '110px',
      tri: (e) => index.equipements.get(e.equipementId)?.criticite ?? 4,
      rendu: (e) => {
        const eq = index.equipements.get(e.equipementId);
        return eq ? <BadgeCriticite niveau={eq.criticite} compact /> : null;
      },
    },
    {
      cle: 'duree',
      entete: 'Durée',
      largeur: '90px',
      aDroite: true,
      tri: (e) => e.dureeMin,
      rendu: (e) => duree(e.dureeMin),
    },
    {
      cle: 'ot',
      entete: 'OT',
      largeur: '130px',
      tri: (e) => (e.otId ? 1 : 0),
      rendu: (e) => (e.otId ? <LienOT id={e.otId} /> : <Badge ton="attention" compact>à générer</Badge>),
    },
  ];

  const colonnesGammes: Colonne<GammeMaintenance>[] = [
    { cle: 'code', entete: 'Code', largeur: '110px', tri: (g) => g.code, rendu: (g) => <span className="font-mono text-xs">{g.code}</span> },
    {
      cle: 'libelle',
      entete: 'Gamme',
      tri: (g) => g.libelle,
      rendu: (g) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{g.libelle}</p>
          <p className="truncate text-xs text-slate-500">
            {g.referenceNormative ?? `${g.operations.length} opérations`}
          </p>
        </div>
      ),
    },
    { cle: 'type', entete: 'Type', largeur: '130px', tri: (g) => g.type, rendu: (g) => <BadgeTypeMaintenance type={g.type} compact /> },
    {
      cle: 'periodicite',
      entete: 'Déclenchement',
      largeur: '190px',
      tri: (g) => g.periodiciteValeur,
      export: (g) => libellePeriodicite(g.periodiciteValeur, g.periodiciteUnite),
      rendu: (g) =>
        g.modeDeclenchement === 'compteur' ? (
          <span className="text-xs text-slate-600">
            Tous les {nombre(g.compteurSeuil ?? 0, 0)} {g.compteurType}
          </span>
        ) : (
          <span className="text-xs text-slate-600">{libellePeriodicite(g.periodiciteValeur, g.periodiciteUnite)}</span>
        ),
    },
    {
      cle: 'perimetre',
      entete: 'Parc couvert',
      largeur: '110px',
      aDroite: true,
      tri: (g) => equipementsDeLaGamme(base, g.id).length,
      rendu: (g) => nombre(equipementsDeLaGamme(base, g.id).length, 0),
    },
    { cle: 'duree', entete: 'Durée', largeur: '90px', aDroite: true, tri: (g) => g.dureeEstimeeMin, rendu: (g) => duree(g.dureeEstimeeMin) },
    {
      cle: 'execution',
      entete: 'Exécution',
      largeur: '120px',
      tri: (g) => g.execution,
      rendu: (g) => <Badge ton={g.execution === 'interne' ? 'info' : 'violet'} compact>{g.execution === 'interne' ? 'Interne' : 'Prestataire'}</Badge>,
    },
  ];

  return (
    <>
      <EnTetePage
        titre="Maintenance préventive"
        description="Gammes d’entretien, échéancier et génération automatique des ordres de travail"
        actions={
          <>
            <Segments
              valeur={vue}
              onChange={setVue}
              taille="sm"
              options={[
                { valeur: 'echeancier', libelle: 'Échéancier' },
                { valeur: 'gammes', libelle: 'Gammes' },
              ]}
            />
            <Bouton variante="primaire" onClick={() => setGeneration(true)}>
              <CalendarPlus className="size-4" /> Générer les OT
            </Bouton>
          </>
        }
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur libelle="Gammes actives" valeur={nombre(base.gammes.filter((g) => g.actif).length, 0)} icone={<Wrench className="size-4" />} />
          <Indicateur
            libelle={`Échéances sous ${horizon} j`}
            valeur={nombre(echeances.length, 0)}
            detail={`${echeances.filter((e) => e.otId).length} déjà couvertes par un OT`}
          />
          <Indicateur
            libelle="En retard"
            valeur={nombre(enRetard.length, 0)}
            accent={enRetard.length ? 'negatif' : 'positif'}
            detail="occurrences non réalisées"
          />
          <Indicateur libelle="Charge à programmer" valeur={`${nombre(chargeHeures, 0)} h`} detail="temps estimé des gammes" />
        </div>

        {enRetard.length > 0 && (
          <Encart ton="attention" titre={`${pluriel(enRetard.length, 'occurrence')} préventive(s) en retard`}>
            Le retard préventif est le premier point relevé lors d’une visite de certification. Les occurrences
            concernées portent notamment sur{' '}
            {[...new Set(enRetard.slice(0, 3).map((e) => index.gammes.get(e.gammeId)?.libelle))].join(', ')}.
          </Encart>
        )}

        {vue === 'echeancier' ? (
          <Carte
            sansPadding
            titre="Échéancier préventif"
            sousTitre="Occurrences calculées à partir de la dernière réalisation ou de la mise en service"
            actions={
              <Liste
                value={String(horizon)}
                onChange={(e) => setHorizon(Number(e.target.value))}
                className="h-8 w-auto py-0 text-xs"
                options={[
                  { valeur: '30', libelle: '30 jours' },
                  { valeur: '60', libelle: '60 jours' },
                  { valeur: '90', libelle: '90 jours' },
                  { valeur: '180', libelle: '6 mois' },
                  { valeur: '365', libelle: '12 mois' },
                ]}
              />
            }
          >
            <Tableau
              lignes={echeances}
              colonnes={colonnesEcheances}
              cleLigne={(e) => `${e.gammeId}-${e.equipementId}`}
              triInitial={{ cle: 'date', sens: 'asc' }}
              parPage={30}
              nomExport="echeancier-preventif"
              vide="Aucune échéance préventive sur l’horizon retenu."
              ligneClassName={(e) => (e.joursRestants < 0 ? 'bg-amber-50/50' : '')}
            />
          </Carte>
        ) : (
          <Carte sansPadding titre="Gammes de maintenance" sousTitre="Protocoles d’entretien appliqués au parc">
            <Tableau
              lignes={base.gammes}
              colonnes={colonnesGammes}
              cleLigne={(g) => g.id}
              onClicLigne={setGammeSelection}
              triInitial={{ cle: 'code', sens: 'asc' }}
              parPage={25}
              nomExport="gammes-maintenance"
              vide="Aucune gamme définie."
            />
          </Carte>
        )}
      </CorpsPage>

      <Panneau
        ouvert={Boolean(gammeSelection)}
        onFermer={() => setGammeSelection(null)}
        titre={gammeSelection?.libelle ?? ''}
        sousTitre={gammeSelection?.code}
      >
        {gammeSelection && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <BadgeTypeMaintenance type={gammeSelection.type} />
              <Badge ton={gammeSelection.execution === 'interne' ? 'info' : 'violet'}>
                {gammeSelection.execution === 'interne' ? 'Réalisée en interne' : 'Confiée au prestataire'}
              </Badge>
              {gammeSelection.arretEquipementRequis && <Badge ton="attention">Arrêt de l’équipement requis</Badge>}
            </div>

            <Definitions
              items={[
                {
                  label: 'Déclenchement',
                  valeur:
                    gammeSelection.modeDeclenchement === 'compteur'
                      ? `Tous les ${nombre(gammeSelection.compteurSeuil ?? 0, 0)} ${gammeSelection.compteurType}`
                      : libellePeriodicite(gammeSelection.periodiciteValeur, gammeSelection.periodiciteUnite),
                },
                { label: 'Durée estimée', valeur: duree(gammeSelection.dureeEstimeeMin) },
                { label: 'Équipe', valeur: index.equipes.get(gammeSelection.equipeId ?? '')?.nom ?? '—' },
                { label: 'Référence normative', valeur: gammeSelection.referenceNormative ?? '—' },
                { label: 'Parc couvert', valeur: pluriel(equipementsDeLaGamme(base, gammeSelection.id).length, 'équipement') },
                {
                  label: 'Compétences requises',
                  valeur: gammeSelection.competencesRequises.length ? gammeSelection.competencesRequises.join(', ') : 'Aucune particulière',
                },
              ]}
            />

            {gammeSelection.consignesSecurite && (
              <Encart ton="attention" titre="Consignes de sécurité">
                {gammeSelection.consignesSecurite}
              </Encart>
            )}

            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                <ListChecks className="size-4 text-slate-400" />
                Opérations ({gammeSelection.operations.length})
              </h3>
              <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {gammeSelection.operations.map((op) => (
                  <li key={op.id} className="flex items-start gap-3 px-3 py-2">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-medium text-slate-600">
                      {op.ordre}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">{op.libelle}</p>
                      <p className="text-xs text-slate-500">
                        {op.nature.replace(/_/g, ' ')} · {op.dureeMin} min
                        {op.valeurAttendue !== undefined &&
                          ` · attendu ${op.valeurAttendue} ${op.unite ?? ''} [${op.toleranceMin} – ${op.toleranceMax}]`}
                      </p>
                    </div>
                    {op.obligatoire && <Badge ton="danger" compact>obligatoire</Badge>}
                  </li>
                ))}
              </ol>
            </section>

            {gammeSelection.piecesPrevues.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Pièces prévues</h3>
                <ul className="space-y-1 text-sm text-slate-700">
                  {gammeSelection.piecesPrevues.map((p) => {
                    const a = index.articles.get(p.articleId);
                    return (
                      <li key={p.articleId} className="flex justify-between rounded-md bg-slate-50 px-3 py-1.5">
                        <span>{a?.designation}</span>
                        <span className="tabulaire">
                          {p.quantite} {a?.unite}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Prochaines échéances</h3>
              <ul className="space-y-1 text-sm">
                {echeancierPreventif(base, 365)
                  .filter((e) => e.gammeId === gammeSelection.id)
                  .slice(0, 12)
                  .map((e) => {
                    const eq = index.equipements.get(e.equipementId);
                    const seuil = seuilCompteurSuivant(base, gammeSelection.id, e.equipementId);
                    return (
                      <li key={e.equipementId} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-1.5">
                        <span className="min-w-0 truncate">
                          {eq?.code} — {eq?.designation}
                        </span>
                        <span className={`shrink-0 text-xs tabulaire ${e.joursRestants < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                          {dateCourte(e.date)}
                          {seuil ? ` (${nombre(seuil, 0)})` : ''}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </section>
          </div>
        )}
      </Panneau>

      <ModaleGeneration
        ouverte={generation}
        onFermer={() => setGeneration(false)}
        onGenerer={async (jours) => {
          const r = await commander(() => api.genererPreventif(jours));
          setGeneration(false);
          setResultat(r.crees);
        }}
      />

      {resultat !== null && (
        <Modale
          ouverte
          onFermer={() => setResultat(null)}
          titre="Génération terminée"
          largeur="sm"
          pied={
            <>
              <Bouton onClick={() => setResultat(null)}>Fermer</Bouton>
              <Bouton variante="primaire" onClick={() => naviguer('/ordres-travail?type=preventif')}>
                Voir les ordres de travail
              </Bouton>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            {resultat === 0
              ? 'Aucun ordre de travail n’a été créé : toutes les échéances de l’horizon sont déjà couvertes.'
              : `${pluriel(resultat, 'ordre de travail', 'ordres de travail')} ont été créés au statut « planifié », avec les opérations et les pièces prévues par la gamme.`}
          </p>
        </Modale>
      )}
    </>
  );
}

function ModaleGeneration({
  ouverte,
  onFermer,
  onGenerer,
}: {
  ouverte: boolean;
  onFermer: () => void;
  onGenerer: (jours: number) => void;
}) {
  const { base } = useGMAO();
  const [jours, setJours] = useState(30);
  const apercu = useMemo(() => echeancierPreventif(base, jours).filter((e) => !e.otId), [base, jours]);

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Générer les ordres de travail préventifs"
      sousTitre="Un OT est créé pour chaque occurrence non encore couverte"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="primaire" disabled={!apercu.length} onClick={() => onGenerer(jours)}>
            Générer {apercu.length} OT
          </Bouton>
        </>
      }
    >
      <div className="space-y-4">
        <Champ label="Horizon de génération (jours)" aide="Les échéances déjà dépassées sont incluses dans tous les cas.">
          <Saisie type="number" min={1} max={365} value={jours} onChange={(e) => setJours(Number(e.target.value))} />
        </Champ>
        <Encart ton="info">
          {apercu.length === 0
            ? 'Aucune occurrence à générer sur cet horizon.'
            : `${pluriel(apercu.length, 'occurrence')} seront transformées en ordres de travail planifiés, dont ${
                apercu.filter((e) => e.joursRestants < 0).length
              } déjà en retard. Charge estimée : ${nombre(apercu.reduce((s, e) => s + e.dureeMin, 0) / 60, 0)} h.`}
        </Encart>
      </div>
    </Modale>
  );
}
