import assert from 'node:assert/strict';

// Shared assertions use the same DOM queries in both real extension pages.
// Actions stay in the native browser driver; missing/ambiguous targets always fail.
export function uiAssertions({ evaluate, poll, movePointer }) {
  const node = (selector, fn, arg, optional = false) =>
    evaluate(
      new Function(
        'payload',
        `
    const query = typeof payload.selector === 'string' ? { selector: payload.selector } : payload.selector;
    const rows = document.querySelectorAll(query.selector);
    const element = Number.isSafeInteger(query.index) ? rows[query.index] : rows.length === 1 ? rows[0] : null;
    if (!rows.length && payload.optional) return { found: false };
    if (!element) throw Error('Expected one target for '+JSON.stringify(query)+', found '+rows.length);
    const value = (${fn.toString()})(element, payload.arg);
    return payload.optional ? { found: true, value } : value;
  `,
      ),
      { selector, arg, optional },
    );
  const probe = (selector, fn, arg) => node(selector, fn, arg, true);
  const css = (selector, property, expected) =>
    poll(() =>
      probe(selector, (e, property) => getComputedStyle(e).getPropertyValue(property), property),
    ).toEqual({ found: true, value: expected });
  const attribute = (selector, name, expected) =>
    poll(() => probe(selector, (e, name) => e.getAttribute(name), name)).toEqual({
      found: true,
      value: expected,
    });
  const count = (selector, expected) =>
    poll(() => evaluate((s) => document.querySelectorAll(s).length, selector)).toBe(expected);
  const focused = (selector) =>
    poll(() => probe(selector, (e) => document.activeElement === e)).toEqual({
      found: true,
      value: true,
    });
  const focus = (selector) =>
    node(selector, (e) => {
      e.focus();
    });
  const value = (selector, expected) =>
    poll(() => probe(selector, (e) => e.value)).toEqual({ found: true, value: expected });
  const text = (selector, expected) =>
    poll(() => probe(selector, (e) => e.textContent.replace(/\s+/g, ' ').trim())).toEqual({
      found: true,
      value: expected,
    });
  const select = async (selector, value) => {
    assert.equal(typeof value, 'string');
    await poll(() =>
      probe(selector, (e, value) => [...e.options].some((option) => option.value === value), value),
    ).toEqual({ found: true, value: true });
    await node(
      selector,
      (e, value) => {
        if (![...e.options].some((option) => option.value === value))
          throw Error('Missing option: ' + value);
        e.value = value;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      },
      value,
    );
  };
  const visible = (selector) =>
    poll(() =>
      probe(selector, (e) => {
        const style = getComputedStyle(e),
          rect = e.getBoundingClientRect();
        return style.visibility === 'visible' && rect.width > 0 && rect.height > 0;
      }),
    ).toEqual({ found: true, value: true });
  const hidden = (selector) =>
    poll(async () => {
      const result = await probe(selector, (e) => {
        const r = e.getBoundingClientRect();
        return getComputedStyle(e).visibility === 'visible' && r.width > 0 && r.height > 0;
      });
      return !result.found || !result.value;
    }).toBe(true);
  const checked = (selector, expected = true) =>
    poll(() => probe(selector, (e) => e.checked)).toEqual({ found: true, value: expected });
  const disabled = (selector, expected = true) =>
    poll(() => probe(selector, (e) => e.matches(':disabled'))).toEqual({
      found: true,
      value: expected,
    });
  const containsText = (selector, expected) =>
    poll(async () => {
      const result = await probe(selector, (e) => e.textContent.replace(/\s+/g, ' ').trim());
      return result.found && result.value.includes(expected);
    }).toBe(true);
  const nth = (selector, index) => {
    assert.ok(Number.isSafeInteger(index) && index >= 0);
    return { selector, index };
  };
  const rect = (selector) =>
    node(selector, (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
  const scroll = async (selector) => {
    await node(selector, (e) => e.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    let previous;
    await poll(async () => {
      const current = JSON.stringify(await rect(selector));
      const stable = current === previous;
      previous = current;
      return stable;
    }).toBe(true);
  };
  const hover = async (selector) => {
    await scroll(selector);
    const r = await rect(selector);
    await movePointer(Math.floor(r.x + r.width / 2), Math.floor(r.y + r.height / 2));
  };
  const byText = async (selector, name) => {
    const token = crypto.randomUUID();
    await poll(() =>
      evaluate(
        ({ selector, name, token }) => {
          const normalize = (text) => text.replace(/\s+/g, ' ').trim();
          const rows = [...document.querySelectorAll(selector)].filter((e) => {
            const r = e.getBoundingClientRect();
            return (
              r.width > 0 &&
              r.height > 0 &&
              getComputedStyle(e).visibility === 'visible' &&
              normalize(e.getAttribute('aria-label') ?? e.textContent) === name
            );
          });
          if (rows.length > 1)
            throw Error('Expected one ' + selector + ' named ' + name + ', found ' + rows.length);
          if (!rows.length) return false;
          rows[0].setAttribute('data-parity-target', token);
          return true;
        },
        { selector, name, token },
      ),
    ).toBe(true);
    return `[data-parity-target="${token}"]`;
  };
  return {
    node,
    css,
    attribute,
    count,
    focused,
    focus,
    value,
    text,
    select,
    visible,
    hidden,
    checked,
    disabled,
    containsText,
    nth,
    rect,
    scroll,
    hover,
    byText,
  };
}
