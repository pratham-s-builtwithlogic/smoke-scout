import type { CitizenAdvisory } from '../api/types';

/** The same PM2.5 bands the backend uses to pick its status (µg/m³). */
export interface Band {
  key: 'good' | 'moderate' | 'veryPoor' | 'severe';
  label: string;
  min: number;
  max: number;
}
export const BANDS: Band[] = [
  { key: 'good', label: 'Good', min: 0, max: 60 },
  { key: 'moderate', label: 'Moderate to poor', min: 60, max: 120 },
  { key: 'veryPoor', label: 'Very poor', min: 120, max: 250 },
  { key: 'severe', label: 'Severe', min: 250, max: Infinity },
];
export const bandOf = (v: number): Band => BANDS.find((b) => v >= b.min && v < b.max) ?? BANDS[BANDS.length - 1];

export type PointId = 'now' | 'morning' | 'midday';
export interface Point {
  id: PointId;
  label: string;
  short: string;
  value: number | null;
}

export const pointsOf = (a: CitizenAdvisory): Point[] => [
  { id: 'now', label: 'Now', short: 'now', value: a.pm25 },
  { id: 'morning', label: 'Next 6 AM', short: '6 AM', value: a.morningPm25 },
  { id: 'midday', label: 'Next 2 PM', short: '2 PM', value: a.middayPm25 },
];

export type Tone = 'serious' | 'caution' | 'good' | 'unknown';
export type Icon = 'closed' | 'caution' | 'good' | 'unknown';
export type Compare = 'better' | 'flat' | 'unavailable';

export interface Verdict {
  tone: Tone;
  icon: Icon;
  headline: string;
  lead: string;
  compare: Compare;
  /** Forecast point that is clearly lower than now, if any. */
  betterAt: Point | null;
  /** Section sub-headline for the forecast comparison. */
  compareLine: string;
}

/** A forecast counts as "clearly lower" only if it is at least 20% and 10 µg/m³ below now. */
export const IMPROVEMENT = { ratio: 0.8, minDrop: 10 };

export function deriveVerdict(a: CitizenAdvisory): Verdict {
  const now = a.pm25;
  const band = bandOf(now);
  const pts = pointsOf(a).filter((p) => p.id !== 'now' && p.value !== null);
  const lower = pts
    .filter((p) => (p.value as number) <= now * IMPROVEMENT.ratio && now - (p.value as number) >= IMPROVEMENT.minDrop)
    .sort((x, y) => (x.value as number) - (y.value as number));
  const betterAt = lower[0] ?? null;
  const compare: Compare = pts.length === 0 ? 'unavailable' : betterAt ? 'better' : 'flat';
  const compareLine =
    compare === 'unavailable'
      ? 'No forecast points came back for this spot.'
      : betterAt
        ? `Conditions may be comparatively better around ${betterAt.short}.`
        : 'No clear improvement is forecast.';

  const stillPolluted = 'Air would still be polluted, so read it as "less bad", not "clean".';

  if (band.key === 'good') {
    return {
      tone: 'good',
      icon: 'good',
      headline: 'Air looks comparatively good right now.',
      lead: `PM2.5 is ${now} µg/m³, the lowest band the service uses. That is relative, not a guarantee. If anyone at home reacts to smoke, keep windows closed.`,
      compare,
      betterAt,
      compareLine,
    };
  }

  if (band.key === 'moderate') {
    return betterAt
      ? {
          tone: 'caution',
          icon: 'caution',
          headline: 'Conditions may be comparatively better later.',
          lead: `The ${betterAt.label.toLowerCase()} forecast is ${betterAt.value} µg/m³, against ${now} now. ${stillPolluted}`,
          compare,
          betterAt,
          compareLine,
        }
      : {
          tone: 'caution',
          icon: 'caution',
          headline: 'Air is polluted, but not at its worst.',
          lead: `PM2.5 is ${now} µg/m³. If you air the house, keep it short, and keep windows closed if anyone at home is sensitive to smoke.`,
          compare,
          betterAt,
          compareLine,
        };
  }

  // very poor / severe: safety first, then the forecast as context.
  const lead = betterAt
    ? `PM2.5 is ${now} µg/m³. A forecast point looks lower: ${betterAt.label.toLowerCase()} at ${betterAt.value} µg/m³. ${stillPolluted}`
    : compare === 'unavailable'
      ? `PM2.5 is ${now} µg/m³, and we have no forecast points for this spot.`
      : `PM2.5 is ${now} µg/m³, and neither forecast point is clearly lower. No clear improvement is forecast.`;
  return {
    tone: 'serious',
    icon: 'closed',
    headline: 'Keep windows closed for now.',
    lead,
    compare,
    betterAt,
    compareLine,
  };
}
