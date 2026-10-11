import type { Investigation } from '../api/types';
import { bearingDeg, compass16 } from './geo';

export interface DerivedWind {
  /** Direction the wind blows FROM, in degrees (meteorological convention, as Open-Meteo reports it). */
  fromDeg: number;
  fromCompass: string;
  /** Bearing the search corridor points along, exactly as the service drew it. */
  corridorDeg: number;
  corridorCompass: string;
  /** driftKm / lookbackHours. An estimate, not a measurement. */
  speedKmh: number | null;
  driftKm: number | null;
  /** Matches the backend's built-in fallback wind (75° at 12 km/h) used when the wind service fails. */
  suspectedFallback: boolean;
}

/**
 * The fire_trace response does not include wind fields, so they are derived from the
 * corridor geometry the backend returned. The service draws the corridor along
 * (wind_direction + 180) degrees, so the wind direction is recovered by adding 180 back.
 * Drift distance / look-back hours gives an approximate speed.
 */
export function deriveWind(inv: Investigation): DerivedWind | null {
  const ring = inv.corridor?.ring;
  if (!ring || ring.length < 3) return null;
  const left = ring[1];
  const right = ring[2];
  const mid = { lat: (left[1] + right[1]) / 2, lon: (left[0] + right[0]) / 2 };
  // Left and right edge points sit at +/-15° of the centre line, so their midpoint lies on it.
  const corridorDeg = bearingDeg(inv.sensor, mid);
  const fromDeg = (corridorDeg + 180) % 360;
  const driftKm = inv.corridor?.driftKm ?? null;
  const speedKmh = driftKm !== null && inv.lookbackHours > 0 ? driftKm / inv.lookbackHours : null;
  const fallback = Math.abs(fromDeg - 75) < 1.5 && speedKmh !== null && Math.abs(speedKmh - 12) < 0.2;
  return {
    fromDeg,
    fromCompass: compass16(fromDeg),
    corridorDeg,
    corridorCompass: compass16(corridorDeg),
    speedKmh,
    driftKm,
    suspectedFallback: fallback,
  };
}
