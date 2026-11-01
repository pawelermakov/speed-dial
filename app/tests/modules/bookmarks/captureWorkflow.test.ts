import { describe, expect, it, vi } from 'vitest';
import { BookmarkCaptureService } from '../../../modules/bookmarks/services/capture';
import type {
  IBookmarkActions,
  CaptureResult,
} from '../../../modules/bookmarks/services/interfaces';

function fixture() {
  const expected = { id: '1', title: 'Original', url: 'https://example.com' };
  const source = { bookmark: vi.fn().mockResolvedValue(expected) };
  const actions: Pick<IBookmarkActions, 'autoNameTicket' | 'cache' | 'applyCapturedTitle'> = {
    autoNameTicket: vi.fn(),
    cache: vi.fn(),
    applyCapturedTitle: vi.fn().mockResolvedValue(undefined),
  };
  const request = vi.fn<(url: string) => Promise<CaptureResult>>();
  const client = { requestThumbnail: request, dispose: vi.fn() };
  const faviconBlob = vi.fn().mockResolvedValue(new Blob(['icon']));
  const completion = { refresh: vi.fn(), announce: vi.fn() };
  const service = new BookmarkCaptureService({
    source,
    actions,
    client,
    faviconBlob,
    error: () => new Error('URL changed'),
  });
  return { service, source, actions, request, client, faviconBlob, completion, expected };
}

describe('capture service', () => {
  it('uses the source and actions directly while preserving their method receivers', async () => {
    const { service, source, actions, request, faviconBlob, completion, expected } = fixture();
    source.bookmark.mockImplementation(async function (this: typeof source) {
      expect(this).toBe(source);
      return expected;
    });
    vi.mocked(actions.cache).mockImplementation(async function (this: typeof actions) {
      expect(this).toBe(actions);
    });
    request.mockResolvedValue({ title: 'Captured', favicon: '', thumbnail: new Blob(['image']) });
    faviconBlob.mockResolvedValue(null);
    await service.updateImages('1', expected.url, completion);
    expect(actions.cache).toHaveBeenCalledWith(
      '1',
      expected.url,
      'thumbnail',
      expect.any(Blob),
      expected,
    );
    expect(completion.refresh).toHaveBeenCalledTimes(1);
    expect(completion.announce).toHaveBeenCalledTimes(1);
  });
  it('publishes the fallback icon before reporting a failed capture', async () => {
    const { service, actions, request, completion, expected } = fixture();
    const failure = new Error('capture failed');
    request.mockRejectedValue(failure);
    await expect(service.updateImages('1', expected.url, completion)).rejects.toBe(failure);
    expect(actions.cache).toHaveBeenCalledWith(
      '1',
      expected.url,
      'favicon',
      expect.any(Blob),
      expected,
    );
    expect(completion.refresh).toHaveBeenCalledTimes(1);
    expect(completion.announce).toHaveBeenCalledTimes(1);
    expect(actions.applyCapturedTitle).not.toHaveBeenCalled();
  });

  it('does not write or publish a result received after disposal', async () => {
    const { service, actions, request, faviconBlob, completion, expected } = fixture();
    let finish!: (value: CaptureResult) => void;
    request.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    faviconBlob.mockResolvedValue(null);
    const operation = service.updateImages('1', expected.url, completion);
    const cancelled = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    service.dispose();
    finish({ title: 'Late', favicon: '', thumbnail: new Blob(['image']) });
    await cancelled;
    expect(actions.cache).not.toHaveBeenCalled();
    expect(actions.applyCapturedTitle).not.toHaveBeenCalled();
    expect(completion.refresh).not.toHaveBeenCalled();
    expect(completion.announce).not.toHaveBeenCalled();
  });

  it('prepares the bookmark itself and rejects changed URLs before issuing requests', async () => {
    const { service, request, faviconBlob, completion } = fixture();
    await expect(service.updateImages('1', 'https://changed.example', completion)).rejects.toThrow(
      'URL changed',
    );
    expect(request).not.toHaveBeenCalled();
    expect(faviconBlob).not.toHaveBeenCalled();
  });

  it('does not start capture if disposed while preparing the bookmark', async () => {
    const { service, actions, request, client, completion, expected } = fixture();
    let finish!: () => void;
    vi.mocked(actions.autoNameTicket).mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve(undefined);
      }),
    );
    const operation = service.updateImages('1', expected.url, completion);
    const cancelled = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    service.dispose();
    service.dispose();
    finish();
    await cancelled;
    await expect(service.updateImages('1', expected.url, completion)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(request).not.toHaveBeenCalled();
    expect(client.dispose).toHaveBeenCalledTimes(1);
  });
});
