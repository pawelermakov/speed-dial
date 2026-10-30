import { inject, type App, type InjectionKey } from 'vue';
import type { NewtabApplication } from './createNewtabApplication';

const servicesKey: InjectionKey<NewtabApplication> = Symbol('newtab-services');
export function provideServices(app: App, services: NewtabApplication) {
  app.provide(servicesKey, services);
}
export function useServices(): NewtabApplication {
  const services = inject(servicesKey);
  if (!services) throw new Error('Newtab application services were not provided');
  return services;
}
