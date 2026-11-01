import { LocalizedError } from '../../../../common/i18n/errors';
import type { MessageText } from '../../../../common/i18n/contracts';
export class MailError extends LocalizedError {
  constructor(
    readonly kind: 'unauthenticated' | 'error' | 'unsupported',
    detail: MessageText,
  ) {
    super(detail);
    this.name = 'MailError';
  }
}
