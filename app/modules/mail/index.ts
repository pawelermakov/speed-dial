import { MailService } from './services/counter';
import type { MailServicePorts } from './services/interfaces';
import { MailApi } from './adapters/api';
export function New(ports: MailServicePorts = new MailApi()) {
  return new MailService(ports);
}

export * from './entities';
export * from './services';
