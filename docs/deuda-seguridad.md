# Deuda de seguridad: `GET /api/alumnos/:id`

Fecha: 2026-11-07

## Ubicación

- Archivo: `Backend/API_Server.js`
- Ruta: `GET /api/alumnos/:id`
- Línea aproximada: 291
- Protección actual: sólo `verifyToken`

```js
app.get("/api/alumnos/:id", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("alumnos").doc(req.params.id).get();
    if (!doc.exists) return fail(res, "Alumno no encontrado", 404);
    ok(res, withId(doc));
  } catch (err) {
    fail(res, "Error al buscar el alumno: " + err.message, 500);
  }
});
```

## Riesgo

Cualquier usuario autenticado (familia, alumno o docente) puede leer los datos
básicos de cualquier alumno con sólo conocer o adivinar su ID. El endpoint no
valida que el alumno esté vinculado al usuario autenticado.

Antes del endurecimiento de `POST /api/auth/sync`, esto se combinaba con la
posibilidad de que un usuario se vinculara a cualquier alumno y después leyera
su ficha médica. `auth/sync` ya quedó restringido a administradores, pero
`GET /api/alumnos/:id` sigue expuesto y amplía la superficie de cualquier
vínculo que se cargue desde el panel.

## Propuesta de corrección

Agregar una autorización por rol antes de devolver el documento:

- `admin`: puede leer cualquier alumno.
- `alumno`: sólo si `req.perfil.alumnoId === req.params.id`.
- `familia`: sólo si el ID coincide con `hijoPrimariaId` o `hijoSecundariaId`.
- `docente`: sólo si el alumno está inscripto en alguna materia del docente;
  reutilizar `docenteTieneAccesoAlumno(req.perfil.docenteId, alumnoId)`.
- Cualquier otro caso: `403`.

La lógica de docente ya existe en `API_Server.js`
(`docenteTieneAccesoAlumno`), pero está definida más abajo; conviene moverla a
un helper compartido o declararla antes de la ruta.

## Por qué no se modifica en este cambio

Es una ruta que usa el backend web en varias pantallas (asistencias, fichas
médicas, dashboards de familia y docente). Restringirla sin revisar todos esos
flujos puede romper pantallas en producción. La corrección debe hacerla quien
mantiene el backend web, con pruebas de regresión por rol.

## Pruebas sugeridas

- `admin` lee cualquier alumno: `200`.
- `familia` lee su hijo vinculado: `200`.
- `familia` lee un alumno ajeno: `403`.
- `alumno` se lee a sí mismo: `200`.
- `alumno` lee a otro alumno: `403`.
- `docente` lee un alumno de su materia: `200`.
- `docente` lee un alumno de otra materia: `403`.
- Sin token: `401`.
