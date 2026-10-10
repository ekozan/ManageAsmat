import { useEffect, useState, type ReactNode } from 'react';

export function Champ({ label, aide, children }: { label: string; aide?: ReactNode; children: ReactNode }) {
  return (
    <label className="champ">
      <span className="champ-label">{label}</span>
      {children}
      {aide && <span className="champ-aide">{aide}</span>}
    </label>
  );
}

/** Saisie numérique tolérant la virgule décimale et les saisies intermédiaires. */
export function Nombre({
  valeur,
  onChange,
  min,
  step = 'any',
  suffixe,
}: {
  valeur: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  step?: string;
  suffixe?: string;
}) {
  const [texte, setTexte] = useState(valeur === undefined ? '' : String(valeur));
  useEffect(() => {
    const courant = parseFloat(texte.replace(',', '.'));
    if (valeur !== courant && !(valeur === undefined && texte === '')) setTexte(valeur === undefined ? '' : String(valeur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeur]);
  return (
    <span className="nombre">
      <input
        inputMode="decimal"
        value={texte}
        min={min}
        step={step}
        onChange={(e) => {
          setTexte(e.target.value);
          const t = e.target.value.replace(',', '.').trim();
          if (t === '') onChange(undefined);
          else {
            const n = parseFloat(t);
            if (!Number.isNaN(n)) onChange(n);
          }
        }}
      />
      {suffixe && <span className="suffixe">{suffixe}</span>}
    </span>
  );
}

export const euros = (x: number) =>
  x.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export const heures = (x: number) =>
  `${x.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h`;
