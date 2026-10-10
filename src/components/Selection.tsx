import { useEffect, useState } from 'react';
import { MOIS } from '../lib/dates';
import { libelleContrat, useStore } from '../lib/store';
import type { ID } from '../lib/types';

const CLE = 'manageasmat:selection';

interface Selection {
  contratId?: ID;
  annee: number;
  mois: number;
}

function lire(): Selection {
  const d = new Date();
  const defaut = { annee: d.getFullYear(), mois: d.getMonth() };
  try {
    return { ...defaut, ...JSON.parse(localStorage.getItem(CLE) ?? '{}') };
  } catch {
    return defaut;
  }
}

/** Contrat et mois sélectionnés, partagés entre le calendrier et la page Pajemploi. */
export function useSelection() {
  const { donnees } = useStore();
  const [sel, setSel] = useState<Selection>(lire);
  useEffect(() => {
    try {
      localStorage.setItem(CLE, JSON.stringify(sel));
    } catch {
      /* ignoré */
    }
  }, [sel]);
  const contrat = donnees.contrats.find((c) => c.id === sel.contratId) ?? donnees.contrats[0];
  const decaler = (n: number) =>
    setSel((s) => {
      const t = s.annee * 12 + s.mois + n;
      return { ...s, annee: Math.floor(t / 12), mois: ((t % 12) + 12) % 12 };
    });
  return { ...sel, contrat, setSel, decaler };
}

export function BarreSelection({ s }: { s: ReturnType<typeof useSelection> }) {
  const { donnees } = useStore();
  return (
    <div className="barre">
      <select value={s.contrat?.id} onChange={(e) => s.setSel({ annee: s.annee, mois: s.mois, contratId: e.target.value })}>
        {donnees.contrats.map((c) => (
          <option key={c.id} value={c.id}>
            {libelleContrat(donnees, c)}
          </option>
        ))}
      </select>
      <div className="nav-mois">
        <button onClick={() => s.decaler(-1)} aria-label="Mois précédent">◀</button>
        <strong>
          {MOIS[s.mois]} {s.annee}
        </strong>
        <button onClick={() => s.decaler(1)} aria-label="Mois suivant">▶</button>
      </div>
    </div>
  );
}
