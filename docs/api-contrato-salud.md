# Contrato API: salud escolar

## Convenciones de las rutas

Las rutas de abajo son las rutas completas del backend, con prefijo `/api`. No hay otro prefijo montado para estas rutas. Las respuestas exitosas usan `{ "ok": true, "data": ... }`; los errores usan `{ "ok": false, "error": "..." }`.

Las rutas protegidas requieren el header:

```http
Authorization: Bearer <Firebase ID token>
```

Los JSON de ejemplo son estructuras armadas a partir del código, con valores ficticios; no son lecturas de datos reales.

## 1. Consultar ficha médica e historial

### `GET /api/fichas-medicas?alumnoId={alumnoId}`

- **Headers:** `Authorization: Bearer <Firebase ID token>`.
- **Roles autorizados:** `admin`; `alumno` para su propio ID; `familia` para un hijo vinculado; `docente` si el alumno está inscripto en una materia suya del ciclo lectivo actual.
- **Path params:** ninguno.
- **Query params:** `alumnoId` (**obligatorio**). El backend busca el alumno y luego la ficha cuyo ID de documento en `fichasMedicas` es ese `alumnoId`.
- **Body:** ninguno.

Ejemplo cuando existe una ficha:

```json
{
  "ok": true,
  "data": {
    "alumno": {
      "id": "alumno-demo-001",
      "legajo": "AL-1042",
      "nombre": "Lucía",
      "apellido": "Pérez",
      "estado": "activo"
    },
    "ficha": {
      "id": "alumno-demo-001",
      "alumnoId": "alumno-demo-001",
      "grupoSanguineo": "O+",
      "alergias": ["polen"],
      "condiciones": ["asma"],
      "medicacion": "Inhalador autorizado",
      "contactoEmergencia": {
        "nombre": "Andrea Pérez",
        "telefono": "11-5555-0101"
      },
      "observaciones": "Avisar ante síntomas respiratorios.",
      "actualizadoEn": "2025-03-10T12:00:00.000Z",
      "creadoEn": "2025-03-01T10:00:00.000Z",
      "atenciones": [
        {
          "id": "atencion-demo-001",
          "fecha": "2025-03-10",
          "motivo": "Malestar",
          "diagnostico": "Dolor de cabeza",
          "tratamiento": "Reposo e hidratación",
          "observaciones": null,
          "registradoPor": "Sofía Gómez",
          "registradoPorRol": "docente",
          "registradaEn": "2025-03-10T12:00:00.000Z"
        }
      ]
    }
  }
}
```

Si el alumno existe, pero no tiene ficha, no se devuelve un error: `data.ficha` es `null`:

```json
{
  "ok": true,
  "data": {
    "alumno": {
      "id": "alumno-demo-001",
      "nombre": "Lucía",
      "apellido": "Pérez"
    },
    "ficha": null,
    "mensaje": "El alumno todavía no tiene ficha médica cargada"
  }
}
```

El historial no tiene un endpoint de listado separado: se obtiene como `ficha.atenciones` en esta misma consulta. Si la ficha no existe, no hay historial y `ficha` es `null`.

**Errores posibles:**

| Status | Mensaje |
|---:|---|
| 400 | `Falta el query param alumnoId` |
| 401 | `Falta el token de autenticación` o `Token inválido o expirado` |
| 403 | `Sólo podés acceder a fichas de alumnos inscriptos en tus materias del ciclo lectivo actual` (docente sin vínculo académico) |
| 403 | `Sólo podés consultar tu propia ficha médica` (alumno consulta otro ID) |
| 403 | `Sólo podés consultar la ficha médica de tus hijos vinculados` (familia consulta un ID no vinculado) |
| 403 | `No tenés permisos para consultar fichas médicas` (otro rol) |
| 404 | `Alumno no encontrado` |
| 500 | `No se pudo leer el perfil del usuario: {detalle}` |
| 500 | `Error al leer la ficha médica: {detalle}` |

`{detalle}` es el mensaje de la excepción capturada; su valor concreto no está determinado por el código.

## 2. Crear o actualizar ficha médica

### `POST /api/fichas-medicas`

**No existe una ruta `PUT` para la ficha.** Este `POST` crea la ficha si no existe y actualiza sus campos de encabezado si ya existe (upsert).

- **Headers:** `Authorization: Bearer <Firebase ID token>` y `Content-Type: application/json`.
- **Roles autorizados:** `admin` y `docente`. Un docente solo puede operar sobre alumnos inscriptos en sus materias del ciclo lectivo actual. Familia y alumno no pueden crear ni actualizar.
- **Path params:** ninguno.
- **Query params:** ninguno.
- **Body:** `alumnoId` es el único campo obligatorio validado por el handler. Los demás son opcionales:

| Campo exacto | Tipo aceptado / guardado | Obligatorio | Validación y valor por defecto |
|---|---|---:|---|
| `alumnoId` | ID de documento del alumno, string esperado | Sí | Se comprueba que sea truthy y que el alumno exista. No hay otra validación de formato. |
| `grupoSanguineo` | Valor recibido o `null` | No | Sin validación de valores permitidos. |
| `alergias` | Array | No | Si el body no trae un array, se guarda `[]`. No se valida el contenido de cada elemento. |
| `condiciones` | Array | No | Si el body no trae un array, se guarda `[]`. El código no usa el nombre `afeccionesCronicas`. |
| `medicacion` | Valor recibido truthy o `null` | No | Sin validación del contenido. El nombre exacto no incluye `Autorizada`. |
| `contactoEmergencia` | Valor recibido truthy o `null` | No | Sin validación de forma o subcampos; la estructura interna es **NO DETERMINADO** por el backend. |
| `observaciones` | Valor recibido truthy o `null` | No | Sin validación del contenido. |

Ejemplo de body:

```json
{
  "alumnoId": "alumno-demo-001",
  "grupoSanguineo": "O+",
  "alergias": ["polen"],
  "condiciones": ["asma"],
  "medicacion": "Inhalador autorizado",
  "contactoEmergencia": {
    "nombre": "Andrea Pérez",
    "telefono": "11-5555-0101"
  },
  "observaciones": "Avisar ante síntomas respiratorios."
}
```

Al crear responde `201`; al actualizar responde `200`. En ambos casos `data` es el documento de ficha con `id` y `alumnoId`. Al crear, el backend agrega `atenciones: []` y `creadoEn`; en ambos casos fija `actualizadoEn`.

```json
{
  "ok": true,
  "data": {
    "id": "alumno-demo-001",
    "alumnoId": "alumno-demo-001",
    "grupoSanguineo": "O+",
    "alergias": ["polen"],
    "condiciones": ["asma"],
    "medicacion": "Inhalador autorizado",
    "contactoEmergencia": {
      "nombre": "Andrea Pérez",
      "telefono": "11-5555-0101"
    },
    "observaciones": "Avisar ante síntomas respiratorios.",
    "atenciones": [],
    "creadoEn": "2025-03-01T10:00:00.000Z",
    "actualizadoEn": "2025-03-01T10:00:00.000Z"
  }
}
```

**Errores posibles:**

| Status | Mensaje |
|---:|---|
| 400 | `Falta el campo alumnoId` |
| 401 | `Falta el token de autenticación` o `Token inválido o expirado` |
| 403 | `Tu usuario no tiene un rol asignado` o `No tenés permisos para acceder a este recurso` |
| 403 | `Sólo podés acceder a fichas de alumnos inscriptos en tus materias del ciclo lectivo actual` (docente sin vínculo académico) |
| 404 | `Alumno no encontrado` |
| 500 | `No se pudo leer el perfil del usuario: {detalle}` |
| 500 | `Error al guardar la ficha médica: {detalle}` |

## 3. Registrar una atención de enfermería

### `POST /api/fichas-medicas/{alumnoId}/atenciones`

- **Headers:** `Authorization: Bearer <Firebase ID token>` y `Content-Type: application/json`.
- **Roles autorizados:** `admin` y `docente`; el docente debe tener al alumno inscripto en una materia propia del ciclo lectivo actual.
- **Path params:** `alumnoId` (obligatorio en la ruta).
- **Query params:** ninguno.
- **Body:** `fecha` y `motivo` son obligatorios (el handler solo comprueba que sean truthy); los otros campos son opcionales y se guardan como `null` si son falsy.

| Campo exacto | Obligatorio | Validación |
|---|---:|---|
| `fecha` | Sí | Solo se comprueba que tenga valor; formato **NO DETERMINADO** y no se valida. |
| `motivo` | Sí | Solo se comprueba que tenga valor; no hay validación de contenido. |
| `diagnostico` | No | Sin validación; falsy se guarda como `null`. |
| `tratamiento` | No | Sin validación; falsy se guarda como `null`. |
| `observaciones` | No | Sin validación; falsy se guarda como `null`. |

Ejemplo de body:

```json
{
  "fecha": "2025-03-10",
  "motivo": "Malestar",
  "diagnostico": "Dolor de cabeza",
  "tratamiento": "Reposo e hidratación",
  "observaciones": "Se avisó al docente a cargo."
}
```

El backend guarda una atención dentro del array `atenciones` del documento `fichasMedicas/{alumnoId}`. Si todavía no hay ficha, crea una con los campos de ficha vacíos y esta primera atención. La atención incluye `id`, los campos recibidos, `registradoPor`, `registradoPorRol` y `registradaEn`. Responde `201`:

```json
{
  "ok": true,
  "data": {
    "id": "atencion-demo-001",
    "fecha": "2025-03-10",
    "motivo": "Malestar",
    "diagnostico": "Dolor de cabeza",
    "tratamiento": "Reposo e hidratación",
    "observaciones": "Se avisó al docente a cargo.",
    "registradoPor": "Sofía Gómez",
    "registradoPorRol": "docente",
    "registradaEn": "2025-03-10T12:00:00.000Z"
  }
}
```

`NO EXISTE` un rol `enfermería` autorizado por este endpoint: el control de roles admite solo `admin` y `docente`. El campo `registradoPorRol` refleja el rol del perfil autenticado.

**Qué hace después:** persiste la atención en Firestore y responde con el objeto creado. Este handler no envía correo, no crea una notificación en `notificaciones` ni envía un mensaje FCM al tutor.

**Errores posibles:**

| Status | Mensaje |
|---:|---|
| 400 | `Faltan campos obligatorios: fecha, motivo` |
| 401 | `Falta el token de autenticación` o `Token inválido o expirado` |
| 403 | `Tu usuario no tiene un rol asignado` o `No tenés permisos para acceder a este recurso` |
| 403 | `Sólo podés acceder a fichas de alumnos inscriptos en tus materias del ciclo lectivo actual` (docente sin vínculo académico) |
| 404 | `Alumno no encontrado` |
| 500 | `No se pudo leer el perfil del usuario: {detalle}` |
| 500 | `Error al registrar la atención: {detalle}` |

## 4. Acceso de familia a ficha y atenciones

La comprobación de familia está en el handler de `GET /api/fichas-medicas` de `Backend/API_Server.js` (línea 1071). La comparación de `alumnoId` contra `req.perfil.hijoPrimariaId` y `req.perfil.hijoSecundariaId` está en la línea 1084; el error `Sólo podés consultar la ficha médica de tus hijos vinculados` se devuelve en la línea 1085.

El mismo `GET` devuelve `ficha.atenciones`, por lo que la restricción protege también la lectura del historial.

El endpoint de registro de atenciones **no** autoriza al rol `familia`: su cadena de middlewares en `Backend/API_Server.js`, línea 1154, usa `requireRole("admin", "docente")`. La actualización/creación de la ficha también excluye a familia, en la línea 1113.

## 5. Roles de usuario y procedencia

Los valores canónicos que define el backend son exactamente `admin`, `alumno`, `docente` y `familia`, en `Backend/API_Server.js`, línea 21, y en `Backend/crear-usuario.js`, línea 15. El perfil se lee de Firestore en `usuarios/{uid}` durante `verifyToken` (`Backend/middleware/verifyToken.js`); `req.perfil.rol` es el rol que usan los handlers y `requireRole`.

| Tipo solicitado | Valor exacto del campo `rol` | Procedencia / observación |
|---|---|---|
| Padre o tutor | `familia` | Se asigna al crear el perfil desde la consola o el panel administrativo. Los hijos asociados se guardan como `hijoPrimariaId` y `hijoSecundariaId`. |
| Alumno | `alumno` | Se asigna al crear el perfil; la relación al registro escolar se guarda como `alumnoId`. |
| Profesor | `docente` | Valor exacto usado por el backend; no existe el valor `profesor`. |
| Enfermería | **NO EXISTE** | No aparece en la lista de roles ni está autorizado para registrar atenciones. |
| Administrador | `admin` | Se asigna al crear el perfil. |

`POST /api/auth/sync` no permite setear el rol: responde `El rol no se puede setear por este endpoint` si el body incluye `rol`. La fuente efectiva es el perfil previamente creado y guardado en `usuarios/{uid}`, no un rol enviado por el cliente al consultar.

## 6. Avisos por ausencia, tardanza o atención

La función `avisarAusencias` en `Backend/API_Server.js`, línea 903, solo procesa registros cuya `estado` sea `ausente` (línea 904). `POST /api/asistencias` la invoca tras guardar la asistencia en la línea 890. Para cada tutor encontrado crea un documento en `notificaciones` con `tipo: "ausencia"`, título, mensaje, IDs relacionados, `leida: false` y `creadaEn`. Si no hay tutor vinculado, lo registra con `console.warn`.

- **Correo al tutor:** **NO EXISTE** envío de correo en estos flujos.
- **Notificación por ausencia:** sí; se guarda en Firestore en `notificaciones`. No es correo ni FCM.
- **Aviso por tardanza:** **NO EXISTE** en el código de `avisarAusencias`; filtra únicamente `ausente`.
- **Aviso al registrar atención:** **NO EXISTE** en el handler de atenciones; solo guarda la atención.

El tutor autenticado puede leer sus notificaciones mediante `GET /api/notificaciones` (línea 950); el backend filtra por `destinatarioUid === req.user.uid` en la línea 953 de `Backend/API_Server.js`.

## 7. Firebase Admin, FCM y token de dispositivo

`Backend/firebaseAdmin.js` carga `firebase-admin`, inicializa la app una sola vez con `admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })` en la línea 17, y toma credenciales de variables de entorno (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`). Exporta `admin`, `db` y `auth`.

Por lo tanto, el SDK de Firebase Admin está inicializado y el objeto `admin` está disponible para obtener el servicio de mensajería (`admin.messaging()`). Sin embargo, `Backend/API_Server.js` no llama a `admin.messaging()` ni envía FCM actualmente.

El perfil del usuario ya se almacena en `usuarios/{uid}`. Ese documento podría alojar un campo de token de dispositivo, por ejemplo `fcmTokens`, pero el código actual no define ese campo, no lo escribe y no tiene un endpoint para registrar o actualizar tokens. La forma o política de rotación de esos tokens queda **NO DETERMINADO** por el código.
