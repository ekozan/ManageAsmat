import { useState } from 'react';
import { Champ, Nombre, euros, heures } from '../components/Champs';
import { JOURS, formatDate, today } from '../lib/dates';
import { alertesContrat, heuresHebdo, heuresMensualisees, salaireMensualiseBrut } from '../lib/paie';
import { contratParDefaut, libelleContrat, nomEnfant, nouvelId, useStore } from '../lib/store';
import { LIBELLES_MODE_CP, type Contrat } from '../lib/types';

export default function Contrats() {
  const { donnees, sauverContrat, supprimerContrat } = useStore();
  const [edition, setEdition] = useState<Contrat | null>(null);

  if (donnees.enfants.length === 0) {
    return (
      <section>
        <h2>Contrats</h2>
        <p className="vide">
          Déclarez d'abord un enfant dans l'onglet <a href="#enfants">Enfants</a>.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2>Contrats</h2>
      <p className="intro">Un contrat par enfant et par assistante maternelle : planning type, taux horaire, repas, entretien, kilomètres.</p>

      {donnees.contrats.length === 0 && !edition && <p className="vide">Aucun contrat pour l'instant.</p>}
      <ul className="cartes">
        {donnees.contrats.map((c) => (
          <li key={c.id} className="carte">
            <div>
              <strong>{libelleContrat(donnees, c)}</strong>
              <div className="discret">
                Du {formatDate(c.dateDebut)}
                {c.dateFin ? ` au ${formatDate(c.dateFin)}` : ''} · année {c.type === 'complete' ? 'complète' : `incomplète (${c.semainesProgrammees} sem.)`}
              </div>
              <div className="discret">
                {heures(heuresHebdo(c))}/semaine · {euros(c.tauxHoraireBrut)} brut/h · mensualisé {euros(salaireMensualiseBrut(c))} brut ≈{' '}
                {euros(salaireMensualiseBrut(c) * c.coefNet)} net
              </div>
            </div>
            <div className="actions">
              <button onClick={() => setEdition(structuredClone(c))}>Modifier</button>
              <button
                onClick={() =>
                  setEdition({ ...structuredClone(c), id: nouvelId(), dateDebut: today(), dateFin: undefined })
                }
              >
                Dupliquer
              </button>
              <button
                className="danger"
                onClick={() => {
                  if (confirm('Supprimer ce contrat et tous ses événements ?')) supprimerContrat(c.id);
                }}
              >
                Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>

      {edition ? (
        <FormulaireContrat
          contrat={edition}
          onChange={setEdition}
          nouveau={!donnees.contrats.some((c) => c.id === edition.id)}
          onSave={() => {
            sauverContrat(edition);
            setEdition(null);
          }}
          onCancel={() => setEdition(null)}
        />
      ) : (
        <button className="primaire" onClick={() => setEdition(contratParDefaut(donnees.enfants[0].id, today()))}>
          + Nouveau contrat
        </button>
      )}
    </section>
  );
}

function FormulaireContrat({
  contrat: c,
  onChange,
  onSave,
  onCancel,
  nouveau,
}: {
  contrat: Contrat;
  onChange: (c: Contrat) => void;
  onSave: () => void;
  onCancel: () => void;
  nouveau: boolean;
}) {
  const { donnees } = useStore();
  const set = (p: Partial<Contrat>) => onChange({ ...c, ...p });
  const setJour = (i: number, p: Partial<Contrat['planning'][number]>) =>
    set({ planning: c.planning.map((j, k) => (k === i ? { ...j, ...p } : j)) });

  const hm = heuresMensualisees(c);
  const brut = salaireMensualiseBrut(c);
  const hebdo = heuresHebdo(c);

  return (
    <form
      className="panneau"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <h3>{nouveau ? 'Nouveau contrat' : 'Modifier le contrat'}</h3>

      <fieldset>
        <legend>Général</legend>
        <div className="grille">
          <Champ label="Enfant">
            <select value={c.enfantId} onChange={(e) => set({ enfantId: e.target.value })}>
              {donnees.enfants.map((e) => (
                <option key={e.id} value={e.id}>
                  {nomEnfant(donnees, e.id)}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Assistante maternelle">
            <input value={c.nomAssmat} onChange={(e) => set({ nomAssmat: e.target.value })} placeholder="Nom / prénom" />
          </Champ>
          <Champ label="Début du contrat">
            <input type="date" required value={c.dateDebut} onChange={(e) => set({ dateDebut: e.target.value })} />
          </Champ>
          <Champ label="Fin du contrat (optionnel)">
            <input type="date" value={c.dateFin ?? ''} min={c.dateDebut} onChange={(e) => set({ dateFin: e.target.value || undefined })} />
          </Champ>
          <Champ label="Type d'accueil">
            <select
              value={c.type}
              onChange={(e) => {
                const type = e.target.value as Contrat['type'];
                set({ type, modeCP: type === 'complete' ? 'mensualise' : c.modeCP === 'mensualise' ? 'juin' : c.modeCP });
              }}
            >
              <option value="complete">Année complète (52 semaines, dont 5 de CP)</option>
              <option value="incomplete">Année incomplète (46 semaines ou moins)</option>
            </select>
          </Champ>
          {c.type === 'incomplete' && (
            <Champ
              label="Semaines d'accueil programmées / an"
              aide="Hors congés payés de l'assistante maternelle : 46 maximum (ex. 41, 36…). Marquez les semaines sans accueil dans le calendrier."
            >
              <Nombre valeur={c.semainesProgrammees} min={1} onChange={(v) => set({ semainesProgrammees: v ?? 0 })} />
            </Champ>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>Planning type de la semaine</legend>
        <div className="table-scroll">
          <table className="planning">
            <thead>
              <tr>
                <th>Jour</th>
                <th>Accueil</th>
                <th>Heures</th>
                {c.typesRepas.map((t) => (
                  <th key={t.id}>{t.libelle || 'Repas'}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.planning.map((j, i) => (
                <tr key={i} className={j.actif ? '' : 'inactif'}>
                  <td>{JOURS[i]}</td>
                  <td>
                    <input type="checkbox" checked={j.actif} onChange={(e) => setJour(i, { actif: e.target.checked })} />
                  </td>
                  <td>
                    <Nombre valeur={j.heures} min={0} onChange={(v) => setJour(i, { heures: v ?? 0 })} suffixe="h" />
                  </td>
                  {c.typesRepas.map((t) => (
                    <td key={t.id}>
                      <Nombre
                        valeur={j.repas[t.id] ?? 0}
                        min={0}
                        onChange={(v) => setJour(i, { repas: { ...j.repas, [t.id]: v ?? 0 } })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="discret">
          Total : <strong>{heures(hebdo)}</strong> par semaine. Pour une demi-heure, saisissez 8,5.
        </p>
      </fieldset>

      <fieldset>
        <legend>Rémunération</legend>
        <div className="grille">
          <Champ label="Taux horaire brut" aide="Minimum conventionnel : 4,20 € brut au 1er juin 2026 (à vérifier).">
            <Nombre valeur={c.tauxHoraireBrut} min={0} onChange={(v) => set({ tauxHoraireBrut: v ?? 0 })} suffixe="€/h" />
          </Champ>
          <Champ label="Coefficient net / brut" aide="Part du brut versée en net (≈ 0,78 : à ajuster selon les cotisations en vigueur).">
            <Nombre valeur={c.coefNet} min={0} onChange={(v) => set({ coefNet: v ?? 0 })} />
          </Champ>
          <Champ label="Taux horaire net (calculé)" aide="Modifiable : recalcule le brut.">
            <Nombre
              valeur={Math.round(c.tauxHoraireBrut * c.coefNet * 10000) / 10000}
              min={0}
              onChange={(v) => c.coefNet > 0 && set({ tauxHoraireBrut: Math.round(((v ?? 0) / c.coefNet) * 10000) / 10000 })}
              suffixe="€/h"
            />
          </Champ>
          <Champ label="Heures majorées au-delà de">
            <Nombre valeur={c.seuilMajoration} min={0} onChange={(v) => set({ seuilMajoration: v ?? 45 })} suffixe="h/sem." />
          </Champ>
          <Champ label="Majoration des heures majorées" aide="10 % minimum.">
            <Nombre valeur={c.majorationPct} min={0} onChange={(v) => set({ majorationPct: v ?? 0 })} suffixe="%" />
          </Champ>
          <Champ label="Majoration des heures complémentaires" aide="0 % sauf clause du contrat.">
            <Nombre
              valeur={c.majorationComplementairesPct}
              min={0}
              onChange={(v) => set({ majorationComplementairesPct: v ?? 0 })}
              suffixe="%"
            />
          </Champ>
          <Champ label="Majoration d'un jour férié travaillé" aide="10 % minimum ; le 1er mai est toujours payé double.">
            <Nombre valeur={c.majorationFeriePct} min={0} onChange={(v) => set({ majorationFeriePct: v ?? 0 })} suffixe="%" />
          </Champ>
          {c.type === 'incomplete' && (
            <Champ
              label="Paiement des congés payés"
              aide="Indemnité calculée au 31 mai (maintien ou 10 %, le plus favorable). Le paiement mensuel de 10 % est interdit."
            >
              <select value={c.modeCP} onChange={(e) => set({ modeCP: e.target.value as Contrat['modeCP'] })}>
                {(['juin', 'prise_principale', 'fur_et_a_mesure'] as const).map((m) => (
                  <option key={m} value={m}>
                    {LIBELLES_MODE_CP[m]}
                  </option>
                ))}
              </select>
            </Champ>
          )}
        </div>
        <div className="resume">
          Heures mensualisées : <strong>{heures(Math.round((hm.normales + hm.majorees) * 100) / 100)}</strong>
          {hm.majorees > 0 && <> (dont {heures(Math.round(hm.majorees * 100) / 100)} majorées)</>} · Salaire mensualisé :{' '}
          <strong>{euros(brut)}</strong> brut ≈ <strong>{euros(brut * c.coefNet)}</strong> net
          <div className="discret">
            = {heures(hebdo)} × {c.type === 'complete' ? 52 : c.semainesProgrammees} semaines ÷ 12 × taux horaire
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Indemnités et frais</legend>
        <div className="grille">
          <Champ label="Indemnité d'entretien">
            <select
              value={c.entretien.mode}
              onChange={(e) => set({ entretien: { ...c.entretien, mode: e.target.value as 'jour' | 'heure' } })}
            >
              <option value="heure">Par heure d'accueil</option>
              <option value="jour">Forfait par jour d'accueil</option>
            </select>
          </Champ>
          <Champ
            label={c.entretien.mode === 'heure' ? 'Montant par heure' : 'Montant par jour'}
            aide="Minimum : 90 % du minimum garanti pour 9 h (3,92 €/9 h, soit 0,435 €/h au 1er juin 2026)."
          >
            <Nombre
              valeur={c.entretien.montant}
              min={0}
              onChange={(v) => set({ entretien: { ...c.entretien, montant: v ?? 0 } })}
              suffixe="€"
            />
          </Champ>
          <Champ label="Minimum par jour d'accueil" aide="2,65 € minimum par journée, quelle que soit la durée.">
            <Nombre
              valeur={c.entretien.minimumJour}
              min={0}
              onChange={(v) => set({ entretien: { ...c.entretien, minimumJour: v ?? 0 } })}
              suffixe="€"
            />
          </Champ>
          <Champ label="Indemnité kilométrique">
            <Nombre valeur={c.tauxKm} min={0} onChange={(v) => set({ tauxKm: v ?? 0 })} suffixe="€/km" />
          </Champ>
        </div>

        <h4>Repas fournis par l'assistante maternelle</h4>
        <table className="repas">
          <tbody>
            {c.typesRepas.map((t, i) => (
              <tr key={t.id}>
                <td>
                  <input
                    value={t.libelle}
                    placeholder="Ex. Déjeuner"
                    onChange={(e) =>
                      set({ typesRepas: c.typesRepas.map((x, k) => (k === i ? { ...x, libelle: e.target.value } : x)) })
                    }
                  />
                </td>
                <td>
                  <Nombre
                    valeur={t.montant}
                    min={0}
                    onChange={(v) =>
                      set({ typesRepas: c.typesRepas.map((x, k) => (k === i ? { ...x, montant: v ?? 0 } : x)) })
                    }
                    suffixe="€"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => set({ typesRepas: c.typesRepas.filter((x) => x.id !== t.id) })}
                  >
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={() => set({ typesRepas: [...c.typesRepas, { id: nouvelId(), libelle: '', montant: 0 }] })}
        >
          + Type de repas (petit-déjeuner, goûter…)
        </button>
      </fieldset>

      {alertesContrat(c).length > 0 && (
        <ul className="alertes">
          {alertesContrat(c).map((a) => (
            <li key={a}>⚠️ {a}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="submit" className="primaire">Enregistrer le contrat</button>
        <button type="button" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}
