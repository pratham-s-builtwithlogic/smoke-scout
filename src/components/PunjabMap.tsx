import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair } from 'lucide-react';
import { TILES } from '../api/config';
import type { Investigation, LatLon } from '../api/types';
import { COVERAGE, MAP_AREA, fmtAcq, round4, validatePin } from '../lib/geo';

export interface MapHandle {
  recenter(): void;
  fitResult(): void;
  focusHotspot(index: number): void;
}

export interface LayerState {
  corridor: boolean;
  hotspots: boolean;
  coverage: boolean;
}

interface Props {
  mode: 'resident' | 'trace';
  pin: LatLon | null;
  onPick: (p: LatLon) => void;
  investigation?: Investigation | null;
  layers?: LayerState;
  onLayersChange?: (l: LayerState) => void;
  className?: string;
}

const PIN_ICON = L.divIcon({
  className: 'map-pin',
  html: '<svg viewBox="0 0 34 44" width="34" height="44" aria-hidden="true"><path d="M17 42C17 42 4 27 4 17a13 13 0 0 1 26 0c0 10-13 25-13 25z" fill="#e8b04a" stroke="#0e2420" stroke-width="2"/><circle cx="17" cy="17" r="5" fill="#0e2420"/></svg>',
  iconSize: [34, 44],
  iconAnchor: [17, 42],
});

// The tentative pin shown after a first click: same shape, dashed and see-through, so it reads as "not yet chosen".
const GHOST_ICON = L.divIcon({
  className: 'map-pin map-pin-ghost',
  html: '<svg viewBox="0 0 34 44" width="34" height="44" aria-hidden="true"><path d="M17 42C17 42 4 27 4 17a13 13 0 0 1 26 0c0 10-13 25-13 25z" fill="#e8b04a" fill-opacity=".35" stroke="#0e2420" stroke-width="2" stroke-dasharray="4 3"/><circle cx="17" cy="17" r="4" fill="none" stroke="#0e2420" stroke-width="2"/></svg>',
  iconSize: [34, 44],
  iconAnchor: [17, 42],
});

const HOTSPOT_ICON = L.divIcon({
  className: 'map-hotspot',
  html: '<span class="hs-diamond"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const COVERAGE_BOUNDS = L.latLngBounds([COVERAGE.south, COVERAGE.west], [COVERAGE.north, COVERAGE.east]);

export const PunjabMap = forwardRef<MapHandle, Props>(function PunjabMap(props, ref) {
  const { mode, pin, investigation, layers, onLayersChange } = props;
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pinMarker = useRef<L.Marker | null>(null);
  const coverageGroup = useRef<L.LayerGroup>(L.layerGroup());
  const corridorGroup = useRef<L.LayerGroup>(L.layerGroup());
  const hotspotGroup = useRef<L.LayerGroup>(L.layerGroup());
  const hotspotMarkers = useRef<L.Marker[]>([]);
  const onPickRef = useRef(props.onPick);
  onPickRef.current = props.onPick;
  const pinRef = useRef(pin);
  pinRef.current = pin;
  // First click = tentative pin with a "Use this spot" card. Confirming (button, second click on it, or Enter) commits.
  const clearGhostRef = useRef<() => void>(() => {});
  // The two map panels start open on wide screens and closed on phones, where they would cover the map.
  const [panelsOpen] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 761px)').matches);

  // ---- map init -----------------------------------------------------------
  useEffect(() => {
    if (!host.current) return;
    const m = L.map(host.current, {
      maxBounds: [
        [MAP_AREA.south, MAP_AREA.west],
        [MAP_AREA.north, MAP_AREA.east],
      ],
      maxBoundsViscosity: 0.9,
      minZoom: 6,
      maxZoom: 14,
      zoomSnap: 0.5,
    });
    m.fitBounds(COVERAGE_BOUNDS);
    L.tileLayer(mode === 'trace' ? TILES.dark : TILES.light, {
      attribution: TILES.attribution,
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(m);

    let ghost: L.Marker | null = null;
    const clearGhost = () => {
      if (ghost) {
        ghost.remove();
        ghost = null;
      }
    };
    clearGhostRef.current = clearGhost;
    const confirmGhost = (ll: L.LatLng) => {
      clearGhost();
      onPickRef.current({ lat: round4(ll.lat), lon: round4(ll.lng) });
    };
    const showGhost = (ll: L.LatLng) => {
      clearGhost();
      const p = { lat: round4(ll.lat), lon: round4(ll.lng) };
      const err = validatePin(p, mode);
      // Deliberately tiny: one button (or one short line when the spot is not allowed). Coordinates are
      // shown in the side panel once the pin is confirmed.
      const card = document.createElement('div');
      card.className = 'ghost-card';
      if (err) {
        card.classList.add('is-blocked');
        card.textContent = err.startsWith('This spot is outside') ? 'Outside the satellite search box' : 'Outside the Punjab map area';
        card.title = err;
      } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ghost-confirm';
        btn.textContent = 'Use this spot';
        btn.addEventListener('click', () => confirmGhost(ll));
        card.append(btn);
      }
      L.DomEvent.disableClickPropagation(card);
      const mk = L.marker(ll, { icon: GHOST_ICON, keyboard: false, zIndexOffset: 900, alt: 'Tentative location' })
        .bindPopup(card, { className: 'ghost-popup', closeButton: false, autoClose: false, closeOnClick: false, autoPan: false, offset: [0, -34], minWidth: 0, maxWidth: 220 })
        .addTo(m);
      if (!err) mk.on('click', () => confirmGhost(ll));
      mk.openPopup();
      ghost = mk;
    };

    // A click shows the tentative pin. It waits briefly so a double-click (zoom) or the start of a drag cancels it.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => {
      if (pending) clearTimeout(pending);
      pending = null;
    };
    m.on('click', (e: L.LeafletMouseEvent) => {
      cancel();
      if (ghost) {
        // A tentative pin is showing: this click only dismisses it. The confirmed pin stays where it was.
        clearGhost();
        return;
      }
      const ll = e.latlng;
      pending = setTimeout(() => {
        pending = null;
        // No confirmed pin yet: the first click places it straight away. Otherwise show a tentative one.
        if (!pinRef.current) confirmGhost(ll);
        else showGhost(ll);
      }, 260);
    });
    m.on('dblclick movestart zoomstart', cancel);

    const c = m.getContainer();
    c.setAttribute('role', 'application');
    c.setAttribute(
      'aria-label',
      'Map of Punjab. Click or tap to drop your pin. Once a pin exists, a click previews a new spot and you confirm it with Use this spot. With the keyboard, move the map with the arrow keys and press Enter to drop a pin at the centre, Escape to cancel a preview. You can also type coordinates in the form.',
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearGhost();
      if (e.key === 'Enter' && e.target === c) {
        if (ghost && !validatePin({ lat: ghost.getLatLng().lat, lon: ghost.getLatLng().lng }, mode)) {
          confirmGhost(ghost.getLatLng());
        } else if (!pinRef.current) {
          confirmGhost(m.getCenter());
        } else {
          showGhost(m.getCenter());
        }
      }
    };
    c.addEventListener('keydown', onKey);

    // Coverage box: the fixed area the backend queries for satellite fires.
    const box = L.rectangle(COVERAGE_BOUNDS, {
      color: '#e8b04a',
      weight: 1.5,
      dashArray: '6 6',
      fill: false,
      interactive: false,
    });
    const label = L.marker([COVERAGE.north, COVERAGE.west], {
      interactive: false,
      icon: L.divIcon({
        className: 'map-label',
        html: '<span>Satellite search area</span>',
        iconSize: [160, 20],
        iconAnchor: [-6, -6],
      }),
    });
    coverageGroup.current.clearLayers().addLayer(box).addLayer(label);

    map.current = m;
    const t = setTimeout(() => m.invalidateSize(), 0);
    return () => {
      clearTimeout(t);
      cancel();
      clearGhost();
      c.removeEventListener('keydown', onKey);
      m.remove();
      map.current = null;
      pinMarker.current = null;
      hotspotMarkers.current = [];
    };
  }, [mode]);

  // ---- pin ----------------------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    clearGhostRef.current();
    if (!pin) {
      pinMarker.current?.remove();
      pinMarker.current = null;
      return;
    }
    const ll = L.latLng(pin.lat, pin.lon);
    if (!pinMarker.current) {
      const mk = L.marker(ll, {
        icon: PIN_ICON,
        draggable: true,
        keyboard: false,
        alt: 'Selected location',
        zIndexOffset: 1000,
      }).addTo(m);
      mk.on('dragend', () => {
        const p = mk.getLatLng();
        onPickRef.current({ lat: round4(p.lat), lon: round4(p.lng) });
      });
      pinMarker.current = mk;
    } else {
      pinMarker.current.setLatLng(ll);
    }
    if (!m.getBounds().contains(ll)) m.panTo(ll);
  }, [pin]);

  // ---- coverage box (trace only) -------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const show = mode === 'trace' && (layers?.coverage ?? true);
    if (show) coverageGroup.current.addTo(m);
    else coverageGroup.current.remove();
  }, [mode, layers?.coverage]);

  // ---- investigation geometry ------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    corridorGroup.current.clearLayers();
    hotspotGroup.current.clearLayers();
    hotspotMarkers.current = [];
    if (!investigation) return;

    // Corridor polygon: straight from the backend GeoJSON.
    if (investigation.geojson) {
      L.geoJSON(investigation.geojson as any, {
        filter: (f) => f.properties?.layer === 'search_wedge',
        style: { color: '#e8b04a', weight: 2, dashArray: '2 5', fillColor: '#e8b04a', fillOpacity: 0.16 },
        onEachFeature: (f, layer) => {
          const km = f.properties?.drift_km;
          layer.bindPopup(
            `<strong>Search corridor</strong><br>Estimated from wind${typeof km === 'number' ? `, about ${km} km long` : ''}. It is a rough area to look at, not a source.`,
          );
        },
      }).addTo(corridorGroup.current);
    }

    // Ring around the monitoring location.
    L.circleMarker([investigation.sensor.lat, investigation.sensor.lon], {
      radius: 16,
      color: '#f3ecd9',
      weight: 1.5,
      fill: false,
    })
      .bindPopup(
        `<strong>Monitoring location</strong>${investigation.pm25 !== null ? `<br>PM2.5 ${investigation.pm25} µg/m³ (measured)` : ''}`,
      )
      .addTo(corridorGroup.current);

    // Estimated centre-line point, only when no satellite detection exists.
    if (investigation.status === 'NO_HOTSPOT' && investigation.target) {
      L.circleMarker([investigation.target.lat, investigation.target.lon], {
        radius: 7,
        color: '#e8b04a',
        weight: 2,
        dashArray: '3 3',
        fillColor: '#0e2420',
        fillOpacity: 0.6,
      })
        .bindPopup('<strong>Estimated point</strong><br>Where the middle of the corridor ends. This is a calculation, not a detection.')
        .addTo(corridorGroup.current);
    }

    investigation.hotspots.forEach((h, i) => {
      const when = fmtAcq(h.acqTime);
      const mk = L.marker([h.lat, h.lon], { icon: HOTSPOT_ICON, alt: `Satellite detection ${i + 1}` })
        .bindPopup(
          `<strong>Satellite detection ${i + 1}</strong><br>` +
            `VIIRS (NASA FIRMS), last-day query<br>` +
            (h.frpMw !== null ? `Fire radiative power: ${h.frpMw} MW<br>` : '') +
            (when ? `Acquired: ${esc(when)}<br>` : '') +
            `${h.lat.toFixed(4)}, ${h.lon.toFixed(4)}<br>` +
            `<em>A detection inside the corridor does not prove it caused this smoke.</em>`,
        )
        .addTo(hotspotGroup.current);
      hotspotMarkers.current.push(mk);
    });

    const bounds = L.latLngBounds([[investigation.sensor.lat, investigation.sensor.lon]]);
    investigation.corridor?.ring.forEach(([lon, lat]) => bounds.extend([lat, lon]));
    investigation.hotspots.forEach((h) => bounds.extend([h.lat, h.lon]));
    m.fitBounds(bounds.pad(0.25), { maxZoom: 11 });
  }, [investigation]);

  // ---- layer toggles --------------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (layers?.corridor ?? true) corridorGroup.current.addTo(m);
    else corridorGroup.current.remove();
    if (layers?.hotspots ?? true) hotspotGroup.current.addTo(m);
    else hotspotGroup.current.remove();
  }, [layers?.corridor, layers?.hotspots, investigation]);

  useImperativeHandle(ref, () => ({
    recenter() {
      const m = map.current;
      if (!m) return;
      if (pinRef.current) m.setView([pinRef.current.lat, pinRef.current.lon], Math.max(m.getZoom(), 9));
      else m.fitBounds(COVERAGE_BOUNDS);
    },
    fitResult() {
      const m = map.current;
      if (!m || !investigation) return;
      const b = L.latLngBounds([[investigation.sensor.lat, investigation.sensor.lon]]);
      investigation.corridor?.ring.forEach(([lon, lat]) => b.extend([lat, lon]));
      investigation.hotspots.forEach((h) => b.extend([h.lat, h.lon]));
      m.fitBounds(b.pad(0.25), { maxZoom: 11 });
    },
    focusHotspot(i: number) {
      const m = map.current;
      const mk = hotspotMarkers.current[i];
      if (!m || !mk) return;
      if (!hotspotGroup.current.hasLayer(mk)) hotspotGroup.current.addTo(m);
      m.setView(mk.getLatLng(), Math.max(m.getZoom(), 11));
      mk.openPopup();
    },
  }));

  const hasResult = !!investigation;
  const hasHotspots = !!investigation && investigation.hotspots.length > 0;

  return (
    <div className={`map-wrap ${props.className ?? ''}`}>
      <div ref={host} className={`map-canvas ${!pin ? 'is-placing' : ''}`} />

      {!pin && (
        <p className="map-hint" role="note">
          Click the map to choose a spot
        </p>
      )}

      <div className="map-tools">
        <RecenterButton onClick={() => {
          const m = map.current;
          if (!m) return;
          if (pinRef.current) m.setView([pinRef.current.lat, pinRef.current.lon], Math.max(m.getZoom(), 9));
          else m.fitBounds(COVERAGE_BOUNDS);
        }} hasPin={!!pin} />

        {mode === 'trace' && layers && onLayersChange && (
          <details className="layer-box" open={panelsOpen}>
            <summary>Layers</summary>
            <div className="layer-list">
            <label>
              <input
                type="checkbox"
                checked={layers.corridor}
                onChange={(e) => onLayersChange({ ...layers, corridor: e.target.checked })}
              />
              Search corridor
            </label>
            <label>
              <input
                type="checkbox"
                checked={layers.hotspots}
                onChange={(e) => onLayersChange({ ...layers, hotspots: e.target.checked })}
              />
              Satellite detections
            </label>
            <label>
              <input
                type="checkbox"
                checked={layers.coverage}
                onChange={(e) => onLayersChange({ ...layers, coverage: e.target.checked })}
              />
              Satellite search area
            </label>
            </div>
          </details>
        )}
      </div>

      <details className="legend" open={mode === 'trace' && panelsOpen}>
        <summary>Legend</summary>
        <ul>
          <li>
            <svg width="18" height="18" viewBox="0 0 34 44" aria-hidden="true">
              <path d="M17 42C17 42 4 27 4 17a13 13 0 0 1 26 0c0 10-13 25-13 25z" fill="#e8b04a" stroke="currentColor" strokeWidth="3" />
            </svg>
            Your selected spot
          </li>
          {mode === 'trace' && (
            <>
              <li>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M2 16 L9 2 L16 16 Z" fill="#e8b04a" fillOpacity=".25" stroke="#e8b04a" strokeDasharray="2 3" strokeWidth="1.5" />
                </svg>
                Search corridor {hasResult ? '' : '(after you investigate)'}
              </li>
              <li>
                <span className="hs-diamond legend-diamond" aria-hidden="true" />
                Satellite detection{hasResult && !hasHotspots ? ' (none found)' : ''}
              </li>
              <li>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <circle cx="9" cy="9" r="5" fill="none" stroke="#e8b04a" strokeDasharray="3 3" strokeWidth="2" />
                </svg>
                Estimated point (a calculation)
              </li>
              <li>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <rect x="2" y="3" width="14" height="12" fill="none" stroke="#e8b04a" strokeDasharray="4 3" strokeWidth="1.5" />
                </svg>
                Satellite search area
              </li>
            </>
          )}
        </ul>
      </details>
    </div>
  );
});

function RecenterButton({ onClick, hasPin }: { onClick: () => void; hasPin: boolean }) {
  return (
    <button type="button" className="map-btn" onClick={onClick}>
      <Crosshair size={16} aria-hidden="true" />
      {hasPin ? 'Back to my pin' : 'Reset view'}
    </button>
  );
}
