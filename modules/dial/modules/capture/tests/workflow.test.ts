import { describe, expect, it, vi } from 'vitest';
import { updateBookmarkImages } from '../services/workflow';
import type { CaptureWorkflowPorts } from '../services/interfaces';

function fixture() {
  const ports: CaptureWorkflowPorts = {
    bookmarks: {
      autoNameTicket: vi.fn(),
      bookmark: vi.fn(),
      cache: vi.fn(),
      applyCapturedTitle: vi.fn().mockResolvedValue(undefined),
    },
    request: vi.fn(),
    faviconBlob: vi.fn().mockResolvedValue(new Blob(['icon'])),
    active: () => true,
    refresh: vi.fn(),
    announce: vi.fn(),
  };
  const prepared = { ticket: undefined, expected: { id: '1', title: 'Original' } };
  return { ports, prepared };
}

describe('capture completion', () => {
  it('publishes the fallback icon before reporting a failed capture', async () => {
    const { ports, prepared } = fixture();
    const failure = new Error('capture failed');
    vi.mocked(ports.request).mockRejectedValue(failure);
    await expect(updateBookmarkImages(ports, '1', 'https://example.com', prepared)).rejects.toBe(
      failure,
    );
    expect(ports.bookmarks.cache).toHaveBeenCalledWith(
      '1',
      'https://example.com',
      'favicon',
      expect.any(Blob),
      prepared.expected,
    );
    expect(ports.refresh).toHaveBeenCalledTimes(1);
    expect(ports.announce).toHaveBeenCalledTimes(1);
    expect(ports.bookmarks.applyCapturedTitle).not.toHaveBeenCalled();
  });

  it('does not write or publish a result received after disposal', async () => {
    const { ports, prepared } = fixture();
    let finish!: (value: { title: string; favicon: string; thumbnail: Blob }) => void;
    vi.mocked(ports.request).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    vi.mocked(ports.faviconBlob).mockResolvedValue(null);
    const operation = updateBookmarkImages(ports, '1', 'https://example.com', prepared);
    ports.active = () => false;
    finish({ title: 'Late', favicon: '', thumbnail: new Blob(['image']) });
    await operation;
    expect(ports.bookmarks.cache).not.toHaveBeenCalled();
    expect(ports.bookmarks.applyCapturedTitle).not.toHaveBeenCalled();
    expect(ports.refresh).not.toHaveBeenCalled();
    expect(ports.announce).not.toHaveBeenCalled();
  });
});
