import { useEffect, useId, useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import type { LatLon } from '../api/types';
import { fmtCoord, parseCoord, round4, validatePin, type PinMode } from '../lib/geo';

/** City centres, offered as one-tap starting points. They set the pin only when tapped. */
const PLACES: { name: string; lat: number; lon: number }[] = [
  { name: 'Amritsar', lat: 31.634, lon: 74.8723 },
  { name: 'Jalandhar', lat: 31.326, lon: 75.5762 },
  { name: 'Ludhiana', lat: 30.901, lon: 75.8573 },
  { name: 'Patiala', lat: 30.3398, lon: 76.3869 },
  { name: 'Sangrur', lat: 30.2458, lon: 75.8421 },
  { name: 'Bathinda', lat: 30.211, lon: 74.9455 },
];

interface Props {
  mode: PinMode;
  pin: LatLon | null;
  onChange: (p: LatLon) => void;
  children?: React.ReactNode;
}

export function LocationPanel({ mode, pin, onChange, children }: Props) {
  const id = useId();
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    setLat(pin ? String(pin.lat) : '');
    setLon(pin ? String(pin.lon) : '');
    setFormError(null);
  }, [pin?.lat, pin?.lon]);

  const pinError = pin ? validatePin(pin, mode) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const la = parseCoord(lat);
    const lo = parseCoord(lon);
    if (la === null || lo === null) {
      setFormError('Enter both numbers, like 30.2110 and 74.9455.');
      return;
    }
    if (la < -90 || la > 90 || lo < -180 || lo > 180) {
      setFormError('Latitude must be between −90 and 90, and longitude between −180 and 180.');
      return;
    }
    const p = { lat: round4(la), lon: round4(lo) };
    const err = validatePin(p, 'resident'); // map-area check only; coverage is shown separately
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    onChange(p);
  }

  function locate() {
    setGeoMsg(null);
    if (!('geolocation' in navigator)) {
      setGeoMsg('This browser cannot share a location. Tap the map or type coordinates instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: round4(pos.coords.latitude), lon: round4(pos.coords.longitude) };
        const err = validatePin(p, 'resident');
        if (err) {
          setGeoMsg('Your device placed you outside Punjab, which is all this map covers. Tap the map to choose a spot instead.');
          return;
        }
        onChange(p);
      },
      (e) => {
        setLocating(false);
        setGeoMsg(
          e.code === e.PERMISSION_DENIED
            ? 'Location permission was declined. No problem: tap the map, pick a city below, or type coordinates.'
            : 'We could not get your location. Tap the map, pick a city below, or type coordinates.',
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="locate">
      <div className="locate-head">
        <h2 className="h3">
          <MapPin size={16} aria-hidden="true" /> Your spot
        </h2>
        <p className="muted small mono" aria-live="polite">
          {pin ? fmtCoord(pin) : 'No pin yet'}
        </p>
      </div>
      <p className="muted small">
        Tap the map, drag the pin, or use the options below. Only the pin's latitude and longitude are sent to the service.
      </p>

      <div className="row">
        <button type="button" className="btn btn-quiet" onClick={locate} disabled={locating}>
          <LocateFixed size={16} aria-hidden="true" />
          {locating ? 'Asking your device…' : 'Use my location'}
        </button>
      </div>
      {geoMsg && (
        <p className="note" role="status">
          {geoMsg}
        </p>
      )}

      <div className="chips" role="group" aria-label="Start from a city centre">
        {PLACES.map((p) => (
          <button key={p.name} type="button" className="chip" onClick={() => onChange({ lat: p.lat, lon: p.lon })}>
            {p.name}
          </button>
        ))}
      </div>

      <form className="coords" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={`${id}-lat`}>Latitude</label>
          <input
            id={`${id}-lat`}
            inputMode="decimal"
            autoComplete="off"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="30.2110"
            aria-invalid={!!formError}
            aria-describedby={formError ? `${id}-err` : undefined}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-lon`}>Longitude</label>
          <input
            id={`${id}-lon`}
            inputMode="decimal"
            autoComplete="off"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            placeholder="74.9455"
            aria-invalid={!!formError}
            aria-describedby={formError ? `${id}-err` : undefined}
          />
        </div>
        <button type="submit" className="btn btn-quiet">
          Set pin
        </button>
      </form>
      {formError && (
        <p id={`${id}-err`} className="note note-err" role="alert">
          {formError}
        </p>
      )}
      {pinError && !formError && (
        <p className="note note-warn" role="status">
          {pinError}
        </p>
      )}

      {children}
    </div>
  );
}
