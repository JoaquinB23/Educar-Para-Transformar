/* global Cypress, cy, it */
const datos = Cypress.expose();

(datos.cp001Configurado ? it : it.skip)(
  'CP-001: el docente crea y vuelve a abrir la ficha de un alumno de su materia',
  () => {
    const marcador = `CP-001-${Date.now()}`;

    cy.env(['DOCENTE_DNI', 'DOCENTE_PASSWORD']).then((credenciales) => {
      cy.visit('/html/login.html');
      cy.get('#roleDocente').check({ force: true });
      if (datos.docenteNivel === 'secundaria') {
        cy.get('#levelSecundaria').check({ force: true });
      } else {
        cy.get('#levelPrimaria').check({ force: true });
      }
      cy.get('#usuario').type(String(credenciales.DOCENTE_DNI));
      cy.get('#password').type(String(credenciales.DOCENTE_PASSWORD), { log: false });
      cy.get('form [type="submit"]').click();

      cy.url().should('include', '/html/dashboard-docente.html');
      cy.contains('a', 'Fichas Médicas').click();
      cy.url().should('include', '/html/ficha-medica.html');

      cy.get('#resultadosAlumno').should('contain.text', datos.alumnoAsignado);
      cy.get('#resultadosAlumno').should('not.contain.text', datos.alumnoNoAsignado);
      cy.contains('#resultadosAlumno button', datos.alumnoAsignado).click();

      cy.get('#contenidoFicha').should('be.visible');
      cy.get('#btnEditarFicha').click();
      cy.get('#fObservaciones').clear().type(marcador);
      cy.get('#btnGuardarFicha').click();
      cy.get('#contenidoFicha').should('contain.text', marcador);

      cy.reload();
      cy.contains('#resultadosAlumno button', datos.alumnoAsignado).click();
      cy.get('#contenidoFicha').should('contain.text', marcador);
    });
  },
);
