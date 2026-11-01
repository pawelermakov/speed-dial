import type { MailProvider } from '../entities/models';
import { abortable } from '../../../common/helpers/abortable';
import type { IMailService, MailServicePorts } from './interfaces';
export type { MailReaders } from './interfaces';
export class MailService implements IMailService {
  private readonly lifetime = new AbortController();
  constructor(private readonly ports: MailServicePorts) {}

  errorStatus = (cause: unknown) => this.ports.errorStatus(cause);
  unread = (provider: MailProvider, cancellation: AbortSignal): Promise<number> => {
    const signal = AbortSignal.any([cancellation, this.lifetime.signal, AbortSignal.timeout(8000)]);
    return abortable(signal, () => this.ports.readers[provider](signal));
  };
  dispose = () => this.lifetime.abort(new DOMException('Mail service is disposed', 'AbortError'));
}
