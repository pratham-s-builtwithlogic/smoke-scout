export function About() {
  return (
    <article className="about">
      <p className="eyebrow mono">How it works</p>
      <h1>What Smoke Scout does, and what it can't tell you.</h1>

      <section>
        <h2>For residents</h2>
        <p>
          You drop a pin. The service reads PM2.5 (fine smoke and dust particles) at that spot from Open-Meteo, plus two
          forecast points: the next 6 AM and the next 2 PM, India time. We compare them with now. We only say conditions
          may be "comparatively better" when a forecast point is at least 20% and 10 µg/m³ lower than now.
        </p>
        <p>
          Bands follow the service's own thresholds: under 60 good, 60–120 moderate to poor, 120–250 very poor, 250 and
          above severe (µg/m³). A better band is relative. It is never a promise that the air is safe.
        </p>
      </section>

      <section>
        <h2>For investigators</h2>
        <p>
          An investigation starts only when PM2.5 is at least 30 µg/m³ or has risen 20 µg/m³ in the last hour. The service
          then reads the wind, draws a narrow wedge from your pin (as far as the air could drift in your chosen look-back
          time), and looks for NASA VIIRS fire detections from roughly the last day inside it.
        </p>
      </section>

      <section>
        <h2>Limits worth knowing</h2>
        <ul>
          <li>Punjab only. Satellite detections are searched in a fixed box of about 29.5–32.5°N, 73.8–76.9°E.</li>
          <li>
            The resident forecast has two points, not 24 hours, so Smoke Scout can't name the cleanest hour of the day.
          </li>
          <li>
            A detection inside the wedge is circumstantial. Smoke travels, winds change, and satellites miss fires under
            cloud or between passes. No detection is not proof that nothing burned.
          </li>
          <li>
            Satellite hotspots only appear if the service has a NASA FIRMS key configured. Without one it reports none.
          </li>
          <li>
            If the weather or air-quality source fails, the service may substitute placeholder numbers. Smoke Scout flags
            results that exactly match those placeholders, but it can't catch every case.
          </li>
          <li>Smoke Scout never names a farmer, village or field. It points at areas on a map.</li>
        </ul>
      </section>

      <section>
        <h2>Your data</h2>
        <p>
          Your pin stays in this page's memory; nothing is saved in your browser. Only its latitude and longitude are sent to
          the service. Smoke Scout doesn't use your device location unless you press "Use my location". Investigations the
          service runs are logged by it (location, readings, status).
        </p>
      </section>

      <section>
        <h2>Sources</h2>
        <ul>
          <li>Air quality and wind: Open-Meteo.</li>
          <li>Fire detections: NASA FIRMS, VIIRS S-NPP near-real-time.</li>
          <li>Map: © OpenStreetMap contributors, © CARTO.</li>
        </ul>
      </section>
    </article>
  );
}
