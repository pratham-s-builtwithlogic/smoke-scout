import { useEffect, useRef } from 'react';
import { CircleCheck, Ban, TriangleAlert, Wind, HelpCircle } from 'lucide-react';
import { requestCitizen } from '../api/client';
import type { CitizenAdvisory, LatLon } from '../api/types';
import { LocationPanel } from '../components/LocationPanel';
import { PunjabMap } from '../components/PunjabMap';
import { ErrorPanel, Skeleton } from '../components/shared';
import { useRequest } from '../hooks/useRequest';
import { BANDS, bandOf, deriveVerdict, pointsOf, type Verdict } from '../lib/advice';
import { validatePin } from '../lib/geo';

interface Props {
  pin: LatLon | null;
  setPin: (p: LatLon) => void;
}

export function Resident({ pin, setPin }: Props) {
  const { state, run, reset } = useRequest<CitizenAdvisory>();
  const pinOk = pin !== null && validatePin(pin, 'resident') === null;
  const lastKey = useRef('');

  // Checking a point is read-only, so it runs as soon as a valid pin is placed.
  useEffect(() => {
    if (!pin || !pinOk) {
      reset();
      lastKey.current = '';
      return;
    }
    const key = `${pin.lat},${pin.lon}`;
    if (key === lastKey.current) return;
    const t = setTimeout(() => {
      lastKey.current = key;
      run((s) => requestCitizen(pin, s));
    }, 350);
    return () => clearTimeout(t);
  }, [pin?.lat, pin?.lon, pinOk]);

  const retry = () => pin && run((s) => requestCitizen(pin, s));

  return (
    <div className={`res ${state.phase === 'idle' ? 'is-idle' : ''}`}>
      <section className="res-decision" aria-live="polite" aria-busy={state.phase === 'loading'}>
        {state.phase === 'idle' && <Empty />}
        {state.phase === 'loading' && <Skeleton lines={4} label="Asking the service about the air at your pin…" />}
        {state.phase === 'error' && <ErrorPanel error={state.error} onRetry={retry} />}
        {state.phase === 'success' && <Decision adv={state.data} receivedAt={state.receivedAt} />}
      </section>

      <aside className="res-locate" aria-label="Choose your location">
        <PunjabMap mode="resident" pin={pin} onPick={setPin} className="map-res" />
        <LocationPanel mode="resident" pin={pin} onChange={setPin} />
      </aside>
    </div>
  );
}

function Empty() {
  return (
    <div className="empty">
      <p className="eyebrow mono">Should I open my windows?</p>
      <h1>Drop a pin where you live, and we'll check the air there.</h1>
      <ol className="steps">
        <li>
          <span className="n mono">1</span> Tap the map, or use "Use my location".
        </li>
        <li>
          <span className="n mono">2</span> We ask the air-quality service for PM2.5 at that spot, now and at two forecast times.
        </li>
        <li>
          <span className="n mono">3</span> You get a plain answer, and the reasons behind it.
        </li>
      </ol>
      <p className="muted small">
        PM2.5 is the tiny smoke and dust particles that get deep into lungs. Lower is better, and "better" is never the
        same as "clean".
      </p>
    </div>
  );
}

const ICONS = { closed: Ban, caution: TriangleAlert, good: CircleCheck, unknown: HelpCircle } as const;
const TAGS = { serious: 'Serious', caution: 'Caution', good: 'Comparatively good', unknown: 'Unknown' } as const;

export function Decision({ adv, receivedAt }: { adv: CitizenAdvisory; receivedAt: Date }) {
  const v = deriveVerdict(adv);
  const Icon = ICONS[v.icon];
  const band = bandOf(adv.pm25);
  const time = receivedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <article className="decision">
      {adv.source === 'demo' && <p className="note note-warn">Demo data: simulated, not a real reading.</p>}
      {adv.suspectedFallback && (
        <p className="note note-warn">
          These numbers exactly match the placeholder values the service uses when its air-quality source fails. Treat
          them as possibly simulated, not measured.
        </p>
      )}

      <div className="verdict" data-tone={v.tone}>
        <p className="tag mono">
          <Icon size={16} aria-hidden="true" /> {TAGS[v.tone]}
        </p>
        <h1>{v.headline}</h1>
        <p className="lead">{v.lead}</p>
      </div>

      <section className="reading" aria-labelledby="pm-h">
        <h2 id="pm-h" className="micro mono">
          Measured now
        </h2>
        <p className="pm">
          <span className="pm-num mono">{adv.pm25}</span>
          <span className="pm-unit">
            µg/m³ PM2.5 · <strong>{band.label}</strong>
          </span>
        </p>
        <PmScale value={adv.pm25} />
        <p className="muted small">
          Retrieved at {time}. The service doesn't report when the sensor reading was taken, so this is when we
          received it.
        </p>
      </section>

      <Compare adv={adv} v={v} />

      <details className="why">
        <summary>Why this recommendation?</summary>
        <div className="why-body">
          <ul>
            <li>
              PM2.5 right now is <strong>{adv.pm25} µg/m³</strong>, which falls in the service's "{band.label}" band (
              {band.max === Infinity ? `${band.min} and above` : `${band.min}–${band.max}`}).
            </li>
            {adv.morningPm25 !== null && (
              <li>
                The next 6 AM forecast is <strong>{adv.morningPm25} µg/m³</strong>.
              </li>
            )}
            {adv.middayPm25 !== null && (
              <li>
                The next 2 PM forecast is <strong>{adv.middayPm25} µg/m³</strong>.
              </li>
            )}
            <li>
              We only call a forecast "comparatively better" if it is at least 20% and 10 µg/m³ lower than now. Here:{' '}
              {v.betterAt ? `${v.betterAt.label.toLowerCase()} qualifies.` : 'neither point qualifies.'}
            </li>
          </ul>
          <p className="muted small">
            PM2.5 means particles smaller than 2.5 micrometres, about 30 times thinner than a hair. Smoke is rich in them.
            Cleaner outdoor air is better for ventilation, but a lower number is not a safety guarantee.
          </p>
          {(adv.homeVentilation || adv.action || adv.betterAlternative) && (
            <div className="service-text">
              <p className="micro mono">Advisory text from the service</p>
              <ul>
                {adv.homeVentilation && <li>{adv.homeVentilation}</li>}
                {adv.action && <li>{adv.action}</li>}
                {adv.betterAlternative && <li>{adv.betterAlternative}</li>}
              </ul>
            </div>
          )}
        </div>
      </details>
    </article>
  );
}

/** Position of a value on the 0–300 µg/m³ axis, as a percentage. */
const pos = (v: number) => Math.max(0, Math.min(100, (v / 300) * 100));

function PmScale({ value }: { value: number }) {
  return (
    <div className="scale" role="img" aria-label={`PM2.5 of ${value} is in the ${bandOf(value).label} band. Bands: good under 60, moderate to poor 60 to 120, very poor 120 to 250, severe above 250.`}>
      <div className="scale-bar">
        {BANDS.map((b) => (
          <span
            key={b.key}
            className={`seg seg-${b.key}`}
            style={{ width: `${pos(Math.min(b.max, 300)) - pos(b.min)}%` }}
          />
        ))}
        <span className="scale-marker" style={{ left: `${pos(value)}%` }} />
      </div>
      <div className="scale-labels mono" aria-hidden="true">
        {BANDS.map((b) => (
          <span key={b.key} style={{ width: `${pos(Math.min(b.max, 300)) - pos(b.min)}%` }}>
            {b.label.split(' ')[0]}
          </span>
        ))}
      </div>
    </div>
  );
}

function Compare({ adv, v }: { adv: CitizenAdvisory; v: Verdict }) {
  const pts = pointsOf(adv);
  const vals = pts.map((p) => p.value).filter((x): x is number => x !== null);
  const max = Math.max(...vals, 60) * 1.08;
  const min = Math.min(...vals);
  const uniqueLowest = vals.filter((x) => x === min).length === 1 && vals.length > 1;

  return (
    <section className="compare" aria-labelledby="cmp-h">
      <h2 id="cmp-h" className="micro mono">
        Now against the two forecast points
      </h2>
      <p className="compare-line">
        <Wind size={18} aria-hidden="true" /> {v.compareLine}
      </p>
      <ul className="bars">
        {pts.map((p) => {
          const b = p.value !== null ? bandOf(p.value) : null;
          return (
            <li key={p.id}>
              <span className="bar-label">{p.label}</span>
              <span className="bar-track" aria-hidden="true">
                {p.value !== null && <span className={`bar-fill seg-${b!.key}`} style={{ width: `${(p.value / max) * 100}%` }} />}
              </span>
              <span className="bar-val mono">
                {p.value !== null ? (
                  <>
                    {p.value}
                    <small> µg/m³</small>
                  </>
                ) : (
                  'No data'
                )}
              </span>
              <span className="bar-band small">
                {b ? b.label : 'Unavailable'}
                {uniqueLowest && p.value === min ? ' · lowest' : ''}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="muted small">
        The service returns just these two forecast times (the next 6 AM and the next 2 PM, India time), not a full day. So
        we can say whether they look better than now, but not which hour is the cleanest.
      </p>
    </section>
  );
}
