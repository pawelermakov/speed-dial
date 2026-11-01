import { browser } from 'wxt/browser';

// Only requests from this extension to the public SuggestSearch endpoint.
export function kinopoiskOriginRule(extensionUrl: string) {
  return {
    id: 1001,
    priority: 1,
    action: {
      type: 'modifyHeaders' as const,
      requestHeaders: [
        { header: 'Origin', operation: 'set' as const, value: 'https://www.kinopoisk.ru' },
      ],
    },
    condition: {
      regexFilter: '^https://graphql\\.kinopoisk\\.ru/graphql/\\?operationName=SuggestSearch$',
      initiatorDomains: [new URL(extensionUrl).hostname],
      requestMethods: ['post' as const],
      resourceTypes: ['xmlhttprequest' as const],
    },
  };
}

export function createKinopoiskNetwork() {
  let ready: Promise<void> | undefined;
  function prepareKinopoiskNetwork(): Promise<void> {
    return (ready ??= browser.declarativeNetRequest
      .updateSessionRules({
        removeRuleIds: [1001],
        addRules: [kinopoiskOriginRule(browser.runtime.getURL('/'))],
      })
      .catch((error) => {
        ready = undefined;
        throw error;
      }));
  }

  return prepareKinopoiskNetwork;
}
// Compatibility setup; production owns its initializer per application.
export const prepareKinopoiskNetwork = createKinopoiskNetwork();
