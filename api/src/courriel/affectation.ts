import { PRIORITE, dateHeure } from '@gmao/partage';
import type { BaseGMAO, OrdreTravail, Utilisateur } from '@gmao/partage';
import { config } from '../config.ts';
import { observerCommandes } from '../etat.ts';
import { envoyer } from './envoi.ts';
import type { Message } from './envoi.ts';

/**
 * Prévenir le technicien qu'un ordre de travail lui revient.
 *
 * Sans cela, un OT affecté le matin peut attendre que son destinataire pense
 * à ouvrir l'écran. Le courriel ne remplace pas la GMAO : il dit qu'il y a
 * quelque chose à y voir, et donne de quoi décider s'il faut y aller tout de
 * suite — l'équipement, le lieu, la priorité, l'échéance.
 */

/** Les ordres de travail dont le technicien principal vient de changer. */
export function affectationsNouvelles(
  avant: BaseGMAO,
  apres: BaseGMAO,
): { ot: OrdreTravail; technicienId: string }[] {
  const precedent = new Map(avant.ordresTravail.map((o) => [o.id, o.technicienPrincipalId]));
  const sorties: { ot: OrdreTravail; technicienId: string }[] = [];

  for (const ot of apres.ordresTravail) {
    const technicienId = ot.technicienPrincipalId;
    if (!technicienId) continue;
    // Un OT créé déjà affecté compte aussi : il n'était pas dans « avant ».
    const avantLui = precedent.get(ot.id);
    if (avantLui === technicienId) continue;
    sorties.push({ ot, technicienId });
  }
  return sorties;
}

/** Le message, tel que le technicien le lira. */
export function messageAffectation(base: BaseGMAO, ot: OrdreTravail, technicien: Utilisateur): Message {
  const equipement = ot.equipementId ? base.equipements.find((e) => e.id === ot.equipementId) : undefined;
  const local = ot.localId ? base.locaux.find((l) => l.id === ot.localId) : undefined;
  const service = base.services.find((s) => s.id === ot.serviceId);
  const priorite = PRIORITE[ot.priorite];
  const lien = config.courriel.baseUrl ? `${config.courriel.baseUrl}/ordres-travail/${ot.id}` : '';

  const lignes: [string, string | undefined][] = [
    ['Priorité', `${priorite.libelle}${priorite.aide ? ` — ${priorite.aide}` : ''}`],
    ['À terminer avant', ot.dateEcheanceSLA ? dateHeure(ot.dateEcheanceSLA) : undefined],
    ['Prévu le', ot.datePlanifiee ? dateHeure(ot.datePlanifiee) : 'à planifier'],
    ['Équipement', equipement ? `${equipement.code} — ${equipement.designation}` : 'aucun'],
    ['Lieu', local ? local.nom : undefined],
    ['Service', service?.nom],
  ];
  const detail = lignes.filter(([, v]) => v).map(([c, v]) => `${c.padEnd(18)}${v}`);

  const texte = [
    `Bonjour ${technicien.prenom},`,
    '',
    `L'ordre de travail ${ot.numero} vous a été affecté.`,
    '',
    ot.objet,
    '',
    ...detail,
    '',
    ...(ot.description ? [ot.description, ''] : []),
    ...(lien ? [`Ouvrir dans la GMAO : ${lien}`, ''] : []),
    '— Message automatique de la GMAO. Ne pas répondre à cette adresse.',
  ].join('\n');

  const echappe = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = [
    '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a">',
    `<p>Bonjour ${echappe(technicien.prenom)},</p>`,
    `<p>L'ordre de travail <strong>${echappe(ot.numero)}</strong> vous a été affecté.</p>`,
    `<p style="font-size:16px;font-weight:600">${echappe(ot.objet)}</p>`,
    '<table cellpadding="4" style="border-collapse:collapse;font-size:14px">',
    ...lignes
      .filter(([, v]) => v)
      .map(
        ([c, v]) =>
          `<tr><td style="color:#64748b;padding-right:12px">${echappe(c)}</td>` +
          `<td><strong>${echappe(v!)}</strong></td></tr>`,
      ),
    '</table>',
    ...(ot.description ? [`<p style="white-space:pre-line">${echappe(ot.description)}</p>`] : []),
    ...(lien
      ? [
          `<p><a href="${echappe(lien)}" style="display:inline-block;padding:10px 16px;` +
            'background:#0f766e;color:#fff;border-radius:6px;text-decoration:none">' +
            "Ouvrir l'ordre de travail</a></p>",
        ]
      : []),
    '<p style="color:#64748b;font-size:12px">Message automatique de la GMAO. Ne pas répondre à cette adresse.</p>',
    '</div>',
  ].join('');

  return {
    a: [technicien.email],
    sujet: `${ot.numero} — ${ot.objet} (${priorite.libelle})`,
    texte,
    html,
  };
}

/**
 * Branche la notification sur toutes les commandes.
 *
 * L'envoi est détaché de l'écriture : la commande a déjà réussi, et le
 * courriel ne doit ni la retarder ni la faire échouer.
 */
export function brancherNotifications(journaliser: (m: string, e?: unknown) => void): void {
  observerCommandes((avant, apres) => {
    for (const { ot, technicienId } of affectationsNouvelles(avant, apres)) {
      const technicien = apres.utilisateurs.find((u) => u.id === technicienId);
      if (!technicien) continue;
      if (!technicien.email) {
        journaliser(`OT ${ot.numero} affecté à ${technicien.prenom} ${technicien.nom} : aucune adresse connue`);
        continue;
      }

      void envoyer(messageAffectation(apres, ot, technicien))
        .then((r) => journaliser(`OT ${ot.numero} → ${technicien.email} : ${r.detail}`))
        .catch((e) => journaliser(`OT ${ot.numero} : notification impossible`, e));
    }
  });
}
