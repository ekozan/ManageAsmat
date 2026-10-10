// Utilitaires de dates. Toutes les dates sont manipulées sous forme de chaînes ISO « AAAA-MM-JJ »
// et converties en UTC pour éviter les surprises liées aux fuseaux horaires / heure d'été.

export type ISODate = string;

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function makeISO(year: number, month0: number, day: number): ISODate {
  return toISO(new Date(Date.UTC(year, month0, day)));
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** Jour de la semaine avec lundi = 0 … dimanche = 6. */
export function weekday(s: ISODate): number {
  return (fromISO(s).getUTCDay() + 6) % 7;
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

export function monthDays(year: number, month0: number): ISODate[] {
  const n = daysInMonth(year, month0);
  const out: ISODate[] = [];
  for (let d = 1; d <= n; d++) out.push(makeISO(year, month0, d));
  return out;
}

/** Lundi de la semaine contenant la date. */
export function mondayOf(s: ISODate): ISODate {
  return addDays(s, -weekday(s));
}

export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function today(): ISODate {
  const d = new Date();
  return makeISO(d.getFullYear(), d.getMonth(), d.getDate());
}

export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export function formatDate(s: ISODate): string {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher). */
export function easter(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeISO(year, month - 1, day);
}

/** Jours fériés légaux en France métropolitaine (hors Alsace-Moselle). */
export function joursFeries(year: number): Map<ISODate, string> {
  const p = easter(year);
  return new Map<ISODate, string>([
    [makeISO(year, 0, 1), "Jour de l'an"],
    [addDays(p, 1), 'Lundi de Pâques'],
    [makeISO(year, 4, 1), 'Fête du travail'],
    [makeISO(year, 4, 8), 'Victoire 1945'],
    [addDays(p, 39), 'Ascension'],
    [addDays(p, 50), 'Lundi de Pentecôte'],
    [makeISO(year, 6, 14), 'Fête nationale'],
    [makeISO(year, 7, 15), 'Assomption'],
    [makeISO(year, 10, 1), 'Toussaint'],
    [makeISO(year, 10, 11), 'Armistice 1918'],
    [makeISO(year, 11, 25), 'Noël'],
  ]);
}

const feriesCache = new Map<number, Map<ISODate, string>>();
export function ferie(s: ISODate): string | undefined {
  const y = Number(s.slice(0, 4));
  let m = feriesCache.get(y);
  if (!m) {
    m = joursFeries(y);
    feriesCache.set(y, m);
  }
  return m.get(s);
}
