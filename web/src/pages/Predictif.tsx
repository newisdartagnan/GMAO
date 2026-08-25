import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, TrendingUp } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Badge } from '@/components/ui/Badge';
import { Indicateur } from '@/components/ui/Indicateur';
import { Vide, Encart } from '@/components/ui/Info';
import { useGMAO } from '@/data/store';
import { dateCourte } from '@gmao/partage';
import { nombre } from '@gmao/partage';
import { TYPE_MESURE } from '@gmao/partage';
import type { Capteur } from '@gmao/partage';

/**
 * Détection de dérive : régression linéaire simple sur les relevés, puis
 * projection de la date de franchissement du seuil d'alerte. C'est
 * volontairement rustique — sur des relevés horaires, une pente suffit à
 * distinguer une dérive lente d'un bruit de mesure.
 */
function tendance(valeurs: { x: number; y: number }[]) {
  const n = valeurs.length;
  if (n < 4) return { pente: 0, ordonnee: valeurs[0]?.y ?? 0 };
  const sx = valeurs.reduce((s, p) => s + p.x, 0);
  const sy = valeurs.reduce((s, p) => s + p.y, 0);
  const sxy = valeurs.reduce((s, p) => s + p.x * p.y, 0);
  const sxx = valeurs.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return { pente: 0, ordonnee: sy / n };
  const pente = (n * sxy - sx * sy) / denom;
  return { pente, ordonnee: (sy - pente * sx) / n };
}

export function PagePredictif() {
  const { base, index } = useGMAO();
  const [selection, setSelection] = useState<string | null>(null);

  const analyses = useMemo(() => {
    return base.capteurs
      .filter((c) => c.actif)
      .map((capteur) => {
        const releves = base.releves
          .filter((r) => r.capteurId === capteur.id)
          .sort((a, b) => a.date.localeCompare(b.date));
        const points = releves.map((r, i) => ({ x: i, y: r.valeur }));
        const { pente } = tendance(points);
        const dernier = releves.at(-1);
        const valeur = dernier?.valeur ?? 0;

        // 4 relevés par jour dans le jeu de données : la pente est par relevé.
        const parJour = pente * 4;
        let joursAvantSeuil: number | null = null;
        if (capteur.seuilHautAlerte !== undefined && parJour > 0.0001) {
          joursAvantSeuil = (capteur.seuilHautAlerte - valeur) / parJour;
        } else if (capteur.seuilBasAlerte !== undefined && parJour < -0.0001) {
          joursAvantSeuil = (valeur - capteur.seuilBasAlerte) / -parJour;
        }

        const horsSeuil =
          (capteur.seuilHautCritique !== undefined && valeur >= capteur.seuilHautCritique) ||
          (capteur.seuilBasCritique !== undefined && valeur <= capteur.seuilBasCritique)
            ? 'critique'
            : (capteur.seuilHautAlerte !== undefined && valeur >= capteur.seuilHautAlerte) ||
                (capteur.seuilBasAlerte !== undefined && valeur <= capteur.seuilBasAlerte)
              ? 'alerte'
              : null;

        return { capteur, releves, valeur, parJour, joursAvantSeuil, horsSeuil };
      })
      .sort((a, b) => {
        const rang = (s: string | null) => (s === 'critique' ? 0 : s === 'alerte' ? 1 : 2);
        if (rang(a.horsSeuil) !== rang(b.horsSeuil)) return rang(a.horsSeuil) - rang(b.horsSeuil);
        return (a.joursAvantSeuil ?? 9999) - (b.joursAvantSeuil ?? 9999);
      });
  }, [base]);

  const derives = analyses.filter((a) => a.joursAvantSeuil !== null && a.joursAvantSeuil > 0 && a.joursAvantSeuil < 60);
  const courant = analyses.find((a) => a.capteur.id === selection) ?? analyses[0];

  if (!analyses.length) {
    return (
      <>
        <EnTetePage titre="Maintenance prédictive" />
        <CorpsPage>
          <Vide titre="Aucun capteur déclaré" description="Les équipements instrumentés apparaîtront ici." icone={<Activity className="size-8" />} />
        </CorpsPage>
      </>
    );
  }

  return (
    <>
      <EnTetePage
        titre="Maintenance prédictive"
        description="Surveillance des grandeurs physiques et détection de dérive avant défaillance"
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur libelle="Capteurs actifs" valeur={nombre(analyses.length, 0)} icone={<Activity className="size-4" />} />
          <Indicateur
            libelle="Seuils franchis"
            valeur={nombre(analyses.filter((a) => a.horsSeuil).length, 0)}
            accent={analyses.some((a) => a.horsSeuil === 'critique') ? 'negatif' : 'attention'}
          />
          <Indicateur
            libelle="Dérives détectées"
            valeur={nombre(derives.length, 0)}
            accent={derives.length ? 'attention' : 'positif'}
            detail="seuil atteint sous 60 jours"
            icone={<TrendingUp className="size-4" />}
          />
          <Indicateur libelle="Relevés analysés" valeur={nombre(base.releves.length, 0)} detail="30 derniers jours" />
        </div>

        {derives.length > 0 && (
          <Encart ton="attention" titre="Dérives à anticiper">
            <ul className="list-inside list-disc space-y-0.5">
              {derives.slice(0, 4).map((d) => {
                const eq = index.equipements.get(d.capteur.equipementId);
                return (
                  <li key={d.capteur.id}>
                    <strong>{eq?.code}</strong> {eq?.designation} — {TYPE_MESURE[d.capteur.type].libelle} atteindra le
                    seuil d’alerte dans environ {nombre(d.joursAvantSeuil ?? 0, 0)} jours au rythme actuel.
                  </li>
                );
              })}
            </ul>
            <p className="mt-1.5">Programmer l’intervention maintenant coûte moins qu’un arrêt subi.</p>
          </Encart>
        )}

        <div className="grid gap-4 xl:grid-cols-3">
          <Carte sansPadding titre="Capteurs" sousTitre={`${analyses.length} points de mesure`} className="xl:col-span-1">
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {analyses.map((a) => {
                const eq = index.equipements.get(a.capteur.equipementId);
                const actif = a.capteur.id === courant?.capteur.id;
                return (
                  <li key={a.capteur.id}>
                    <button
                      type="button"
                      onClick={() => setSelection(a.capteur.id)}
                      className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                        actif ? 'bg-marque-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-800">{eq?.designation}</p>
                        <p className="truncate text-xs text-slate-500">
                          {eq?.code} · {TYPE_MESURE[a.capteur.type].libelle}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`text-sm font-medium tabulaire ${
                            a.horsSeuil === 'critique' ? 'text-rose-600' : a.horsSeuil === 'alerte' ? 'text-amber-600' : 'text-slate-700'
                          }`}
                        >
                          {a.valeur} {a.capteur.unite}
                        </p>
                        {a.joursAvantSeuil !== null && a.joursAvantSeuil > 0 && a.joursAvantSeuil < 90 && (
                          <p className="text-[11px] text-amber-600">seuil ~{nombre(a.joursAvantSeuil, 0)} j</p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Carte>

          {courant && <CourbeCapteur analyse={courant} />}
        </div>
      </CorpsPage>
    </>
  );
}

function CourbeCapteur({
  analyse,
}: {
  analyse: {
    capteur: Capteur;
    releves: { date: string; valeur: number }[];
    valeur: number;
    parJour: number;
    joursAvantSeuil: number | null;
    horsSeuil: string | null;
  };
}) {
  const { index } = useGMAO();
  const eq = index.equipements.get(analyse.capteur.equipementId);
  const donnees = analyse.releves.map((r) => ({
    date: r.date.slice(5, 10).replace('-', '/'),
    valeur: r.valeur,
  }));

  const c = analyse.capteur;

  return (
    <Carte
      className="xl:col-span-2"
      titre={`${TYPE_MESURE[c.type].libelle} — ${eq?.designation}`}
      sousTitre={`${eq?.code} · capteur ${c.code} · relevé toutes les ${c.frequenceReleveMin} min`}
      actions={
        analyse.horsSeuil ? (
          <Badge ton={analyse.horsSeuil === 'critique' ? 'danger' : 'attention'}>
            {analyse.horsSeuil === 'critique' ? 'Seuil critique franchi' : 'Seuil d’alerte franchi'}
          </Badge>
        ) : (
          <Badge ton="succes">Dans la plage nominale</Badge>
        )
      }
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={donnees} margin={{ top: 5, right: 10, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              formatter={(v: number) => [`${v} ${c.unite}`, TYPE_MESURE[c.type].libelle]}
            />
            {c.seuilHautCritique !== undefined && (
              <ReferenceLine y={c.seuilHautCritique} stroke="#e11d48" strokeDasharray="4 4" label={{ value: 'critique haut', fontSize: 10, fill: '#e11d48', position: 'insideTopRight' }} />
            )}
            {c.seuilHautAlerte !== undefined && (
              <ReferenceLine y={c.seuilHautAlerte} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'alerte haute', fontSize: 10, fill: '#b45309', position: 'insideTopLeft' }} />
            )}
            {c.seuilBasAlerte !== undefined && (
              <ReferenceLine y={c.seuilBasAlerte} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'alerte basse', fontSize: 10, fill: '#b45309', position: 'insideBottomRight' }} />
            )}
            {c.seuilBasCritique !== undefined && (
              <ReferenceLine y={c.seuilBasCritique} stroke="#e11d48" strokeDasharray="4 4" label={{ value: 'critique bas', fontSize: 10, fill: '#e11d48', position: 'insideBottomLeft' }} />
            )}
            <Line type="monotone" dataKey="valeur" stroke="#0d9488" strokeWidth={1.8} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Dernière mesure</p>
          <p className="text-lg font-semibold tabulaire text-slate-800">
            {analyse.valeur} {c.unite}
          </p>
          <p className="text-xs text-slate-500">le {dateCourte(analyse.releves.at(-1)?.date)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Tendance</p>
          <p className={`text-lg font-semibold tabulaire ${Math.abs(analyse.parJour) < 0.01 ? 'text-slate-800' : 'text-amber-700'}`}>
            {analyse.parJour >= 0 ? '+' : ''}
            {nombre(analyse.parJour, 3)} {c.unite}/j
          </p>
          <p className="text-xs text-slate-500">régression sur 30 jours</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Franchissement projeté</p>
          <p
            className={`text-lg font-semibold tabulaire ${
              analyse.horsSeuil ? 'text-rose-700' : 'text-slate-800'
            }`}
          >
            {analyse.horsSeuil
              ? 'atteint'
              : analyse.joursAvantSeuil !== null && analyse.joursAvantSeuil > 0
                ? `${nombre(analyse.joursAvantSeuil, 0)} j`
                : '—'}
          </p>
          <p className="text-xs text-slate-500">
            {analyse.horsSeuil
              ? 'seuil déjà franchi'
              : analyse.joursAvantSeuil !== null && analyse.joursAvantSeuil > 0
                ? 'au rythme actuel'
                : 'aucune dérive significative'}
          </p>
        </div>
      </div>
    </Carte>
  );
}
