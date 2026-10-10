import { useEffect, useState } from 'react';
import Enfants from './pages/Enfants';
import Contrats from './pages/Contrats';
import Calendrier from './pages/Calendrier';
import Pajemploi from './pages/Pajemploi';
import Sauvegarde from './pages/Sauvegarde';

const PAGES = [
  { id: 'enfants', titre: '1. Enfants', composant: Enfants },
  { id: 'contrats', titre: '2. Contrats', composant: Contrats },
  { id: 'calendrier', titre: '3. Calendrier', composant: Calendrier },
  { id: 'pajemploi', titre: '4. Pajemploi', composant: Pajemploi },
  { id: 'sauvegarde', titre: 'Sauvegarde & aide', composant: Sauvegarde },
] as const;

function pageCourante(): string {
  const h = location.hash.replace('#', '');
  return PAGES.some((p) => p.id === h) ? h : 'enfants';
}

export default function App() {
  const [page, setPage] = useState(pageCourante);
  useEffect(() => {
    const f = () => setPage(pageCourante());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const Page = PAGES.find((p) => p.id === page)!.composant;
  return (
    <>
      <header className="entete">
        <h1>ManageAsmat</h1>
        <p className="sous-titre">Paie de l'assistante maternelle → montants à déclarer sur Pajemploi</p>
        <nav>
          {PAGES.map((p) => (
            <a key={p.id} href={`#${p.id}`} className={p.id === page ? 'actif' : ''}>
              {p.titre}
            </a>
          ))}
        </nav>
      </header>
      <main>
        <Page />
      </main>
    </>
  );
}
