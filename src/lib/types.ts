import type { ISODate } from './dates';

export type ID = string;

export interface Enfant {
  id: ID;
  prenom: string;
  nom: string;
  dateNaissance?: ISODate;
}

/** Un type de repas fourni par l'assistante maternelle (déjeuner, goûter, petit-déjeuner…). */
export interface TypeRepas {
  id: ID;
  libelle: string;
  montant: number; // € par repas
}

/** Planning type d'un jour de la semaine. */
export interface PlanningJour {
  actif: boolean;
  heures: number; // heures d'accueil prévues ce jour-là
  repas: Record<ID, number>; // id du type de repas -> nombre fourni ce jour-là
}

/**
 * - complete : accueil toute l'année (52 semaines dont 5 de congés payés de l'assistante maternelle).
 * - incomplete : accueil sur un nombre de semaines programmées (≤ 46), congés payés rémunérés à part.
 */
export type TypeContrat = 'complete' | 'incomplete';

/**
 * Mode de rémunération des congés payés (art. 102 du socle assistant maternel).
 * - mensualise : année complète, congés payés inclus dans le salaire mensualisé (maintien),
 *   avec complément en juin si la règle du dixième est plus favorable.
 * Année incomplète, l'indemnité calculée au 31 mai est versée :
 * - juin : en une seule fois en juin ;
 * - prise_principale : lors de la prise principale des congés ;
 * - fur_et_a_mesure : au fur et à mesure de la prise des congés.
 */
export type ModeCP = 'mensualise' | 'juin' | 'prise_principale' | 'fur_et_a_mesure';

export const LIBELLES_MODE_CP: Record<ModeCP, string> = {
  mensualise: 'Inclus dans la mensualisation (année complète)',
  juin: 'En une seule fois en juin',
  prise_principale: 'Lors de la prise principale des congés',
  fur_et_a_mesure: 'Au fur et à mesure de la prise des congés',
};

export interface Entretien {
  mode: 'jour' | 'heure';
  montant: number; // € par jour d'accueil, ou € par heure d'accueil
  minimumJour: number; // plancher par jour d'accueil
}

export interface Contrat {
  id: ID;
  enfantId: ID;
  nomAssmat: string;
  dateDebut: ISODate;
  dateFin?: ISODate;
  type: TypeContrat;
  semainesProgrammees: number; // utilisé seulement en année incomplète
  planning: PlanningJour[]; // 7 entrées, lundi -> dimanche
  tauxHoraireBrut: number;
  coefNet: number; // net = brut × coefNet
  seuilMajoration: number; // heures hebdo au-delà desquelles les heures sont majorées (45 h)
  majorationPct: number; // % de majoration au-delà du seuil (10 % minimum)
  majorationComplementairesPct: number; // % de majoration des heures complémentaires (0 sauf clause du contrat)
  majorationFeriePct: number; // % de majoration d'un jour férié ordinaire travaillé (10 % minimum ; 1er mai : 100 %)
  entretien: Entretien;
  typesRepas: TypeRepas[];
  tauxKm: number; // € par km
  modeCP: ModeCP;
}

export type TypeEvenement =
  | 'absence_enfant_deduite'
  | 'absence_enfant_payee'
  | 'absence_assmat'
  | 'conges_payes'
  | 'non_programme'
  | 'heures_sup'
  | 'heures_reelles'
  | 'ferie_travaille'
  | 'frais';

export interface Evenement {
  id: ID;
  contratId: ID;
  type: TypeEvenement;
  dateDebut: ISODate;
  dateFin: ISODate;
  /** Absences : heures d'absence par jour (vide = journée entière). Heures sup : heures en plus par jour. */
  heures?: number;
  /** Heures réelles : heure d'arrivée et de départ (« HH:MM »), facultatives. */
  arrivee?: string;
  depart?: string;
  /** Kilomètres parcourus par jour. */
  km?: number;
  /** Repas en plus (positif) ou en moins (négatif) par jour, par type de repas. */
  repas?: Record<ID, number>;
  note?: string;
}

export interface Donnees {
  version: 1;
  enfants: Enfant[];
  contrats: Contrat[];
  evenements: Evenement[];
}

export const LIBELLES_EVENEMENT: Record<TypeEvenement, string> = {
  absence_enfant_deduite: 'Absence enfant déduite (maladie avec certificat…)',
  absence_enfant_payee: 'Absence enfant payée (convenance des parents)',
  absence_assmat: "Absence de l'assistante maternelle (maladie, sans solde…)",
  conges_payes: "Congés payés de l'assistante maternelle",
  non_programme: 'Période non programmée au contrat (année incomplète)',
  heures_sup: 'Heures en plus',
  heures_reelles: 'Heures réelles du jour (arrivée / départ)',
  ferie_travaille: 'Jour férié travaillé',
  frais: 'Frais (km, repas en plus/en moins)',
};

export const LIBELLES_COURTS: Record<TypeEvenement, string> = {
  absence_enfant_deduite: 'Abs. déduite',
  absence_enfant_payee: 'Abs. payée',
  absence_assmat: 'Abs. AM',
  conges_payes: 'CP',
  non_programme: 'Non prog.',
  heures_sup: 'H. en plus',
  heures_reelles: 'Réel',
  ferie_travaille: 'Férié trav.',
  frais: 'Frais',
};
