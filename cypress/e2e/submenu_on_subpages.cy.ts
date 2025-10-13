describe('Submenu on subpages', () => {
  beforeEach(() => {
    cy.viewport(1280, 800);
  });

  it('first click opens and stays open; can switch repeatedly', () => {
    cy.visit('/pages/chocolates.html');

    cy.contains('a.dropdown-toggle', /Snacks y Confites/i)
      .as('snacksToggle')
      .trigger('pointerdown', { pointerType: 'mouse' });

    cy.get('@snacksToggle')
      .should('have.attr', 'aria-expanded', 'true')
      .parent()
      .find('.dropdown-menu')
      .should('be.visible')
      .and('have.class', 'show');

    cy.contains('a.dropdown-toggle', /Bebestibles/i)
      .as('beveragesToggle')
      .trigger('pointerdown', { pointerType: 'mouse' });

    cy.get('@beveragesToggle')
      .should('have.attr', 'aria-expanded', 'true')
      .parent()
      .find('.dropdown-menu')
      .should('be.visible')
      .and('have.class', 'show');

    cy.get('@snacksToggle').should('have.attr', 'aria-expanded', 'false');
  });
});
