# Smoke Scout

Two journeys over one shared map of Punjab:

- **Check my air** (`#/resident`): drop a pin, get a plain answer to "should I open my windows?", with a now / 6 AM / 2 PM comparison.
- **Trace the smoke** (`#/trace`): drop a pin, run an investigation, see the wind corridor and any NASA FIRMS detections on an interactive map.

Dropping a pin (tap, drag, "Use my location", a city chip, or typed coordinates) sends only its `lat` / `lon` to your API Gateway.

## Run it

```bash
npm install
cp .env.example .env     # then set VITE_API_URL
npm run dev              # http://localhost:5173
npm run build            # typecheck + production build into dist/
```

Stack: React 18, TypeScript, Vite, Leaflet, lucide-react. No CSS framework; tokens live in `src/styles/tokens.css`.

If `VITE_API_URL` is empty the app runs in **demo mode**: a bar at the top says `DEMO DATA`, and a scenario picker lets you walk through every state (severe, moderate, good, no improvement, missing forecast, timeout, hotspots, no hotspot, normal air, service error, malformed response). Demo output is generated in the exact shape of your Lambda response and goes through the same parser. Nothing in demo mode is real.

## Connecting API Gateway

Set `VITE_API_URL` to the full invoke URL, stage and path included, e.g. `https://abc123.execute-api.ap-south-1.amazonaws.com/prod/trace`. The app POSTs one JSON body to that URL:

```json
{ "mode": "citizen", "lat": 30.2110, "lon": 74.9455 }
{ "mode": "fire_trace", "lat": 30.2110, "lon": 74.9455, "lookback_hours": 2.5 }
```

`src/api/client.ts` accepts both integration styles:

- **Lambda proxy integration**: the body arrives already unwrapped.
- **Non-proxy / envelope-as-JSON**: `{ "statusCode": 200, "body": "<json string>" }` is unwrapped, and a `statusCode >= 400` becomes an error.

I could not see your deployed gateway, so I did not assume which one you have. Both are covered by tests (below).

### CORS (check this in the deployed environment)

- Requests are sent as `Content-Type: text/plain`, which is a CORS "simple request", so browsers skip the `OPTIONS` preflight. Lambda still receives the JSON text in `event.body`. Change it with `VITE_API_CONTENT_TYPE` if you prefer `application/json` (then enable CORS / `OPTIONS` on the gateway).
- Your handler adds `Access-Control-Allow-Origin: *` on its 200 responses only. Its **400 and 500 responses have no CORS headers**, so the browser reports them as a network failure, not an error body. The UI shows a "couldn't reach the service" message in that case. Add the header to those two returns, or enable CORS on the gateway so it is added for you.
- For HTTP APIs, you can instead set CORS on the gateway itself.

## Project map

```
src/api/        config, types, parse (response -> models), client (fetch, timeout, envelope), demo
src/lib/        geo (bounds, bearing, projection), advice (recommendation), wind (derived wind)
src/hooks/      useRequest (idle / loading / success / error, cancels stale requests)
src/components/ PunjabMap (Leaflet), LocationPanel, FlowField, Header, shared
src/pages/      Landing, Resident, Trace, About
```

## What the UI will and won't claim

- Resident: the backend gives two forecast points (next 6 AM, next 2 PM), so the UI compares those with now and says so. It never draws an hourly series and never names a "best hour". A forecast counts as "comparatively better" only if it is at least 20% and 10 µg/m³ lower than now.
- Trace: `NORMAL_AIR` is shown as a valid result. `CONFIRMED_STUBBLE_FIRE` is worded as "satellite hotspot detected within the search corridor", and `UNVERIFIED_SMOKE_PLUME` as "possible plume, no matching hotspot". The internal confidence score is not shown anywhere.
- Wind speed and direction are **derived** from the corridor geometry (the response has no wind fields) and labelled as estimates.
- Pins outside the satellite search box (29.5–32.5°N, 73.8–76.9°E) cannot be investigated.

## Things in the backend worth knowing

1. **Corridor direction.** The original code drew the corridor along `(wind_dir + 180) % 360`, which is where the air is *going*. For "where did this smoke come from" it should point along `wind_dir` (the direction the wind comes *from*). Use `reverse_bearing = wind_dir`, and have the Lambda report the wind it used so the app can check itself (add to the `search_wedge` properties):

   ```python
   # fetch_wind_and_cone: add  "wind_dir": wind_dir  to the returned dict, then in the wedge feature:
   "properties": {"layer": "search_wedge", "drift_km": wind_cone["drift_distance_km"],
                  "wind_from_deg": wind_cone["wind_dir"], "wind_speed_kmh": wind_cone["speed_kmh"]}
   ```

   With those fields the trace panel shows "Wind from" as reported and runs a visible check: corridor direction vs wind-from direction. Without them it shows only the corridor's own direction and never guesses the wind. **Verify against reality** before trusting any of this: compare "Wind from" with the observed wind (airport METAR, e.g. `27010KT` means wind *from* 270°) or with Windy.com's wind-from reading for the same place and time.
2. **Silent placeholder data.** If Open-Meteo fails, `fetch_air_quality` and `fetch_wind_and_cone` substitute made-up numbers (PM2.5 142.5, wind 75° at 12 km/h) and the response does not say so. The UI flags results that exactly match those placeholders, but it cannot catch every case. Best fix: add a `"data_source": "fallback"` field and return an error instead.
3. **No hotspots without a FIRMS key.** With `NASA_MAP_KEY` unset or `DEMO_KEY`, `check_nasa_fires` returns `[]` every time, so every investigation reads as "no matching hotspot".
4. **Wording.** For PM2.5 60–120 the service says "Safe to open windows for ventilation." The UI avoids repeating that as its headline, but it does show the service's text inside "Why this recommendation?". Consider softening it.
5. **Trace responses omit PM10, 1-hour change and wind** when an investigation is triggered; they only appear in `NORMAL_AIR`. Adding them would let the evidence panel show measured values instead of derived ones.
6. **Every triggered investigation is written to DynamoDB** (location, readings, status). The UI says so next to the Investigate button, and runs investigations only on an explicit click.

## Verification status (honest)

Done, here, against output from your actual `lambda_handler` (run offline with `boto3` stubbed and its network calls mocked):

- 42 checks on the response parsers, error handling, both gateway envelope styles, request payloads, verdict logic, location validation, and the demo generator round-tripping through the real parser. All passed.
- Server-side render of every page and of the result components (severe, placeholder, missing forecast, good, hotspot, no hotspot, normal air) with key text asserted.

**Not done:** `npm install` was blocked in my workspace (the npm registry is denied by organization policy), so I did not run `npm run build` or the Vite dev server, did not typecheck against real `react` / `leaflet` types, and did not view the app in a browser. That means the Leaflet map behaviour (pin drop, drag, popups, layer toggles, fit-to-corridor), the visual layout, responsive behaviour at phone and laptop widths, and contrast have **not** been inspected. Please run `npm run build` first; if it reports type errors they will be small and local.
