import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ updateSessionRules: vi.fn() }));
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { getURL: () => 'chrome-extension://test-extension/' },
    declarativeNetRequest: api,
  },
}));
beforeEach(() => {
  vi.resetModules();
  api.updateSessionRules.mockReset().mockResolvedValue(undefined);
});
describe('Kinopoisk Origin rule', () => {
  it('owns initialization promises per application', async () => {
    const { createKinopoiskNetwork } =
      await import('../../../modules/search/adapters/api/kinopoiskNetwork');
    const first = createKinopoiskNetwork(),
      second = createKinopoiskNetwork();
    await Promise.all([first(), first(), second()]);
    expect(api.updateSessionRules).toHaveBeenCalledTimes(2);
  });
  it('only matches this extension, POST and the exact public SuggestSearch endpoint', async () => {
    const { kinopoiskOriginRule } =
      await import('../../../modules/search/adapters/api/kinopoiskNetwork');
    const rule = kinopoiskOriginRule('moz-extension://test-uuid/');
    expect(rule.condition.initiatorDomains).toEqual(['test-uuid']);
    expect(rule.condition.requestMethods).toEqual(['post']);
    expect(rule.condition.resourceTypes).toEqual(['xmlhttprequest']);
    const pattern = new RegExp(rule.condition.regexFilter);
    expect(pattern.test('https://graphql.kinopoisk.ru/graphql/?operationName=SuggestSearch')).toBe(
      true,
    );
    for (const url of [
      'https://evil.example/graphql/?operationName=SuggestSearch',
      'https://graphqlXkinopoiskXru/graphql/?operationName=SuggestSearch',
      'https://graphql.kinopoisk.ru/graphql/?operationName=Other',
      'https://graphql.kinopoisk.ru/graphql/?operationName=SuggestSearch&other=1',
    ])
      expect(pattern.test(url)).toBe(false);
    expect(rule.action.requestHeaders).toEqual([
      { header: 'Origin', operation: 'set', value: 'https://www.kinopoisk.ru' },
    ]);
  });
  it('waits for installation, shares concurrent setup and retries after failure', async () => {
    const { prepareKinopoiskNetwork } =
      await import('../../../modules/search/adapters/api/kinopoiskNetwork');
    api.updateSessionRules.mockRejectedValueOnce(new Error('permission denied'));
    await expect(prepareKinopoiskNetwork()).rejects.toThrowLocalized('permission denied');
    await Promise.all([prepareKinopoiskNetwork(), prepareKinopoiskNetwork()]);
    expect(api.updateSessionRules).toHaveBeenCalledTimes(2);
    expect(api.updateSessionRules.mock.calls[1]?.[0]).toMatchObject({
      removeRuleIds: [1001],
      addRules: [{ condition: { initiatorDomains: ['test-extension'] } }],
    });
  });
});
