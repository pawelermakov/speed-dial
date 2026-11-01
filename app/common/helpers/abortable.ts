/** Reject promptly on cancellation, including when a dependency ignores its signal. */
export async function abortable<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let onAbort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([operation(), cancelled]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
