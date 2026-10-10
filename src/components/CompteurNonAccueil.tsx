import { formatDate } from '../lib/dates';
import { compteurNonAccueil } from '../lib/paie';
import { useStore } from '../lib/store';
import type { Contrat } from '../lib/types';

/** Forfait de semaines sans accueil (vacances de l'enfant, jours perlés) en année incomplète. */
export default function CompteurNonAccueil({ c, date }: { c: Contrat; date: string }) {
  const { donnees } = useStore();
  if (c.type !== 'incomplete') return null;
  const k = compteurNonAccueil(c, donnees.evenements, date);
  const n = k.joursParSemaine || 1;
  const fmt = (jours: number) => {
    const sem = Math.trunc(jours / n);
    const reste = jours - sem * n;
    const parts = [];
    if (sem) parts.push(`${sem} sem.`);
    if (reste || !sem) parts.push(`${reste} j`);
    return parts.join(' ') + (sem ? ` (${jours} j)` : '');
  };
  const depasse = k.restantJours < 0;
  return (
    <div className="compteur">
      <h3>
        Vacances de l'enfant et jours perlés — du {formatDate(k.debut)} au {formatDate(k.fin)}
      </h3>
      <div className="compteur-grille">
        <div>
          <span className="discret">Forfait sans accueil (52 − {c.semainesProgrammees} semaines)</span>
          <strong>{fmt(k.forfaitJours)}</strong>
        </div>
        <div>
          <span className="discret">Déjà pris au {formatDate(date)}</span>
          <strong>{fmt(k.prisJours)}</strong>
        </div>
        <div>
          <span className="discret">Posés sur l'année (prévus inclus)</span>
          <strong>{fmt(k.posesJours)}</strong>
          {k.dontCongesAssmatJours > 0 && (
            <span className="discret">dont {k.dontCongesAssmatJours} j de congés de l'assistante maternelle</span>
          )}
        </div>
        <div>
          <span className="discret">Restant à poser</span>
          <strong className={depasse ? 'negatif' : ''}>{depasse ? `−${fmt(-k.restantJours)}` : fmt(k.restantJours)}</strong>
        </div>
      </div>
      <div className="jauge" aria-hidden="true">
        <div className="jauge-pris" style={{ width: `${Math.min(100, (k.prisJours / Math.max(1, k.forfaitJours)) * 100)}%` }} />
        <div
          className="jauge-poses"
          style={{ width: `${Math.min(100, ((k.posesJours - k.prisJours) / Math.max(1, k.forfaitJours)) * 100)}%` }}
        />
      </div>
      {depasse ? (
        <p className="alerte-texte">
          ⚠️ Forfait dépassé : au-delà des {k.forfaitSemaines} semaines prévues au contrat, les jours où l'enfant ne
          vient pas doivent être payés (« Absence enfant payée ») ou le contrat révisé par avenant.
        </p>
      ) : (
        <p className="discret">
          Comptés en jours d'accueil du planning ({k.joursParSemaine} par semaine) : un jour perlé = 1 j, une semaine
          de vacances = {k.joursParSemaine} j. Les congés de l'assistante maternelle pris pendant ces semaines sont
          inclus.
        </p>
      )}
    </div>
  );
}
