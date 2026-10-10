import { useMemo, useState } from 'react';
import { BarreSelection, useSelection } from '../components/Selection';
import { Champ, Nombre, euros, heures } from '../components/Champs';
import CompteurConges from '../components/CompteurConges';
import CompteurNonAccueil from '../components/CompteurNonAccueil';
import SaisieJours, { JourneeEditeur } from '../components/SaisieJours';
import { JOURS_COURTS, dureeHeures, formatDate, makeISO, today, weekday } from '../lib/dates';
import { absencesEnfantSurAnnee, calculerMois, type JourCalcule, type StatutJour } from '../lib/paie';
import { nouvelId, useStore } from '../lib/store';
import { LIBELLES_COURTS, LIBELLES_EVENEMENT, type Contrat, type Evenement, type TypeEvenement } from '../lib/types';

const LIBELLES_STATUT: Record<StatutJour, string> = {
  hors_contrat: 'Hors contrat',
  repos: '',
  travail: 'Accueil',
  ferie: 'Férié',
  non_programme: 'Vacances enfant',
  cp: 'Congés payés',
  absence_deduite: 'Absence déduite',
  absence_payee: 'Absence payée',
};

/** Date du compteur : aujourd'hui si on regarde le mois en cours, sinon la fin du mois affiché. */
function compteurDate(finMois: string, debutContrat: string): string {
  const t = today();
  const d = finMois.slice(0, 7) === t.slice(0, 7) ? t : finMois;
  return d < debutContrat ? debutContrat : d;
}

const TYPES_AVEC_HEURES: TypeEvenement[] = ['absence_enfant_deduite', 'absence_enfant_payee', 'absence_assmat', 'heures_sup'];
const TYPES_AVEC_FRAIS: TypeEvenement[] = ['frais', 'heures_sup'];

export default function Calendrier() {
  const { donnees, sauverEvenement, supprimerEvenement } = useStore();
  const s = useSelection();
  const [edition, setEdition] = useState<Evenement | null>(null);
  const [vue, setVue] = useState<'calendrier' | 'jours'>('calendrier');
  const [jourOuvert, setJourOuvert] = useState<string | null>(null);
  const c = s.contrat;

  const res = useMemo(
    () => (c ? calculerMois(c, donnees.evenements, s.annee, s.mois) : null),
    [c, donnees.evenements, s.annee, s.mois],
  );

  if (!c || !res) {
    return (
      <section>
        <h2>Calendrier</h2>
        <p className="vide">
          Créez d'abord un contrat dans l'onglet <a href="#contrats">Contrats</a>.
        </p>
      </section>
    );
  }

  const premier = makeISO(s.annee, s.mois, 1);
  const decalage = weekday(premier);
  const dernier = res.jours[res.jours.length - 1].date;
  const evtsMois = donnees.evenements
    .filter((e) => e.contratId === c.id && e.dateDebut <= dernier && e.dateFin >= premier)
    .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));

  const absences = absencesEnfantSurAnnee(c, donnees.evenements, dernier < c.dateDebut ? c.dateDebut : dernier);

  const nouvelEvenement = (date: string): Evenement => ({
    id: nouvelId(),
    contratId: c.id,
    type: 'absence_enfant_deduite',
    dateDebut: date,
    dateFin: date,
  });

  return (
    <section>
      <h2>Calendrier prévisionnel</h2>
      <p className="intro">
        Le planning type du contrat est appliqué automatiquement (jours fériés compris). Cliquez sur un jour pour
        ajouter un événement (absence, congés sur une période…), ou passez en « saisie jour par jour » pour entrer
        les heures réelles, les absences, les km et les repas de chaque journée.
      </p>
      <BarreSelection s={s} />
      <div className="onglets-vue">
        <button className={vue === 'calendrier' ? 'primaire' : ''} onClick={() => setVue('calendrier')}>
          Calendrier
        </button>
        <button className={vue === 'jours' ? 'primaire' : ''} onClick={() => setVue('jours')}>
          Saisie jour par jour
        </button>
      </div>

      {vue === 'jours' ? (
        <SaisieJours c={c} jours={res.jours} />
      ) : (
      <div className="calendrier">
        {JOURS_COURTS.map((j) => (
          <div key={j} className="cal-entete">
            {j}
          </div>
        ))}
        {Array.from({ length: decalage }, (_, i) => (
          <div key={`v${i}`} className="cal-vide" />
        ))}
        {res.jours.map((j) => (
          <Case
            key={j.date}
            j={j}
            saisi={j.evenements.some(
              (e) => e.dateDebut === j.date && e.dateFin === j.date && e.type !== 'heures_sup',
            )}
            actif={jourOuvert === j.date}
            onClick={() => {
              setEdition(null);
              setJourOuvert(j.date);
            }}
          />
        ))}
      </div>
      )}
      <Legende />
      {(absences.jours > 5 || absences.plusLongueSerie > 14) && (
        <ul className="alertes">
          <li>
            ⚠️ {absences.jours} jour(s) d'absence de l'enfant déduits entre le {formatDate(absences.debut)} et le{' '}
            {formatDate(absences.fin)}. La convention (art. 105) limite les courtes absences pour maladie non
            rémunérées à 5 jours par période de 12 mois ; au-delà de 14 jours calendaires consécutifs, l'employeur
            doit reprendre le paiement du salaire ou rompre le contrat. Vérifiez vos déductions.
          </li>
        </ul>
      )}

      {jourOuvert && vue === 'calendrier' && res.jours.find((j) => j.date === jourOuvert) && (
        <JourneeEditeur
          c={c}
          j={res.jours.find((j) => j.date === jourOuvert)!}
          onClose={() => setJourOuvert(null)}
          onPeriode={() => {
            setEdition(nouvelEvenement(jourOuvert));
            setJourOuvert(null);
          }}
        />
      )}

      {edition && (
        <FormulaireEvenement
          e={edition}
          c={c}
          nouveau={!donnees.evenements.some((x) => x.id === edition.id)}
          onChange={setEdition}
          onSave={() => {
            sauverEvenement(edition);
            setEdition(null);
          }}
          onCancel={() => setEdition(null)}
        />
      )}

      <h3>Événements du mois</h3>
      {evtsMois.length === 0 ? (
        <p className="vide">Aucun événement ce mois-ci.</p>
      ) : (
        <ul className="evenements">
          {evtsMois.map((e) => (
            <li key={e.id} className={`ev ev-${e.type}`}>
              <div>
                <strong>{LIBELLES_EVENEMENT[e.type]}</strong>
                <div className="discret">
                  {e.dateDebut === e.dateFin ? `le ${formatDate(e.dateDebut)}` : `du ${formatDate(e.dateDebut)} au ${formatDate(e.dateFin)}`}
                  {e.arrivee || e.depart ? ` · ${e.arrivee ?? '?'} → ${e.depart ?? '?'}` : ''}
                  {e.heures ? ` · ${heures(e.heures)}${e.type === 'heures_reelles' ? '' : '/jour'}` : ''}
                  {e.km ? ` · ${e.km} km/jour` : ''}
                  {e.repas &&
                    Object.entries(e.repas)
                      .filter(([, n]) => n)
                      .map(([id, n]) => ` · ${n > 0 ? '+' : ''}${n} ${c.typesRepas.find((t) => t.id === id)?.libelle ?? 'repas'}`)
                      .join('')}
                  {e.note ? ` · ${e.note}` : ''}
                </div>
              </div>
              <div className="actions">
                <button onClick={() => setEdition(structuredClone(e))}>Modifier</button>
                <button className="danger" onClick={() => supprimerEvenement(e.id)}>
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="resume">
        Ce mois : <strong>{res.pajemploi.joursActivite}</strong> jours d'accueil ·{' '}
        <strong>{heures(res.heuresPrevuesMois)}</strong> prévues · {heures(res.heuresDeduites)} déduites ·{' '}
        {heures(res.heuresComplementaires + res.heuresMajoreesEnPlus)} en plus · salaire net{' '}
        <strong>{euros(res.salaireNetTotal)}</strong> → <a href="#pajemploi">voir la déclaration Pajemploi</a>
      </div>

      <CompteurNonAccueil c={c} date={compteurDate(dernier, c.dateDebut)} />
      <CompteurConges c={c} date={compteurDate(dernier, c.dateDebut)} />
    </section>
  );
}

function Case({ j, saisi, actif, onClick }: { j: JourCalcule; saisi: boolean; actif: boolean; onClick: () => void }) {
  const jour = Number(j.date.slice(8));
  const nbRepas = Object.values(j.repas).reduce((a, b) => a + b, 0);
  return (
    <button
      className={`cal-jour st-${j.statut}${saisi ? ' saisi' : ''}${actif ? ' ouvert' : ''}`}
      onClick={onClick}
      title={j.ferie ?? ''}
    >
      <span className="cal-num">
        {jour}
        {saisi && <span className="coche" aria-label="journée saisie"> ✓</span>}
      </span>
      {j.ferie && <span className="cal-ferie">{j.ferie}</span>}
      {j.statut !== 'repos' && <span className="cal-statut">{LIBELLES_STATUT[j.statut]}</span>}
      {j.heuresTravaillees > 0 && (
        <span className="cal-h">
          {heures(j.heuresTravaillees)}
          {j.heuresEnPlus > 0 && <em> (+{j.heuresEnPlus})</em>}
        </span>
      )}
      {j.heuresDeduites > 0 && j.statut !== 'hors_contrat' && <span className="cal-ded">−{heures(j.heuresDeduites)}</span>}
      {(nbRepas > 0 || j.km > 0) && (
        <span className="cal-frais">
          {nbRepas > 0 && `🍽 ${nbRepas}`} {j.km > 0 && `🚗 ${j.km} km`}
        </span>
      )}
      <span className="cal-badges">
        {j.evenements.map((e) => (
          <span key={e.id} className={`badge ev-${e.type}`}>
            {LIBELLES_COURTS[e.type]}
          </span>
        ))}
      </span>
    </button>
  );
}

function Legende() {
  const items: [StatutJour, string][] = [
    ['travail', 'Accueil prévu'],
    ['ferie', 'Férié chômé (payé)'],
    ['cp', 'Congés payés'],
    ['absence_deduite', 'Absence déduite'],
    ['absence_payee', 'Absence payée'],
    ['non_programme', 'Vacances enfant / jour perlé'],
    ['hors_contrat', 'Hors contrat'],
  ];
  return (
    <div className="legende">
      {items.map(([st, l]) => (
        <span key={st}>
          <i className={`pastille st-${st}`} /> {l}
        </span>
      ))}
      <span>
        <i className="pastille st-travail saisi" /> Journée saisie ✓
      </span>
    </div>
  );
}

function FormulaireEvenement({
  e,
  c,
  nouveau,
  onChange,
  onSave,
  onCancel,
}: {
  e: Evenement;
  c: Contrat;
  nouveau: boolean;
  onChange: (e: Evenement) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (p: Partial<Evenement>) => onChange({ ...e, ...p });
  const estAbsence = e.type.startsWith('absence');
  return (
    <form
      className="panneau"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (e.dateFin < e.dateDebut) return;
        onSave();
      }}
    >
      <h3>{nouveau ? 'Nouvel événement' : "Modifier l'événement"}</h3>
      <div className="grille">
        <Champ label="Type">
          <select value={e.type} onChange={(ev) => set({ type: ev.target.value as TypeEvenement })}>
            {(Object.keys(LIBELLES_EVENEMENT) as TypeEvenement[]).map((t) => (
              <option key={t} value={t}>
                {LIBELLES_EVENEMENT[t]}
              </option>
            ))}
          </select>
        </Champ>
        <Champ label="Du">
          <input
            type="date"
            required
            value={e.dateDebut}
            onChange={(ev) => set({ dateDebut: ev.target.value, dateFin: ev.target.value > e.dateFin ? ev.target.value : e.dateFin })}
          />
        </Champ>
        <Champ label="Au (inclus)">
          <input type="date" required min={e.dateDebut} value={e.dateFin} onChange={(ev) => set({ dateFin: ev.target.value })} />
        </Champ>
        {e.type === 'heures_reelles' && (
          <>
            <Champ label="Arrivée">
              <input
                type="time"
                value={e.arrivee ?? ''}
                onChange={(ev) => set({ arrivee: ev.target.value || undefined, heures: dureeHeures(ev.target.value, e.depart) ?? e.heures })}
              />
            </Champ>
            <Champ label="Départ">
              <input
                type="time"
                value={e.depart ?? ''}
                onChange={(ev) => set({ depart: ev.target.value || undefined, heures: dureeHeures(e.arrivee, ev.target.value) ?? e.heures })}
              />
            </Champ>
            <Champ label="Heures réelles par jour" aide="Calculées depuis l'arrivée et le départ, ou à saisir directement.">
              <Nombre valeur={e.heures} min={0} onChange={(v) => set({ heures: v })} suffixe="h" />
            </Champ>
          </>
        )}
        {TYPES_AVEC_HEURES.includes(e.type) && (
          <Champ
            label={estAbsence ? "Heures d'absence par jour" : 'Heures en plus par jour'}
            aide={estAbsence ? 'Laisser vide pour une journée entière.' : undefined}
          >
            <Nombre valeur={e.heures} min={0} onChange={(v) => set({ heures: v })} suffixe="h" />
          </Champ>
        )}
        {TYPES_AVEC_FRAIS.includes(e.type) && (
          <Champ label="Kilomètres par jour">
            <Nombre valeur={e.km} min={0} onChange={(v) => set({ km: v })} suffixe="km" />
          </Champ>
        )}
        {TYPES_AVEC_FRAIS.includes(e.type) &&
          c.typesRepas.map((t) => (
            <Champ key={t.id} label={`${t.libelle || 'Repas'} en plus / en moins`} aide="Ex. 1 ou -1 par jour">
              <Nombre
                valeur={e.repas?.[t.id]}
                onChange={(v) => set({ repas: { ...e.repas, [t.id]: v ?? 0 } })}
              />
            </Champ>
          ))}
        <Champ label="Note">
          <input value={e.note ?? ''} onChange={(ev) => set({ note: ev.target.value || undefined })} />
        </Champ>
      </div>
      <AideEvenement type={e.type} contrat={c} />
      <div className="actions">
        <button type="submit" className="primaire">Enregistrer</button>
        <button type="button" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

function AideEvenement({ type, contrat }: { type: TypeEvenement; contrat: Contrat }) {
  const textes: Record<TypeEvenement, string> = {
    absence_enfant_deduite:
      contrat.type === 'complete'
        ? "Maladie de l'enfant justifiée par un certificat médical (art. 105) : 5 jours par période de 12 mois au maximum. Déduction = salaire mensualisé × heures d'absence ÷ heures qui auraient été travaillées dans le mois (art. 111)."
        : "Maladie de l'enfant justifiée par un certificat médical (art. 105) : 5 jours par période de 12 mois au maximum. Déduction = salaire mensualisé × jours d'absence ÷ jours qui auraient été travaillés dans le mois, semaines de non-accueil comprises (art. 111).",
    absence_enfant_payee:
      "L'enfant n'est pas accueilli à la demande des parents : le salaire est maintenu, mais pas d'indemnité d'entretien ni de repas.",
    absence_assmat:
      "Maladie, congé sans solde, absence de l'assistante maternelle : déduite selon l'art. 111 (en heures en année complète, en jours en année incomplète). À utiliser aussi pour un jour férié non payé (absence injustifiée la veille ou le lendemain).",
    conges_payes:
      contrat.type === 'complete'
        ? 'Année complète : les congés payés sont inclus dans la mensualisation (pas de déduction). Les jours ouvrables sont comptés pour Pajemploi.'
        : "Année incomplète : les congés sont pris pendant les semaines sans accueil ; l'indemnité (calculée au 31 mai) est versée selon le mode choisi dans le contrat.",
    non_programme:
      contrat.type === 'incomplete'
        ? "Vacances de l'enfant ou jour perlé : jours sans accueil prévus par le forfait du contrat (année incomplète). Déjà pris en compte dans la mensualisation : pas de déduction. Le compteur sous le calendrier indique ce qui reste du forfait."
        : "En année complète, il n'y a pas de forfait de semaines sans accueil : si l'enfant ne vient pas en dehors des congés de l'assistante maternelle, utilisez « Absence enfant payée » (le salaire reste dû).",
    heures_sup:
      'Heures en plus du planning : complémentaires (taux normal) jusqu’au seuil hebdomadaire, puis majorées. Possible aussi sur un jour non travaillé.',
    heures_reelles:
      "Heures réellement faites ce jour-là. En dessous du planning, le salaire mensualisé est maintenu (pas de déduction) mais l'indemnité d'entretien suit les heures réelles. Au-delà, la différence compte en heures complémentaires puis majorées.",
    ferie_travaille: `La journée est travaillée et majorée de ${contrat.majorationFeriePct} % (100 % le 1er mai). Doit être prévu au contrat ou accepté par écrit.`,
    frais: 'Kilomètres parcourus et repas en plus ou en moins par rapport au planning.',
  };
  return <p className="aide">{textes[type]}</p>;
}
