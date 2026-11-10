# Contrato de notificaciones

## Listar notificaciones

`GET /api/notificaciones` requiere un token válido (`verifyToken`) y no aplica
una restricción adicional por rol. Solo devuelve documentos cuyo
`destinatarioUid` coincide con el UID autenticado.

### Query params

- `leidas` (opcional): `"true"` filtra las leídas; `"false"` filtra las no
  leídas. Si se envía cualquier otro valor, el código lo trata como `false`.

### Respuesta

La respuesta exitosa tiene la forma exacta `{ "ok": true, "data": { ... } }`.
Cada notificación contiene `id` (el ID del documento de Firestore) y todos los
campos almacenados en ese documento. `sinLeer` cuenta las notificaciones no
leídas del resultado, después de aplicar el filtro `leidas`.

Las notificaciones se ordenan por `creadaEn` descendente. No hay paginación:
se leen todos los documentos del destinatario.

Ejemplo con una notificación de tipo `ausencia`:

```json
{
  "ok": true,
  "data": {
    "notificaciones": [
      {
        "id": "notificacion-123",
        "destinatarioUid": "tutor-456",
        "tipo": "ausencia",
        "titulo": "Ana Pérez estuvo ausente",
        "mensaje": "El alumno fue marcado como ausente el 2026-11-06 en Matemática.",
        "alumnoId": "alumno-789",
        "asistenciaId": "asistencia-321",
        "materiaId": "materia-654",
        "fecha": "2026-11-06",
        "leida": false,
        "creadaEn": "2026-11-06T15:00:00.000Z"
      }
    ],
    "sinLeer": 1
  }
}
```

Ejemplo con una notificación de tipo `atencion`:

```json
{
  "ok": true,
  "data": {
    "notificaciones": [
      {
        "id": "notificacion-987",
        "destinatarioUid": "tutor-456",
        "tipo": "atencion",
        "titulo": "Atención en enfermería",
        "mensaje": "Se registró una atención de Ana Pérez el 2026-11-06. Consultá el detalle en la app.",
        "alumnoId": "alumno-789",
        "atencionId": "atencion-654",
        "fecha": "2026-11-06",
        "leida": false,
        "creadaEn": "2026-11-06T15:00:00.000Z"
      }
    ],
    "sinLeer": 1
  }
}
```

## Marcar una notificación como leída

Existe `PUT /api/notificaciones/:id/leida`, protegido por `verifyToken` y sin
restricción adicional por rol. Solo el destinatario puede actualizarla. Recibe
`{ "leida": true }` o `{ "leida": false }`; la respuesta exitosa envuelve la
notificación actualizada en `{ "ok": true, "data": ... }` y agrega `leidaEn`
(fecha ISO cuando se marca leída, `null` cuando se marca no leída).
