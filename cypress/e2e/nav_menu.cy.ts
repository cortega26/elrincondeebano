const enableServiceWorker = (win: Window) => {
  win.localStorage.setItem('ebano-sw-enable-local', 'true');
  win.localStorage.removeItem('ebano-sw-disabled');
};

describe('Nav menu regressions', () => {
  beforeEach(() => {
    cy.clearAllCookies();
    cy.clearAllLocalStorage();
  });

  it('CAT-01: Switching categories works repeatedly', () => {
    cy.visit('/', {
      onBeforeLoad: enableServiceWorker,
    });

    cy.contains('a', /Bebestibles|Category A/i).click();
    cy.contains('a', /Aguas|Panel|Productos/i).should('be.visible');

    cy.contains('a', /Alimentos|Category B/i).click();
    cy.contains('a', /Despensa|Panel|Productos/i).should('be.visible');

    cy.contains('a', /Bebestibles|Category A/i).click();
    cy.contains('a', /Aguas|Panel|Productos/i).should('be.visible');
  });

  it('SUB-01: First subcategory click does not auto-close', () => {
    cy.visit('/pages/bebidas.html', {
      onBeforeLoad: enableServiceWorker,
    });

    cy.contains('a', /Bebestibles|Category A/i).click();
    cy.contains('a', /Aguas|Subcat|Productos/i).should('be.visible');
  });
});
