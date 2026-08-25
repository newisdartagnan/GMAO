import { Badge } from '@/components/ui/Badge';
import {
  CLASSE_DM,
  CRITICITE,
  DOMAINE,
  PRIORITE,
  STATUT_DI,
  STATUT_EQUIPEMENT,
  STATUT_OT,
  TYPE_MAINTENANCE,
} from '@/types/labels';
import type {
  ClasseDM,
  DomaineTechnique,
  NiveauCriticite,
  OrdreTravail,
  PrioriteOT,
  StatutDI,
  StatutEquipement,
  StatutOT,
  TypeMaintenance,
} from '@/types/domain';

export const BadgeStatutEquipement = ({ statut }: { statut: StatutEquipement }) => (
  <Badge ton={STATUT_EQUIPEMENT[statut].ton} pastille>
    {STATUT_EQUIPEMENT[statut].libelle}
  </Badge>
);

export const BadgeStatutOT = ({ statut }: { statut: StatutOT }) => (
  <Badge ton={STATUT_OT[statut].ton} pastille>
    {STATUT_OT[statut].libelle}
  </Badge>
);

export const BadgeStatutDI = ({ statut }: { statut: StatutDI }) => (
  <Badge ton={STATUT_DI[statut].ton} pastille>
    {STATUT_DI[statut].libelle}
  </Badge>
);

export const BadgePriorite = ({ priorite, compact }: { priorite: PrioriteOT; compact?: boolean }) => (
  <Badge ton={PRIORITE[priorite].ton} titre={PRIORITE[priorite].aide} compact={compact}>
    {compact ? priorite : PRIORITE[priorite].libelle}
  </Badge>
);

export const BadgeCriticite = ({ niveau, compact }: { niveau: NiveauCriticite; compact?: boolean }) => (
  <Badge ton={CRITICITE[niveau].ton} titre={CRITICITE[niveau].aide} compact={compact}>
    {CRITICITE[niveau].libelle}
  </Badge>
);

export const BadgeTypeMaintenance = ({ type, compact }: { type: TypeMaintenance; compact?: boolean }) => (
  <Badge ton={TYPE_MAINTENANCE[type].ton} titre={TYPE_MAINTENANCE[type].aide} compact={compact}>
    {TYPE_MAINTENANCE[type].libelle}
  </Badge>
);

export const BadgeDomaine = ({ domaine }: { domaine: DomaineTechnique }) => (
  <Badge ton={DOMAINE[domaine].ton}>{DOMAINE[domaine].libelle}</Badge>
);

export const BadgeClasseDM = ({ classe }: { classe: ClasseDM }) => (
  <Badge ton={CLASSE_DM[classe].ton} titre={CLASSE_DM[classe].aide}>
    {CLASSE_DM[classe].libelle}
  </Badge>
);

export function BadgeConformite({ conformite }: { conformite: OrdreTravail['conformite'] }) {
  if (!conformite) return <span className="text-slate-400">—</span>;
  const map = {
    conforme: { ton: 'succes', libelle: 'Conforme' },
    conforme_avec_reserves: { ton: 'attention', libelle: 'Conforme avec réserves' },
    non_conforme: { ton: 'danger', libelle: 'Non conforme' },
  } as const;
  const m = map[conformite];
  return (
    <Badge ton={m.ton} pastille>
      {m.libelle}
    </Badge>
  );
}
