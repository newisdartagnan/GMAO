import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Badge } from '@/components/ui/Badge';
import { BarreRepartition, Indicateur } from '@/components/ui/Indicateur';
import { Liste } from '@/components/ui/Champs';
import { useGMAO } from '@/data/store';
import { estOuvert, valeurNetteComptable } from '@gmao/partage';
import { montant, nombre } from '@gmao/partage';
import { CRITICITE } from '@gmao/partage';

const ZONES: Record<string, { libelle: string; ton: 'neutre' | 'info' | 'attention' | 'danger' }> = {
  zone1_bas: { libelle: 'Zone 1 — risque faible', ton: 'neutre' },
  zone2_moyen: { libelle: 'Zone 2 — risque modéré', ton: 'info' },
  zone3_haut: { libelle: 'Zone 3 — risque élevé', ton: 'attention' },
  zone4_tres_haut: { libelle: 'Zone 4 — risque très élevé', ton: 'danger' },
};

export function PageImplantation() {
  const { base, index } = useGMAO();
  const [siteId, setSiteId] = useState(base.sites[0].id);
  const [deplies, setDeplies] = useState<Set<string>>(new Set());

  const basculer = (cle: string) =>
    setDeplies((s) => {
      const n = new Set(s);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });

  const arbre = useMemo(() => {
    const batiments = base.batiments.filter((b) => b.siteId === siteId);
    return batiments.map((bat) => {
      const locaux = base.locaux.filter((l) => l.batimentId === bat.id);
      const services = [...new Set(locaux.map((l) => l.serviceId))].map((sid) => {
        const locauxService = locaux.filter((l) => l.serviceId === sid);
        const equipements = base.equipements.filter((e) => locauxService.some((l) => l.id === e.localId));
        return {
          service: index.services.get(sid)!,
          locaux: locauxService.map((l) => ({
            local: l,
            equipements: base.equipements.filter((e) => e.localId === l.id),
          })),
          equipements,
        };
      });
      const equipements = services.flatMap((s) => s.equipements);
      return { batiment: bat, services, equipements };
    });
  }, [base, index, siteId]);

  const site = index.sites.get(siteId)!;
  const equipementsSite = base.equipements.filter((e) => e.siteId === siteId);
  const otOuverts = base.ordresTravail.filter((o) => estOuvert(o) && o.siteId === siteId);

  return (
    <>
      <EnTetePage
        titre="Implantation du parc"
        description="Répartition des équipements par bâtiment, service et local"
        actions={
          <Liste
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="h-9 w-auto py-0 text-sm"
            options={base.sites.map((s) => ({ valeur: s.id, libelle: s.nom }))}
          />
        }
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur libelle="Bâtiments" valeur={nombre(arbre.length, 0)} icone={<Building2 className="size-4" />} detail={`${site.nbLits} lits`} />
          <Indicateur libelle="Locaux référencés" valeur={nombre(base.locaux.filter((l) => l.siteId === siteId).length, 0)} icone={<MapPin className="size-4" />} />
          <Indicateur libelle="Équipements implantés" valeur={nombre(equipementsSite.length, 0)} />
          <Indicateur libelle="Valeur nette du parc" valeur={montant(equipementsSite.reduce((s, e) => s + valeurNetteComptable(e), 0))} />
        </div>

        <div className="space-y-3">
          {arbre.map(({ batiment, services, equipements }) => {
            const ouvertBat = deplies.has(batiment.id);
            const enPanne = equipements.filter((e) => e.statut === 'en_panne' || e.statut === 'attente_pieces').length;
            return (
              <Carte key={batiment.id} sansPadding>
                <button
                  type="button"
                  onClick={() => basculer(batiment.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  {ouvertBat ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}
                  <Building2 className="size-4 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-800">{batiment.nom}</p>
                    <p className="text-xs text-slate-500">
                      {batiment.nbEtages} niveau(x) · construit en {batiment.anneeConstruction} ·{' '}
                      {services.length} service(s) · {equipements.length} équipement(s)
                    </p>
                  </div>
                  <div className="hidden w-40 shrink-0 sm:block">
                    <BarreRepartition
                      segments={[
                        { libelle: 'En service', valeur: equipements.filter((e) => e.statut === 'en_service').length, classe: 'bg-emerald-500' },
                        { libelle: 'Maintenance', valeur: equipements.filter((e) => e.statut === 'en_maintenance').length, classe: 'bg-amber-500' },
                        { libelle: 'Indisponible', valeur: enPanne, classe: 'bg-rose-500' },
                        { libelle: 'Autre', valeur: equipements.filter((e) => ['en_stock', 'en_pret', 'reforme'].includes(e.statut)).length, classe: 'bg-slate-400' },
                      ]}
                    />
                  </div>
                  {enPanne > 0 && (
                    <Badge ton="danger" compact>
                      {enPanne} indisponible(s)
                    </Badge>
                  )}
                </button>

                {ouvertBat && (
                  <div className="divide-y divide-slate-100 border-t border-slate-200">
                    {services.map(({ service, locaux, equipements: eqService }) => {
                      const cle = `${batiment.id}-${service.id}`;
                      const ouvertSrv = deplies.has(cle);
                      return (
                        <div key={cle}>
                          <button
                            type="button"
                            onClick={() => basculer(cle)}
                            className="flex w-full items-center gap-3 py-2 pr-4 pl-10 text-left hover:bg-slate-50"
                          >
                            {ouvertSrv ? <ChevronDown className="size-3.5 text-slate-400" /> : <ChevronRight className="size-3.5 text-slate-400" />}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-slate-800">{service.nom}</p>
                              <p className="text-xs text-slate-500">
                                {service.pole} · {locaux.length} local(aux) · {eqService.length} équipement(s)
                                {service.continuite24_7 && ' · fonctionnement continu'}
                              </p>
                            </div>
                            <Badge ton={CRITICITE[service.criticite].ton} compact>
                              {CRITICITE[service.criticite].libelle}
                            </Badge>
                          </button>

                          {ouvertSrv && (
                            <ul className="divide-y divide-slate-50 bg-slate-50/50">
                              {locaux.map(({ local, equipements: eqLocal }) => (
                                <li key={local.id} className="py-2 pr-4 pl-16">
                                  <div className="flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm text-slate-700">
                                        {local.nom} <span className="font-mono text-xs text-slate-400">{local.code}</span>
                                      </p>
                                      <p className="text-xs text-slate-500">
                                        {local.etage === '0' ? 'rez-de-chaussée' : `étage ${local.etage}`}
                                        {local.surfaceM2 && ` · ${local.surfaceM2} m²`}
                                        {local.accesControle && ' · accès contrôlé'}
                                      </p>
                                    </div>
                                    <Badge ton={ZONES[local.zoneRisque].ton} compact>
                                      {ZONES[local.zoneRisque].libelle}
                                    </Badge>
                                    <span className="w-24 shrink-0 text-right text-xs text-slate-500 tabulaire">
                                      {eqLocal.length} équipement(s)
                                    </span>
                                  </div>
                                  {eqLocal.length > 0 && (
                                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                                      {eqLocal.slice(0, 18).map((e) => (
                                        <li key={e.id}>
                                          <Link
                                            to={`/equipements/${e.id}`}
                                            title={`${e.designation} — ${e.marque} ${e.modele}`}
                                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] hover:border-marque-400 ${
                                              e.statut === 'en_panne' || e.statut === 'attente_pieces'
                                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                                : e.statut === 'en_maintenance'
                                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                  : 'border-slate-200 bg-white text-slate-600'
                                            }`}
                                          >
                                            {e.code}
                                          </Link>
                                        </li>
                                      ))}
                                      {eqLocal.length > 18 && (
                                        <li className="text-[11px] text-slate-400">+ {eqLocal.length - 18}</li>
                                      )}
                                    </ul>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Carte>
            );
          })}
        </div>

        <Carte titre="Interventions ouvertes sur ce site" sousTitre={`${otOuverts.length} ordre(s) de travail`}>
          <div className="flex flex-wrap gap-2">
            {[...new Set(otOuverts.map((o) => o.serviceId))].map((sid) => {
              const n = otOuverts.filter((o) => o.serviceId === sid).length;
              return (
                <Link
                  key={sid}
                  to={`/ordres-travail?service=${sid}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm hover:border-marque-400"
                >
                  <span className="text-slate-700">{index.services.get(sid)?.nom}</span>
                  <span className="tabulaire rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{n}</span>
                </Link>
              );
            })}
            {otOuverts.length === 0 && <p className="text-sm text-slate-500">Aucune intervention en cours sur ce site.</p>}
          </div>
        </Carte>
      </CorpsPage>
    </>
  );
}
