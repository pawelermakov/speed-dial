import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { getURL: () => 'chrome-extension://test/newtab.html' },
    tabs: { query: async () => [] },
  },
}));
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('BROWSER', 'chrome');
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ close: vi.fn() })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('local favicon retrieval', () => {
  it('accepts Chrome PNG without MIME and excludes the browser placeholder', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(png))
        .mockResolvedValueOnce(new Response(new Uint8Array([2]))),
    );
    const { faviconBlob } = await import('../services/favicons');
    expect((await faviconBlob('https://example.com/'))?.type).toBe('image/png');
  });
  it('does not cache a default browser icon as a site icon', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('chrome-extension:') ? new Response(png) : new Response('', { status: 404 }),
      ),
    );
    const { faviconBlob } = await import('../services/favicons');
    expect(await faviconBlob('https://example.com/')).toBeNull();
  });
  it('retrieves a site icon when Chrome only has its generic placeholder', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith('chrome-extension:')
        ? new Response(png)
        : new Response(png, { headers: { 'Content-Type': 'image/png' } }),
    );
    vi.stubGlobal('fetch', fetch);
    const { faviconBlob } = await import('../services/favicons');
    expect((await faviconBlob('https://youtube.com/watch?v=example'))?.type).toBe('image/png');
    expect(fetch).toHaveBeenCalledWith(
      'https://youtube.com/favicon.ico',
      expect.objectContaining({ credentials: 'omit' }),
    );
  });
  it('degrades on endpoint failure or unsafe MIME', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } })),
    );
    const { faviconBlob } = await import('../services/favicons');
    expect(await faviconBlob('https://example.com/')).toBeNull();
  });
  it('Firefox retrieves a site icon when no tab has favicon metadata', async () => {
    vi.stubEnv('BROWSER', 'firefox');
    const fetch = vi.fn(
      async () => new Response(png, { headers: { 'Content-Type': 'image/png' } }),
    );
    vi.stubGlobal('fetch', fetch);
    const { faviconBlob } = await import('../services/favicons');
    expect((await faviconBlob('https://ya.ru/search'))?.type).toBe('image/png');
    expect(fetch).toHaveBeenCalledWith(
      'https://ya.ru/favicon.ico',
      expect.objectContaining({ credentials: 'omit' }),
    );
  });
  it('Firefox accepts validated tab icon data but does not fetch unrelated origins or SVG', async () => {
    vi.stubEnv('BROWSER', 'firefox');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { faviconBlob } = await import('../services/favicons');
    expect(await faviconBlob('https://example.com/', 'data:image/png;base64,YQ==')).toBeTruthy();
    expect(
      await faviconBlob('https://example.com/', 'https://third-party.example/icon.png'),
    ).toBeNull();
    expect(
      await faviconBlob('https://example.com/', 'data:image/svg+xml;base64,PHN2Zz4='),
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
