import { SearchService } from './services/suggestions';
import type { Translator } from '../../common/i18n/formatMessage';
import { LocalizedError } from '../../common/i18n/errors';
import { createLazyLoader } from '../../common/helpers/lazy';
import { SearchApi } from './adapters/api';
export function New({ translate: t }: { translate: Translator }) {
  const network = createLazyLoader(async () => {
    const { createKinopoiskNetwork } = await import('./adapters/api/kinopoiskNetwork');
    return createKinopoiskNetwork();
  });
  return new SearchService(
    {
      api: new SearchApi(t, async () => {
        const prepare = await network.get();
        await prepare();
      }),
      error: (message) => new LocalizedError(message),
    },
    network.dispose,
  );
}

export * from './entities';
export * from './services';
