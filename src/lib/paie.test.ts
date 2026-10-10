import { describe, expect, it } from 'vitest';
import { easter, ferie } from './dates';
import { absencesEnfantSurAnnee, alertesContrat, calculerMois, droitsCP, heuresMensualisees, salaireMensualiseBrut } from './paie';
import type { Contrat, Evenement, PlanningJour } from './types';

const jour = (heures: number, repas: Record<string, number> = { dej: 1, gouter: 1 }): PlanningJour => ({
  actif: heures > 0,
  heures,
  repas: heures > 0 ? repas : {},
});

function contrat(p: Partial<Contrat> = {}): Contrat {
  return {
    id: 'c1',
    enfantId: 'e1',
    nomAssmat: 'Marie',
    dateDebut: '2026-01-01',
    type: 'complete',
    semainesProgrammees: 46,
    // 4 jours × 9 h = 36 h / semaine
    planning: [jour(9), jour(9), jour(0), jour(9), jour(9), jour(0), jour(0)],
    tauxHoraireBrut: 5,
    coefNet: 0.78,
    seuilMajoration: 45,
    majorationPct: 25,
    majorationComplementairesPct: 0,
    majorationFeriePct: 10,
    entretien: { mode: 'jour', montant: 4, minimumJour: 2.65 },
    typesRepas: [
      { id: 'dej', libelle: 'Déjeuner', montant: 3 },
      { id: 'gouter', libelle: 'Goûter', montant: 1 },
    ],
    tauxKm: 0.5,
    modeCP: 'mensualise',
    ...p,
  };
}

let n = 0;
const ev = (e: Omit<Evenement, 'id' | 'contratId'>): Evenement => ({ id: `ev${n++}`, contratId: 'c1', ...e });

describe('dates', () => {
  it('calcule Pâques et les fériés', () => {
    expect(easter(2026)).toBe('2026-04-05');
    expect(ferie('2026-04-06')).toBe('Lundi de Pâques');
    expect(ferie('2026-05-14')).toBe('Ascension');
    expect(ferie('2026-05-25')).toBe('Lundi de Pentecôte');
    expect(ferie('2026-05-26')).toBeUndefined();
  });
});

describe('mensualisation', () => {
  it('année complète : 52 semaines', () => {
    const c = contrat();
    expect(heuresMensualisees(c).normales).toBeCloseTo(156); // 36 × 52 / 12
    expect(salaireMensualiseBrut(c)).toBeCloseTo(780);
  });

  it('année incomplète : semaines programmées', () => {
    const c = contrat({ type: 'incomplete', semainesProgrammees: 40, modeCP: 'juin' });
    expect(heuresMensualisees(c).normales).toBeCloseTo(120); // 36 × 40 / 12
  });

  it('année incomplète à 41 semaines ou moins', () => {
    expect(salaireMensualiseBrut(contrat({ type: 'incomplete', semainesProgrammees: 41, modeCP: 'juin' }))).toBeCloseTo(615);
    expect(salaireMensualiseBrut(contrat({ type: 'incomplete', semainesProgrammees: 36, modeCP: 'juin' }))).toBeCloseTo(540);
    expect(alertesContrat(contrat({ type: 'incomplete', semainesProgrammees: 41, modeCP: 'juin' }))).toEqual([]);
    expect(alertesContrat(contrat({ type: 'incomplete', semainesProgrammees: 47, modeCP: 'juin' })).length).toBe(1);
  });

  it('heures au-delà de 45 h hebdo mensualisées en majorées', () => {
    const c = contrat({ planning: [jour(10), jour(10), jour(10), jour(10), jour(10), jour(0), jour(0)] });
    const h = heuresMensualisees(c);
    expect(h.normales).toBeCloseTo((45 * 52) / 12);
    expect(h.majorees).toBeCloseTo((5 * 52) / 12);
    expect(salaireMensualiseBrut(c)).toBeCloseTo(5 * ((45 * 52) / 12 + ((5 * 52) / 12) * 1.25));
  });
});

describe('calcul du mois', () => {
  it('mois complet sans événement (septembre 2026)', () => {
    const r = calculerMois(contrat(), [], 2026, 8);
    // Septembre 2026 : 1er = mardi. Lun/Mar/Jeu/Ven : 17 jours, pas de férié.
    expect(r.pajemploi.joursActivite).toBe(17);
    expect(r.heuresPrevuesMois).toBe(153);
    expect(r.salaireBrutTotal).toBe(780);
    expect(r.pajemploi.salaireNet).toBe(608.4);
    expect(r.pajemploi.heuresNormales).toBe(156);
    expect(r.pajemploi.indemnitesEntretien).toBe(68);
    expect(r.pajemploi.indemnitesRepas).toBe(68); // 17 × (3 + 1)
  });

  it('absence déduite au réel', () => {
    const evts = [ev({ type: 'absence_enfant_deduite', dateDebut: '2026-09-07', dateFin: '2026-09-08' })];
    const r = calculerMois(contrat(), evts, 2026, 8);
    expect(r.heuresDeduites).toBe(18);
    expect(r.deductionBrut).toBeCloseTo((780 * 18) / 153);
    expect(r.pajemploi.joursActivite).toBe(15);
    expect(r.pajemploi.heuresNormales).toBe(138); // 156 × (1 − 18/153) = 137,65 arrondi
    expect(r.pajemploi.indemnitesEntretien).toBe(60);
  });

  it('absence payée : pas de déduction mais pas de frais', () => {
    const evts = [ev({ type: 'absence_enfant_payee', dateDebut: '2026-09-07', dateFin: '2026-09-07' })];
    const r = calculerMois(contrat(), evts, 2026, 8);
    expect(r.salaireBrutTotal).toBe(780);
    expect(r.pajemploi.joursActivite).toBe(16);
    expect(r.pajemploi.indemnitesRepas).toBe(64);
  });

  it('absence partielle en heures', () => {
    const evts = [ev({ type: 'absence_assmat', dateDebut: '2026-09-07', dateFin: '2026-09-07', heures: 3 })];
    const r = calculerMois(contrat(), evts, 2026, 8);
    expect(r.heuresDeduites).toBe(3);
    expect(r.pajemploi.joursActivite).toBe(17);
  });

  it('jours fériés : ni déduits ni indemnisés (mai 2026)', () => {
    const r = calculerMois(contrat(), [], 2026, 4);
    // Fériés en mai 2026 : ven 1, ven 8, jeu 14, lun 25 -> tous des jours prévus
    expect(r.jours.filter((j) => j.statut === 'ferie').length).toBe(4);
    expect(r.salaireBrutTotal).toBe(780);
    expect(r.pajemploi.joursActivite).toBe(17 - 4);
  });

  it('prorata du mois d’entrée', () => {
    const c = contrat({ dateDebut: '2026-09-14' });
    const r = calculerMois(c, [], 2026, 8);
    // Jours prévus avant le 14 : 1,3,4,7,8,10,11 = 7 jours × 9 h = 63 h
    expect(r.heuresDeduites).toBe(63);
    expect(r.salaireBrutTotal).toBeCloseTo(780 * (1 - 63 / 153), 2);
    expect(r.pajemploi.joursActivite).toBe(10);
  });

  it('hors contrat : rien à déclarer', () => {
    const r = calculerMois(contrat({ dateDebut: '2026-10-01' }), [], 2026, 8);
    expect(r.actif).toBe(false);
    expect(r.pajemploi.salaireNet).toBe(0);
  });

  it('heures complémentaires puis majorées au-delà de 45 h', () => {
    // Semaine du 7 sept : 36 h prévues + 12 h en plus le vendredi -> 9 complémentaires, 3 majorées
    const evts = [ev({ type: 'heures_sup', dateDebut: '2026-09-11', dateFin: '2026-09-11', heures: 12 })];
    const r = calculerMois(contrat(), evts, 2026, 8);
    expect(r.heuresComplementaires).toBe(9);
    expect(r.heuresMajoreesEnPlus).toBe(3);
    expect(r.salaireBrutTotal).toBeCloseTo(780 + 9 * 5 + 3 * 5 * 1.25);
    expect(r.pajemploi.heuresNormales).toBe(165);
    expect(r.pajemploi.heuresMajorees).toBe(3);
  });

  it('frais kilométriques et repas ajustés', () => {
    const evts = [
      ev({ type: 'frais', dateDebut: '2026-09-07', dateFin: '2026-09-08', km: 10, repas: { gouter: -1 } }),
    ];
    const r = calculerMois(contrat(), evts, 2026, 8);
    expect(r.km).toBe(20);
    expect(r.pajemploi.indemnitesKm).toBe(10);
    expect(r.pajemploi.indemnitesRepas).toBe(66);
  });

  it('entretien horaire avec plancher', () => {
    const c = contrat({ entretien: { mode: 'heure', montant: 0.2, minimumJour: 2.65 } });
    const r = calculerMois(c, [], 2026, 8);
    expect(r.pajemploi.indemnitesEntretien).toBe(17 * 2.65);
  });

  it('année complète : congés payés non déduits', () => {
    const evts = [ev({ type: 'conges_payes', dateDebut: '2026-09-07', dateFin: '2026-09-12' })];
    const r = calculerMois(contrat(), evts, 2026, 8);
    expect(r.salaireBrutTotal).toBe(780);
    expect(r.pajemploi.joursCongesPayes).toBe(6); // lundi -> samedi (ouvrables)
    expect(r.pajemploi.joursActivite).toBe(13);
  });

  it('férié travaillé : majoration (1er mai payé double)', () => {
    const evts = [
      ev({ type: 'ferie_travaille', dateDebut: '2026-05-01', dateFin: '2026-05-01' }),
      ev({ type: 'ferie_travaille', dateDebut: '2026-05-14', dateFin: '2026-05-14' }),
    ];
    const r = calculerMois(contrat(), evts, 2026, 4);
    expect(r.majorationFerieBrut).toBeCloseTo(9 * 5 * 1 + 9 * 5 * 0.1);
    expect(r.salaireBrutTotal).toBe(829.5);
    expect(r.pajemploi.joursActivite).toBe(15);
  });

  it('férié chômé avec absence injustifiée : déduit', () => {
    const evts = [ev({ type: 'absence_assmat', dateDebut: '2026-05-25', dateFin: '2026-05-25' })];
    const r = calculerMois(contrat(), evts, 2026, 4);
    expect(r.heuresDeduites).toBe(9);
  });

  it('heures complémentaires majorées par clause du contrat', () => {
    const evts = [ev({ type: 'heures_sup', dateDebut: '2026-09-07', dateFin: '2026-09-07', heures: 2 })];
    const r = calculerMois(contrat({ majorationComplementairesPct: 20 }), evts, 2026, 8);
    expect(r.montantComplementairesBrut).toBeCloseTo(2 * 5 * 1.2);
  });

  it('limite des absences de l’enfant sur 12 mois glissants', () => {
    const evts = [
      ev({ type: 'absence_enfant_deduite', dateDebut: '2026-09-07', dateFin: '2026-09-08' }),
      ev({ type: 'absence_enfant_deduite', dateDebut: '2026-09-10', dateFin: '2026-09-11' }),
      ev({ type: 'absence_enfant_deduite', dateDebut: '2026-09-14', dateFin: '2026-09-15' }),
    ];
    const a = absencesEnfantSurAnnee(contrat(), evts, '2026-09-30');
    expect(a.debut).toBe('2026-01-01');
    expect(a.fin).toBe('2026-12-31');
    expect(a.jours).toBe(6);
    expect(a.plusLongueSerie).toBe(2);
  });
});

describe('année incomplète', () => {
  const inc = (p: Partial<Contrat> = {}) => contrat({ type: 'incomplete', semainesProgrammees: 40, modeCP: 'juin', ...p });

  it('déduction en jours (art. 111)', () => {
    const evts = [ev({ type: 'absence_enfant_deduite', dateDebut: '2026-09-07', dateFin: '2026-09-08' })];
    const r = calculerMois(inc(), evts, 2026, 8);
    expect(r.methodeDeduction).toBe('jours');
    expect(r.joursPrevusMois).toBe(17);
    expect(r.deductionBrut).toBeCloseTo((600 * 2) / 17);
  });

  it('les semaines de non-accueil restent au dénominateur', () => {
    const evts = [
      ev({ type: 'non_programme', dateDebut: '2026-09-21', dateFin: '2026-09-27' }),
      ev({ type: 'absence_enfant_deduite', dateDebut: '2026-09-07', dateFin: '2026-09-07' }),
    ];
    const r = calculerMois(inc(), evts, 2026, 8);
    expect(r.joursPrevusMois).toBe(17);
    expect(r.deductionBrut).toBeCloseTo(600 / 17);
    expect(r.pajemploi.joursActivite).toBe(12); // 17 − 4 (non programmés) − 1 (absence)
  });

  it('absence partielle : fraction de journée', () => {
    const evts = [ev({ type: 'absence_assmat', dateDebut: '2026-09-07', dateFin: '2026-09-07', heures: 3 })];
    const r = calculerMois(inc(), evts, 2026, 8);
    expect(r.joursDeduits).toBeCloseTo(1 / 3);
  });

  it('mois sans accueil : salaire mensualisé maintenu', () => {
    const evts = [ev({ type: 'non_programme', dateDebut: '2026-08-01', dateFin: '2026-08-31' })];
    const r = calculerMois(inc(), evts, 2026, 7);
    expect(r.salaireBrutTotal).toBe(600);
    expect(r.pajemploi.joursActivite).toBe(0);
    expect(r.pajemploi.indemnitesRepas).toBe(0);
  });

  it('pas de congés payés versés chaque mois', () => {
    const r = calculerMois(inc(), [], 2026, 8);
    expect(r.congesPayesBrut).toBe(0);
    expect(r.salaireBrutTotal).toBe(600);
  });

  // Contrat de 41 semaines démarré le 1er juin 2025 : 11 semaines sans accueil sur la période de référence.
  const c41 = (modeCP: Contrat['modeCP']) => inc({ semainesProgrammees: 41, dateDebut: '2025-06-01', modeCP });
  const nonAccueil = () => [
    ev({ type: 'non_programme', dateDebut: '2025-07-07', dateFin: '2025-08-24' }), // 7 semaines
    ev({ type: 'non_programme', dateDebut: '2025-12-22', dateFin: '2026-01-04' }), // 2 semaines
    ev({ type: 'non_programme', dateDebut: '2026-04-13', dateFin: '2026-04-26' }), // 2 semaines
  ];

  it('droits à congés : 41 semaines → 26 jours, maintien plus favorable que 10 %', () => {
    const d = droitsCP(c41('juin'), nonAccueil(), 2026);
    expect(d.joursAcquis).toBe(26); // 41 / 4 × 2,5 = 25,6 → 26
    expect(d.brutReference).toBeCloseTo(12 * 615);
    expect(d.dixieme).toBeCloseTo(738);
    expect(d.maintien).toBeCloseTo((26 / 6) * 180);
    expect(d.indemnite).toBeCloseTo(780);
  });

  it('CP versés en une fois en juin', () => {
    const evts = nonAccueil();
    expect(calculerMois(c41('juin'), evts, 2026, 4).congesPayesBrut).toBe(0);
    const juin = calculerMois(c41('juin'), evts, 2026, 5);
    expect(juin.congesPayesBrut).toBeCloseTo(780);
    expect(juin.salaireBrutTotal).toBe(1395);
    expect(juin.pajemploi.heuresNormales).toBe(Math.round(123 + 780 / 5));
  });

  const prisesCP = () => [
    ...nonAccueil(),
    ev({ type: 'conges_payes', dateDebut: '2026-07-06', dateFin: '2026-07-25' }), // 17 jours ouvrables (14/07 férié)
    ev({ type: 'conges_payes', dateDebut: '2026-12-21', dateFin: '2026-12-26' }), // 5 jours ouvrables (25/12 férié)
  ];

  it('CP versés au fur et à mesure de la prise', () => {
    const juillet = calculerMois(c41('fur_et_a_mesure'), prisesCP(), 2026, 6);
    expect(juillet.pajemploi.joursCongesPayes).toBe(17);
    expect(juillet.congesPayesBrut).toBeCloseTo((780 * 17) / 26);
    const dec = calculerMois(c41('fur_et_a_mesure'), prisesCP(), 2026, 11);
    expect(dec.congesPayesBrut).toBeCloseTo((780 * 5) / 26);
  });

  it('CP versés lors de la prise principale', () => {
    expect(calculerMois(c41('prise_principale'), prisesCP(), 2026, 6).congesPayesBrut).toBeCloseTo(780);
    expect(calculerMois(c41('prise_principale'), prisesCP(), 2026, 11).congesPayesBrut).toBe(0);
  });
});

describe('année complète : congés payés', () => {
  it('complément en juin si le dixième est plus favorable', () => {
    const c = contrat({ dateDebut: '2025-06-01' });
    const d = droitsCP(c, [], 2026);
    expect(d.joursAcquis).toBe(30);
    expect(d.dixieme).toBeCloseTo(936);
    expect(d.maintien).toBeCloseTo(900);
    const juin = calculerMois(c, [], 2026, 5);
    expect(juin.congesPayesBrut).toBeCloseTo(36);
    expect(juin.salaireBrutTotal).toBe(816);
  });

  it('première année incomplète : pas de complément si le maintien est plus favorable', () => {
    const c = contrat({ dateDebut: '2025-09-01' });
    const d = droitsCP(c, [], 2026);
    expect(d.joursAcquis).toBe(25); // 39 semaines / 4 × 2,5 = 24,4 → 25
    expect(calculerMois(c, [], 2026, 5).congesPayesBrut).toBe(0);
  });
});
