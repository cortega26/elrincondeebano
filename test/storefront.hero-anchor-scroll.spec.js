import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { scrollToHashTarget } from '../astro-poc/src/scripts/storefront/hero-anchor-scroll.js';

function setupDom() {
  const dom = new JSDOM(
    `<!DOCTYPE html>
    <html>
      <body>
        <main>
          <section>
            <h2 id="home-bundles-heading">Combos listos</h2>
          </section>
        </main>
      </body>
    </html>`,
    {
      url: 'http://localhost/',
    }
  );

  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;

  return dom;
}

afterEach(() => {
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  vi.restoreAllMocks();
});

describe('scrollToHashTarget', () => {
  it('forces an instant hash jump without leaving smooth scroll enabled', () => {
    setupDom();
    const heading = document.getElementById('home-bundles-heading');
    heading.getBoundingClientRect = () => ({ top: 640 });

    document.documentElement.style.scrollBehavior = 'smooth';
    document.body.style.scrollBehavior = 'smooth';

    Object.defineProperty(window, 'scrollY', {
      value: 80,
      configurable: true,
    });

    const scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy;
    window.getComputedStyle = vi.fn(() => ({ scrollPaddingTop: '56px' }));
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const onBeforeScroll = vi.fn();
    const onAfterScroll = vi.fn();

    const handled = scrollToHashTarget({
      href: '#home-bundles-heading',
      documentRef: document,
      scrollRoot: window,
      onBeforeScroll,
      onAfterScroll,
    });

    expect(handled).toBe(true);
    expect(onBeforeScroll).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 664);
    expect(pushStateSpy).toHaveBeenCalledWith(window.history.state, '', '#home-bundles-heading');
    expect(window.location.hash).toBe('#home-bundles-heading');
    expect(onAfterScroll).toHaveBeenCalledTimes(1);
    expect(document.documentElement.style.scrollBehavior).toBe('smooth');
    expect(document.body.style.scrollBehavior).toBe('smooth');
  });

  it('skips non-hash destinations without touching pagination state', () => {
    setupDom();
    const onBeforeScroll = vi.fn();
    const onAfterScroll = vi.fn();

    const handled = scrollToHashTarget({
      href: '/catalogo',
      documentRef: document,
      scrollRoot: window,
      onBeforeScroll,
      onAfterScroll,
    });

    expect(handled).toBe(false);
    expect(onBeforeScroll).not.toHaveBeenCalled();
    expect(onAfterScroll).not.toHaveBeenCalled();
  });
});
