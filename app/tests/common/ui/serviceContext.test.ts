import { describe, expect, it } from 'vitest';
import { createApp } from 'vue';
import { createServiceContext } from '../../../common/ui/serviceContext';
describe('feature service scopes', () => {
  it('isolates tabs and independent feature keys even when their labels match', () => {
    const first = createApp({ render: () => null }),
      second = createApp({ render: () => null });
    const a = createServiceContext<{ id: string }>('feature');
    const b = createServiceContext<{ id: string }>('feature');
    const one = { id: 'first' },
      two = { id: 'second' };
    a.provide(first, one);
    a.provide(second, two);
    b.provide(first, { id: 'other-feature' });
    expect(first.runWithContext(a.use)).toBe(one);
    expect(second.runWithContext(a.use)).toBe(two);
    expect(first.runWithContext(b.use)).toEqual({ id: 'other-feature' });
    expect(() => second.runWithContext(b.use)).toThrow('feature services were not provided');
  });
});
