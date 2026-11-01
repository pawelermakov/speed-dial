import { provideMailService } from '../modules/mail/context';
import { provideSearchService } from '../modules/search/context';
import { provideSettingsServices } from '../modules/settings/context';
import { inject, type App, type InjectionKey } from 'vue';
import type { NewtabApplication } from '../adapters/createNewtabApplication';

const servicesKey: InjectionKey<NewtabApplication> = Symbol('newtab-services');
export function provideServices(app: App, services: NewtabApplication) {
  app.provide(servicesKey, services);
  provideMailService(app, services.mail);
  provideSearchService(app, services.search);
  provideSettingsServices(app, {
    source: services.bookmarks.source,
    sync: services.settings.sync,
    events: services.events,
  });
}
export function useServices(): NewtabApplication {
  const services = inject(servicesKey);
  if (!services) throw new Error('Newtab application services were not provided');
  return services;
}
