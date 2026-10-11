export interface LatLon {
  lat: number;
  lon: number;
}

/** 'live' = answered by the configured backend. 'demo' = simulated in the browser. */
export type Source = 'live' | 'demo';

export interface CitizenAdvisory {
  source: Source;
  location: LatLon | null;
  /** Backend status string, e.g. GOOD | MODERATE_POOR | VERY_POOR | SEVERE_EMERGENCY */
  status: string;
  pm25: number;
  action: string | null;
  homeVentilation: string | null;
  morningPm25: number | null;
  middayPm25: number | null;
  morningWalkAdvice: string | null;
  betterAlternative: string | null;
  /** Values exactly match the placeholder numbers the backend substitutes when Open-Meteo fails. */
  suspectedFallback: boolean;
}

export interface AirReadings {
  pm25: number | null;
  pm10: number | null;
  co: number | null;
  delta1h: number | null;
  suspectedFallback: boolean;
}

export interface Hotspot {
  lat: number;
  lon: number;
  frpMw: number | null;
  /** FIRMS acquisition time, HHMM UTC, as supplied. */
  acqTime: string | null;
}

export interface Corridor {
  /** [lon, lat] ring, as returned in the GeoJSON polygon. */
  ring: [number, number][];
  driftKm: number | null;
}

export interface GeoJsonFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: any };
  properties?: Record<string, unknown>;
}
export interface GeoJsonFC {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export interface NormalAir {
  kind: 'normal';
  source: Source;
  message: string | null;
  air: AirReadings;
}

export interface Investigation {
  kind: 'investigation';
  source: Source;
  /**
   * Simplified from the backend status:
   *  HOTSPOT     <- CONFIRMED_STUBBLE_FIRE (at least one satellite detection inside the corridor)
   *  NO_HOTSPOT  <- UNVERIFIED_SMOKE_PLUME (none found)
   */
  status: 'HOTSPOT' | 'NO_HOTSPOT' | 'UNKNOWN';
  rawStatus: string;
  eventId: string | null;
  district: string | null;
  sensor: LatLon;
  /** First hotspot if any, otherwise the estimated centre-line point. Not a validated source. */
  target: LatLon | null;
  pm25: number | null;
  corridor: Corridor | null;
  hotspots: Hotspot[];
  geojson: GeoJsonFC | null;
  lookbackHours: number;
  /** Wind the service actually used. Present only if the Lambda adds wind_from_deg to the search_wedge properties. */
  windFromDeg: number | null;
  windSpeedKmh: number | null;
  suspectedFallback: boolean;
}

export type TraceResult = NormalAir | Investigation;

export type ApiErrorKind = 'timeout' | 'network' | 'http' | 'service' | 'shape' | 'config';

export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;
  detail?: string;
  constructor(kind: ApiErrorKind, detail?: string, status?: number) {
    super(`${kind}${detail ? `: ${detail}` : ''}`);
    this.kind = kind;
    this.detail = detail;
    this.status = status;
  }
}
