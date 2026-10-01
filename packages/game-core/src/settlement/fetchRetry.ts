/**
 * Bounded retry for the settlement layer's one-shot loads (16k walk 7: on a
 * phone, one dropped request left "settlement kit works-v1 failed: failed to
 * fetch" and no buildings anywhere until a reload). A network error, a 5xx,
 * 408 or 429 is tried again after a doubling delay; a 404 or any other 4xx is
 * the data's fault and fails at once. Stateless: no shared queue or cache.
 */

export interface RetryOptions {
  /** Attempts in all, the first included. */
  readonly attempts?: number;
  /** Wait before the second attempt, ms; doubles each time. */
  readonly baseDelayMs?: number;
  /** Injected for tests. */
  readonly pause?: (ms: number) => Promise<void>;
}

const RETRY_STATUS = (status: number) => status >= 500 || status === 408 || status === 429;

/** An HTTP answer that retrying cannot change. */
export class PermanentFetchError extends Error {}

/** Every attempt failed on the way (network, 5xx): worth asking again later. */
export class TransientFetchError extends Error {}

const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/** Runs `attempt` until it resolves, it throws a `PermanentFetchError`, or the attempts run out. */
export async function withRetry<T>(attempt: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 4);
  const pause = options.pause ?? wait;
  let delay = options.baseDelayMs ?? 400;
  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (error: unknown) {
      if (error instanceof PermanentFetchError) throw error;
      if (n >= attempts) {
        const message = error instanceof Error ? error.message : String(error);
        throw new TransientFetchError(`${message} (after ${attempts} attempts)`, { cause: error });
      }
      await pause(delay);
      delay *= 2;
    }
  }
}

/** `fetch` with `withRetry`: resolves to an ok response, else throws. */
export function fetchWithRetry(url: string, options: RetryOptions & { readonly fetchFn?: typeof fetch } = {}):
  Promise<Response> {
  const fetchFn = options.fetchFn ?? fetch;
  return withRetry(async () => {
    const response = await fetchFn(url);
    if (response.ok) return response;
    const message = `${url} returned HTTP ${response.status}`;
    throw RETRY_STATUS(response.status) ? new Error(message) : new PermanentFetchError(message);
  }, options);
}

/** `fetchWithRetry`, parsed as JSON. */
export async function fetchJsonWithRetry(url: string, options?: RetryOptions): Promise<unknown> {
  return (await fetchWithRetry(url, options)).json();
}
