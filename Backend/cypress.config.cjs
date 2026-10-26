/* global process */
const { defineConfig } = require('cypress');

const baseUrl = process.env.CYPRESS_BASE_URL;
const docenteDni = process.env.CYPRESS_DOCENTE_DNI;
const docentePassword = process.env.CYPRESS_DOCENTE_PASSWORD;
const docenteNivel = process.env.CYPRESS_DOCENTE_NIVEL;
const alumnoAsignado = process.env.CYPRESS_ALUMNO_ASIGNADO;
const alumnoNoAsignado = process.env.CYPRESS_ALUMNO_NO_ASIGNADO;
const cp001Configurado = Boolean(
  baseUrl && docenteDni && docentePassword && docenteNivel && alumnoAsignado && alumnoNoAsignado,
);

module.exports = defineConfig({
  allowCypressEnv: false,
  expose: {
    cp001Configurado,
    docenteNivel,
    alumnoAsignado,
    alumnoNoAsignado,
  },
  e2e: {
    ...(baseUrl ? { baseUrl } : {}),
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: false,
  },
});
