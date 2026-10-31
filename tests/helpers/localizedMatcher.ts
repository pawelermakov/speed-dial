import { expect } from 'vitest';
import { errorMessage } from '../../shared/i18n/errors';
import { formatMessage } from './i18n';

declare module 'vitest' {
  interface Matchers<T> {
    toThrowLocalized(expected: string | RegExp): T;
  }
}
// Assert visible error text explicitly, without coupling diagnostics to a locale.
expect.extend({
  toThrowLocalized(received: unknown, expected: string | RegExp) {
    let error: unknown,
      thrown = false;
    if (typeof received === 'function') {
      try {
        received();
      } catch (cause) {
        error = cause;
        thrown = true;
      }
    } else {
      error = received;
      thrown = true;
    }
    const actual = thrown ? formatMessage(errorMessage(error)) : '';
    const matches =
      typeof expected === 'string'
        ? actual.includes(expected)
        : new RegExp(expected.source, expected.flags).test(actual);
    return {
      pass: thrown && matches,
      message: () =>
        `Expected localized error ${String(expected)}; received ${thrown ? JSON.stringify(actual) : 'no error'}`,
    };
  },
});
