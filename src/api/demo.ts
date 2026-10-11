/**
 * DEMO MODE ONLY. Used when VITE_API_URL is empty (or VITE_DEMO_MODE=true).
 * Produces responses in the exact shape of the Lambda handler so the real parser runs on them,
 * but every number here is simulated. The UI labels all of it as demo data.
 */
import { useSyncExternalStore } from 'react';
import { ApiError } from './types';
import { project } from '../lib/geo';

export type ResidentScenario = 'severe_later' | 'moderate_later' | 'good' | 'flat' | 'incomplete' | 'timeout';
export type TraceScenario = 'normal' | 'hotspots' | 'no_hotspot' | 'service_error' | 'bad_shape';

export const RESIDENT_SCENARIOS: { id: ResidentScenario; label: string }[] = [
  { id: 'severe_later', label: 'Very poor now, lower at 2 PM' },
  { id: 'moderate_later', label: 'Moderate now, lower at 2 PM' },
  { id: 'good', label: 'Good now' },
  { id: 'flat', label: 'Very poor, no improvement' },
  { id: 'incomplete', label: 'Forecast points missing' },
  { id: 'timeout', label: 'Service timeout' },
];
export const TRACE_SCENARIOS: { id: TraceScenario; label: string }[] = [
  { id: 'hotspots', label: 'Hotspots in corridor' },
  { id: 'no_hotspot', label: 'No matching hotspot' },
  { id: 'normal', label: 'Normal air (no investigation)' },
  { id: 'service_error', label: 'Service error' },
  { id: 'bad_shape', label: 'Unexpected response shape' },
];

let state = { resident: 'severe_later' as ResidentScenario, trace: 'hotspots' as TraceScenario };
const listeners = new Set<() => void>();
export const demoStore = {
  get: () => state,
  set<K extends keyof typeof state>(key: K, value: (typeof state)[K]) {
    state = { ...state, [key]: value };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
export const useDemoScenario = () => useSyncExternalStore(demoStore.subscribe, demoStore.get, demoStore.get);

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

const band = (v: number) => (v >= 250 ? 'SEVERE_EMERGENCY' : v >= 120 ? 'VERY_POOR' : v >= 60 ? 'MODERATE_POOR' : 'GOOD');

function citizen(lat: number, lon: number, now: number, morning: number | null, midday: number | null) {
  const s = band(now);
  return {
    mode: 'citizen',
    location: { lat, lon },
    advisory: {
      right_now: {
        status: s,
        pm25_level: now,
        action: 'Demo advisory text.',
        home_ventilation: s === 'GOOD' || s === 'MODERATE_POOR' ? 'Demo: brief ventilation.' : 'Demo: keep windows closed.',
      },
      tomorrow_planner: {
        morning_forecast_pm25: morning,
        midday_forecast_pm25: midday,
        morning_walk_advice: 'Demo morning advice.',
        better_alternative: 'Demo alternative.',
      },
    },
  };
}

function trace(lat: number, lon: number, lookback: number, withHotspots: boolean) {
  const speed = 14; // km/h, simulated
  const windFrom = 300; // degrees, simulated
  const dist = speed * lookback;
  // Mirrors the corrected backend: the corridor points toward where the wind comes FROM (upwind).
  const upwind = windFrom;
  const o = { lat, lon };
  const left = project(o, (upwind - 15 + 360) % 360, dist);
  const right = project(o, (upwind + 15) % 360, dist);
  const centre = project(o, upwind, dist);
  const ring = [[Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4], left, right, [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4]];
  const fires = withHotspots
    ? [
        { at: project(o, upwind - 3, dist * 0.55), frp: 14.2, t: '842' },
        { at: project(o, upwind + 5, dist * 0.8), frp: 6.7, t: '842' },
      ].map((f) => ({ lat: f.at[1], lon: f.at[0], frp_mw: f.frp, acq_time: f.t }))
    : [];
  const target = fires.length ? { lat: fires[0].lat, lon: fires[0].lon } : { lat: centre[1], lon: centre[0] };
  return {
    event_id: 'demo0000',
    mode: 'fire_trace',
    status: fires.length ? 'CONFIRMED_STUBBLE_FIRE' : 'UNVERIFIED_SMOKE_PLUME',
    confidence_score: fires.length ? 10 : 3,
    origin_district: 'Demo district',
    target_coordinates: target,
    sensor_location: { lat, lon },
    satellite_fires: fires,
    geojson: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { layer: 'sensor', pm25: 168.4 } },
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { layer: 'search_wedge', drift_km: Math.round(dist * 10) / 10, wind_from_deg: windFrom, wind_speed_kmh: speed } },
        ...fires.map((f) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
          properties: { layer: 'nasa_fire_hotspot', frp: f.frp_mw },
        })),
      ],
    },
  };
}

export async function demoCall(payload: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  await wait(650, signal);
  const lat = Number(payload.lat);
  const lon = Number(payload.lon);

  if (payload.mode === 'citizen') {
    switch (state.resident) {
      case 'timeout':
        throw new ApiError('timeout');
      case 'good':
        return citizen(lat, lon, 38, 44, 29);
      case 'moderate_later':
        return citizen(lat, lon, 96, 112, 54);
      case 'flat':
        return citizen(lat, lon, 152, 158, 149);
      case 'incomplete':
        return citizen(lat, lon, 131, null, null);
      default:
        return citizen(lat, lon, 276, 212, 98);
    }
  }

  const lookback = Number(payload.lookback_hours) || 2.5;
  switch (state.trace) {
    case 'service_error':
      throw new ApiError('http', 'Simulated upstream failure', 500);
    case 'bad_shape':
      return { hello: 'world' };
    case 'normal':
      return {
        mode: 'fire_trace',
        status: 'NORMAL_AIR',
        message: 'Air quality does not indicate a biomass influx.',
        air_quality: { pm25: 54.2, pm10: 118.0, co: 301, delta_1h: 4.1, investigation_triggered: false },
      };
    case 'no_hotspot':
      return trace(lat, lon, lookback, false);
    default:
      return trace(lat, lon, lookback, true);
  }
}
