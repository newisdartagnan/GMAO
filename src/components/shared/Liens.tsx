import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { useGMAO } from '@/data/store';
import { initiales } from '@/lib/format';
import type { ID } from '@/types/domain';

export function LienEquipement({ id, avecDesignation = true }: { id?: ID; avecDesignation?: boolean }) {
  const { index } = useGMAO();
  if (!id) return <span className="text-slate-400">—</span>;
  const eq = index.equipements.get(id);
  if (!eq) return <span className="text-slate-400">Équipement inconnu</span>;
  return (
    <Link to={`/equipements/${eq.id}`} className="group inline-flex min-w-0 items-baseline gap-1.5" onClick={(e) => e.stopPropagation()}>
      <span className="font-mono text-xs text-slate-500 group-hover:text-marque-700">{eq.code}</span>
      {avecDesignation && <span className="truncate text-slate-800 group-hover:text-marque-800 group-hover:underline">{eq.designation}</span>}
    </Link>
  );
}

export function LienOT({ id }: { id?: ID }) {
  const { base } = useGMAO();
  if (!id) return <span className="text-slate-400">—</span>;
  const ot = base.ordresTravail.find((o) => o.id === id);
  if (!ot) return <span className="text-slate-400">—</span>;
  return (
    <Link to={`/ordres-travail/${ot.id}`} className="lien font-mono text-xs" onClick={(e) => e.stopPropagation()}>
      {ot.numero}
    </Link>
  );
}

export function NomUtilisateur({ id, avecRole = false }: { id?: ID; avecRole?: boolean }) {
  const { index } = useGMAO();
  if (!id) return <span className="text-slate-400">Non affecté</span>;
  const u = index.utilisateurs.get(id);
  if (!u) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar nom={u.nom} prenom={u.prenom} />
      <span className="truncate">
        {u.prenom} {u.nom}
        {avecRole && <span className="block text-xs text-slate-500">{u.role.replace(/_/g, ' ')}</span>}
      </span>
    </span>
  );
}

export function Avatar({ nom, prenom, taille = 'sm' }: { nom: string; prenom?: string; taille?: 'sm' | 'md' }) {
  const classes = taille === 'sm' ? 'size-6 text-[10px]' : 'size-9 text-xs';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-marque-100 font-semibold text-marque-800 ${classes}`}
    >
      {initiales(nom, prenom)}
    </span>
  );
}

/** Site › bâtiment › service › local, tronqué selon la place disponible. */
export function Localisation({ localId, court = false }: { localId?: ID; court?: boolean }) {
  const { index } = useGMAO();
  if (!localId) return <span className="text-slate-400">—</span>;
  const local = index.locaux.get(localId);
  if (!local) return <span className="text-slate-400">—</span>;
  const service = index.services.get(local.serviceId);
  const batiment = index.batiments.get(local.batimentId);

  if (court) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-slate-600" title={`${batiment?.nom} — ${local.nom}`}>
        <MapPin className="size-3 shrink-0 text-slate-400" />
        <span className="truncate">{service?.nom ?? local.nom}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex min-w-0 flex-col">
      <span className="truncate text-slate-800">{service?.nom}</span>
      <span className="truncate text-xs text-slate-500">
        {batiment?.code}
        {local.etage !== '0' ? `, étage ${local.etage}` : ', rez-de-chaussée'} — {local.nom} ({local.code})
      </span>
    </span>
  );
}

export function NomFournisseur({ id }: { id?: ID }) {
  const { index } = useGMAO();
  if (!id) return <span className="text-slate-400">—</span>;
  return <span>{index.fournisseurs.get(id)?.raisonSociale ?? '—'}</span>;
}

export function NomService({ id }: { id?: ID }) {
  const { index } = useGMAO();
  if (!id) return <span className="text-slate-400">—</span>;
  return <span>{index.services.get(id)?.nom ?? '—'}</span>;
}
