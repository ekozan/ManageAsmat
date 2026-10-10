import { Nombre, heures } from './Champs';
import { JOURS_COURTS, dureeHeures, formatDate, weekday } from '../lib/dates';
import { calculerJour, type JourCalcule } from '../lib/paie';
import { nouvelId, useStore } from '../lib/store';
import type { Contrat, Evenement, TypeEvenement } from '../lib/types';

/** Statuts saisissables sur une journée (un événement d'un jour). */
export const STATUTS: { type: TypeEvenement | ''; libelle: string }[] = [
  { type: '', libelle: 'Normal' },
  { type: 'absence_enfant_deduite', libelle: 'Abs. enfant déduite (maladie)' },
  { type: 'absence_enfant_payee', libelle: 'Abs. enfant payée' },
  { type: 'absence_assmat', libelle: 'Abs. assistante maternelle' },
  { type: 'conges_payes', libelle: 'Congés payés' },
  { type: 'non_programme', libelle: 'Vacances enfant / jour perlé' },
  { type: 'ferie_travaille', libelle: 'Férié travaillé' },
];
export const TYPES_STATUT_JOUR = STATUTS.map((s) => s.type).filter(Boolean) as TypeEvenement[];

/**
 * Saisie jour par jour : statut, heures réelles (arrivée / départ), km et repas.
 * Chaque valeur est stockée dans un événement d'une seule journée ; les événements sur plusieurs
 * jours (saisis via le formulaire) restent affichés mais ne sont pas modifiables ici.
 */
/** Lecture / écriture des événements d'une journée pour un contrat. */
export function useSaisieJour(c: Contrat) {
  const { donnees, sauverEvenement, supprimerEvenement } = useStore();
  const evtsC = donnees.evenements.filter((e) => e.contratId === c.id);

  const duJour = (date: string, type: TypeEvenement) =>
    evtsC.find((e) => e.type === type && e.dateDebut === date && e.dateFin === date);
  const periode = (date: string, types: TypeEvenement[]) =>
    evtsC.find((e) => types.includes(e.type) && e.dateDebut <= date && date <= e.dateFin && e.dateDebut !== e.dateFin);

  const ecrire = (date: string, type: TypeEvenement, patch: Partial<Evenement> | null) => {
    const ex = duJour(date, type);
    if (patch === null) {
      if (ex) supprimerEvenement(ex.id);
      return;
    }
    sauverEvenement({ ...(ex ?? { id: nouvelId(), contratId: c.id, type, dateDebut: date, dateFin: date }), ...patch });
  };

  const changerStatut = (date: string, type: TypeEvenement | '') => {
    for (const t of TYPES_STATUT_JOUR) {
      const ex = duJour(date, t);
      if (ex && t !== type) supprimerEvenement(ex.id);
    }
    if (type && !duJour(date, type)) ecrire(date, type, {});
  };

  const changerReel = (date: string, e: Evenement | undefined, patch: Partial<Evenement>) => {
    const n = { arrivee: e?.arrivee, depart: e?.depart, heures: e?.heures, ...patch };
    const calc = dureeHeures(n.arrivee, n.depart);
    if ('arrivee' in patch || 'depart' in patch) n.heures = calc ?? (n.arrivee || n.depart ? n.heures : undefined);
    if (!n.arrivee && !n.depart && n.heures === undefined) ecrire(date, 'heures_reelles', null);
    else ecrire(date, 'heures_reelles', n);
  };

  const changerFrais = (date: string, patch: { km?: number; repas?: Record<string, number> }) => {
    const ex = duJour(date, 'frais');
    const n = { km: ex?.km, repas: ex?.repas, ...patch };
    const vide = !n.km && !Object.values(n.repas ?? {}).some((x) => x);
    ecrire(date, 'frais', vide ? null : n);
  };

  /** Nombre de repas « réel » saisi → écart à stocker par rapport au calcul sans l'ajustement du jour. */
  const changerRepas = (date: string, typeId: string, valeur: number) => {
    const ex = duJour(date, 'frais');
    const sans = calculerJour(c, evtsC.filter((e) => e !== ex), date).repas[typeId] ?? 0;
    changerFrais(date, { repas: { ...(ex?.repas ?? {}), [typeId]: valeur - sans } });
  };

  const saisi = (date: string) =>
    evtsC.some((e) => e.dateDebut === date && e.dateFin === date && (e.type === 'heures_reelles' || e.type === 'frais' || TYPES_STATUT_JOUR.includes(e.type)));
  return { duJour, periode, changerStatut, changerReel, changerFrais, changerRepas, saisi, evtsC };
}

export default function SaisieJours({ c, jours }: { c: Contrat; jours: JourCalcule[] }) {
  const { duJour, periode, changerStatut, changerReel, changerFrais, changerRepas, saisi } = useSaisieJour(c);

  return (
    <div className="table-scroll">
      <table className="saisie-jours">
        <thead>
          <tr>
            <th>Jour</th>
            <th>Prévu</th>
            <th>Statut</th>
            <th>Arrivée</th>
            <th>Départ</th>
            <th>Heures réelles</th>
            <th>Payé / en plus</th>
            <th>Km</th>
            {c.typesRepas.map((t) => (
              <th key={t.id}>{t.libelle || 'Repas'}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jours.map((j) => {
            if (j.statut === 'hors_contrat') return null;
            const statutJour = TYPES_STATUT_JOUR.find((t) => duJour(j.date, t)) ?? '';
            const statutPeriode = periode(j.date, TYPES_STATUT_JOUR);
            const reel = duJour(j.date, 'heures_reelles');
            const frais = duJour(j.date, 'frais');
            return (
              <tr key={j.date} className={`st-${j.statut}${saisi(j.date) ? ' saisi' : ''}`}>
                <td className="nowrap">
                  {JOURS_COURTS[weekday(j.date)]} {formatDate(j.date).slice(0, 5)}
                  {saisi(j.date) && <span className="coche"> ✓</span>}
                  {j.ferie && <div className="discret">{j.ferie}</div>}
                </td>
                <td>{j.prevu > 0 ? heures(j.prevu) : '—'}</td>
                <td>
                  {statutPeriode ? (
                    <span className="discret" title="Événement sur plusieurs jours : modifiable dans la vue calendrier">
                      {STATUTS.find((x) => x.type === statutPeriode.type)?.libelle} (période)
                    </span>
                  ) : (
                    <select value={statutJour} onChange={(e) => changerStatut(j.date, e.target.value as TypeEvenement | '')}>
                      {STATUTS.map((x) => (
                        <option key={x.type} value={x.type}>
                          {x.libelle}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td>
                  <input type="time" value={reel?.arrivee ?? ''} onChange={(e) => changerReel(j.date, reel, { arrivee: e.target.value || undefined })} />
                </td>
                <td>
                  <input type="time" value={reel?.depart ?? ''} onChange={(e) => changerReel(j.date, reel, { depart: e.target.value || undefined })} />
                </td>
                <td>
                  <Nombre valeur={reel?.heures} min={0} onChange={(v) => changerReel(j.date, reel, { heures: v })} suffixe="h" />
                </td>
                <td className="nowrap">
                  {j.heuresTravaillees > 0 || j.heuresDeduites > 0 ? (
                    <>
                      {heures(j.heuresTravaillees - j.heuresEnPlus)}
                      {j.heuresEnPlus > 0 && <em className="plus"> +{heures(j.heuresEnPlus)}</em>}
                      {j.heuresDeduites > 0 && <span className="cal-ded"> −{heures(j.heuresDeduites)}</span>}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <Nombre valeur={frais?.km} min={0} onChange={(v) => changerFrais(j.date, { km: v })} />
                </td>
                {c.typesRepas.map((t) => (
                  <td key={t.id}>
                    <Nombre valeur={j.repas[t.id] ?? 0} min={0} onChange={(v) => changerRepas(j.date, t.id, v ?? 0)} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Fiche d'une journée, ouverte en cliquant sur un jour du calendrier. */
export function JourneeEditeur({
  c,
  j,
  onClose,
  onPeriode,
}: {
  c: Contrat;
  j: JourCalcule;
  onClose: () => void;
  onPeriode: () => void;
}) {
  const { duJour, periode, changerStatut, changerReel, changerFrais, changerRepas } = useSaisieJour(c);
  const statutJour = TYPES_STATUT_JOUR.find((t) => duJour(j.date, t)) ?? '';
  const statutPeriode = periode(j.date, TYPES_STATUT_JOUR);
  const reel = duJour(j.date, 'heures_reelles');
  const frais = duJour(j.date, 'frais');
  return (
    <div className="panneau journee">
      <h3>
        {JOURS_COURTS[weekday(j.date)]} {formatDate(j.date)}
        {j.ferie && <span className="discret"> · {j.ferie}</span>}
      </h3>
      {j.statut === 'hors_contrat' ? (
        <p className="vide">Jour hors contrat.</p>
      ) : (
        <>
          <p className="discret">
            Prévu au planning : {j.prevu > 0 ? heures(j.prevu) : 'pas d’accueil'} · payé ce jour :{' '}
            {heures(j.heuresTravaillees - j.heuresEnPlus)}
            {j.heuresEnPlus > 0 && ` + ${heures(j.heuresEnPlus)} en plus`}
            {j.heuresDeduites > 0 && ` · ${heures(j.heuresDeduites)} déduites`}
          </p>
          <div className="grille">
            <label className="champ">
              <span className="champ-label">Statut de la journée</span>
              {statutPeriode ? (
                <span className="discret">
                  {STATUTS.find((x) => x.type === statutPeriode.type)?.libelle} (période du {formatDate(statutPeriode.dateDebut)} au{' '}
                  {formatDate(statutPeriode.dateFin)})
                </span>
              ) : (
                <select value={statutJour} onChange={(e) => changerStatut(j.date, e.target.value as TypeEvenement | '')}>
                  {STATUTS.map((x) => (
                    <option key={x.type} value={x.type}>
                      {x.libelle}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="champ">
              <span className="champ-label">Arrivée</span>
              <input type="time" value={reel?.arrivee ?? ''} onChange={(e) => changerReel(j.date, reel, { arrivee: e.target.value || undefined })} />
            </label>
            <label className="champ">
              <span className="champ-label">Départ</span>
              <input type="time" value={reel?.depart ?? ''} onChange={(e) => changerReel(j.date, reel, { depart: e.target.value || undefined })} />
            </label>
            <label className="champ">
              <span className="champ-label">Heures réelles</span>
              <Nombre valeur={reel?.heures} min={0} onChange={(v) => changerReel(j.date, reel, { heures: v })} suffixe="h" />
            </label>
            <label className="champ">
              <span className="champ-label">Kilomètres</span>
              <Nombre valeur={frais?.km} min={0} onChange={(v) => changerFrais(j.date, { km: v })} suffixe="km" />
            </label>
            {c.typesRepas.map((t) => (
              <label key={t.id} className="champ">
                <span className="champ-label">{t.libelle || 'Repas'}</span>
                <Nombre valeur={j.repas[t.id] ?? 0} min={0} onChange={(v) => changerRepas(j.date, t.id, v ?? 0)} />
              </label>
            ))}
          </div>
          <p className="aide">
            Heures réelles inférieures au planning : salaire maintenu. Supérieures : heures complémentaires puis
            majorées au-delà de 45 h dans la semaine. Les modifications sont enregistrées immédiatement.
          </p>
        </>
      )}
      <div className="actions">
        {j.prevu > 0 && j.statut === 'travail' && !reel && (
          <button className="primaire" onClick={() => changerReel(j.date, undefined, { heures: j.prevu })}>
            ✓ Conforme au planning ({heures(j.prevu)})
          </button>
        )}
        <button onClick={onPeriode}>Événement sur plusieurs jours…</button>
        <button onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}
