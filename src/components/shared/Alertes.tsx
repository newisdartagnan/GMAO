import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, CircleAlert, Info } from 'lucide-react';
import type { AlerteCalculee } from '@/lib/alertes';
import { SOURCE_ALERTE } from '@/types/labels';
import { Vide } from '@/components/ui/Info';

const ICONES = {
  critique: <CircleAlert className="size-4 text-rose-600" />,
  alerte: <AlertTriangle className="size-4 text-amber-600" />,
  info: <Info className="size-4 text-sky-600" />,
};

const FONDS = {
  critique: 'border-l-rose-500 bg-rose-50/40 hover:bg-rose-50',
  alerte: 'border-l-amber-500 bg-amber-50/40 hover:bg-amber-50',
  info: 'border-l-sky-400 bg-sky-50/30 hover:bg-sky-50',
};

export function ListeAlertes({
  alertes,
  limite,
  compact = false,
}: {
  alertes: AlerteCalculee[];
  limite?: number;
  compact?: boolean;
}) {
  const affichees = limite ? alertes.slice(0, limite) : alertes;

  if (!affichees.length) {
    return <Vide titre="Aucune alerte en cours" description="Les échéances et les seuils surveillés sont tous dans le vert." icone={<Bell className="size-8" />} />;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {affichees.map((a) => {
        const contenu = (
          <div className={`flex gap-3 border-l-4 px-3.5 ${compact ? 'py-2' : 'py-2.5'} transition-colors ${FONDS[a.niveau]}`}>
            <span className="mt-0.5 shrink-0">{ICONES[a.niveau]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{a.titre}</p>
              <p className="truncate text-sm text-slate-600">{a.message}</p>
              {!compact && <p className="mt-0.5 text-xs text-slate-400">{SOURCE_ALERTE[a.source]}</p>}
            </div>
          </div>
        );
        return (
          <li key={a.id}>
            {a.lien ? (
              <Link to={a.lien} className="block">
                {contenu}
              </Link>
            ) : (
              contenu
            )}
          </li>
        );
      })}
    </ul>
  );
}
