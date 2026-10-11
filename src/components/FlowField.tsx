/**
 * Decorative hero motif, generated from a deterministic vector field:
 * streamlines (air moving), closed contours (concentration), coordinate ticks,
 * and a miniature of the investigation geometry (a corridor wedge, a monitoring dot, a detection diamond).
 * It carries no data; it is aria-hidden.
 */
const W = 1200;
const H = 640;

function angle(x: number, y: number) {
  return 0.5 * Math.sin(y / 120 + x / 420) + 0.35 * Math.cos(x / 280 - y / 190) + 0.2;
}

function stream(x0: number, y0: number, steps = 76, step = 16) {
  let x = x0;
  let y = y0;
  const pts: string[] = [`${x.toFixed(1)} ${y.toFixed(1)}`];
  for (let i = 0; i < steps; i++) {
    const a = angle(x, y);
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return 'M' + pts.join('L');
}

function contour(cx: number, cy: number, r: number, phase: number) {
  const pts: string[] = [];
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    const rr = r * (1 + 0.11 * Math.sin(3 * t + phase) + 0.06 * Math.cos(5 * t - phase));
    pts.push(`${(cx + rr * Math.cos(t) * 1.25).toFixed(1)} ${(cy + rr * Math.sin(t)).toFixed(1)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}

const STREAMS = Array.from({ length: 24 }, (_, i) => ({ d: stream(-30, 14 + i * 27), hot: i % 6 === 2, i }));
const CONTOURS = [46, 92, 140, 192, 250].map((r, i) => contour(880, 310, r, i * 0.8));

export function FlowField() {
  return (
    <svg className="flow" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
      <g fill="none" strokeLinecap="round">
        <g stroke="var(--text)" strokeOpacity="0.10" strokeWidth="1">
          {CONTOURS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g stroke="var(--text)" strokeOpacity="0.16" strokeWidth="1.2">
          {STREAMS.filter((s) => !s.hot).map((s) => (
            <path key={s.i} d={s.d} />
          ))}
        </g>
        <g stroke="var(--accent)" strokeOpacity="0.85" strokeWidth="1.6" className="flow-hot">
          {STREAMS.filter((s) => s.hot).map((s) => (
            <path key={s.i} d={s.d} pathLength={100} strokeDasharray="6 94" />
          ))}
        </g>
      </g>

      {/* coordinate ticks */}
      <g fontFamily="var(--font-mono)" fontSize="11" fill="var(--text-3)">
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} transform={`translate(${220 + i * 220} ${H - 14})`}>
            <path d="M0 -10v-8" stroke="var(--text-3)" strokeOpacity=".6" />
            <text x="4" y="-2">{`${74 + i}°E`}</text>
          </g>
        ))}
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${W - 14} ${150 + i * 170})`}>
            <path d="M-8 0h-8" stroke="var(--text-3)" strokeOpacity=".6" />
            <text x="-52" y="-6">{`${32 - i}°N`}</text>
          </g>
        ))}
      </g>

      {/* miniature of the trace geometry */}
      <g transform="translate(900 330)">
        <path d="M0 0 L-250 -120 L-215 -30 Z" fill="var(--accent)" fillOpacity=".12" stroke="var(--accent)" strokeDasharray="3 6" />
        <circle r="7" fill="var(--text)" />
        <circle r="16" fill="none" stroke="var(--text)" strokeOpacity=".7" />
        <path d="M-150 -62 l7 7 -7 7 -7 -7z" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
      </g>
    </svg>
  );
}
