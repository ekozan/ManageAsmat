import { useMemo, useState } from 'react';
import { BarreSelection, useSelection } from '../components/Selection';
import { euros, heures } from '../components/Champs';
import { MOIS, formatDate } from '../lib/dates';
import { LIBELLES_MODE_CP } from '../lib/types';
import { calculerMois } from '../lib/paie';
import { useStore } from '../lib/store';

const nb = (x: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const montant = (x: number) => x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Pajemploi() {
  const { donnees } = useStore();
  const s = useSelection();
  const c = s.contrat;
  const r = useMemo(
    () => (c ? calculerMois(c, donnees.evenements, s.annee, s.mois) : null),
    [c, donnees.evenements, s.annee, s.mois],
  );
  const annuel = useMemo(
    () => (c ? Array.from({ length: 12 }, (_, m) => calculerMois(c, donnees.evenements, s.annee, m)) : []),
    [c, donnees.evenements, s.annee],
  );

  if (!c || !r) {
    return (
      <section>
        <h2>Déclaration Pajemploi</h2>
        <p className="vide">
          Créez d'abord un contrat dans l'onglet <a href="#contrats">Contrats</a>.
        </p>
      </section>
    );
  }

  const p = r.pajemploi;
  const lignes: [string, string, string][] = [
    ['Nombre d’heures normales', String(p.heuresNormales), 'Heures mensualisées (− absences / prorata) + heures complémentaires + congés payés versés convertis en heures, arrondies à l’entier le plus proche.'],
    [
      'Nombre de jours d’activité',
      String(p.joursActivite),
      `Forfait mensualisé : ${p.joursMensualises} j (jours d’accueil par semaine × ${c.type === 'complete' ? 52 : c.semainesProgrammees} semaines ÷ 12, arrondi)` +
        (p.joursAbsenceDeduits ? ` − ${p.joursAbsenceDeduits} j d’absence déduite ou hors contrat` : '') +
        (p.joursEnPlus ? ` + ${p.joursEnPlus} j d’accueil en plus` : '') +
        ` · présence réelle : ${p.joursPresence} j`,
    ],
    ['Nombre de jours de congés payés', String(p.joursCongesPayes), 'Jours ouvrables de congés payés pris dans le mois.'],
    ['Salaire net total', montant(p.salaireNet), 'Salaire net à verser (hors indemnités).'],
    ...(p.heuresMajorees > 0
      ? ([
          ['Nombre d’heures majorées', String(p.heuresMajorees), `Heures au-delà de ${c.seuilMajoration} h par semaine.`],
          ['Montant net des heures majorées', montant(p.montantNetHeuresMajorees), 'Déjà inclus dans le salaire net total.'],
        ] as [string, string, string][])
      : []),
    ['Indemnités d’entretien', montant(p.indemnitesEntretien), ''],
    ['Indemnités de repas', montant(p.indemnitesRepas), r.detailRepas.map((d) => `${d.nombre} ${d.libelle.toLowerCase()}`).join(', ')],
    ['Indemnités kilométriques', montant(p.indemnitesKm), r.km ? `${nb(r.km)} km × ${euros(c.tauxKm)}` : ''],
  ];

  const totalAVerser = p.salaireNet + p.indemnitesEntretien + p.indemnitesRepas + p.indemnitesKm;

  return (
    <section>
      <h2>Déclaration Pajemploi</h2>
      <p className="intro">Les valeurs à recopier dans votre déclaration mensuelle sur pajemploi.urssaf.fr.</p>
      <BarreSelection s={s} />

      {!r.actif ? (
        <p className="vide">Le contrat ne couvre pas ce mois : rien à déclarer.</p>
      ) : (
        <>
          <table className="declaration">
            <thead>
              <tr>
                <th>Rubrique Pajemploi</th>
                <th>Valeur</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lignes.map(([l, v, aide]) => (
                <tr key={l}>
                  <td>
                    {l}
                    {aide && <div className="discret">{aide}</div>}
                  </td>
                  <td className="valeur">{v}</td>
                  <td>
                    <Copier texte={v} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="resume total">
            Total à verser à l'assistante maternelle : <strong>{euros(totalAVerser)}</strong>
            <span className="discret"> (salaire net + indemnités ; via Pajemploi+ ou directement selon votre choix)</span>
          </div>

          <details className="detail-calcul">
            <summary>Détail du calcul</summary>
            <table>
              <tbody>
                <tr>
                  <td>Heures mensualisées</td>
                  <td>
                    {heures(round2(r.heuresMensualiseesNormales))}
                    {r.heuresMensualiseesMajorees > 0 && ` + ${heures(round2(r.heuresMensualiseesMajorees))} majorées`}
                  </td>
                </tr>
                <tr>
                  <td>Salaire mensualisé brut</td>
                  <td>{euros(r.salaireMensualiseBrut)}</td>
                </tr>
                {r.methodeDeduction === 'heures' ? (
                  <tr>
                    <td>Heures déduites / heures prévues dans le mois (art. 111, en heures)</td>
                    <td>
                      {nb(r.heuresDeduites)} / {nb(r.heuresPrevuesMois)}
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td>Jours déduits / jours prévus dans le mois (art. 111, en jours)</td>
                    <td>
                      {nb(round2(r.joursDeduits))} / {r.joursPrevusMois}
                    </td>
                  </tr>
                )}
                <tr>
                  <td>Déduction brute (absences, prorata d'entrée/sortie)</td>
                  <td>
                    − {euros(r.deductionBrut)}
                    {r.deductionBrut > 0 && (
                      <span className="discret">
                        {' '}
                        = {euros(r.salaireMensualiseBrut)} ×{' '}
                        {r.methodeDeduction === 'heures'
                          ? `${nb(r.heuresDeduites)} / ${nb(r.heuresPrevuesMois)}`
                          : `${nb(round2(r.joursDeduits))} / ${r.joursPrevusMois}`}
                      </span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Heures complémentaires{c.majorationComplementairesPct > 0 && ` (+${c.majorationComplementairesPct} %)`}</td>
                  <td>
                    {heures(r.heuresComplementaires)} → {euros(r.montantComplementairesBrut)} brut
                  </td>
                </tr>
                <tr>
                  <td>Heures majorées en plus (+{c.majorationPct} %)</td>
                  <td>
                    {heures(r.heuresMajoreesEnPlus)} → {euros(r.montantMajoreesEnPlusBrut)} brut
                  </td>
                </tr>
                {r.heuresFerieTravaille > 0 && (
                  <tr>
                    <td>Majoration jours fériés travaillés</td>
                    <td>
                      {heures(r.heuresFerieTravaille)} → {euros(r.majorationFerieBrut)} brut
                    </td>
                  </tr>
                )}
                {r.droitsCP && (
                  <tr>
                    <td>
                      Congés payés — période du {formatDate(r.droitsCP.debut)} au {formatDate(r.droitsCP.fin)}
                    </td>
                    <td>
                      {r.droitsCP.joursAcquis} jours acquis · 10 % = {euros(r.droitsCP.dixieme)} · maintien ={' '}
                      {euros(r.droitsCP.maintien)}
                      <div className="discret">
                        {c.type === 'complete'
                          ? 'Année complète : complément = 10 % − maintien (si positif)'
                          : `Indemnité retenue : ${euros(r.droitsCP.indemnite)} (${LIBELLES_MODE_CP[c.modeCP].toLowerCase()})`}
                      </div>
                    </td>
                  </tr>
                )}
                {(c.type === 'incomplete' || r.congesPayesBrut > 0) && (
                  <tr>
                    <td>Congés payés versés ce mois-ci</td>
                    <td>{euros(r.congesPayesBrut)} brut</td>
                  </tr>
                )}
                <tr>
                  <td>
                    <strong>Salaire brut total</strong>
                  </td>
                  <td>
                    <strong>{euros(r.salaireBrutTotal)}</strong>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Salaire net</strong> (× {c.coefNet.toLocaleString('fr-FR', { maximumFractionDigits: 4 })})
                  </td>
                  <td>
                    <strong>{euros(r.salaireNetTotal)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </details>
        </>
      )}

      <h3>Récapitulatif {s.annee}</h3>
      <div className="table-scroll">
        <table className="recap">
          <thead>
            <tr>
              <th>Mois</th>
              <th>Heures</th>
              <th>Jours</th>
              <th>CP</th>
              <th>Salaire net</th>
              <th>Entretien</th>
              <th>Repas</th>
              <th>Km</th>
            </tr>
          </thead>
          <tbody>
            {annuel.map((m) => (
              <tr
                key={m.mois}
                className={`${m.mois === s.mois ? 'courant' : ''} ${m.actif ? '' : 'inactif'}`}
                onClick={() => s.setSel({ annee: s.annee, mois: m.mois, contratId: c.id })}
              >
                <td>{MOIS[m.mois]}</td>
                <td>{m.pajemploi.heuresNormales}</td>
                <td>{m.pajemploi.joursActivite}</td>
                <td>{m.pajemploi.joursCongesPayes}</td>
                <td>{euros(m.pajemploi.salaireNet)}</td>
                <td>{euros(m.pajemploi.indemnitesEntretien)}</td>
                <td>{euros(m.pajemploi.indemnitesRepas)}</td>
                <td>{euros(m.pajemploi.indemnitesKm)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>{annuel.reduce((a, m) => a + m.pajemploi.heuresNormales, 0)}</td>
              <td>{annuel.reduce((a, m) => a + m.pajemploi.joursActivite, 0)}</td>
              <td>{annuel.reduce((a, m) => a + m.pajemploi.joursCongesPayes, 0)}</td>
              <td>{euros(annuel.reduce((a, m) => a + m.pajemploi.salaireNet, 0))}</td>
              <td>{euros(annuel.reduce((a, m) => a + m.pajemploi.indemnitesEntretien, 0))}</td>
              <td>{euros(annuel.reduce((a, m) => a + m.pajemploi.indemnitesRepas, 0))}</td>
              <td>{euros(annuel.reduce((a, m) => a + m.pajemploi.indemnitesKm, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="avertissement">
        Outil d'aide au calcul : vérifiez les montants (taux, minimums conventionnels, cotisations) avec la convention
        collective IDCC 3239 et le simulateur Pajemploi avant de déclarer.
      </p>
    </section>
  );
}

const round2 = (x: number) => Math.round(x * 100) / 100;

function Copier({ texte }: { texte: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="copier"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texte);
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        } catch {
          /* presse-papiers indisponible */
        }
      }}
    >
      {ok ? 'Copié ✓' : 'Copier'}
    </button>
  );
}
