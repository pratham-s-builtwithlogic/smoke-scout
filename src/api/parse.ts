import {
  ApiError,
  type AirReadings,
  type CitizenAdvisory,
  type Corridor,
  type GeoJsonFC,
  type GeoJsonFeature,
  type Hotspot,
  type Investigation,
  type LatLon,
  type Source,
  type TraceResult,
} from './types';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

function latLon(v: unknown): LatLon | null {
  if (!isObj(v)) return null;
  const lat = num(v.lat);
  const lon = num(v.lon);
  return lat !== null && lon !== null ? { lat, lon } : null;
}

function throwIfServiceError(o: Obj) {
  if (typeof o.error === 'string') throw new ApiError('service', o.error);
}

/** Placeholder values the backend substitutes when its upstream air-quality call fails. */
const FALLBACK_PM25 = 142.5;

export function parseCitizen(raw: unknown, source: Source): CitizenAdvisory {
  if (!isObj(raw)) throw new ApiError('shape', 'Response was not a JSON object');
  throwIfServiceError(raw);
  const adv = isObj(raw.advisory) ? raw.advisory : null;
  const now = adv && isObj(adv.right_now) ? adv.right_now : null;
  const tomorrow = adv && isObj(adv.tomorrow_planner) ? adv.tomorrow_planner : null;
  const pm25 = num(now?.pm25_level);
  if (!now || pm25 === null) {
    throw new ApiError('shape', 'Missing advisory.right_now.pm25_level');
  }
  const morning = num(tomorrow?.morning_forecast_pm25);
  const midday = num(tomorrow?.midday_forecast_pm25);
  return {
    source,
    location: latLon(raw.location),
    status: str(now.status) ?? 'UNKNOWN',
    pm25,
    action: str(now.action),
    homeVentilation: str(now.home_ventilation),
    morningPm25: morning,
    middayPm25: midday,
    morningWalkAdvice: str(tomorrow?.morning_walk_advice),
    betterAlternative: str(tomorrow?.better_alternative),
    suspectedFallback: pm25 === FALLBACK_PM25 && morning === 185 && midday === 85,
  };
}

function ringFrom(coords: unknown): [number, number][] | null {
  if (!Array.isArray(coords) || !Array.isArray(coords[0])) return null;
  const ring = coords[0] as unknown[];
  const out: [number, number][] = [];
  for (const p of ring) {
    if (Array.isArray(p) && num(p[0]) !== null && num(p[1]) !== null) out.push([p[0] as number, p[1] as number]);
  }
  return out.length >= 3 ? out : null;
}

function toFeatures(g: unknown): GeoJsonFeature[] {
  if (!isObj(g) || !Array.isArray(g.features)) return [];
  return g.features.filter(
    (f): f is GeoJsonFeature => isObj(f) && isObj(f.geometry) && typeof f.geometry.type === 'string',
  );
}

export function parseTrace(raw: unknown, source: Source, lookbackHours: number): TraceResult {
  if (!isObj(raw)) throw new ApiError('shape', 'Response was not a JSON object');
  throwIfServiceError(raw);
  const status = str(raw.status);

  // A valid answer, not an error: nothing triggered an investigation.
  if (status === 'NORMAL_AIR') {
    const aq = isObj(raw.air_quality) ? raw.air_quality : {};
    const pm25 = num(aq.pm25);
    const air: AirReadings = {
      pm25,
      pm10: num(aq.pm10),
      co: num(aq.co),
      delta1h: num(aq.delta_1h),
      suspectedFallback: false,
    };
    return { kind: 'normal', source, message: str(raw.message), air };
  }

  const features = toFeatures(raw.geojson);
  if (!status || (!features.length && !latLon(raw.sensor_location))) {
    throw new ApiError('shape', 'Unrecognised fire_trace response');
  }

  const sensorFeature = features.find((f) => f.properties?.layer === 'sensor');
  const wedgeFeature = features.find((f) => f.properties?.layer === 'search_wedge');

  const sensorFromFeature =
    sensorFeature && Array.isArray(sensorFeature.geometry.coordinates)
      ? { lat: num(sensorFeature.geometry.coordinates[1]), lon: num(sensorFeature.geometry.coordinates[0]) }
      : null;
  const sensor =
    latLon(raw.sensor_location) ??
    (sensorFromFeature && sensorFromFeature.lat !== null && sensorFromFeature.lon !== null
      ? { lat: sensorFromFeature.lat, lon: sensorFromFeature.lon }
      : null);
  if (!sensor) throw new ApiError('shape', 'Response had no sensor location');

  const ring = wedgeFeature ? ringFrom(wedgeFeature.geometry.coordinates) : null;
  const corridor: Corridor | null = ring ? { ring, driftKm: num(wedgeFeature?.properties?.drift_km) } : null;

  // Satellite details (acquisition time) come from satellite_fires; geometry from the GeoJSON.
  const fires = Array.isArray(raw.satellite_fires) ? raw.satellite_fires.filter(isObj) : [];
  const hotspotFeatures = features.filter((f) => f.properties?.layer === 'nasa_fire_hotspot');
  let hotspots: Hotspot[] = [];
  for (const f of hotspotFeatures) {
    const c = f.geometry.coordinates;
    const lon = Array.isArray(c) ? num(c[0]) : null;
    const lat = Array.isArray(c) ? num(c[1]) : null;
    if (lat === null || lon === null) continue;
    const match = fires.find((x) => num(x.lat) === lat && num(x.lon) === lon);
    hotspots.push({
      lat,
      lon,
      frpMw: num(f.properties?.frp) ?? num(match?.frp_mw),
      acqTime: match ? str(match.acq_time) : null,
    });
  }
  if (!hotspots.length && fires.length) {
    hotspots = fires
      .map((x) => ({ lat: num(x.lat), lon: num(x.lon), frpMw: num(x.frp_mw), acqTime: str(x.acq_time) }))
      .filter((h): h is Hotspot => h.lat !== null && h.lon !== null);
  }

  const pm25 = num(sensorFeature?.properties?.pm25);
  const geojson: GeoJsonFC | null = features.length ? { type: 'FeatureCollection', features } : null;
  const known = status === 'CONFIRMED_STUBBLE_FIRE' || status === 'UNVERIFIED_SMOKE_PLUME';
  const inv: Investigation = {
    kind: 'investigation',
    source,
    status: !known ? 'UNKNOWN' : status === 'CONFIRMED_STUBBLE_FIRE' ? 'HOTSPOT' : 'NO_HOTSPOT',
    rawStatus: status,
    eventId: str(raw.event_id),
    district: str(raw.origin_district),
    sensor,
    target: latLon(raw.target_coordinates),
    pm25,
    corridor,
    hotspots,
    geojson,
    lookbackHours,
    windFromDeg: num(wedgeFeature?.properties?.wind_from_deg),
    windSpeedKmh: num(wedgeFeature?.properties?.wind_speed_kmh),
    suspectedFallback: pm25 === FALLBACK_PM25,
  };
  return inv;
}
