import { useEffect, useState } from 'react';
import type { LatLon } from './api/types';
import { Header } from './components/Header';
import { DemoBar } from './components/shared';
import { About } from './pages/About';
import { Landing } from './pages/Landing';
import { Resident } from './pages/Resident';
import { Trace } from './pages/Trace';
import { useRoute, type Route } from './router';

const TITLES: Record<Route, string> = {
  home: 'Smoke Scout',
  resident: 'When can I open my windows? · Smoke Scout',
  trace: 'Trace the smoke · Smoke Scout',
  about: 'How it works · Smoke Scout',
};

export default function App() {
  const route = useRoute();
  // The pin is shared by both journeys and lives only in memory (nothing is stored in the browser).
  const [pin, setPin] = useState<LatLon | null>(null);

  useEffect(() => {
    document.title = TITLES[route];
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [route]);

  const theme = route === 'resident' || route === 'about' ? 'theme-paper' : 'theme-ink';

  return (
    <div className={`app ${theme}`}>
      <a
        className="skip"
        href="#/"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <Header route={route} pin={pin} />
      <DemoBar route={route} />
      <main id="main" tabIndex={-1}>
        {route === 'home' && <Landing />}
        {route === 'resident' && <Resident pin={pin} setPin={setPin} />}
        {route === 'trace' && <Trace pin={pin} setPin={setPin} />}
        {route === 'about' && <About />}
      </main>
      <footer className="site-footer">
        <p>© 2026 TERRA. All rights reserved.</p>
      </footer>
    </div>
  );
}
