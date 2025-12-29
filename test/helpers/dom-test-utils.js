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

function teardownDom() {
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  delete global.location;
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
  teardownDom,
  wait,
  waitImmediate,
  dispatchPointerDown,
  dispatchClick,
};
