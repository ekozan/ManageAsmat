import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Contrat, Donnees, Enfant, Evenement, ID, PlanningJour } from './types';

const CLE = 'manageasmat:v1';

const VIDE: Donnees = { version: 1, enfants: [], contrats: [], evenements: [] };

export function nouvelId(): ID {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function charger(): Donnees {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return VIDE;
    return valider(JSON.parse(brut));
  } catch {
    return VIDE;
  }
}

export function valider(d: unknown): Donnees {
  const o = d as Partial<Donnees>;
  if (!o || typeof o !== 'object' || !Array.isArray(o.enfants) || !Array.isArray(o.contrats) || !Array.isArray(o.evenements)) {
    throw new Error('Fichier de sauvegarde invalide');
  }
  return { version: 1, enfants: o.enfants, contrats: o.contrats.map(migrerContrat), evenements: o.evenements };
}

/** Complète les contrats enregistrés par une version antérieure. */
function migrerContrat(c: Contrat): Contrat {
  const modesValides: Contrat['modeCP'][] = ['mensualise', 'juin', 'prise_principale', 'fur_et_a_mesure'];
  let modeCP = modesValides.includes(c.modeCP) ? c.modeCP : 'juin';
  if (c.type === 'complete') modeCP = 'mensualise';
  else if (modeCP === 'mensualise') modeCP = 'juin';
  return {
    ...c,
    majorationComplementairesPct: c.majorationComplementairesPct ?? 0,
    majorationFeriePct: c.majorationFeriePct ?? 10,
    modeCP,
  };
}

interface Store {
  donnees: Donnees;
  remplacer: (d: Donnees) => void;
  sauverEnfant: (e: Enfant) => void;
  supprimerEnfant: (id: ID) => void;
  sauverContrat: (c: Contrat) => void;
  supprimerContrat: (id: ID) => void;
  sauverEvenement: (e: Evenement) => void;
  supprimerEvenement: (id: ID) => void;
}

const Ctx = createContext<Store | null>(null);

function upsert<T extends { id: ID }>(liste: T[], item: T): T[] {
  return liste.some((x) => x.id === item.id) ? liste.map((x) => (x.id === item.id ? item : x)) : [...liste, item];
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [donnees, setDonnees] = useState<Donnees>(charger);

  useEffect(() => {
    try {
      localStorage.setItem(CLE, JSON.stringify(donnees));
    } catch {
      /* stockage indisponible (navigation privée…) : les données restent en mémoire */
    }
  }, [donnees]);

  const store: Store = {
    donnees,
    remplacer: setDonnees,
    sauverEnfant: (e) => setDonnees((d) => ({ ...d, enfants: upsert(d.enfants, e) })),
    supprimerEnfant: (id) =>
      setDonnees((d) => {
        const contrats = d.contrats.filter((c) => c.enfantId === id).map((c) => c.id);
        return {
          ...d,
          enfants: d.enfants.filter((e) => e.id !== id),
          contrats: d.contrats.filter((c) => c.enfantId !== id),
          evenements: d.evenements.filter((e) => !contrats.includes(e.contratId)),
        };
      }),
    sauverContrat: (c) => setDonnees((d) => ({ ...d, contrats: upsert(d.contrats, c) })),
    supprimerContrat: (id) =>
      setDonnees((d) => ({
        ...d,
        contrats: d.contrats.filter((c) => c.id !== id),
        evenements: d.evenements.filter((e) => e.contratId !== id),
      })),
    sauverEvenement: (e) => setDonnees((d) => ({ ...d, evenements: upsert(d.evenements, e) })),
    supprimerEvenement: (id) => setDonnees((d) => ({ ...d, evenements: d.evenements.filter((e) => e.id !== id) })),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider manquant');
  return s;
}

export function nomEnfant(d: Donnees, enfantId: ID): string {
  const e = d.enfants.find((x) => x.id === enfantId);
  return e ? `${e.prenom} ${e.nom}`.trim() : '(enfant supprimé)';
}

export function libelleContrat(d: Donnees, c: Contrat): string {
  return `${nomEnfant(d, c.enfantId)} — ${c.nomAssmat || 'Assistante maternelle'}`;
}

export function contratParDefaut(enfantId: ID, dateDebut: string): Contrat {
  const dej = nouvelId();
  const gouter = nouvelId();
  const jour = (actif: boolean): PlanningJour => ({
    actif,
    heures: actif ? 9 : 0,
    repas: actif ? { [dej]: 1, [gouter]: 1 } : {},
  });
  return {
    id: nouvelId(),
    enfantId,
    nomAssmat: '',
    dateDebut,
    type: 'complete',
    semainesProgrammees: 46,
    planning: [jour(true), jour(true), jour(false), jour(true), jour(true), jour(false), jour(false)],
    tauxHoraireBrut: 4.5,
    coefNet: 0.7812,
    seuilMajoration: 45,
    majorationPct: 10,
    majorationComplementairesPct: 0,
    majorationFeriePct: 10,
    // 90 % du minimum garanti (4,35 € au 1er juin 2026) pour 9 h, soit 0,435 €/h ; plancher 2,65 €/jour.
    entretien: { mode: 'heure', montant: 0.435, minimumJour: 2.65 },
    typesRepas: [
      { id: dej, libelle: 'Déjeuner', montant: 3 },
      { id: gouter, libelle: 'Goûter', montant: 1 },
    ],
    tauxKm: 0.4,
    modeCP: 'mensualise',
  };
}
