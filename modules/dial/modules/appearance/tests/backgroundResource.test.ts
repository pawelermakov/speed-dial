import { describe, it, expect, vi } from 'vitest';
import { BackgroundResource } from '../adapters/backgroundResource';
describe('background resource lifetime', () => {
  it('keeps the URL for equivalent Blob instances and frees it only after replacement is published', async () => {
    let sequence = 0;
    const events: string[] = [],
      create = vi.fn(() => 'blob:' + String(++sequence));
    const resource = new BackgroundResource(
      async (url) => {
        events.push('publish:' + url);
      },
      async (url) => {
        events.push('ready:' + url);
      },
      create,
      (url) => events.push('revoke:' + url),
    );
    await resource.replace(new Blob(['image'], { type: 'image/png' }));
    await resource.replace(new Blob(['image'], { type: 'image/png' }));
    expect(create).toHaveBeenCalledTimes(1);
    await resource.replace(new Blob(['other'], { type: 'image/png' }));
    expect(events).toEqual([
      'ready:blob:1',
      'publish:blob:1',
      'ready:blob:2',
      'publish:blob:2',
      'revoke:blob:1',
    ]);
    await resource.replace(null);
    expect(events.slice(-2)).toEqual(['publish:', 'revoke:blob:2']);
  });
  it('does not publish stale loads or replace the old image when decoding fails', async () => {
    let sequence = 0;
    const publish = vi.fn(async () => {}),
      revoke = vi.fn(),
      create = vi.fn(() => 'blob:' + String(++sequence));
    let finish!: () => void;
    const preload = vi.fn(async () => {});
    const resource = new BackgroundResource(publish, preload, create, revoke);
    await resource.replace(new Blob(['initial']));
    preload.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = resource.replace(new Blob(['slow']));
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await resource.replace(new Blob(['latest']));
    finish();
    await pending;
    expect(publish.mock.calls).toHaveLength(2);
    expect(revoke).toHaveBeenCalledWith('blob:2');
    preload.mockRejectedValueOnce(new Error('bad image'));
    await expect(resource.replace(new Blob(['bad']))).rejects.toThrow('bad image');
    expect(revoke).not.toHaveBeenCalledWith('blob:3');
    resource.dispose();
    expect(revoke).toHaveBeenCalledWith('blob:3');
  });
});
