// Automated coverage for menu regressions described in CAT-01 and SUB-01.
describe('Nav menu regressions', () => {
  it('CAT-01: Second category click works after first', () => {
    cy.visit('/');
    cy.contains('a', /Alimentos/i).click();
    cy.contains('a', /Carnes y Embutidos/i).should('be.visible');

    cy.contains('a', /Bebestibles/i).click();
    cy.contains('a', /Aguas/i).should('be.visible');
  });

  it('SUB-01: First subcategory click does NOT auto-close', () => {
    cy.visit('/pages/despensa.html');
    cy.contains('a', /Bebestibles/i).click();
    cy.contains('a', /Aguas/i).should('be.visible');
  });
});
