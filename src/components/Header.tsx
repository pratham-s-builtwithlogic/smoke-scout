import type { LatLon } from '../api/types';
import { fmtCoord } from '../lib/geo';
import type { Route } from '../router';
import { Glyph } from './shared';

export function Header({ route, pin }: { route: Route; pin: LatLon | null }) {
  const cur = (r: Route) => (route === r ? 'page' : undefined);
  return (
    <header className="site-header">
      <a className="wordmark" href="#/" aria-label="Smoke Scout, home">
        <Glyph />
        <span>
          Smoke<b>Scout</b>
        </span>
      </a>
      <nav aria-label="Main">
        <a href="#/resident" aria-current={cur('resident')}>
          <span className="long">Check my air</span>
          <span className="short">Air</span>
        </a>
        <a href="#/trace" aria-current={cur('trace')}>
          <span className="long">Trace the smoke</span>
          <span className="short">Trace</span>
        </a>
        <a href="#/about" aria-current={cur('about')}>
          <span className="long">How it works</span>
          <span className="short">About</span>
        </a>
      </nav>
      {pin && route !== 'home' && (
        <p className="pin-readout mono" title="The pin you placed on the map">
          {fmtCoord(pin)}
        </p>
      )}
    </header>
  );
}
