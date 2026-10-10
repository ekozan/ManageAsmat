import { formatDate } from '../lib/dates';
import { compteurCP } from '../lib/paie';
import { useStore } from '../lib/store';
import type { Contrat } from '../lib/types';

const j = (x: number) => `${x.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`;

/** Compteur des congés payés de l'assistante maternelle (jours ouvrables). */
export default function CompteurConges({ c, date }: { c: Contrat; date: string }) {
  const { donnees } = useStore();
  const k = compteurCP(c, donnees.evenements, date);
  const periodeClose = k.acquis.debut <= k.acquis.fin;
  return (
    <div className="compteur">
      <h3>Congés payés de l'assistante maternelle au {formatDate(date)}</h3>
      <div className="compteur-grille">
        <div>
          <span className="discret">
            Acquis {periodeClose ? `du ${formatDate(k.acquis.debut)} au ${formatDate(k.acquis.fin)}` : '(aucune période close)'}
          </span>
          <strong>{j(k.acquis.jours)}</strong>
        </div>
        <div>
          <span className="discret">Pris depuis le {formatDate(k.priseDebut)}</span>
          <strong>{j(k.prisADate)}</strong>
        </div>
        <div>
          <span className="discret">Posés jusqu'au {formatDate(k.priseFin)} (prévus inclus)</span>
          <strong>{j(k.posesTotal)}</strong>
        </div>
        <div>
          <span className="discret">Restant à poser</span>
          <strong className={k.restants < 0 ? 'negatif' : ''}>{j(k.restants)}</strong>
        </div>
        <div>
          <span className="discret">En cours d'acquisition (depuis le {formatDate(k.enCours.debut)})</span>
          <strong>{j(k.enCours.joursADate)}</strong>
          <span className="discret">≈ {j(k.enCours.joursFinPeriode)} au {formatDate(k.enCours.fin)}</span>
        </div>
      </div>
      {k.restants < 0 && (
        <p className="discret">
          ⚠️ Plus de jours posés que de jours acquis : les jours en trop sont un congé sans solde (à saisir comme
          absence de l'assistante maternelle) ou un accord d'anticipation.
        </p>
      )}
      <p className="discret">
        Jours ouvrables (lundi → samedi hors fériés). Acquisition : 2,5 jours par 4 semaines de travail effectif, 30
        jours maximum, du 1er juin au 31 mai ; ces jours se prennent à partir du 1er juin suivant.
      </p>
    </div>
  );
}
