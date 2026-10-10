// Moteur de calcul de la paie d'une assistante maternelle employée par un particulier
// (convention collective IDCC 3239, socle spécifique assistant maternel). Voir README.md.
//
// Principes :
// - Salaire mensualisé = taux horaire × heures hebdomadaires × semaines / 12
//   (52 semaines en année complète, semaines programmées en année incomplète).
// - Absences non rémunérées (art. 111) : salaire mensualisé × absences / ce qui aurait été travaillé
//   dans le mois, en heures (année complète) ou en jours (année incomplète). Le dénominateur inclut
//   les absences, les semaines de non-accueil et les jours fériés chômés. Même règle pour le mois
//   d'entrée et le mois de sortie.
// - Heures en plus : complémentaires jusqu'au seuil hebdomadaire (45 h), majorées au-delà.
// - Congés payés : période de référence 1er juin → 31 mai, 2,5 jours ouvrables par 4 semaines,
//   indemnité = max(maintien de salaire, 10 % du brut de la période).

import { addDays, dateRange, ferie, makeISO, monthDays, mondayOf, weekday, type ISODate } from './dates';
import type { Contrat, Evenement, ID } from './types';

export type StatutJour =
  | 'hors_contrat'
  | 'repos'
  | 'travail'
  | 'ferie'
  | 'non_programme'
  | 'cp'
  | 'absence_deduite'
  | 'absence_payee';

export interface JourCalcule {
  date: ISODate;
  statut: StatutJour;
  ferie?: string;
  /** Heures prévues au planning type ce jour-là (base des déductions, art. 111). */
  prevu: number;
  heuresTravaillees: number;
  heuresDeduites: number;
  /** Fraction de journée déduite (0 à 1), utilisée en année incomplète. */
  jourDeduit: number;
  heuresEnPlus: number;
  /** Heures travaillées un jour férié (ouvrant droit à majoration). */
  heuresFerieTravaille: number;
  cp: boolean;
  /** Jour compté comme travail effectif pour l'acquisition des congés payés. */
  effectifCP: boolean;
  /** Absence de l'enfant déduite (pour le contrôle de la limite conventionnelle). */
  absenceEnfantDeduite: boolean;
  repas: Record<ID, number>;
  km: number;
  entretien: number;
  evenements: Evenement[];
}

export interface DroitsCP {
  /** Année du 31 mai qui clôt la période de référence. */
  anneeFin: number;
  debut: ISODate;
  fin: ISODate;
  joursAcquis: number;
  brutReference: number;
  dixieme: number;
  maintien: number;
  indemnite: number;
}

export interface ResultatMois {
  annee: number;
  mois: number; // 0-11
  actif: boolean; // le contrat couvre au moins un jour du mois
  jours: JourCalcule[];
  methodeDeduction: 'heures' | 'jours';
  // Base mensualisée
  heuresMensualiseesNormales: number;
  heuresMensualiseesMajorees: number;
  salaireMensualiseBrut: number;
  // Déductions / prorata (art. 111)
  heuresPrevuesMois: number;
  heuresDeduites: number;
  joursPrevusMois: number;
  joursDeduits: number;
  deductionBrut: number;
  // Heures en plus
  heuresComplementaires: number;
  heuresMajoreesEnPlus: number;
  montantComplementairesBrut: number;
  montantMajoreesEnPlusBrut: number;
  // Jours fériés travaillés
  heuresFerieTravaille: number;
  majorationFerieBrut: number;
  // Congés payés
  congesPayesBrut: number;
  droitsCP?: DroitsCP; // période dont l'indemnité est versée ce mois-ci
  salaireBrutTotal: number;
  salaireNetTotal: number;
  // Indemnités
  indemnitesEntretien: number;
  indemnitesRepas: number;
  detailRepas: { libelle: string; nombre: number; montant: number }[];
  km: number;
  indemnitesKm: number;
  // Pajemploi
  pajemploi: DeclarationPajemploi;
}

export interface DeclarationPajemploi {
  heuresNormales: number;
  heuresMajorees: number;
  montantNetHeuresMajorees: number;
  salaireNet: number;
  joursActivite: number;
  joursCongesPayes: number;
  indemnitesEntretien: number;
  indemnitesRepas: number;
  indemnitesKm: number;
}

const EPS = 1e-9;

export function arrondi2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export function heuresHebdo(c: Contrat): number {
  return c.planning.reduce((s, j) => s + (j.actif ? j.heures : 0), 0);
}

export function semainesMensualisation(c: Contrat): number {
  return c.type === 'complete' ? 52 : c.semainesProgrammees;
}

/** Heures mensualisées : normales (jusqu'au seuil) et majorées (au-delà du seuil hebdomadaire). */
export function heuresMensualisees(c: Contrat): { normales: number; majorees: number } {
  const hebdo = heuresHebdo(c);
  const sem = semainesMensualisation(c);
  const norm = Math.min(hebdo, c.seuilMajoration);
  const maj = Math.max(0, hebdo - c.seuilMajoration);
  return { normales: (norm * sem) / 12, majorees: (maj * sem) / 12 };
}

/** Salaire d'une semaine type (heures majorées comprises). */
export function salaireHebdoBrut(c: Contrat): number {
  const hebdo = heuresHebdo(c);
  const norm = Math.min(hebdo, c.seuilMajoration);
  const maj = Math.max(0, hebdo - c.seuilMajoration);
  return c.tauxHoraireBrut * (norm + maj * (1 + c.majorationPct / 100));
}

export function salaireMensualiseBrut(c: Contrat): number {
  return (salaireHebdoBrut(c) * semainesMensualisation(c)) / 12;
}

/** Contrôles de cohérence du contrat avec la convention collective. */
export function alertesContrat(c: Contrat): string[] {
  const a: string[] = [];
  if (c.type === 'incomplete' && c.semainesProgrammees > 46) {
    a.push("Au-delà de 46 semaines d'accueil programmées, le contrat doit être en année complète (52 semaines).");
  }
  if (c.type === 'incomplete' && c.semainesProgrammees <= 0) a.push('Indiquez le nombre de semaines programmées.');
  if (heuresHebdo(c) > 0 && c.planning.some((j) => j.actif && j.heures > 13)) {
    a.push("Une journée d'accueil ne doit pas dépasser 13 heures (repos quotidien de 11 heures consécutives).");
  }
  if (heuresHebdo(c) > 48) a.push('La durée hebdomadaire ne peut pas dépasser 48 heures en moyenne.');
  if (c.majorationPct < 10) a.push('Les heures au-delà de 45 h par semaine doivent être majorées d’au moins 10 %.');
  if (c.majorationFeriePct < 10) a.push('Un jour férié ordinaire travaillé doit être majoré d’au moins 10 %.');
  if (c.entretien.minimumJour < 2.65) a.push("L'indemnité d'entretien ne peut être inférieure à 2,65 € par journée d'accueil.");
  return a;
}

function evenementsDuJour(evts: Evenement[], date: ISODate): Evenement[] {
  return evts.filter((e) => e.dateDebut <= date && date <= e.dateFin);
}

/** Calcule une journée du calendrier pour un contrat. */
export function calculerJour(c: Contrat, evts: Evenement[], date: ISODate): JourCalcule {
  const evs = evenementsDuJour(evts, date);
  const plan = c.planning[weekday(date)];
  const nomFerie = ferie(date);
  const j: JourCalcule = {
    date,
    statut: 'repos',
    ferie: nomFerie,
    prevu: plan.actif ? plan.heures : 0,
    heuresTravaillees: 0,
    heuresDeduites: 0,
    jourDeduit: 0,
    heuresEnPlus: 0,
    heuresFerieTravaille: 0,
    cp: false,
    effectifCP: false,
    absenceEnfantDeduite: false,
    repas: {},
    km: 0,
    entretien: 0,
    evenements: evs,
  };

  if (date < c.dateDebut || (c.dateFin && date > c.dateFin)) {
    // Hors contrat : le jour reste dans la base et il est intégralement déduit (prorata d'entrée / sortie).
    j.statut = 'hors_contrat';
    j.heuresDeduites = j.prevu;
    j.jourDeduit = j.prevu > 0 ? 1 : 0;
    return j;
  }

  const has = (t: Evenement['type']) => evs.find((e) => e.type === t);
  const absEnfant = has('absence_enfant_deduite');
  const absDed = absEnfant ?? has('absence_assmat');
  const absPay = has('absence_enfant_payee');
  const reel = has('heures_reelles');
  const ouvrable = weekday(date) <= 5 && !nomFerie;
  j.effectifCP = !has('non_programme') && !has('absence_assmat');

  if (has('conges_payes')) {
    j.cp = ouvrable;
    j.statut = 'cp';
  } else if (has('non_programme')) {
    j.statut = 'non_programme';
  } else if (j.prevu > 0) {
    // Saisir des heures réelles un jour férié revient à le déclarer travaillé.
    const ferieChome = nomFerie && !has('ferie_travaille') && !(reel && reel.heures && reel.heures > 0);
    if (ferieChome && !absDed) {
      j.statut = 'ferie';
    } else {
      j.statut = 'travail';
      j.heuresTravaillees = ferieChome ? 0 : j.prevu;
      const abs = absDed ?? absPay;
      if (abs) {
        const h = abs.heures && abs.heures > 0 ? Math.min(abs.heures, j.prevu) : j.prevu;
        j.heuresTravaillees = Math.max(0, j.prevu - h);
        if (absDed) {
          j.heuresDeduites = h;
          j.jourDeduit = h / j.prevu;
          j.absenceEnfantDeduite = !!absEnfant;
        }
        if (j.heuresTravaillees <= EPS) j.statut = absDed ? 'absence_deduite' : 'absence_payee';
      }
    }
  }

  // Heures réelles : en dessous du planning, le salaire mensualisé est maintenu (pas de déduction) ;
  // au-delà, la différence devient des heures en plus. Un jour sans accueil prévu, tout est en plus.
  if (reel && reel.heures !== undefined && reel.heures >= 0) {
    if (j.statut === 'travail' && j.prevu > 0) {
      const base = j.heuresTravaillees;
      j.heuresTravaillees = Math.min(reel.heures, base);
      j.heuresEnPlus += Math.max(0, reel.heures - base);
    } else if (j.statut === 'repos' || j.statut === 'non_programme') {
      j.heuresEnPlus += reel.heures;
    }
  }
  if (nomFerie && j.statut === 'travail') j.heuresFerieTravaille = j.heuresTravaillees;

  for (const e of evs) {
    if (e.type === 'heures_sup' && e.heures && e.heures > 0) j.heuresEnPlus += e.heures;
  }
  if (j.heuresEnPlus > 0) {
    j.heuresTravaillees += j.heuresEnPlus;
    if (j.statut === 'repos' || j.statut === 'non_programme' || j.statut === 'ferie') j.statut = 'travail';
  }

  const present = j.heuresTravaillees > EPS;
  // Repas : ceux du planning si l'enfant est accueilli un jour prévu, plus les ajustements.
  if (present && plan.actif) {
    for (const [id, n] of Object.entries(plan.repas)) if (n > 0) j.repas[id] = n;
  }
  for (const e of evs) {
    if (e.type === 'frais' || e.type === 'heures_sup') {
      if (e.km) j.km += e.km;
      for (const [id, n] of Object.entries(e.repas ?? {})) {
        j.repas[id] = Math.max(0, (j.repas[id] ?? 0) + n);
      }
    }
  }
  if (present) {
    const { mode, montant, minimumJour } = c.entretien;
    const brut = mode === 'jour' ? montant : montant * j.heuresTravaillees;
    j.entretien = Math.max(brut, minimumJour);
  }
  return j;
}

/**
 * Répartit les heures en plus entre complémentaires et majorées, semaine civile par semaine civile
 * (lundi → dimanche). Retourne, pour chaque date, le nombre d'heures en plus majorées.
 */
function heuresMajoreesParJour(c: Contrat, evts: Evenement[], dates: ISODate[]): Map<ISODate, number> {
  const res = new Map<ISODate, number>();
  const semaines = new Set(dates.map(mondayOf));
  for (const lundi of semaines) {
    // Heures au-delà du seuil sur la semaine (au-delà des heures du planning si celles-ci le dépassent déjà,
    // puisqu'elles sont mensualisées) ; elles sont imputées sur les dernières heures en plus de la semaine.
    const jours = dateRange(lundi, addDays(lundi, 6)).map((d) => calculerJour(c, evts, d));
    const total = jours.reduce((s, j) => s + j.heuresTravaillees, 0);
    const base = jours.reduce((s, j) => s + j.heuresTravaillees - j.heuresEnPlus, 0);
    let reste = Math.max(0, total - Math.max(c.seuilMajoration, base));
    for (const j of [...jours].reverse()) {
      const m = Math.min(j.heuresEnPlus, reste);
      res.set(j.date, m);
      reste -= m;
    }
  }
  return res;
}

interface BaseMois {
  actif: boolean;
  jours: JourCalcule[];
  /** Brut du mois hors congés payés versés à part. */
  brutHorsCP: number;
  partiel: Omit<
    ResultatMois,
    'congesPayesBrut' | 'droitsCP' | 'salaireBrutTotal' | 'salaireNetTotal' | 'pajemploi' | 'annee' | 'mois' | 'jours' | 'actif'
  >;
}

/** Contexte de calcul avec mémoïsation (les congés payés dépendent des mois précédents). */
class Calcul {
  private bases = new Map<string, BaseMois>();
  private droits = new Map<number, DroitsCP>();
  private evts: Evenement[];
  constructor(
    private c: Contrat,
    evts: Evenement[],
  ) {
    this.evts = evts.filter((e) => e.contratId === c.id);
  }

  base(annee: number, mois: number): BaseMois {
    const cle = `${annee}-${mois}`;
    let b = this.bases.get(cle);
    if (!b) {
      b = calculerBase(this.c, this.evts, annee, mois);
      this.bases.set(cle, b);
    }
    return b;
  }

  /** Droits à congés payés de la période de référence se terminant le 31 mai de `anneeFin`. */
  droitsCP(anneeFin: number): DroitsCP {
    const memo = this.droits.get(anneeFin);
    if (memo) return memo;
    const c = this.c;
    const debutPeriode = makeISO(anneeFin - 1, 5, 1);
    const finPeriode = makeISO(anneeFin, 4, 31);
    const debut = c.dateDebut > debutPeriode ? c.dateDebut : debutPeriode;
    const fin = c.dateFin && c.dateFin < finPeriode ? c.dateFin : finPeriode;
    const vide: DroitsCP = { anneeFin, debut, fin, joursAcquis: 0, brutReference: 0, dixieme: 0, maintien: 0, indemnite: 0 };
    if (debut > fin) {
      this.droits.set(anneeFin, vide);
      return vide;
    }
    this.droits.set(anneeFin, vide); // garde-fou contre la récursion
    // Semaines de travail effectif : jours d'accueil prévus et effectifs ÷ jours d'accueil par semaine.
    // Les congés payés, absences de l'enfant et jours fériés sont assimilés à du travail effectif ;
    // les semaines non programmées et absences de l'assistante maternelle ne le sont pas.
    const joursParSemaine = c.planning.filter((p) => p.actif && p.heures > 0).length;
    let joursEffectifs = 0;
    let brutReference = 0;
    for (let k = 0; k < 12; k++) {
      const m = (5 + k) % 12;
      const a = m >= 5 ? anneeFin - 1 : anneeFin;
      const b = this.base(a, m);
      joursEffectifs += b.jours.filter((j) => j.statut !== 'hors_contrat' && j.prevu > 0 && j.effectifCP).length;
      // L'indemnité de congés payés versée pendant la période entre dans la base du dixième.
      brutReference += b.brutHorsCP + this.congesPayesVerses(a, m).montant;
    }
    const semainesEffectives = joursParSemaine > 0 ? joursEffectifs / joursParSemaine : 0;
    // 2,5 jours ouvrables par période de 4 semaines de travail effectif, 30 jours maximum,
    // arrondi au nombre entier immédiatement supérieur.
    const joursAcquis = Math.min(30, Math.ceil((semainesEffectives / 4) * 2.5 - 1e-9));
    const dixieme = brutReference * 0.1;
    // Maintien de salaire : une semaine de congés = 6 jours ouvrables = une semaine de salaire.
    const maintien = (joursAcquis / 6) * salaireHebdoBrut(c);
    const d: DroitsCP = {
      anneeFin,
      debut,
      fin,
      joursAcquis,
      brutReference,
      dixieme,
      maintien,
      indemnite: Math.max(dixieme, maintien),
    };
    this.droits.set(anneeFin, d);
    return d;
  }

  /** Jours de congés acquis sur la période close au 31 mai `anneeFin`, comptés jusqu'à `jusqua` (non arrondis). */
  acquisitionADate(anneeFin: number, jusqua: ISODate): number {
    const c = this.c;
    const joursParSemaine = c.planning.filter((p) => p.actif && p.heures > 0).length;
    if (joursParSemaine === 0) return 0;
    let joursEffectifs = 0;
    for (let k = 0; k < 12; k++) {
      const m = (5 + k) % 12;
      const a = m >= 5 ? anneeFin - 1 : anneeFin;
      if (makeISO(a, m, 1) > jusqua) break;
      joursEffectifs += this.base(a, m).jours.filter(
        (j) => j.date <= jusqua && j.statut !== 'hors_contrat' && j.prevu > 0 && j.effectifCP,
      ).length;
    }
    return Math.min(30, ((joursEffectifs / joursParSemaine) / 4) * 2.5);
  }

  /** Jours ouvrables de congés payés pris entre deux dates (incluses). */
  joursPris(debut: ISODate, fin: ISODate): number {
    let n = 0;
    let [a, m] = [Number(debut.slice(0, 4)), Number(debut.slice(5, 7)) - 1];
    while (makeISO(a, m, 1) <= fin) {
      n += this.base(a, m).jours.filter((j) => j.cp && j.statut !== 'hors_contrat' && j.date >= debut && j.date <= fin).length;
      m++;
      if (m === 12) [a, m] = [a + 1, 0];
    }
    return n;
  }

  /** Congés payés versés à part pendant le mois (année incomplète, ou complément en année complète). */
  congesPayesVerses(annee: number, mois: number): { montant: number; droits?: DroitsCP } {
    const c = this.c;
    if (!this.base(annee, mois).actif) return { montant: 0 };
    // Entre juin de l'année N et mai de N+1, on verse les congés acquis sur la période close au 31 mai N.
    const anneeFin = mois >= 5 ? annee : annee - 1;
    if (makeISO(anneeFin, 4, 31) < c.dateDebut) return { montant: 0 };
    const d = this.droitsCP(anneeFin);
    if (d.indemnite <= 0) return { montant: 0 };

    if (c.type === 'complete') {
      // Les congés sont payés par la mensualisation ; complément en juin si le dixième est plus favorable.
      return mois === 5 ? { montant: Math.max(0, d.dixieme - d.maintien), droits: d } : { montant: 0 };
    }
    switch (c.modeCP) {
      case 'juin':
        return mois === 5 ? { montant: d.indemnite, droits: d } : { montant: 0 };
      case 'prise_principale': {
        // Mois de la période juin N → mai N+1 comptant le plus de jours de congés pris.
        let meilleur = -1;
        let max = 0;
        for (let k = 0; k < 12; k++) {
          const m = (5 + k) % 12;
          const a = m >= 5 ? anneeFin : anneeFin + 1;
          const n = this.base(a, m).jours.filter((j) => j.cp).length;
          if (n > max) {
            max = n;
            meilleur = k;
          }
        }
        const k = (mois - 5 + 12) % 12;
        return meilleur === k ? { montant: d.indemnite, droits: d } : { montant: 0 };
      }
      case 'fur_et_a_mesure':
      default: {
        if (d.joursAcquis <= 0) return { montant: 0 };
        // Proportionnel aux jours ouvrables de congés pris, sans dépasser les jours acquis.
        let dejaPris = 0;
        for (let k = 0; k < (mois - 5 + 12) % 12; k++) {
          const m = (5 + k) % 12;
          const a = m >= 5 ? anneeFin : anneeFin + 1;
          dejaPris += this.base(a, m).jours.filter((j) => j.cp).length;
        }
        const ceMois = this.base(annee, mois).jours.filter((j) => j.cp).length;
        const payes = Math.max(0, Math.min(ceMois, d.joursAcquis - dejaPris));
        return payes > 0 ? { montant: (d.indemnite * payes) / d.joursAcquis, droits: d } : { montant: 0 };
      }
    }
  }
}

function calculerBase(c: Contrat, evtsC: Evenement[], annee: number, mois: number): BaseMois {
  const dates = monthDays(annee, mois);
  const jours = dates.map((d) => calculerJour(c, evtsC, d));
  const actif = jours.some((j) => j.statut !== 'hors_contrat');

  const hm = heuresMensualisees(c);
  const base = salaireMensualiseBrut(c);
  const heuresPrevuesMois = jours.reduce((s, j) => s + j.prevu, 0);
  const heuresDeduites = jours.reduce((s, j) => s + j.heuresDeduites, 0);
  const joursPrevusMois = jours.filter((j) => j.prevu > 0).length;
  const joursDeduits = jours.reduce((s, j) => s + j.jourDeduit, 0);
  const methodeDeduction = c.type === 'complete' ? 'heures' : 'jours';

  // Part du salaire mensualisé due (art. 111).
  let ratio: number;
  if (!actif) ratio = 0;
  else if (methodeDeduction === 'heures') ratio = heuresPrevuesMois > EPS ? 1 - heuresDeduites / heuresPrevuesMois : 1;
  else ratio = joursPrevusMois > 0 ? 1 - joursDeduits / joursPrevusMois : 1;
  ratio = Math.max(0, ratio);

  const majParJour = heuresMajoreesParJour(c, evtsC, dates);
  let heuresMajoreesEnPlus = 0;
  let heuresComplementaires = 0;
  for (const j of jours) {
    if (j.heuresEnPlus <= 0) continue;
    const m = Math.min(j.heuresEnPlus, majParJour.get(j.date) ?? 0);
    heuresMajoreesEnPlus += m;
    heuresComplementaires += j.heuresEnPlus - m;
  }
  const montantComplementairesBrut = heuresComplementaires * c.tauxHoraireBrut * (1 + c.majorationComplementairesPct / 100);
  const montantMajoreesEnPlusBrut = heuresMajoreesEnPlus * c.tauxHoraireBrut * (1 + c.majorationPct / 100);

  // Jour férié travaillé : majoration de la journée (1er mai : payé double).
  let heuresFerieTravaille = 0;
  let majorationFerieBrut = 0;
  for (const j of jours) {
    if (j.heuresFerieTravaille <= 0) continue;
    heuresFerieTravaille += j.heuresFerieTravaille;
    const pct = j.date.slice(5) === '05-01' ? 100 : c.majorationFeriePct;
    majorationFerieBrut += j.heuresFerieTravaille * c.tauxHoraireBrut * (pct / 100);
  }

  const salaireDu = base * ratio;
  const brutHorsCP = actif ? salaireDu + montantComplementairesBrut + montantMajoreesEnPlusBrut + majorationFerieBrut : 0;

  const repasTotaux = new Map<ID, number>();
  for (const j of jours) for (const [id, n] of Object.entries(j.repas)) repasTotaux.set(id, (repasTotaux.get(id) ?? 0) + n);
  const detailRepas = c.typesRepas
    .map((t) => {
      const nombre = repasTotaux.get(t.id) ?? 0;
      return { libelle: t.libelle, nombre, montant: arrondi2(nombre * t.montant) };
    })
    .filter((r) => r.nombre > 0);
  const km = jours.reduce((s, j) => s + j.km, 0);

  return {
    actif,
    jours,
    brutHorsCP,
    partiel: {
      methodeDeduction,
      heuresMensualiseesNormales: hm.normales,
      heuresMensualiseesMajorees: hm.majorees,
      salaireMensualiseBrut: actif ? base : 0,
      heuresPrevuesMois,
      heuresDeduites,
      joursPrevusMois,
      joursDeduits,
      deductionBrut: actif ? base - salaireDu : 0,
      heuresComplementaires,
      heuresMajoreesEnPlus,
      montantComplementairesBrut,
      montantMajoreesEnPlusBrut,
      heuresFerieTravaille,
      majorationFerieBrut,
      indemnitesEntretien: arrondi2(jours.reduce((s, j) => s + j.entretien, 0)),
      indemnitesRepas: arrondi2(detailRepas.reduce((s, r) => s + r.montant, 0)),
      detailRepas,
      km,
      indemnitesKm: arrondi2(km * c.tauxKm),
    },
  };
}

/** Calcule la paie d'un mois pour un contrat et les éléments à saisir sur Pajemploi. */
export function calculerMois(c: Contrat, evts: Evenement[], annee: number, mois: number): ResultatMois {
  const calc = new Calcul(c, evts);
  const b = calc.base(annee, mois);
  const p = b.partiel;
  const cp = calc.congesPayesVerses(annee, mois);
  const congesPayesBrut = cp.montant;

  const salaireBrutTotal = arrondi2(b.brutHorsCP + congesPayesBrut);
  const salaireNetTotal = arrondi2(salaireBrutTotal * c.coefNet);
  const ratio = p.salaireMensualiseBrut > 0 ? 1 - p.deductionBrut / p.salaireMensualiseBrut : 0;
  const heuresMajorees = p.heuresMensualiseesMajorees * ratio + p.heuresMajoreesEnPlus;
  const montantMajoreesBrut = heuresMajorees * c.tauxHoraireBrut * (1 + c.majorationPct / 100);
  // Pajemploi : les congés payés versés à part sont convertis en heures (montant ÷ taux horaire).
  const heuresCP = c.tauxHoraireBrut > 0 ? congesPayesBrut / c.tauxHoraireBrut : 0;

  const pajemploi: DeclarationPajemploi = b.actif
    ? {
        heuresNormales: Math.round(p.heuresMensualiseesNormales * ratio + p.heuresComplementaires + heuresCP),
        heuresMajorees: Math.round(heuresMajorees),
        montantNetHeuresMajorees: arrondi2(montantMajoreesBrut * c.coefNet),
        salaireNet: salaireNetTotal,
        joursActivite: b.jours.filter((j) => j.heuresTravaillees > EPS).length,
        joursCongesPayes: b.jours.filter((j) => j.cp).length,
        indemnitesEntretien: p.indemnitesEntretien,
        indemnitesRepas: p.indemnitesRepas,
        indemnitesKm: p.indemnitesKm,
      }
    : {
        heuresNormales: 0,
        heuresMajorees: 0,
        montantNetHeuresMajorees: 0,
        salaireNet: 0,
        joursActivite: 0,
        joursCongesPayes: 0,
        indemnitesEntretien: 0,
        indemnitesRepas: 0,
        indemnitesKm: 0,
      };

  return {
    annee,
    mois,
    actif: b.actif,
    jours: b.jours,
    ...p,
    congesPayesBrut,
    droitsCP: cp.droits,
    salaireBrutTotal,
    salaireNetTotal,
    pajemploi,
  };
}

/** Droits à congés payés pour la période de référence se terminant le 31 mai de `anneeFin`. */
export function droitsCP(c: Contrat, evts: Evenement[], anneeFin: number): DroitsCP {
  return new Calcul(c, evts).droitsCP(anneeFin);
}

/**
 * Absences de l'enfant déduites sur l'année de contrat (12 mois glissants à partir de la date
 * d'effet du contrat ou de sa date anniversaire) contenant `date` (art. 105).
 */
export function absencesEnfantSurAnnee(
  c: Contrat,
  evts: Evenement[],
  date: ISODate,
): { debut: ISODate; fin: ISODate; jours: number; plusLongueSerie: number } {
  const [, ma, da] = c.dateDebut.split('-').map(Number);
  let annee = Number(date.slice(0, 4));
  let debut = makeISO(annee, ma - 1, da);
  if (debut > date) debut = makeISO(--annee, ma - 1, da);
  const fin = addDays(makeISO(annee + 1, ma - 1, da), -1);
  const evtsC = evts.filter((e) => e.contratId === c.id && e.type === 'absence_enfant_deduite' && e.dateFin >= debut && e.dateDebut <= fin);
  let jours = 0;
  let serie = 0;
  let plusLongueSerie = 0;
  let precedent: ISODate | null = null;
  const dates = new Set<ISODate>();
  for (const e of evtsC) for (const d of dateRange(e.dateDebut < debut ? debut : e.dateDebut, e.dateFin > fin ? fin : e.dateFin)) dates.add(d);
  for (const d of [...dates].sort()) {
    if (calculerJour(c, evtsC, d).absenceEnfantDeduite) jours++;
    serie = precedent && addDays(precedent, 1) === d ? serie + 1 : 1;
    plusLongueSerie = Math.max(plusLongueSerie, serie);
    precedent = d;
  }
  return { debut, fin, jours, plusLongueSerie };
}

export interface CompteurCP {
  /** Congés acquis sur la dernière période close (à prendre du 1er juin au 31 mai suivant). */
  acquis: { debut: ISODate; fin: ISODate; jours: number };
  /** Période pendant laquelle ces congés se prennent. */
  priseDebut: ISODate;
  priseFin: ISODate;
  /** Jours pris jusqu'à la date, et jours posés sur toute la période de prise (prévisionnel compris). */
  prisADate: number;
  posesTotal: number;
  restants: number;
  /** Période en cours d'acquisition (congés pris l'année suivante). */
  enCours: { debut: ISODate; fin: ISODate; joursADate: number; joursFinPeriode: number };
}

/** Compteur des congés payés de l'assistante maternelle à une date donnée. */
export function compteurCP(c: Contrat, evts: Evenement[], date: ISODate): CompteurCP {
  const calc = new Calcul(c, evts);
  const annee = Number(date.slice(0, 4));
  const mois = Number(date.slice(5, 7)) - 1;
  // Période close la plus récente : elle se termine le 31 mai de cette année si l'on est en juin ou après.
  const anneeFin = mois >= 5 ? annee : annee - 1;
  const d = calc.droitsCP(anneeFin);
  const priseDebut = makeISO(anneeFin, 5, 1);
  const priseFin = makeISO(anneeFin + 1, 4, 31);
  const prisADate = calc.joursPris(priseDebut, date);
  const posesTotal = calc.joursPris(priseDebut, priseFin);
  const enCoursDebut = c.dateDebut > priseDebut ? c.dateDebut : priseDebut;
  const enCoursFin = c.dateFin && c.dateFin < priseFin ? c.dateFin : priseFin;
  return {
    acquis: { debut: d.debut, fin: d.fin, jours: d.joursAcquis },
    priseDebut,
    priseFin,
    prisADate,
    posesTotal,
    restants: d.joursAcquis - posesTotal,
    enCours: {
      debut: enCoursDebut,
      fin: enCoursFin,
      joursADate: calc.acquisitionADate(anneeFin + 1, date),
      joursFinPeriode: Math.min(30, Math.ceil(calc.acquisitionADate(anneeFin + 1, priseFin) - 1e-9)),
    },
  };
}
