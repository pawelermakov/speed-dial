import type { Settings } from '../entities/models';
import type { SettingsEnvelope } from '../entities/models';

export interface SettingsPort {
  getValue(): Promise<SettingsEnvelope | null>;
  setValue(value: SettingsEnvelope, replace?: boolean): Promise<void>;
  watch?(callback: (value: SettingsEnvelope | null) => void): () => void;
}

// Called after local save; never awaited while the data lock is held.
export interface SettingsChangeSink {
  (patch: Partial<Settings>): void;
}
