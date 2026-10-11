import { API_CONTENT_TYPE, API_URL, DEMO, REQUEST_TIMEOUT_MS } from './config';
import { demoCall } from './demo';
import { parseCitizen, parseTrace } from './parse';
import { ApiError, type CitizenAdvisory, type LatLon, type Source, type TraceResult } from './types';

interface Raw {
  raw: unknown;
  source: Source;
}

/**
 * API Gateway may hand back either:
 *  - the Lambda proxy envelope's *body* (proxy integration: status + headers + JSON string already unwrapped), or
 *  - the envelope itself as JSON ({ statusCode, headers, body: "<json string>" }) when the integration is non-proxy.
 * This accepts both.
 */
function unwrapEnvelope(json: unknown, httpStatus: number): { status: number; body: unknown } {
  if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
    const o = json as Record<string, unknown>;
    if (typeof o.statusCode === 'number' && 'body' in o) {
      let body = o.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          throw new ApiError('shape', 'Envelope body was not valid JSON', o.statusCode as number);
        }
      }
      return { status: o.statusCode as number, body };
    }
  }
  return { status: httpStatus, body: json };
}

function messageFrom(body: unknown): string | undefined {
  if (typeof body === 'object' && body !== null) {
    const o = body as Record<string, unknown>;
    if (typeof o.error === 'string') return o.error;
    if (typeof o.message === 'string') return o.message;
  }
  return undefined;
}

async function call(payload: Record<string, unknown>, signal: AbortSignal): Promise<Raw> {
  if (DEMO) return { raw: await demoCall(payload, signal), source: 'demo' };

  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, REQUEST_TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  signal.addEventListener('abort', onAbort);

  try {
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': API_CONTENT_TYPE },
        body: JSON.stringify(payload),
        signal: ctl.signal,
      });
    } catch (e) {
      if (timedOut) throw new ApiError('timeout');
      if (signal.aborted) throw e;
      throw new ApiError('network');
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError('shape', 'The response was not JSON', res.status);
    }
    const { status, body } = unwrapEnvelope(json, res.status);
    if (status >= 400) throw new ApiError('http', messageFrom(body), status);
    return { raw: body, source: 'live' };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

export async function requestCitizen(p: LatLon, signal: AbortSignal): Promise<CitizenAdvisory> {
  const { raw, source } = await call({ mode: 'citizen', lat: p.lat, lon: p.lon }, signal);
  return parseCitizen(raw, source);
}

export async function requestTrace(p: LatLon, lookbackHours: number, signal: AbortSignal): Promise<TraceResult> {
  const { raw, source } = await call(
    { mode: 'fire_trace', lat: p.lat, lon: p.lon, lookback_hours: lookbackHours },
    signal,
  );
  return parseTrace(raw, source, lookbackHours);
}
