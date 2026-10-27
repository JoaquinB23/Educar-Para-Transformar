/* global beforeEach, expect, jest, require, test */
jest.mock('../firebaseAdmin', () => require('./support/firebaseAdminMock'));

const request = require('supertest');
const { auth, db } = require('../firebaseAdmin');
const app = require('../API_Server');

beforeEach(() => {
  db.reset();
  auth.token('docente-1');
  auth.token('docente-2');
  db.set('usuarios', 'docente-1', { rol: 'docente', docenteId: 'docente-1' });
  db.set('usuarios', 'docente-2', { rol: 'docente', docenteId: 'docente-2' });
  db.set('alumnos', 'alumno-1', {
    nombre: 'Ana',
    apellido: 'Asignada',
    legajo: 'A-001',
    estado: 'activo',
  });
  db.set('alumnos', 'alumno-2', {
    nombre: 'Luis',
    apellido: 'NoAsignado',
    legajo: 'A-002',
    estado: 'activo',
  });
  db.set('materias', 'materia-1', {
    codigo: 'M-01',
    nombre: 'Matemática',
    docenteId: 'docente-1',
    cicloLectivo: 2025,
  });
  db.set('materias', 'materia-2', {
    codigo: 'M-02',
    nombre: 'Historia',
    docenteId: 'docente-2',
    cicloLectivo: 2025,
  });
  db.set('inscripciones', 'inscripcion-1', {
    alumnoId: 'alumno-1',
    materiaId: 'materia-1',
    cicloLectivo: 2025,
  });
  db.set('inscripciones', 'inscripcion-2', {
    alumnoId: 'alumno-2',
    materiaId: 'materia-2',
    cicloLectivo: 2025,
  });
});

test('el docente autenticado recibe sólo alumnos inscriptos en sus materias', async () => {
  const respuesta = await request(app)
    .get('/api/docentes/alumnos')
    .set('Authorization', `Bearer ${auth.token('docente-1')}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.data.map((alumno) => alumno.id)).toEqual(['alumno-1']);
  expect(respuesta.body.data[0].materias.map((materia) => materia.nombre)).toEqual(['Matemática']);
});

test('rechaza fichas y listado docente si falta el token', async () => {
  const [ficha, listado] = await Promise.all([
    request(app).get('/api/fichas-medicas?alumnoId=alumno-1'),
    request(app).get('/api/docentes/alumnos'),
  ]);

  expect(ficha.status).toBe(401);
  expect(listado.status).toBe(401);
});

test('el docente autorizado puede crear y volver a consultar la ficha', async () => {
  const guardado = await request(app)
    .post('/api/fichas-medicas')
    .set('Authorization', `Bearer ${auth.token('docente-1')}`)
    .send({ alumnoId: 'alumno-1', observaciones: 'Control de prueba' });

  expect(guardado.status).toBe(201);

  const consulta = await request(app)
    .get('/api/fichas-medicas?alumnoId=alumno-1')
    .set('Authorization', `Bearer ${auth.token('docente-1')}`);

  expect(consulta.status).toBe(200);
  expect(consulta.body.data.ficha.observaciones).toBe('Control de prueba');
});

// Regresión: impide que una ficha quede accesible cuando el alumno está inscripto
// en una materia de otro docente, aun si el docente intenta consultar la API directamente.
test('deniega la ficha de un alumno inscripto en la materia de otro docente', async () => {
  const respuesta = await request(app)
    .get('/api/fichas-medicas?alumnoId=alumno-2')
    .set('Authorization', `Bearer ${auth.token('docente-1')}`);

  expect(respuesta.status).toBe(403);
});

test('deniega el guardado si el docente no tiene al alumno en una materia propia', async () => {
  const respuesta = await request(app)
    .post('/api/fichas-medicas')
    .set('Authorization', `Bearer ${auth.token('docente-1')}`)
    .send({ alumnoId: 'alumno-2', observaciones: 'No permitido' });

  expect(respuesta.status).toBe(403);
});
