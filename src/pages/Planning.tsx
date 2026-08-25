import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Users } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Badge } from '@/components/ui/Badge';
import { Bouton } from '@/components/ui/Bouton';
import { Liste, Segments } from '@/components/ui/Champs';
import { Indicateur } from '@/components/ui/Indicateur';
import { Encart } from '@/components/ui/Info';
import { BadgePriorite, BadgeTypeMaintenance } from '@/components/shared/Etiquettes';
import { Avatar } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import { estOuvert, tempsPasseMin } from '@/lib/kpi';
import { addDays, aujourdHui, dateCourte, iso } from '@/lib/dates';
import { duree, nombre, pourcent } from '@/lib/format';
import type { OrdreTravail } from '@/types/domain';

const JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

export function PagePlanning() {
  const { base, index } = useGMAO();
  const [equipeId, setEquipeId] = useState('');
  const [decalage, setDecalage] = useState(0);
  const [vue, setVue] = useState<'semaine' | 'charge'>('semaine');

  /** Lundi de la semaine affichée. */
  const debutSemaine = useMemo(() => {
    const d = aujourdHui();
    const jour = (d.getDay() + 6) % 7;
    return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -jour + decalage * 7);
  }, [decalage]);

  const jours = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(debutSemaine, i)), [debutSemaine]);

  const techniciens = useMemo(
    () => base.utilisateurs.filter((u) => u.actif && u.role === 'technicien' && (!equipeId || u.equipeId === equipeId)),
    [base.utilisateurs, equipeId],
  );

  const otPlanifies = useMemo(() => {
    const debut = iso(debutSemaine);
    const fin = iso(addDays(debutSemaine, 7));
    return base.ordresTravail.filter(
      (o) => o.datePlanifiee && o.datePlanifiee >= debut && o.datePlanifiee < fin && (!equipeId || o.equipeId === equipeId),
    );
  }, [base.ordresTravail, debutSemaine, equipeId]);

  const charge = useMemo(() => {
    return techniciens
      .map((t) => {
        const ots = base.ordresTravail.filter((o) => o.technicienPrincipalId === t.id && estOuvert(o));
        const gammes = ots.map((o) => (o.gammeId ? index.gammes.get(o.gammeId)?.dureeEstimeeMin ?? 90 : 120));
        const chargeMin = gammes.reduce((s, v) => s + v, 0);
        const equipe = t.equipeId ? index.equipes.get(t.equipeId) : undefined;
        const capaciteMin = (equipe?.heuresHebdo ?? 40) * 60;
        return {
          technicien: t,
          nbOT: ots.length,
          chargeMin,
          capaciteMin,
          taux: capaciteMin ? (chargeMin / capaciteMin) * 100 : 0,
          realiseMin: base.ordresTravail
            .filter((o) => o.temps.some((x) => x.technicienId === t.id))
            .reduce((s, o) => s + o.temps.filter((x) => x.technicienId === t.id).reduce((a, x) => a + x.dureeMin, 0), 0),
        };
      })
      .sort((a, b) => b.taux - a.taux);
  }, [techniciens, base.ordresTravail, index]);

  const nonAffectes = base.ordresTravail.filter((o) => estOuvert(o) && !o.technicienPrincipalId && o.execution === 'interne');

  return (
    <>
      <EnTetePage
        titre="Planning et plan de charge"
        description="Répartition hebdomadaire des interventions et charge des équipes techniques"
        actions={
          <>
            <Segments
              valeur={vue}
              onChange={setVue}
              taille="sm"
              options={[
                { valeur: 'semaine', libelle: 'Semaine' },
                { valeur: 'charge', libelle: 'Plan de charge' },
              ]}
            />
            <Liste
              value={equipeId}
              onChange={(e) => setEquipeId(e.target.value)}
              className="h-9 w-auto py-0 text-sm"
              vide="Toutes les équipes"
              options={base.equipes.map((e) => ({ valeur: e.id, libelle: e.nom }))}
            />
          </>
        }
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur libelle="Techniciens" valeur={nombre(techniciens.length, 0)} icone={<Users className="size-4" />} />
          <Indicateur
            libelle="OT planifiés cette semaine"
            valeur={nombre(otPlanifies.length, 0)}
            icone={<CalendarDays className="size-4" />}
          />
          <Indicateur
            libelle="Non affectés"
            valeur={nombre(nonAffectes.length, 0)}
            accent={nonAffectes.length ? 'attention' : 'positif'}
            lien="/ordres-travail?statut=a_planifier"
          />
          <Indicateur
            libelle="Charge moyenne"
            valeur={pourcent(charge.length ? charge.reduce((s, c) => s + c.taux, 0) / charge.length : 0, 0)}
            accent={charge.some((c) => c.taux > 110) ? 'negatif' : 'neutre'}
            detail="OT ouverts / capacité hebdomadaire"
          />
        </div>

        {charge.some((c) => c.taux > 130) && (
          <Encart ton="attention" titre="Surcharge repérée">
            {charge
              .filter((c) => c.taux > 130)
              .map((c) => `${c.technicien.prenom} ${c.technicien.nom} (${Math.round(c.taux)} %)`)
              .join(' · ')}
            . Le report d’interventions préventives est le premier symptôme d’une charge mal répartie.
          </Encart>
        )}

        {vue === 'semaine' ? (
          <Carte
            sansPadding
            titre={`Semaine du ${dateCourte(debutSemaine)} au ${dateCourte(addDays(debutSemaine, 6))}`}
            actions={
              <div className="flex items-center gap-1">
                <Bouton taille="sm" onClick={() => setDecalage((d) => d - 1)}>
                  ←
                </Bouton>
                <Bouton taille="sm" onClick={() => setDecalage(0)} variante={decalage === 0 ? 'primaire' : 'secondaire'}>
                  Aujourd’hui
                </Bouton>
                <Bouton taille="sm" onClick={() => setDecalage((d) => d + 1)}>
                  →
                </Bouton>
              </div>
            }
          >
            <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-7 lg:divide-x lg:divide-y-0">
              {jours.map((jour, i) => {
                const cle = iso(jour);
                const duJour = otPlanifies.filter((o) => o.datePlanifiee === cle);
                const estAujourdHui = cle === iso(aujourdHui());
                const chargeJour = duJour.reduce(
                  (s, o) => s + (o.gammeId ? index.gammes.get(o.gammeId)?.dureeEstimeeMin ?? 90 : 120),
                  0,
                );
                return (
                  <div key={cle} className={`min-h-52 ${estAujourdHui ? 'bg-marque-50/50' : ''}`}>
                    <div className="border-b border-slate-100 px-2.5 py-2">
                      <p className={`text-xs font-semibold ${estAujourdHui ? 'text-marque-800' : 'text-slate-600'}`}>
                        {JOURS[i]} {jour.getDate()}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {duJour.length} OT · {duree(chargeJour)}
                      </p>
                    </div>
                    <ul className="space-y-1.5 p-2">
                      {duJour.slice(0, 12).map((o) => (
                        <li key={o.id}>
                          <Link
                            to={`/ordres-travail/${o.id}`}
                            className="block rounded-md border border-slate-200 bg-white p-1.5 text-xs shadow-sm hover:border-marque-300"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <BadgePriorite priorite={o.priorite} compact />
                              <span className="truncate font-mono text-[10px] text-slate-400">{o.numero.slice(-5)}</span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-slate-700">{o.objet}</p>
                            <p className="mt-0.5 truncate text-[10px] text-slate-500">
                              {o.execution === 'prestataire'
                                ? (index.fournisseurs.get(o.prestataireId ?? '')?.raisonSociale ?? 'prestataire externe')
                                : o.technicienPrincipalId
                                  ? `${index.utilisateurs.get(o.technicienPrincipalId)?.prenom} ${index.utilisateurs.get(o.technicienPrincipalId)?.nom}`
                                  : 'à affecter'}
                            </p>
                          </Link>
                        </li>
                      ))}
                      {duJour.length > 12 && (
                        <li className="text-center text-[11px] text-slate-400">+ {duJour.length - 12} autres</li>
                      )}
                      {duJour.length === 0 && <li className="py-4 text-center text-[11px] text-slate-300">—</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Carte>
        ) : (
          <Carte sansPadding titre="Plan de charge par technicien" sousTitre="OT ouverts rapportés à la capacité hebdomadaire">
            <ul className="divide-y divide-slate-100">
              {charge.map((c) => (
                <li key={c.technicien.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <Avatar nom={c.technicien.nom} prenom={c.technicien.prenom} taille="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {c.technicien.prenom} {c.technicien.nom}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {index.equipes.get(c.technicien.equipeId ?? '')?.nom} ·{' '}
                      {c.technicien.competences.slice(0, 2).join(', ') || 'aucune habilitation enregistrée'}
                    </p>
                  </div>
                  <div className="w-full sm:w-64">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-slate-500">
                        {c.nbOT} OT · {duree(c.chargeMin)} estimées
                      </span>
                      <span
                        className={`tabulaire font-medium ${
                          c.taux > 110 ? 'text-rose-600' : c.taux > 85 ? 'text-amber-600' : 'text-emerald-700'
                        }`}
                      >
                        {Math.round(c.taux)} %
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${c.taux > 110 ? 'bg-rose-500' : c.taux > 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, c.taux)}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-slate-500">Réalisé cumulé</p>
                    <p className="text-sm tabulaire text-slate-700">{duree(c.realiseMin)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Carte>
        )}

        {nonAffectes.length > 0 && (
          <Carte sansPadding titre="Interventions internes non affectées" sousTitre="À répartir entre les techniciens">
            <ul className="divide-y divide-slate-100">
              {nonAffectes.slice(0, 15).map((o: OrdreTravail) => (
                <li key={o.id}>
                  <Link to={`/ordres-travail/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <BadgePriorite priorite={o.priorite} compact />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{o.objet}</p>
                      <p className="truncate text-xs text-slate-500">
                        {o.numero} · {index.services.get(o.serviceId)?.nom}
                      </p>
                    </div>
                    <BadgeTypeMaintenance type={o.type} compact />
                    <Badge ton="neutre" compact>
                      {tempsPasseMin(o) ? duree(tempsPasseMin(o)) : 'non démarré'}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Carte>
        )}
      </CorpsPage>
    </>
  );
}
