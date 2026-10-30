import type { SettingsEnvelope } from '../entities/models';

export interface SettingsPort {
  getValue(): Promise<SettingsEnvelope | null>;
  setValue(value: SettingsEnvelope, replace?: boolean): Promise<void>;
  watch?(callback: (value: SettingsEnvelope | null) => void): () => void;
}
