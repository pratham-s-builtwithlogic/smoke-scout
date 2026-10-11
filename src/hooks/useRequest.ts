import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/types';

export type ReqState<T> =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'success'; data: T; receivedAt: Date }
  | { phase: 'error'; error: ApiError };

function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  return new ApiError('network', e instanceof Error ? e.message : undefined);
}

/** Runs one request at a time; a newer call (or reset) cancels the previous one. */
export function useRequest<T>() {
  const [state, setState] = useState<ReqState<T>>({ phase: 'idle' });
  const ctl = useRef<AbortController | null>(null);

  const run = useCallback(async (fn: (signal: AbortSignal) => Promise<T>) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setState({ phase: 'loading' });
    try {
      const data = await fn(c.signal);
      if (!c.signal.aborted) setState({ phase: 'success', data, receivedAt: new Date() });
    } catch (e) {
      if (c.signal.aborted) return;
      setState({ phase: 'error', error: toApiError(e) });
    }
  }, []);

  const reset = useCallback(() => {
    ctl.current?.abort();
    setState({ phase: 'idle' });
  }, []);

  useEffect(() => () => ctl.current?.abort(), []);

  return { state, run, reset };
}
