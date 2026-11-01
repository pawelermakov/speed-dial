export interface UpdateMessage {
  type: 'updated';
  assets?: boolean;
  background?: boolean;
}

// The legacy string is still accepted by existing tabs during the migration.
export type DialUpdate = UpdateMessage | 'updated';

export interface UpdatesPort {
  publish(message: UpdateMessage): void;
  subscribe(listener: (message: DialUpdate) => void): () => void;
  dispose(): void;
}
