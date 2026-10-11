import { ArrowRight } from 'lucide-react';
import { FlowField } from '../components/FlowField';

function HomeAirflow() {
  return (
    <svg className="motif" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M44 62 80 32l36 30" />
        <path d="M52 56v40h56V56" />
        <rect x="68" y="66" width="24" height="22" rx="1" />
        <path d="M80 66v22M68 77h24" strokeWidth="1.5" />
      </g>
      <g fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
        <path d="M2 70c12-6 20 6 34 0s14-4 26-3" strokeDasharray="1 0" />
        <path d="M2 84c12-6 20 6 34 0s14-4 26-3" opacity=".6" />
        <path d="M98 78c14-5 22 5 36 0s14-3 24-2" opacity=".6" />
      </g>
    </svg>
  );
}

function CorridorMotif() {
  return (
    <svg className="motif" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
      <g fill="none" stroke="var(--text-3)" strokeWidth="1">
        {[20, 40, 60, 80, 100].map((y) => (
          <path key={y} d={`M0 ${y}H160`} strokeOpacity=".35" />
        ))}
        {[30, 60, 90, 120].map((x) => (
          <path key={x} d={`M${x} 0V120`} strokeOpacity=".35" />
        ))}
      </g>
      <path d="M118 92 28 22 52 8Z" fill="var(--accent)" fillOpacity=".16" stroke="var(--accent)" strokeDasharray="3 4" strokeWidth="1.5" />
      <circle cx="118" cy="92" r="5" fill="var(--text)" />
      <circle cx="118" cy="92" r="11" fill="none" stroke="var(--text)" strokeOpacity=".7" />
      <path d="M58 30l6 6-6 6-6-6z" fill="var(--accent)" stroke="var(--bg)" strokeWidth="1.5" />
    </svg>
  );
}

export function Landing() {
  return (
    <div className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <FlowField />
        <div className="hero-copy">
          <p className="eyebrow mono">Punjab · air quality, wind and satellite fire data</p>
          <h1 id="hero-title">
            Know when to let the outside air in. <em>Discover where the smoke may begin.</em>
          </h1>
          <p className="lede">
            Smoke Scout helps you find comparatively better times to ventilate your home, and investigate possible
            stubble-burning sources, using air-quality, wind and satellite data.
          </p>
        </div>
      </section>

      <section className="journeys" aria-label="Choose what you want to do">
        <a className="journey journey-home theme-paper" href="#/resident">
          <HomeAirflow />
          <p className="eyebrow mono">For everyday life</p>
          <h2>When Can I Open My Windows?</h2>
          <p>Find comparatively cleaner hours to ventilate your home.</p>
          <span className="btn btn-primary">
            Check My Air <ArrowRight size={18} aria-hidden="true" />
          </span>
        </a>

        <a className="journey journey-trace" href="#/trace">
          <CorridorMotif />
          <p className="eyebrow mono">For investigation</p>
          <h2>Trace the Smoke</h2>
          <p>Explore wind patterns and satellite detections to investigate possible stubble-burning sources.</p>
          <span className="btn btn-primary">
            Start an Investigation <ArrowRight size={18} aria-hidden="true" />
          </span>
        </a>
      </section>

      <section className="trust" aria-label="Where the data comes from">
        <dl>
          <div>
            <dt className="mono">Air and wind</dt>
            <dd>Open-Meteo air-quality and weather models: PM2.5, PM10, wind speed and direction, hourly forecasts.</dd>
          </div>
          <div>
            <dt className="mono">Fire detections</dt>
            <dd>NASA FIRMS VIIRS satellite detections from roughly the last day, searched inside the wind corridor.</dd>
          </div>
          <div>
            <dt className="mono">Where it works</dt>
            <dd>Punjab only (about 29.5–32.5°N, 73.8–76.9°E). Estimates, not proof, and not medical advice.</dd>
          </div>
        </dl>
        <a href="#/about" className="text-link">
          How it works and what it can't tell you <ArrowRight size={14} aria-hidden="true" />
        </a>
      </section>
    </div>
  );
}
