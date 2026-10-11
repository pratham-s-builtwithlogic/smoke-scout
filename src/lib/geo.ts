import type { LatLon } from '../api/types';

type Box = { south: number; west: number; north: number; east: number };

/** The fixed bounding box the backend sends to NASA FIRMS. */
export const COVERAGE: Box = { south: 29.5, west: 73.8, north: 32.5, east: 76.9 };
/** Area the map lets people move around in (coverage box plus a margin). */
export const MAP_AREA: Box = { south: 28.8, west: 73.0, north: 33.2, east: 77.6 };

export type PinMode = 'resident' | 'trace';

export const inBox = (p: LatLon, b: Box) =>
  p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east;

export const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function parseCoord(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function validatePin(p: LatLon, mode: PinMode): string | null {
  if (!inBox(p, MAP_AREA)) {
    return 'That point is outside the Punjab map area. Smoke Scout is set up for Punjab only.';
  }
  if (mode === 'trace' && !inBox(p, COVERAGE)) {
    return 'This spot is outside the satellite search area the service uses (the dashed box). A smoke trace here would not be meaningful. Move the pin inside the box.';
  }
  return null;
}

export const fmtCoord = (p: LatLon) =>
  `${Math.abs(p.lat).toFixed(4)}°${p.lat >= 0 ? 'N' : 'S'} ${Math.abs(p.lon).toFixed(4)}°${p.lon >= 0 ? 'E' : 'W'}`;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function bearingDeg(a: LatLon, b: LatLon): number {
  const f1 = rad(a.lat);
  const f2 = rad(b.lat);
  const dl = rad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Same great-circle projection the backend uses. Returns [lon, lat]. */
export function project(origin: LatLon, bearing: number, distKm: number): [number, number] {
  const R = 6371;
  const b = rad(bearing);
  const f1 = rad(origin.lat);
  const l1 = rad(origin.lon);
  const d = distKm / R;
  const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(b));
  const l2 =
    l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
  return [Math.round(deg(l2) * 1e4) / 1e4, Math.round(deg(f2) * 1e4) / 1e4];
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass16 = (d: number) => POINTS[Math.round(d / 22.5) % 16];

/** FIRMS acq_time is HHMM UTC without leading zeros. */
export function fmtAcq(t: string | null): string | null {
  if (!t) return null;
  const digits = t.replace(/\D/g, '').padStart(4, '0').slice(-4);
  return `${digits.slice(0, 2)}:${digits.slice(2)} UTC`;
}
