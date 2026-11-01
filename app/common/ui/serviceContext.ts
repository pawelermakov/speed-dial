import { inject, type App, type InjectionKey } from 'vue';
export function createServiceContext<T>(name: string) {
  const key: InjectionKey<T> = Symbol(name);
  return {
    provide(app: App, service: T) {
      app.provide(key, service);
    },
    use(): T {
      const service = inject(key, undefined);
      if (service === undefined) throw new Error(name + ' services were not provided');
      return service;
    },
  };
}
