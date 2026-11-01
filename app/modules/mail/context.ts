import { createServiceContext } from '../../common/ui/serviceContext';
import type { IMailService } from './services/interfaces';
export const { provide: provideMailService, use: useMailService } =
  createServiceContext<IMailService>('mail');
