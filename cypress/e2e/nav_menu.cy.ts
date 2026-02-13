const enableServiceWorker = (win: Window) => {
  win.localStorage.setItem('ebano-sw-enable-local', 'true');
  win.localStorage.removeItem('ebano-sw-disabled');
};

describe('Nav menu regressions', () => {
  const beveragesGroupPattern = /Bebidas|Bebestibles/i;

  beforeEach(() => {
    cy.clearAllCookies();
    cy.clearAllLocalStorage();
  });

  const openNavbar = () => {
    cy.get('.navbar-toggler').then(($toggle) => {
      if ($toggle.is(':visible')) {
        cy.wrap($toggle).click();
      }
    });
  };

  it('CAT-01: Switching categories works repeatedly', () => {
    cy.visit('/', {
      onBeforeLoad: enableServiceWorker,
    });

    openNavbar();
    cy.contains('button', beveragesGroupPattern).trigger('pointerdown', { pointerType: 'mouse' });
    cy.contains('a', /Aguas/i).should('be.visible');

    cy.contains('button', /Alimentos/i).trigger('pointerdown', { pointerType: 'mouse' });
    cy.contains('a', /Despensa/i).should('be.visible');

    cy.contains('button', beveragesGroupPattern).trigger('pointerdown', { pointerType: 'mouse' });
    cy.contains('a', /Aguas/i).should('be.visible');
  });

  it('SUB-01: First subcategory click does not auto-close', () => {
    cy.visit('/pages/bebidas.html', {
      onBeforeLoad: enableServiceWorker,
    });

    openNavbar();
    cy.contains('button', beveragesGroupPattern).trigger('pointerdown', { pointerType: 'mouse' });
    cy.contains('a', /Aguas/i).should('be.visible');
  });
});
