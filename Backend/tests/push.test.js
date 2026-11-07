/* global beforeEach, expect, require, test */
jest.mock('../firebaseAdmin', () => require('./support/firebaseAdminMock'));

const request = require('supertest');
const { auth, db, pushEnviados, tokensInvalidos } = require('../firebaseAdmin');
const app = require('../API_Server');
const { hashToken, TEXTO_PUSH_GENERICO } = require('../services/push');

const TOKEN_APP = 'token-fcm-de-prueba';

beforeEach(() => {
  db.reset();
  auth.token('tutor-1');
  auth.token('tutor-2');
  auth.token('docente-1');
  db.set('usuarios', 'tutor-1', {
    rol: 'familia',
    nombre: 'Tutora',
    apellido: 'Uno',
    hijoPrimariaId: 'alumno-1',
  });
  db.set('usuarios', 'tutor-2', { rol: 'familia', nombre: 'Tutor', apellido: 'Dos' });
  db.set('usuarios', 'docente-1', { rol: 'docente', docenteId: 'docente-1' });
  db.set('alumnos', 'alumno-1', {
    nombre: 'Ana',
    apellido: 'Asignada',
    legajo: 'A-001',
    estado: 'activo',
  });
  db.set('materias', 'materia-1', {
    codigo: 'M-01',
    nombre: 'Matemática',
    docenteId: 'docente-1',
    cicloLectivo: 2025,
  });
  db.set('inscripciones', 'inscripcion-1', {
    alumnoId: 'alumno-1',
    materiaId: 'materia-1',
    cicloLectivo: 2025,
  });
});

async function registrarToken(uid, token = TOKEN_APP) {
  return request(app)
    .post('/api/push-token')
    .set('Authorization', `Bearer ${auth.token(uid)}`)
    .send({ token });
}

test('POST /api/push-token hace upsert con el hash del token como ID', async () => {
  const respuesta = await registrarToken('tutor-1');

  expect(respuesta.status).toBe(201);
  expect(respuesta.body.data).toMatchObject({
    token: TOKEN_APP,
    uid: 'tutor-1',
    plataforma: 'android',
    reasignado: false,
  });

  const guardado = await db.collection('pushTokens').doc(hashToken(TOKEN_APP)).get();
  expect(guardado.exists).toBe(true);
  expect(guardado.data().uid).toBe('tutor-1');
});

test('POST /api/push-token normaliza plataforma a android o ios', async () => {
  const ios = await request(app)
    .post('/api/push-token')
    .set('Authorization', `Bearer ${auth.token('tutor-1')}`)
    .send({ token: 'token-ios', plataforma: 'ios' });
  expect(ios.body.data.plataforma).toBe('ios');

  const android = await request(app)
    .post('/api/push-token')
    .set('Authorization', `Bearer ${auth.token('tutor-1')}`)
    .send({ token: 'token-android', plataforma: 'android' });
  expect(android.body.data.plataforma).toBe('android');

  const invalida = await request(app)
    .post('/api/push-token')
    .set('Authorization', `Bearer ${auth.token('tutor-1')}`)
    .send({ token: 'token-web', plataforma: 'web' });
  expect(invalida.body.data.plataforma).toBe('android');

  const noString = await request(app)
    .post('/api/push-token')
    .set('Authorization', `Bearer ${auth.token('tutor-1')}`)
    .send({ token: 'token-num', plataforma: 123 });
  expect(noString.body.data.plataforma).toBe('android');
});

test('POST /api/push-token reasigna el token si lo tenía otra cuenta', async () => {
  await registrarToken('tutor-2');

  const respuesta = await registrarToken('tutor-1');

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.data.reasignado).toBe(true);
  const guardado = await db.collection('pushTokens').doc(hashToken(TOKEN_APP)).get();
  expect(guardado.data().uid).toBe('tutor-1');
});

test('POST /api/push-token rechaza un body sin token', async () => {
  const respuesta = await request(app)
    .post('/api/push-token')
    .set('Authorization', `Bearer ${auth.token('tutor-1')}`)
    .send({});

  expect(respuesta.status).toBe(400);
});

test('POST /api/push-token rechaza un token que no es string o está vacío', async () => {
  const sinString = await request(app)
    .post('/api/push-token')
    .set('Authorization', `Bearer ${auth.token('tutor-1')}`)
    .send({ token: 123 });

  expect(sinString.status).toBe(400);

  const vacio = await registrarToken('tutor-1', '   ');
  expect(vacio.status).toBe(400);
});

test('POST /api/push-token rechaza un token demasiado largo', async () => {
  const respuesta = await registrarToken('tutor-1', 'x'.repeat(4097));

  expect(respuesta.status).toBe(400);
});

test('POST /api/push-token sin Authorization responde 401', async () => {
  const respuesta = await request(app)
    .post('/api/push-token')
    .send({ token: TOKEN_APP });

  expect(respuesta.status).toBe(401);
});

test('DELETE /api/push-token toma el token del body y sólo borra el propio', async () => {
  await registrarToken('tutor-1');

  const ajeno = await request(app)
    .delete('/api/push-token')
    .set('Authorization', `Bearer ${auth.token('tutor-2')}`)
    .send({ token: TOKEN_APP });
  expect(ajeno.status).toBe(403);

  const propio = await request(app)
    .delete('/api/push-token')
    .set('Authorization', `Bearer ${auth.token('tutor-1')}`)
    .send({ token: TOKEN_APP });
  expect(propio.status).toBe(200);
  expect(propio.body.data.eliminado).toBe(true);

  const borrado = await db.collection('pushTokens').doc(hashToken(TOKEN_APP)).get();
  expect(borrado.exists).toBe(false);
});

test('la ausencia crea la notificación y envía un push genérico al tutor', async () => {
  await registrarToken('tutor-1');

  const respuesta = await request(app)
    .post('/api/asistencias')
    .set('Authorization', `Bearer ${auth.token('docente-1')}`)
    .send({
      materiaId: 'materia-1',
      fecha: '2026-11-07',
      registros: [{ alumnoId: 'alumno-1', estado: 'ausente' }],
    });

  expect(respuesta.status).toBe(201);
  expect(respuesta.body.data.avisos.generadas).toBe(1);

  const notificaciones = await db.collection('notificaciones').get();
  expect(notificaciones.size).toBe(1);
  expect(notificaciones.docs[0].data()).toMatchObject({
    destinatarioUid: 'tutor-1',
    tipo: 'ausencia',
    leida: false,
  });

  expect(pushEnviados).toHaveLength(1);
  expect(pushEnviados[0].tokens).toEqual([TOKEN_APP]);
  expect(pushEnviados[0].notification.body).toBe(TEXTO_PUSH_GENERICO);
  expect(pushEnviados[0].data).toEqual({ destino: 'notificaciones' });
  expect(pushEnviados[0].android.notification.channelId).toBe('default');
});

test('sin token registrado no se envía push pero la notificación queda guardada', async () => {
  const respuesta = await request(app)
    .post('/api/asistencias')
    .set('Authorization', `Bearer ${auth.token('docente-1')}`)
    .send({
      materiaId: 'materia-1',
      fecha: '2026-11-07',
      registros: [{ alumnoId: 'alumno-1', estado: 'ausente' }],
    });

  expect(respuesta.status).toBe(201);
  expect(pushEnviados).toHaveLength(0);
  const notificaciones = await db.collection('notificaciones').get();
  expect(notificaciones.size).toBe(1);
});

test('la tardanza crea una notificación tipo tardanza y envía push', async () => {
  await registrarToken('tutor-1');

  const respuesta = await request(app)
    .post('/api/asistencias')
    .set('Authorization', `Bearer ${auth.token('docente-1')}`)
    .send({
      materiaId: 'materia-1',
      fecha: '2026-11-07',
      registros: [{ alumnoId: 'alumno-1', estado: 'tarde' }],
    });

  expect(respuesta.status).toBe(201);
  expect(respuesta.body.data.avisos.generadas).toBe(1);

  const notificaciones = await db.collection('notificaciones').get();
  expect(notificaciones.size).toBe(1);
  const aviso = notificaciones.docs[0].data();
  expect(aviso).toMatchObject({
    destinatarioUid: 'tutor-1',
    tipo: 'tardanza',
    alumnoId: 'alumno-1',
    leida: false,
  });
  expect(aviso.titulo).toBe('Ana Asignada llegó tarde');
  expect(aviso.mensaje).toContain('llegó tarde');

  expect(pushEnviados).toHaveLength(1);
  expect(pushEnviados[0].notification.body).toBe(TEXTO_PUSH_GENERICO);
});

test('presente no genera notificación ni push', async () => {
  const respuesta = await request(app)
    .post('/api/asistencias')
    .set('Authorization', `Bearer ${auth.token('docente-1')}`)
    .send({
      materiaId: 'materia-1',
      fecha: '2026-11-07',
      registros: [{ alumnoId: 'alumno-1', estado: 'presente' }],
    });

  expect(respuesta.status).toBe(201);
  expect(respuesta.body.data.avisos.generadas).toBe(0);
  expect((await db.collection('notificaciones').get()).size).toBe(0);
  expect(pushEnviados).toHaveLength(0);
});

test('enviarPush borra el token si FCM lo marca como no registrado', async () => {
  await registrarToken('tutor-1');
  tokensInvalidos.set(TOKEN_APP, 'messaging/registration-token-not-registered');

  const respuesta = await request(app)
    .post('/api/asistencias')
    .set('Authorization', `Bearer ${auth.token('docente-1')}`)
    .send({
      materiaId: 'materia-1',
      fecha: '2026-11-07',
      registros: [{ alumnoId: 'alumno-1', estado: 'ausente' }],
    });

  expect(respuesta.status).toBe(201);
  const token = await db.collection('pushTokens').doc(hashToken(TOKEN_APP)).get();
  expect(token.exists).toBe(false);
});

test('enviarPush conserva el token ante un error transitorio de FCM', async () => {
  await registrarToken('tutor-1');
  tokensInvalidos.set(TOKEN_APP, 'messaging/internal-error');

  const respuesta = await request(app)
    .post('/api/asistencias')
    .set('Authorization', `Bearer ${auth.token('docente-1')}`)
    .send({
      materiaId: 'materia-1',
      fecha: '2026-11-07',
      registros: [{ alumnoId: 'alumno-1', estado: 'ausente' }],
    });

  expect(respuesta.status).toBe(201);
  const token = await db.collection('pushTokens').doc(hashToken(TOKEN_APP)).get();
  expect(token.exists).toBe(true);
});

test('la atención crea la notificación y envía push sin datos clínicos', async () => {
  await registrarToken('tutor-1');

  const respuesta = await request(app)
    .post('/api/fichas-medicas/alumno-1/atenciones')
    .set('Authorization', `Bearer ${auth.token('docente-1')}`)
    .send({
      fecha: '2026-11-07',
      motivo: 'Dolor de cabeza',
      diagnostico: 'Migraña',
      tratamiento: 'Reposo',
    });

  expect(respuesta.status).toBe(201);

  const notificaciones = await db.collection('notificaciones').get();
  expect(notificaciones.size).toBe(1);
  const aviso = notificaciones.docs[0].data();
  expect(aviso).toMatchObject({
    destinatarioUid: 'tutor-1',
    tipo: 'atencion',
    alumnoId: 'alumno-1',
    atencionId: respuesta.body.data.id,
    leida: false,
  });
  expect(JSON.stringify(aviso)).not.toContain('Dolor de cabeza');
  expect(JSON.stringify(aviso)).not.toContain('Migraña');
  expect(JSON.stringify(aviso)).not.toContain('Reposo');

  expect(pushEnviados).toHaveLength(1);
  expect(pushEnviados[0].notification.body).toBe(TEXTO_PUSH_GENERICO);
});

test('la atención sigue respondiendo 201 si el push falla', async () => {
  await registrarToken('tutor-1');
  const { admin } = require('../firebaseAdmin');
  const mensajeria = admin.messaging;
  admin.messaging = () => ({
    async sendEachForMulticast() {
      throw new Error('FCM caído');
    },
  });

  try {
    const respuesta = await request(app)
      .post('/api/fichas-medicas/alumno-1/atenciones')
      .set('Authorization', `Bearer ${auth.token('docente-1')}`)
      .send({ fecha: '2026-11-07', motivo: 'Control' });

    expect(respuesta.status).toBe(201);
    expect((await db.collection('notificaciones').get()).size).toBe(1);
  } finally {
    admin.messaging = mensajeria;
  }
});
