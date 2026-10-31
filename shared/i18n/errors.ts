import type { MessageText } from './contracts';

// Error diagnostics are locale-independent. UI renders the serializable DTO.
export class LocalizedError extends Error {
  constructor(readonly localized: MessageText) {
    super(
      typeof localized === 'string'
        ? localized
        : 'key' in localized
          ? localized.key
          : 'Message list',
    );
    this.name = 'LocalizedError';
  }
}
export function errorMessage(error: unknown): MessageText {
  return error instanceof LocalizedError
    ? error.localized
    : error instanceof Error
      ? error.message
      : String(error);
}
