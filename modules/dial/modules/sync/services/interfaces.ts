// Preserve the existing wire contract until message validation is migrated in stage 4.
export interface SyncClient {
  (action: string, value?: unknown): Promise<void>;
}
