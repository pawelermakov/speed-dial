import assert from 'node:assert/strict';
import { runSharedScenario } from '../../browser/helpers/extension-driver.mjs';

await runSharedScenario(
  'glass-motion',
  async (browser, { evaluate, poll, ready, click, clickAt, media, caseDone }) => {
    await ready();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const sample = async (selector, action) =>
      evaluate(
        async ({ selector, action }) => {
          window.motionSamples = [];
          const start = performance.now();
          const frame = () => {
            const e = document.querySelector(selector);
            if (e) {
              const s = getComputedStyle(e);
              let p = e.parentElement,
                ancestors = [];
              while (p) {
                ancestors.push(getComputedStyle(p).opacity);
                p = p.parentElement;
              }
              window.motionSamples.push({
                opacity: s.opacity,
                transform: s.transform,
                blur: s.backdropFilter,
                ancestors,
              });
            }
            if (performance.now() - start < 500) requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
          if (action === 'close')
            document
              .querySelector(selector)
              .closest('dialog,.settings-overlay')
              .querySelector('button[aria-label^="Закрыть"]')
              .click();
          else if (action === 'settings')
            document.querySelector('button[aria-label="Настройки"]').click();
          else if (action === 'modal') document.querySelector('[role="menuitem"]').click();
          else
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await new Promise((r) => setTimeout(r, 550));
          return window.motionSamples;
        },
        { selector, action },
      );
    const verify = (rows, label) => {
      assert(rows.length > 2, label + ' must sample animation');
      assert(
        rows.some((row) => Number(row.opacity) < 1 || row.transform !== 'none'),
        label + ' must include intermediate frames',
      );
      for (const row of rows) {
        assert(
          row.ancestors.every((x) => x === '1'),
          label + ' must not fade glass ancestors',
        );
        assert.equal(row.blur, 'blur(12px) saturate(1.6)', label + ' blur must remain stable');
      }
    };

    verify(await sample('.settings', 'settings'), 'settings enter');
    caseDone('settings-enter');
    verify(await sample('.settings', 'close'), 'settings leave');
    await poll(() => evaluate(() => document.querySelectorAll('.settings').length)).toBe(0);
    caseDone('settings-leave');
    await clickAt(2, 790, { button: 'right' });
    await poll(() =>
      evaluate(() => {
        const e = document.querySelector('[role="menu"]');
        return (
          !!e && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility === 'visible'
        );
      }),
    ).toBe(true);
    verify(await sample('.modal', 'modal'), 'modal enter');
    caseDone('modal-enter');
    verify(await sample('.modal', 'close'), 'modal leave');
    await poll(() => evaluate(() => document.querySelectorAll('dialog').length)).toBe(0);
    caseDone('modal-leave');
    await media({ reducedMotion: 'reduce' });
    await click('button[aria-label="Настройки"]');
    await poll(() =>
      evaluate(() => {
        const e = document.querySelector('.settings');
        return e ? getComputedStyle(e).transitionDuration : null;
      }),
    ).toBe('0s');
    await click('button[aria-label="Закрыть настройки"]');
    await poll(() => evaluate(() => document.querySelectorAll('.settings').length)).toBe(0);
    caseDone('reduced-motion');
    console.log(
      'PASS ' +
        browser +
        ' glass motion: stable blur and opaque ancestors throughout modal/settings enter and leave; reduced motion',
    );
  },
);
