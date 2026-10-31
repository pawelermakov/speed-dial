import { describe, it, expect, vi, afterEach } from 'vitest';
import { defaults } from '../../../../../types/models';
import { validateSettings } from '../../../../../services/validation';
import { validSetting, syncPatch } from '../../../../../services/settingsSchema';
import { mailEnabled, mailTooltip } from '../helpers/presentation';
import { parseYandexMailCount, parseMailCount, MailError } from '../adapters/counters';
import { createMailModule } from '../newtab';
const unreadProvider = createMailModule().unread;
const unreadMail = (signal: AbortSignal) => unreadProvider('mailru', signal);
afterEach(() => vi.unstubAllGlobals());
describe('mail indicators', () => {
  it('shows only explicitly enabled services', () => {
    for (const id of ['mailru', 'gmail', 'yandex'] as const)
      expect(mailEnabled(defaults, id)).toBe(false);
    expect(mailEnabled({ ...defaults, mailruEnabled: true }, 'mailru')).toBe(true);
  });
  it('validates and preserves only provider preferences across JSON and sync', () => {
    const settings = validateSettings({
      ...defaults,
      mailruEnabled: false,
      gmailEnabled: true,
      yandexMailEnabled: true,
    });
    expect(validateSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
    for (const v of [true, false]) expect(validSetting('mailruEnabled', v)).toBe(true);
    for (const v of [null, 'true', 1, {}, []]) {
      expect(() => validateSettings({ mailruEnabled: v })).toThrow();
      expect(validSetting('mailruEnabled', v)).toBe(false);
    }
    for (const key of ['gmailEnabled', 'yandexMailEnabled'])
      for (const v of [null, 'true', 1]) expect(() => validateSettings({ [key]: v })).toThrow();
    expect(() => validateSettings({ email: 'removed@mail.ru' })).toThrow();
    expect(
      syncPatch({
        'settings.v1.mailruEnabled': false,
        'settings.v1.gmailEnabled': true,
        'settings.v1.yandexMailEnabled': true,
      }),
    ).toEqual({ mailruEnabled: false, gmailEnabled: true, yandexMailEnabled: true });
  });
  it('never duplicates count in a successful tooltip and distinguishes failures', () => {
    expect(mailTooltip('Mail.ru', 'ready')).toBe('Mail.ru');
    expect(mailTooltip('Gmail', 'unauthenticated')).toBe('Войдите в Gmail');
    expect(mailTooltip('Mail.ru', 'error')).toBe('Не удалось проверить почту · Mail.ru');
    expect(mailTooltip('Gmail', 'unsupported')).toBe('Счётчик недоступен · Gmail');
  });
  it('keeps the verified endpoint and session credentials with cancellation and no redirects', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: { mail_cnt: '105' } })));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    expect(await unreadMail(controller.signal)).toBe(105);
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe('https://portal.mail.ru/NaviData?mac=1');
    expect(options.credentials).toBe('include');
    expect(options.redirect).toBe('error');
    controller.abort();
    expect(options.signal.aborted).toBe(true);
  });
  it('classifies only explicit noauth/401 as signed out, rejects network/server/login markup', async () => {
    expect(() => parseMailCount({ status: 'noauth', data: { mail_cnt: 0 } })).toThrow(MailError);
    expect(() => parseMailCount({ status: 'error', data: { mail_cnt: 0 } })).toThrow(MailError);
    for (const status of [401, 403, 500]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
      await expect(unreadMail(new AbortController().signal)).rejects.toMatchObject({
        kind: status === 401 ? 'unauthenticated' : 'error',
      });
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html><script>throw 1</script>Login</html>')),
    );
    await expect(unreadMail(new AbortController().signal)).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(unreadMail(new AbortController().signal)).rejects.toThrow('offline');
  });
});

describe('session-backed counters', () => {
  it('uses unread rather than fresh and rejects missing/error/invalid counters', () => {
    expect(parseYandexMailCount({ counters: { unread: 12, fresh: 2 } })).toBe(12);
    expect(parseYandexMailCount({ counters: { unread: '0' } })).toBe(0);
    for (const value of [
      null,
      [],
      {},
      { counters: { fresh: 5 } },
      { error: 'failed', counters: { unread: 0 } },
      ...[-1, 1.5, null, true, '', '5x', '9007199254740992'].map((unread) => ({
        counters: { unread },
      })),
    ])
      expect(() => parseYandexMailCount(value)).toThrow();
  });
  it('requests only the known Yandex counter with browser credentials and no cached values', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ counters: { unread: 7 } })));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    expect(await unreadProvider('yandex', controller.signal)).toBe(7);
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe('https://mail.yandex.ru/api/v2/serp/counters?silent');
    expect(options).toMatchObject({
      credentials: 'include',
      cache: 'no-store',
      redirect: 'manual',
    });
    controller.abort();
    expect(options.signal.aborted).toBe(true);
  });
  it('distinguishes authentication, unavailable endpoints, network/server and redirects for both services', async () => {
    for (const provider of ['gmail', 'yandex'] as const)
      for (const status of [401, 403, 404, 410, 500, 302]) {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
        await expect(unreadProvider(provider, new AbortController().signal)).rejects.toMatchObject({
          kind:
            status === 401
              ? 'unauthenticated'
              : [404, 410].includes(status)
                ? 'unsupported'
                : 'error',
        });
      }
  });
});

describe('automatic Mail.ru account', () => {
  it('uses the returned current account, never the saved address or another signed-in account', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            data: { email: 'current+tag@mail.ru', list: ['other@mail.ru', 'current+tag@mail.ru'] },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok', data: { mail_cnt: 8 } })));
    vi.stubGlobal('fetch', fetch);
    expect(await unreadMail(new AbortController().signal)).toBe(8);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      'https://portal.mail.ru/NaviData?mac=1',
      'https://portal.mail.ru/NaviData?mac=1&Login=current%2Btag%40mail.ru',
    ]);
    expect(fetch.mock.calls[0]![1].signal).toBe(fetch.mock.calls[1]![1].signal);
  });
  it('can resolve a sole account without storing the address', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok', data: { list: ['single@mail.ru'] } })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { mail_cnt: 0 } })));
    vi.stubGlobal('fetch', fetch);
    expect(await unreadMail(new AbortController().signal)).toBe(0);
    expect(fetch.mock.calls[1]![0]).toContain('Login=single%40mail.ru');
  });
  it('never guesses a mailbox or masks a malformed counter with another account', async () => {
    for (const data of [
      { list: ['one@mail.ru', 'two@mail.ru'] },
      { list: [] },
      { email: 'bad', list: ['bad'] },
      { email: 'https://attacker.invalid/' },
      { mail_cnt: null, email: 'valid@mail.ru' },
    ]) {
      const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok', data })));
      vi.stubGlobal('fetch', fetch);
      await expect(unreadMail(new AbortController().signal)).rejects.toBeInstanceOf(MailError);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
});
