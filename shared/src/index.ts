/**
 * Point d'entrée du code partagé entre l'API et l'interface web.
 *
 * Tout ce qui décrit le métier — le modèle de domaine, les libellés, les
 * calculs d'indicateurs, les échéanciers, les alertes et les opérations
 * d'écriture — vit ici. Le serveur applique exactement les mêmes règles que
 * le navigateur : il n'y a qu'une seule définition de « OT en retard » ou de
 * « prochaine échéance préventive » dans tout le projet.
 */
export * from './domaine';
export * from './libelles';
export * from './catalogues';
export * from './dates';
export * from './format';
export * from './id';
export * from './echeances';
export * from './kpi';
export * from './alertes';
export * from './actions';
export * from './inspections';
export * from './liens';
export * from './secteurs';
export * from './rapprochement';
export * from './patch';
export * from './donnees-demo';
