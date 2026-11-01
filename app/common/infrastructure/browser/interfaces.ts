// Shared by application contexts; the implementation owns queue/lock coordination.
export interface DataLock {
  <T>(operation: () => Promise<T>): Promise<T>;
}
