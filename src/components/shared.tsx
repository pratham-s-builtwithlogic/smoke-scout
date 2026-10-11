import { RefreshCw } from 'lucide-react';
import { API_URL, DEMO } from '../api/config';
import {
  RESIDENT_SCENARIOS,
  TRACE_SCENARIOS,
  demoStore,
  useDemoScenario,
  type ResidentScenario,
  type TraceScenario,
} from '../api/demo';
import type { ApiError } from '../api/types';

export function Glyph({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="glyph">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 10c5-3 9 3 14 0s6-1 9-2" />
        <path d="M3 16c5-3 9 3 14 0" />
        <path d="M3 22c5-3 9 3 14 0" />
      </g>
      <path d="M21 13l7 10H14z" fill="var(--accent)" />
    </svg>
  );
}

export function DemoBar({ route }: { route: string }) {
  const s = useDemoScenario();
  if (!DEMO) return null;
  const forTrace = route === 'trace';
  const showPicker = route === 'resident' || route === 'trace';
  return (
    <div className="demo-bar" role="status">
      <strong>DEMO DATA</strong>
      <span>
        {API_URL === ''
          ? 'No backend is configured (VITE_API_URL is empty), so every number here is simulated.'
          : 'Demo mode is forced on, so every number here is simulated.'}
      </span>
      {showPicker && (
        <label className="demo-pick">
          Scenario
          <select
            value={forTrace ? s.trace : s.resident}
            onChange={(e) =>
              forTrace
                ? demoStore.set('trace', e.target.value as TraceScenario)
                : demoStore.set('resident', e.target.value as ResidentScenario)
            }
          >
            {(forTrace ? TRACE_SCENARIOS : RESIDENT_SCENARIOS).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  timeout: {
    title: 'The service took too long to answer.',
    body: 'The air-quality or satellite data source may be slow right now. Nothing has been guessed or filled in.',
  },
  network: {
    title: "We couldn't reach the service.",
    body: 'Check your connection and try again. (If you run this app yourself and the connection is fine, the API may be blocking browser requests: see CORS in the README.)',
  },
  http: {
    title: 'The service returned an error.',
    body: 'The request was received but could not be completed.',
  },
  service: {
    title: 'The service reported a problem.',
    body: 'It answered, but with an error instead of data.',
  },
  shape: {
    title: 'The answer was not in a form we recognise.',
    body: 'The service responded, but the content was not what this app expects, so none of it is shown.',
  },
  config: {
    title: 'The app is not configured.',
    body: 'No backend address is set.',
  },
};

export function ErrorPanel({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const copy = ERROR_COPY[error.kind] ?? ERROR_COPY.network;
  return (
    <div className="error-panel" role="alert">
      <h2 className="h3">{copy.title}</h2>
      <p>{copy.body}</p>
      {(error.detail || error.status) && (
        <p className="mono small muted">
          {error.status ? `HTTP ${error.status}` : ''}
          {error.status && error.detail ? ' · ' : ''}
          {error.detail ?? ''}
        </p>
      )}
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        <RefreshCw size={16} aria-hidden="true" /> Try again
      </button>
    </div>
  );
}

export function Skeleton({ lines = 3, label }: { lines?: number; label: string }) {
  return (
    <div className="skeleton" role="status" aria-label={label}>
      {Array.from({ length: lines }).map((_, i) => (
        <span key={i} style={{ width: `${92 - i * 14}%` }} />
      ))}
      <p className="muted small">{label}</p>
    </div>
  );
}
