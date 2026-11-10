/* global beforeEach, expect, jest, require, test */
jest.mock('../firebaseAdmin', () => require('./support/firebaseAdminMock'));

const request = require('supertest');
const { auth, db } = require('../firebaseAdmin');
const app = require('../API_Server');

beforeEach(() => {
  db.reset();
  auth.token('familia-1');
  auth.token('admin-1');
  db.set('usuarios', 'familia-1', {
    rol: 'familia',
    nombre: 'María',
    apellido: 'Pérez',
    hijoPrimariaId: 'alumno-1',
  });
  db.set('usuarios', 'admin-1', { rol: 'admin' });
  db.set('alumnos', 'alumno-1', { nombre: 'Ana', apellido: 'Pérez', nivel: 'primaria' });
  db.set('alumnos', 'alumno-2', { nombre: 'Luis', apellido: 'Gómez' });
});

test('la familia registra un pago de su hijo como pendiente', async () => {
  const respuesta = await request(app)
    .post('/api/pagos')
    .set('Authorization', `Bearer ${auth.token('familia-1')}`)
    .send({ alumnoId: 'alumno-1', periodo: '2026-11', fechaPago: '2026-11-02', monto: '12500.50', medioPago: 'transferencia' });

  expect(respuesta.status).toBe(201);
  expect(respuesta.body.data).toMatchObject({
    alumnoId: 'alumno-1',
    alumnoNombre: 'Ana Pérez',
    monto: 12500.5,
    moneda: 'ARS',
    fechaPago: '2026-11-02',
    estado: 'pendiente',
  });
});

test('la familia no puede informar pagos de un alumno no vinculado', async () => {
  const respuesta = await request(app)
    .post('/api/pagos')
    .set('Authorization', `Bearer ${auth.token('familia-1')}`)
    .send({ alumnoId: 'alumno-2', periodo: '2026-11', fechaPago: '2026-11-02', monto: 1000, medioPago: 'efectivo' });

  expect(respuesta.status).toBe(403);
});

test('sólo administración puede aprobar pagos pendientes', async () => {
  const creado = await request(app)
    .post('/api/pagos')
    .set('Authorization', `Bearer ${auth.token('familia-1')}`)
    .send({ alumnoId: 'alumno-1', periodo: '2026-11', fechaPago: '2026-11-02', monto: 1000, medioPago: 'efectivo' });
  const pagoId = creado.body.data.id;

  const aprobacion = await request(app)
    .put(`/api/admin/pagos/${pagoId}/estado`)
    .set('Authorization', `Bearer ${auth.token('admin-1')}`)
    .send({ estado: 'aprobado', tipoPago: 'completo' });
  const accesoFamilia = await request(app)
    .put(`/api/admin/pagos/${pagoId}/estado`)
    .set('Authorization', `Bearer ${auth.token('familia-1')}`)
    .send({ estado: 'rechazado' });

  expect(aprobacion.status).toBe(200);
  expect(aprobacion.body.data.estado).toBe('aprobado');
  expect(aprobacion.body.data.tipoPago).toBe('completo');
  expect(accesoFamilia.status).toBe(403);
});

test('el reporte agrupa ingresos por mes y separa pagos completos e incompletos', async () => {
  const tokenFamilia = `Bearer ${auth.token('familia-1')}`;
  const tokenAdmin = `Bearer ${auth.token('admin-1')}`;
  const pagoCompleto = await request(app)
    .post('/api/pagos')
    .set('Authorization', tokenFamilia)
    .send({ alumnoId: 'alumno-1', periodo: '2026-11', fechaPago: '2026-11-02', monto: 12000, medioPago: 'transferencia' });
  const pagoParcial = await request(app)
    .post('/api/pagos')
    .set('Authorization', tokenFamilia)
    .send({ alumnoId: 'alumno-1', periodo: '2026-11', fechaPago: '2026-11-03', monto: 5000, medioPago: 'efectivo' });

  await request(app)
    .put(`/api/admin/pagos/${pagoCompleto.body.data.id}/estado`)
    .set('Authorization', tokenAdmin)
    .send({ estado: 'aprobado', tipoPago: 'completo' });
  await request(app)
    .put(`/api/admin/pagos/${pagoParcial.body.data.id}/estado`)
    .set('Authorization', tokenAdmin)
    .send({ estado: 'aprobado', tipoPago: 'incompleto' });

  const reporte = await request(app)
    .get('/api/admin/pagos/reportes?desde=2026-11-01&hasta=2026-11-30')
    .set('Authorization', tokenAdmin);

  expect(reporte.status).toBe(200);
  expect(reporte.body.data.totalIngresos).toBe(17000);
  expect(reporte.body.data.ingresosPorMes).toEqual([
    { periodo: '2026-11', total: 17000, cantidad: 2 },
  ]);
  expect(reporte.body.data.pagosCompletos[0]).toMatchObject({ anioPago: '2026', anioCuota: '2026', nivelAlumno: 'primaria' });
  expect(reporte.body.data.pagosIncompletos).toHaveLength(1);
});

test('el reporte rechaza rangos de fechas inválidos', async () => {
  const respuesta = await request(app)
    .get('/api/admin/pagos/reportes?desde=2026-02-30&hasta=2026-03-01')
    .set('Authorization', `Bearer ${auth.token('admin-1')}`);

  expect(respuesta.status).toBe(400);
});

test('administración puede clasificar un pago aprobado legado sin cambiar su fecha', async () => {
  db.set('pagos', 'pago-legado', {
    alumnoId: 'alumno-1',
    alumnoNombre: 'Ana Pérez',
    periodo: '2025-10',
    monto: 8000,
    estado: 'aprobado',
    revisadoEn: '2025-10-12T12:00:00.000Z',
  });

  const respuesta = await request(app)
    .put('/api/admin/pagos/pago-legado/estado')
    .set('Authorization', `Bearer ${auth.token('admin-1')}`)
    .send({ estado: 'aprobado', tipoPago: 'incompleto' });

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.data.tipoPago).toBe('incompleto');
  expect(respuesta.body.data.revisadoEn).toBe('2025-10-12T12:00:00.000Z');
});