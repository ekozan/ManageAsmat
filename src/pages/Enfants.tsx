import { useState } from 'react';
import { Champ } from '../components/Champs';
import { formatDate } from '../lib/dates';
import { nouvelId, useStore } from '../lib/store';
import type { Enfant } from '../lib/types';

const vide = (): Enfant => ({ id: nouvelId(), prenom: '', nom: '' });

export default function Enfants() {
  const { donnees, sauverEnfant, supprimerEnfant } = useStore();
  const [edition, setEdition] = useState<Enfant | null>(null);

  return (
    <section>
      <h2>Enfants</h2>
      <p className="intro">Commencez par déclarer le ou les enfants accueillis.</p>

      {donnees.enfants.length === 0 && !edition && <p className="vide">Aucun enfant pour l'instant.</p>}
      <ul className="cartes">
        {donnees.enfants.map((e) => {
          const nb = donnees.contrats.filter((c) => c.enfantId === e.id).length;
          return (
            <li key={e.id} className="carte">
              <div>
                <strong>
                  {e.prenom} {e.nom}
                </strong>
                {e.dateNaissance && <div className="discret">Né(e) le {formatDate(e.dateNaissance)}</div>}
                <div className="discret">{nb} contrat(s)</div>
              </div>
              <div className="actions">
                <button onClick={() => setEdition(e)}>Modifier</button>
                <button
                  className="danger"
                  onClick={() => {
                    if (confirm(`Supprimer ${e.prenom} ainsi que ses contrats et événements ?`)) supprimerEnfant(e.id);
                  }}
                >
                  Supprimer
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {edition ? (
        <form
          className="panneau"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!edition.prenom.trim()) return;
            sauverEnfant(edition);
            setEdition(null);
          }}
        >
          <h3>{donnees.enfants.some((e) => e.id === edition.id) ? "Modifier l'enfant" : 'Nouvel enfant'}</h3>
          <div className="grille">
            <Champ label="Prénom *">
              <input required value={edition.prenom} onChange={(e) => setEdition({ ...edition, prenom: e.target.value })} />
            </Champ>
            <Champ label="Nom">
              <input value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} />
            </Champ>
            <Champ label="Date de naissance">
              <input
                type="date"
                value={edition.dateNaissance ?? ''}
                onChange={(e) => setEdition({ ...edition, dateNaissance: e.target.value || undefined })}
              />
            </Champ>
          </div>
          <div className="actions">
            <button type="submit" className="primaire">Enregistrer</button>
            <button type="button" onClick={() => setEdition(null)}>Annuler</button>
          </div>
        </form>
      ) : (
        <button className="primaire" onClick={() => setEdition(vide())}>+ Ajouter un enfant</button>
      )}
    </section>
  );
}
