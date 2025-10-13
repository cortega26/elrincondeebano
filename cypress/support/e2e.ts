/// <reference types="cypress" />

Cypress.on('window:before:load', (win) => {
  const originalError = win.console.error?.bind(win.console) ?? (() => undefined);

  win.console.error = (...args: unknown[]) => {
    const message = (args?.[0] ?? '').toString();
    if (/Failed to convert value to 'Response'|FetchEvent/i.test(message)) {
      throw new Error(`SW error still present: ${message}`);
    }

    return originalError(...args);
  };
});
