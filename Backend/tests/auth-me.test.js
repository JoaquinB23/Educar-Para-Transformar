/* global beforeEach, expect, require, test */
jest.mock('../firebaseAdmin', () => require('./support/firebaseAdminMock'));

const request = require('supertest');
const { auth, db } = require('../firebaseAdmin');
const app = require('../API_Server');

beforeEach(() => {
  db.reset();
  auth.token('familia-1');
  auth.token('docente-1');
  db.set('usuarios', 'familia-1', {
    rol: 'familia',
    nombre: 'Tutora',
    apellido: 'Uno',
    hijoPrimariaId: 'alumno-1',
    hijoSecundariaId: 'alumno-2',
  });
  db.set('usuarios', 'docente-1', { rol: 'docente', docenteId: 'docente-1' });
  db.set('alumnos', 'alumno-1', {
    nombre: 'Ana',
    apellido: 'Primaria',
    nivel: 'primaria',
    legajo: 'A-001',
    estado: 'activo',
  });
  db.set('alumnos', 'alumno-2', {
    nombre: 'Luis',
    apellido: 'Secundaria',
    nivel: 'secundaria',
    legajo: 'A-002',
    estado: 'activo',
  });
});

test('familia recibe sólo sus hijos vinculados, sin quitar los campos actuales', async () => {
  const respuesta = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${auth.token('familia-1')}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.data).toMatchObject({
    rol: 'familia',
    hijoPrimariaId: 'alumno-1',
    hijoSecundariaId: 'alumno-2',
    cicloLectivoActual: 2025,
    hijos: [
      {
        id: 'alumno-1',
        nombre: 'Ana',
        apellido: 'Primaria',
        nivel: 'primaria',
        legajo: 'A-001',
      },
      {
        id: 'alumno-2',
        nombre: 'Luis',
        apellido: 'Secundaria',
        nivel: 'secundaria',
        legajo: 'A-002',
      },
    ],
  });
});

test('familia no recibe hijos inexistentes ni duplicados', async () => {
  db.set('usuarios', 'familia-1', {
    rol: 'familia',
    hijoPrimariaId: 'alumno-1',
    hijoSecundariaId: 'alumno-1',
  });

  const respuesta = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${auth.token('familia-1')}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.data.hijos).toHaveLength(1);
  expect(respuesta.body.data.hijos[0].id).toBe('alumno-1');
});

test('familia sin vínculos recibe un arreglo vacío', async () => {
  db.set('usuarios', 'familia-1', { rol: 'familia' });

  const respuesta = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${auth.token('familia-1')}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.data.hijos).toEqual([]);
});

test('otros roles no reciben el campo hijos', async () => {
  const respuesta = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${auth.token('docente-1')}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.data).not.toHaveProperty('hijos');
});

test('sin perfil responde 404 y sin Authorization responde 401', async () => {
  const sinPerfil = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${auth.token('sin-perfil')}`);

  expect(sinPerfil.status).toBe(404);

  const sinToken = await request(app).get('/api/auth/me');
  expect(sinToken.status).toBe(401);
});
