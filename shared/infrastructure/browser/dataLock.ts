import type { DataLock } from './interfaces';

// Keep one fallback queue per JS context, shared by all application instances.
let localQueue: Promise<unknown> = Promise.resolve();
export const withDataLock: DataLock = async (operation) => {
  if (navigator.locks) return navigator.locks.request('speed-dial-data', operation);
  const pending = localQueue.then(operation);
  localQueue = pending.catch(() => {});
  return pending;
};
