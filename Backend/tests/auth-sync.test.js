/* global beforeEach, expect, require, test */
jest.mock('../firebaseAdmin', () => require('./support/firebaseAdminMock'));

const request = require('supertest');
const { auth, db } = require('../firebaseAdmin');
const app = require('../API_Server');

function sync(uid, body) {
  return request(app)
    .post('/api/auth/sync')
    .set('Authorization', `Bearer ${auth.token(uid)}`)
    .send(body);
}

beforeEach(() => {
  db.reset();
  auth.token('admin-1');
  auth.token('familia-1');
  auth.token('docente-1');
  auth.token('sin-perfil');
  db.set('usuarios', 'admin-1', { rol: 'admin', nombre: 'Admin', apellido: 'Uno' });
  db.set('usuarios', 'familia-1', {
    rol: 'familia',
    nombre: 'Tutora',
    apellido: 'Uno',
    nivel: 'primaria',
    hijoPrimariaId: 'alumno-viejo',
  });
  db.set('usuarios', 'docente-1', {
    rol: 'docente',
    nombre: 'Docente',
    apellido: 'Uno',
    docenteId: 'docente-1',
  });
  db.set('alumnos', 'alumno-1', { nombre: 'Ana', apellido: 'Nueva' });
  db.set('alumnos', 'alumno-viejo', { nombre: 'Viejo', apellido: 'Vinculo' });
  db.set('docentes', 'docente-2', { nombre: 'Otro', apellido: 'Docente' });
});

test('un no-admin no puede setear vínculos', async () => {
  const campos = [
    { hijoPrimariaId: 'alumno-1' },
    { hijoSecundariaId: 'alumno-1' },
    { alumnoId: 'alumno-1' },
    { docenteId: 'docente-2' },
  ];

  for (const body of campos) {
    const respuesta = await sync('familia-1', body);
    expect(respuesta.status).toBe(403);
  }

  const perfil = await db.collection('usuarios').doc('familia-1').get();
  expect(perfil.data().hijoPrimariaId).toBe('alumno-viejo');
});

test('un no-admin tampoco puede mandar un vínculo en null', async () => {
  const respuesta = await sync('familia-1', { hijoPrimariaId: null });

  expect(respuesta.status).toBe(403);
});

test('un no-admin puede editar nombre, apellido y nivel sin perder sus vínculos', async () => {
  const respuesta = await sync('familia-1', {
    nombre: 'Nueva',
    apellido: 'Tutora',
    nivel: 'secundaria',
  });

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.data).toMatchObject({
    rol: 'familia',
    nombre: 'Nueva',
    apellido: 'Tutora',
    nivel: 'secundaria',
    hijoPrimariaId: 'alumno-viejo',
  });
});

test('un admin puede setear hijoPrimariaId', async () => {
  const respuesta = await sync('admin-1', { hijoPrimariaId: 'alumno-1' });

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.data.hijoPrimariaId).toBe('alumno-1');
});

test('un admin puede setear alumnoId y docenteId', async () => {
  const alumno = await sync('admin-1', { alumnoId: 'alumno-1' });
  expect(alumno.status).toBe(200);
  expect(alumno.body.data.alumnoId).toBe('alumno-1');

  const docente = await sync('admin-1', { docenteId: 'docente-2' });
  expect(docente.status).toBe(200);
  expect(docente.body.data.docenteId).toBe('docente-2');
});

test('el rol se rechaza para admin y para no-admin', async () => {
  const admin = await sync('admin-1', { rol: 'admin' });
  const familia = await sync('familia-1', { rol: 'admin' });

  expect(admin.status).toBe(400);
  expect(familia.status).toBe(400);
});

test('sin perfil responde 403', async () => {
  const respuesta = await sync('sin-perfil', { nombre: 'Sin' });

  expect(respuesta.status).toBe(403);
});

test('un admin no puede vincular un registro inexistente', async () => {
  const respuesta = await sync('admin-1', { docenteId: 'no-existe' });

  expect(respuesta.status).toBe(400);
});

test('sin campos para actualizar responde 400', async () => {
  const respuesta = await sync('familia-1', {});

  expect(respuesta.status).toBe(400);
});
