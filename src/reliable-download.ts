/** The deadline covers the body as well as the response headers. */
export async function download<T>(url: string, read: (response: Response) => Promise<T>, options: {
  signal?: AbortSignal; timeoutMs?: number; attempts?: number; init?: RequestInit;
} = {}): Promise<T> {
  let failure: unknown;
  for (let attempt = 0; attempt < (options.attempts ?? 3); attempt++) {
    options.signal?.throwIfAborted();
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 120_000)])
      : AbortSignal.timeout(options.timeoutMs ?? 120_000);
    try {
      const response = await fetch(url, { ...options.init, signal });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Download HTTP ${response.status}`);
      }
      return await read(response);
    } catch (error) {
      options.signal?.throwIfAborted();
      failure = error;
    }
  }
  throw failure;
}
export async function withDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Operation timed out")), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

