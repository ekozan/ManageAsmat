import { useRef, useState } from 'react';
import { today } from '../lib/dates';
import { useStore, valider } from '../lib/store';

export default function Sauvegarde() {
  const { donnees, remplacer } = useStore();
  const fichier = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  const exporter = () => {
    const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `manageasmat-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importer = async (f: File) => {
    try {
      const d = valider(JSON.parse(await f.text()));
      if (!confirm('Remplacer toutes les données actuelles par celles du fichier ?')) return;
      remplacer(d);
      setMessage(`Import réussi : ${d.enfants.length} enfant(s), ${d.contrats.length} contrat(s), ${d.evenements.length} événement(s).`);
    } catch (e) {
      setMessage(`Échec de l'import : ${(e as Error).message}`);
    }
  };

  return (
    <section>
      <h2>Sauvegarde</h2>
      <p className="intro">
        Les données sont enregistrées uniquement dans ce navigateur. Exportez-les régulièrement pour les conserver ou
        les transférer sur un autre appareil.
      </p>
      <div className="actions">
        <button className="primaire" onClick={exporter}>Exporter (fichier JSON)</button>
        <button onClick={() => fichier.current?.click()}>Importer un fichier</button>
        <input
          ref={fichier}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importer(f);
            e.target.value = '';
          }}
        />
      </div>
      {message && <p className="message">{message}</p>}

      <h2>Comment ça marche</h2>
      <ol className="aide-liste">
        <li>
          <strong>Enfants</strong> : déclarez chaque enfant accueilli.
        </li>
        <li>
          <strong>Contrats</strong> : type d'accueil (année complète / incomplète), planning type de la semaine, taux
          horaire, repas fournis, indemnité d'entretien, indemnité kilométrique.
        </li>
        <li>
          <strong>Calendrier</strong> : le planning se remplit automatiquement. Ajoutez les événements : absences,
          congés, semaines non programmées, heures en plus, km, repas en plus ou en moins.
        </li>
        <li>
          <strong>Pajemploi</strong> : recopiez les valeurs du mois dans votre déclaration.
        </li>
      </ol>

      <h3>Règles de calcul utilisées</h3>
      <p className="intro">
        Le détail complet, avec les articles de la convention collective (IDCC 3239) et des exemples chiffrés, est
        dans le fichier README.md du projet.
      </p>
      <ul className="aide-liste">
        <li>
          <strong>Salaire mensualisé</strong> = taux horaire × heures par semaine × 52 (année complète) ou nombre de
          semaines programmées, 46 au maximum (année incomplète) ÷ 12.
        </li>
        <li>
          <strong>Absences non rémunérées (art. 111)</strong> = salaire mensualisé × absences ÷ ce qui aurait été
          travaillé dans le mois : en <em>heures</em> en année complète, en <em>jours</em> en année incomplète. Les
          semaines sans accueil et les jours fériés chômés restent au dénominateur. Même formule pour le premier et le
          dernier mois du contrat.
        </li>
        <li>
          <strong>Absence de l'enfant pour maladie (art. 105)</strong> : non rémunérée avec certificat médical, dans la
          limite de 5 jours par période de 12 mois ; au-delà de 14 jours calendaires consécutifs, reprise du salaire ou
          rupture du contrat. L'application vous alerte si ces seuils sont dépassés.
        </li>
        <li>
          <strong>Heures en plus</strong> : complémentaires au taux normal (sauf clause) jusqu'à 45 h par semaine,
          majorées d'au moins 10 % au-delà.
        </li>
        <li>
          <strong>Jours fériés</strong> : chômés sans déduction (sauf absence injustifiée la veille ou le lendemain) ;
          travaillés, majorés d'au moins 10 % (1er mai : payé double).
        </li>
        <li>
          <strong>Congés payés</strong> : 2,5 jours ouvrables par 4 semaines de travail effectif (30 jours max) sur la
          période du 1er juin au 31 mai ; indemnité = la plus favorable entre maintien de salaire et 10 % du brut de
          la période. Année complète : payés par la mensualisation (+ complément en juin si le 10 % est plus
          favorable). Année incomplète : versés en juin, à la prise principale ou au fur et à mesure — jamais par 10 %
          chaque mois.
        </li>
        <li>
          <strong>Net</strong> = brut × coefficient net/brut du contrat (≈ 0,7812 en 2026, à vérifier).
        </li>
      </ul>
      <p className="avertissement">
        Non pris en charge : régularisation de fin de contrat en année incomplète, indemnité de rupture, droits à
        congés acquis pendant un arrêt maladie (loi du 22 avril 2024), jours de fractionnement, spécificités
        Alsace-Moselle. Vérifiez toujours avec la convention collective et le simulateur Pajemploi.
      </p>
    </section>
  );
}
