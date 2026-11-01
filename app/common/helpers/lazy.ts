// One retryable promise per application instance, with explicit ownership of loaded resources.
export function createLazyLoader<T>(load: () => Promise<T>, release?: (value: T) => void) {
  let pending: Promise<T> | undefined,
    loaded: T | undefined,
    hasLoaded = false,
    disposed = false;
  function get(): Promise<T> {
    if (disposed) return Promise.reject(new Error('Application is disposed'));
    if (!pending)
      pending = Promise.resolve()
        .then(() => {
          if (disposed) throw new Error('Application is disposed');
          return load();
        })
        .then((value) => {
          if (disposed) {
            release?.(value);
            throw new Error('Application is disposed');
          }
          loaded = value;
          hasLoaded = true;
          return value;
        })
        .catch((error) => {
          pending = undefined;
          throw error;
        });
    return pending;
  }
  return {
    get,
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = undefined;
      if (hasLoaded) {
        hasLoaded = false;
        const value = loaded;
        loaded = undefined;
        release?.(value as T);
      }
    },
  };
}
