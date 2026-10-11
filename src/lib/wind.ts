import type { Investigation } from '../api/types';
import { bearingDeg, compass16 } from './geo';

export type Agreement = 'upwind' | 'downwind' | 'other' | 'unknown';

export interface WindInfo {
  /** Direction the wind blows FROM (meteorological convention). null if the service did not report it. */
  fromDeg: number | null;
  fromCompass: string | null;
  /** Bearing the search corridor actually points along, measured from the drawn geometry. */
  corridorDeg: number;
  corridorCompass: string;
  speedKmh: number | null;
  driftKm: number | null;
  /** True when fromDeg/speed come from the service; false when only the corridor shape is known. */
  reported: boolean;
  /**
   * Self-check. Smoke at the pin arrived FROM the wind direction, so the search corridor should point
   * the same way as "wind from" ('upwind'). If it points the opposite way it is 'downwind', which means
   * the corridor sits where the smoke is going, not where it came from.
   */
  agreement: Agreement;
  /** Matches the backend's built-in placeholder wind (75° at 12 km/h) used when the wind service fails. */
  suspectedFallback: boolean;
}

const angDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Corridor bearing is always measured from the geometry. "Wind from" is shown only when the service
 * reports it (search_wedge.wind_from_deg); it is never guessed from the corridor, because the
 * corridor could be drawn either way round.
 */
export function readWind(inv: Investigation): WindInfo | null {
  const ring = inv.corridor?.ring;
  if (!ring || ring.length < 3) return null;
  const left = ring[1];
  const right = ring[2];
  const mid = { lat: (left[1] + right[1]) / 2, lon: (left[0] + right[0]) / 2 };
  // Left and right edge points sit at +/-15° of the centre line, so their midpoint lies on it.
  const corridorDeg = bearingDeg(inv.sensor, mid);
  const driftKm = inv.corridor?.driftKm ?? null;
  const reported = inv.windFromDeg !== null;
  const fromDeg = inv.windFromDeg;
  const speedKmh = inv.windSpeedKmh ?? (driftKm !== null && inv.lookbackHours > 0 ? driftKm / inv.lookbackHours : null);

  let agreement: Agreement = 'unknown';
  if (fromDeg !== null) {
    const d = angDiff(corridorDeg, fromDeg);
    agreement = d <= 5 ? 'upwind' : d >= 175 ? 'downwind' : 'other';
  }
  const fallback = fromDeg !== null && angDiff(fromDeg, 75) < 1.5 && speedKmh !== null && Math.abs(speedKmh - 12) < 0.2;
  return {
    fromDeg,
    fromCompass: fromDeg !== null ? compass16(fromDeg) : null,
    corridorDeg,
    corridorCompass: compass16(corridorDeg),
    speedKmh,
    driftKm,
    reported,
    agreement,
    suspectedFallback: fallback,
  };
}
