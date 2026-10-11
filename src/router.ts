import { useEffect, useState } from 'react';

export type Route = 'home' | 'resident' | 'trace' | 'about';

function read(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return h === 'resident' || h === 'trace' || h === 'about' ? h : 'home';
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
