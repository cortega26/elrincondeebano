const { JSDOM } = require('jsdom');
const { File } = require('undici');

function ensureFileGlobal() {
  if (typeof global.File === 'undefined') {
    global.File = File;
  }
}

function setupDom(markup, options = {}) {
  const dom = new JSDOM(markup, { url: 'http://localhost', ...options });
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.location = dom.window.location;
  return dom;
}

function setupAppDom(markup, options = {}) {
  const dom = setupDom(markup, options);
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;
  global.CustomEvent = dom.window.CustomEvent;
  global.MutationObserver =
    dom.window.MutationObserver ||
    class {
      observe() {}
      disconnect() {}
    };
  global.IntersectionObserver =
    dom.window.IntersectionObserver ||
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  return dom;
}

function teardownDom() {
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  delete global.location;
}

function teardownAppDom() {
  delete global.navigator;
  delete global.localStorage;
  delete global.CustomEvent;
  delete global.MutationObserver;
  delete global.IntersectionObserver;
  teardownDom();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

function dispatchPointerDown(target) {
  target.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
}

function dispatchClick(target) {
  target.dispatchEvent(new window.Event('click', { bubbles: true }));
}

module.exports = {
  ensureFileGlobal,
  setupDom,
  setupAppDom,
  teardownDom,
  teardownAppDom,
  wait,
  waitImmediate,
  dispatchPointerDown,
  dispatchClick,
};
