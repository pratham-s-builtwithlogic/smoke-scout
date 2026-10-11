import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { requestTrace } from '../api/client';
import type { Investigation, LatLon, TraceResult } from '../api/types';
import { LocationPanel } from '../components/LocationPanel';
import { PunjabMap, type LayerState, type MapHandle } from '../components/PunjabMap';
import { ErrorPanel, Skeleton } from '../components/shared';
import { useRequest } from '../hooks/useRequest';
import { fmtAcq, validatePin } from '../lib/geo';
import { readWind } from '../lib/wind';

interface Props {
  pin: LatLon | null;
  setPin: (p: LatLon) => void;
}

const LOOKBACKS = [1, 2, 2.5, 3, 4, 6];

export function Trace({ pin, setPin }: Props) {
  const { state, run, reset } = useRequest<TraceResult>();
  const [lookback, setLookback] = useState(2.5);
  const [layers, setLayers] = useState<LayerState>({ corridor: true, hotspots: true, coverage: true });
  const mapRef = useRef<MapHandle>(null);

  const pinError = pin ? validatePin(pin, 'trace') : null;
  const canRun = pin !== null && pinError === null && state.phase !== 'loading';

  // Moving the pin invalidates the previous investigation.
  useEffect(() => {
    reset();
  }, [pin?.lat, pin?.lon]);

  const go = () => {
    if (pin && !validatePin(pin, 'trace')) run((s) => requestTrace(pin, lookback, s));
  };

  const result = state.phase === 'success' ? state.data : null;
  const inv: Investigation | null = result && result.kind === 'investigation' ? result : null;

  return (
    <div className="trace">
      <section className="trace-map" aria-label="Investigation map">
        <PunjabMap
          ref={mapRef}
          mode="trace"
          pin={pin}
          onPick={setPin}
          investigation={inv}
          layers={layers}
          onLayersChange={setLayers}
        />
        {state.phase === 'loading' && (
          <div className="map-busy" role="status">
            Investigating this area…
          </div>
        )}
      </section>

      <aside className="trace-panel">
        <div className="panel-block">
          <p className="eyebrow mono">Trace the smoke</p>
          <h1 className="h2">Where might this smoke have come from?</h1>
          <p className="muted small">
            Put a pin where you measured or breathed the smoke. We check the air there, and if it looks like a smoke
            event, we search a wind-based corridor for satellite fire detections.
          </p>
        </div>

        <div className="panel-block">
          <LocationPanel mode="trace" pin={pin} onChange={setPin}>
            <div className="field field-inline">
              <label htmlFor="lookback">Look back</label>
              <select id="lookback" value={lookback} onChange={(e) => setLookback(Number(e.target.value))}>
                {LOOKBACKS.map((h) => (
                  <option key={h} value={h}>
                    {h} hours of drift
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-primary btn-wide" disabled={!canRun} onClick={go}>
              <Search size={18} aria-hidden="true" />
              {state.phase === 'loading' ? 'Investigating…' : 'Investigate This Area'}
            </button>
            <p className="muted small">
              Coverage: Punjab only. Satellite detections are searched in the dashed box on the map. Each investigation
              the service runs is logged by it (location, readings, status).
            </p>
          </LocationPanel>
        </div>

        <div className="panel-block" aria-live="polite" aria-busy={state.phase === 'loading'}>
          {state.phase === 'idle' && (
            <p className="muted">
              {pin ? 'Ready. Press "Investigate This Area".' : 'Drop a pin on the map to begin.'}
            </p>
          )}
          {state.phase === 'loading' && <Skeleton lines={3} label="Checking air quality, wind and satellite detections…" />}
          {state.phase === 'error' && <ErrorPanel error={state.error} onRetry={go} />}
          {result?.kind === 'normal' && <Normal r={result} />}
          {inv && <Findings inv={inv} onFocusHotspot={(i) => mapRef.current?.focusHotspot(i)} onRecenter={() => {
            mapRef.current?.fitResult();
            // On phones the map sits above this panel, so bring it into view.
            document.querySelector('.trace-map')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }} />}
        </div>

        <details className="panel-block how">
          <summary>How this investigation works</summary>
          <ol className="how-steps">
            <li>
              <b>Detect.</b> The investigation starts only if PM2.5 is at least 30 µg/m³, or has risen by 20 µg/m³ or more
              in the last hour.
            </li>
            <li>
              <b>Project.</b> The service reads the wind and draws a narrow wedge from your pin, as long as the air
              could have drifted in the look-back time.
            </li>
            <li>
              <b>Search.</b> It looks for NASA VIIRS fire detections inside that wedge.
            </li>
            <li>
              <b>Report.</b> You see what was found, and what it can't tell you.
            </li>
          </ol>
          <p className="note note-warn">
            This is an approximation. A wind wedge and a satellite dot together are circumstantial. They do not establish
            what caused the smoke, or who.
          </p>
        </details>
      </aside>
    </div>
  );
}

function DemoTag({ r }: { r: TraceResult }) {
  return r.source === 'demo' ? <p className="note note-warn">Demo data: simulated, not a real investigation.</p> : null;
}

export function Normal({ r }: { r: Extract<TraceResult, { kind: 'normal' }> }) {
  const a = r.air;
  return (
    <div className="status" data-state="normal">
      <DemoTag r={r} />
      <p className="tag mono">No investigation</p>
      <h2 className="h3">No investigation triggered by current readings.</h2>
      <p>
        {r.message ?? 'The air-quality readings here do not look like a smoke event.'} That is a valid answer, not an
        error. An investigation starts when PM2.5 reaches 30 µg/m³ or jumps 20 µg/m³ in an hour.
      </p>
      <Facts
        title="Measured"
        rows={[
          ['PM2.5', a.pm25 !== null ? `${a.pm25} µg/m³` : null],
          ['PM10', a.pm10 !== null ? `${a.pm10} µg/m³` : null],
          ['PM2.5 change, last hour', a.delta1h !== null ? `${a.delta1h > 0 ? '+' : ''}${a.delta1h} µg/m³` : null],
        ]}
      />
    </div>
  );
}

export function Findings({
  inv,
  onFocusHotspot,
  onRecenter,
}: {
  inv: Investigation;
  onFocusHotspot: (i: number) => void;
  onRecenter: () => void;
}) {
  const wind = useMemo(() => readWind(inv), [inv]);
  const n = inv.hotspots.length;
  // Shown verbatim from the service. Only a missing value gets the placeholder.
  const district = inv.district?.trim() || null;
  const districtMatched = district !== null && !/out of bounds|general region/i.test(district);

  let title: string;
  let body: string;
  let tag: string;
  if (inv.status === 'HOTSPOT') {
    tag = 'Detection in corridor';
    title = 'Satellite hotspot detected within the search corridor.';
    body = `${n} satellite detection${n === 1 ? '' : 's'} fall${n === 1 ? 's' : ''} inside the wedge. That is a lead worth looking at, not proof that these fires produced the smoke measured at your pin.`;
  } else if (inv.status === 'NO_HOTSPOT') {
    tag = 'Possible plume';
    title = 'Investigating a possible smoke plume. No matching satellite hotspot found.';
    body =
      'Readings look like a smoke event, but no detection fell inside the corridor. That does not mean nothing was burning: satellites only see a spot when they pass over, and clouds or thick smoke can hide fires.';
  } else {
    tag = 'Unrecognised status';
    title = 'The service returned a status we do not recognise.';
    body = `Status received: ${inv.rawStatus}. The geometry is shown on the map as returned.`;
  }

  return (
    <div className="status" data-state={inv.status.toLowerCase()}>
      <DemoTag r={inv} />
      {inv.suspectedFallback && (
        <p className="note note-warn">
          PM2.5 exactly matches the placeholder value the service uses when its air-quality source fails
          {wind?.suspectedFallback ? ', and the wind matches its placeholder wind as well' : ''}. Treat this as possibly
          simulated.
        </p>
      )}
      <p className="tag mono">{tag}</p>
      <h2 className="h3">{title}</h2>
      <p>{body}</p>

      <div className="origin" data-matched={districtMatched}>
        <p className="micro mono">Possible origin district</p>
        <p className="origin-name">{district ?? 'District not identified'}</p>
        <p className="muted small">
          {inv.status === 'HOTSPOT' ? 'Where the service places the first satellite detection.' : 'Where the service places the end of the search corridor (a calculated point, not a detection).'}{' '}
          {district === null
            ? 'The service did not return a district.'
            : !districtMatched
              ? 'The service could not match that point to one of the Punjab districts.'
              : ''}{' '}
          An area, not a person, village or field.
        </p>
      </div>

      <button type="button" className="btn btn-quiet" onClick={onRecenter}>
        Re-centre map on the corridor
      </button>

      <Facts title="Measured" kind="measured" rows={[['PM2.5 at your pin', inv.pm25 !== null ? `${inv.pm25} µg/m³` : null]]}>
        <p className="muted small">
          PM10 and the one-hour change are only returned when no investigation is triggered.
        </p>
      </Facts>

      <Facts
        title={wind?.reported ? 'Wind and corridor' : 'Corridor (wind not reported)'}
        kind={wind?.reported ? 'measured' : 'derived'}
        rows={[
          ['Wind from', wind?.fromDeg != null ? `${wind.fromCompass} (${Math.round(wind.fromDeg)}°)` : null],
          ['Wind speed', wind?.speedKmh != null ? `${wind.reported ? '' : '≈ '}${wind.speedKmh.toFixed(1)} km/h` : null],
          ['Drift distance', wind?.driftKm != null ? `${wind.driftKm} km in ${inv.lookbackHours} h` : null],
          ['Corridor points toward', wind ? `${wind.corridorCompass} (${Math.round(wind.corridorDeg)}°)` : null],
        ]}
      >
        {wind?.agreement === 'upwind' && (
          <p className="muted small">Check passed: the corridor points the way the wind came from, which is where smoke at your pin would have originated.</p>
        )}
        {wind?.agreement === 'downwind' && (
          <p className="note note-err">
            The corridor points the opposite way to "wind from", so it covers where the air is going, not where it came
            from. The search area is on the wrong side. Fix the bearing in the Lambda.
          </p>
        )}
        {wind?.agreement === 'other' && (
          <p className="note note-warn">The corridor direction does not line up with the reported wind direction.</p>
        )}
        {wind && !wind.reported && (
          <p className="muted small">
            The service did not report the wind, so only the corridor's own direction is shown, and nothing about the
            wind is guessed. To show it, add <code>wind_from_deg</code> to the search wedge properties (see README).
          </p>
        )}
      </Facts>

      <section className="facts" data-kind="satellite">
        <h3 className="micro mono">
          <span className="kind-mark kind-satellite" aria-hidden="true" /> Satellite detections
        </h3>
        <p>
          <strong className="mono">{n}</strong> found inside the corridor (VIIRS, last-day query).
        </p>
        {n > 0 && (
          <ul className="hotspot-list">
            {inv.hotspots.map((h, i) => (
              <li key={`${h.lat},${h.lon},${i}`}>
                <button type="button" onClick={() => onFocusHotspot(i)}>
                  <span className="hs-diamond legend-diamond" aria-hidden="true" />
                  <span>
                    Detection {i + 1}
                    <small className="mono">
                      {h.frpMw !== null ? `FRP ${h.frpMw} MW` : 'FRP n/a'}
                      {fmtAcq(h.acqTime) ? ` · ${fmtAcq(h.acqTime)}` : ''}
                    </small>
                  </span>
                  <span className="muted small">Show on map</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {n === 0 && <p className="muted small">An empty result is not proof that nothing burned.</p>}
      </section>

      {inv.eventId && <p className="muted small mono">Logged as event {inv.eventId}</p>}
    </div>
  );
}

function Facts({
  title,
  rows,
  kind,
  children,
}: {
  title: string;
  rows: [string, string | null][];
  kind?: 'measured' | 'derived';
  children?: React.ReactNode;
}) {
  const shown = rows.filter(([, v]) => v !== null) as [string, string][];
  return (
    <section className="facts" data-kind={kind ?? 'measured'}>
      <h3 className="micro mono">
        <span className={`kind-mark kind-${kind ?? 'measured'}`} aria-hidden="true" /> {title}
      </h3>
      {shown.length === 0 ? (
        <p className="muted small">No values returned.</p>
      ) : (
        <dl>
          {shown.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="mono">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </section>
  );
}
