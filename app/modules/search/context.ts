import { createServiceContext } from '../../common/ui/serviceContext';
import type { ISearchService } from './services/interfaces';
export const { provide: provideSearchService, use: useSearchService } =
  createServiceContext<ISearchService>('search');
