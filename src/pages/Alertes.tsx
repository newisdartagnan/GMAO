import { useMemo, useState } from 'react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Segments } from '@/components/ui/Champs';
import { Indicateur } from '@/components/ui/Indicateur';
import { ListeAlertes } from '@/components/shared/Alertes';
import { useGMAO } from '@/data/store';
import { compterAlertes } from '@/lib/alertes';
import { SOURCE_ALERTE } from '@/types/labels';
import { nombre } from '@/lib/format';
import type { SourceAlerte } from '@/types/domain';

export function PageAlertes() {
  const { alertes } = useGMAO();
  const [niveau, setNiveau] = useState<'critique' | 'alerte' | 'info' | 'tous'>('tous');
  const [source, setSource] = useState<SourceAlerte | 'toutes'>('toutes');

  const compteurs = useMemo(() => compterAlertes(alertes), [alertes]);

  const parSource = useMemo(() => {
    const m = new Map<SourceAlerte, number>();
    for (const a of alertes) m.set(a.source, (m.get(a.source) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [alertes]);

  const filtrees = alertes.filter(
    (a) => (niveau === 'tous' || a.niveau === niveau) && (source === 'toutes' || a.source === source),
  );

  return (
    <>
      <EnTetePage
        titre="Alertes"
        description="Situations recalculées en continu à partir des échéances, des seuils et des engagements de service"
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur libelle="Critiques" valeur={nombre(compteurs.critiques, 0)} accent={compteurs.critiques ? 'negatif' : 'positif'} detail="décision immédiate attendue" />
          <Indicateur libelle="Alertes" valeur={nombre(compteurs.alertes, 0)} accent="attention" detail="à traiter cette semaine" />
          <Indicateur libelle="Informations" valeur={nombre(compteurs.infos, 0)} detail="à anticiper" />
          <Indicateur libelle="Total" valeur={nombre(compteurs.total, 0)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <Carte titre="Par origine" className="lg:col-span-1">
            <ul className="space-y-1">
              <li>
                <button
                  type="button"
                  onClick={() => setSource('toutes')}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                    source === 'toutes' ? 'bg-marque-50 font-medium text-marque-800' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>Toutes les origines</span>
                  <span className="tabulaire text-xs">{alertes.length}</span>
                </button>
              </li>
              {parSource.map(([s, n]) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => setSource(s)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      source === s ? 'bg-marque-50 font-medium text-marque-800' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{SOURCE_ALERTE[s]}</span>
                    <span className="tabulaire shrink-0 text-xs">{n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Carte>

          <Carte
            className="lg:col-span-3"
            sansPadding
            titre={source === 'toutes' ? 'Toutes les alertes' : SOURCE_ALERTE[source]}
            sousTitre={`${filtrees.length} élément(s)`}
            actions={
              <Segments
                valeur={niveau}
                onChange={setNiveau}
                taille="sm"
                options={[
                  { valeur: 'tous', libelle: 'Tous' },
                  { valeur: 'critique', libelle: 'Critique', compteur: compteurs.critiques },
                  { valeur: 'alerte', libelle: 'Alerte', compteur: compteurs.alertes },
                  { valeur: 'info', libelle: 'Info', compteur: compteurs.infos },
                ]}
              />
            }
          >
            <div className="max-h-[65vh] overflow-y-auto">
              <ListeAlertes alertes={filtrees} />
            </div>
          </Carte>
        </div>
      </CorpsPage>
    </>
  );
}
