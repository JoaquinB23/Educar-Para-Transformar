# Contrato de API: consulta de datos de alumnos

## Alcance y autenticación

El backend declara las rutas directamente sobre Express en la raíz; no hay un montaje adicional del router. Por eso las rutas completas incluyen `/api` (por ejemplo, `GET /api/alumnos/:id`). Las rutas protegidas requieren `Authorization: Bearer <Firebase ID token>`.

Los ejemplos son ilustrativos: reconstruyen la forma de las respuestas desde el código y usan datos ficticios. No representan datos leídos de una base real.

## Alumno: consulta de sus datos

No existe una ruta única que devuelva todos los datos académicos del alumno. El flujo implementado por el dashboard es:

1. `GET /api/auth/me` obtiene el perfil autenticado; el alumno toma `data.alumnoId` de ahí.
2. `GET /api/alumnos/{alumnoId}` consulta el registro del alumno. El ID va en el **path**.
3. Las inscripciones y materias se consultan aparte con `GET /api/inscripciones?alumnoId={alumnoId}` y `GET /api/materias/{materiaId}`.

El perfil no tiene necesariamente `alumnoId`; si falta, el dashboard muestra que la cuenta no está vinculada.

### Respuesta de `GET /api/alumnos/{alumnoId}`

```json
{
  "ok": true,
  "data": {
    "id": "alumno-demo-001",
    "legajo": "AL-1042",
    "nombre": "Lucía",
    "apellido": "Pérez",
    "email": "lucia.perez@example.test",
    "nivel": "primaria",
    "estado": "activo"
  }
}
```

El endpoint devuelve `{ id, ...datos guardados en alumnos }`. El alta por `POST /api/alumnos` exige `legajo`, `nombre`, `apellido` y `email`; `nivel` es opcional en la entrada y toma `primaria` por defecto, y `estado` toma `activo` por defecto. Hay otro flujo de alta de alumnos que no guarda `nivel`, por lo que ese campo no está garantizado en todos los registros existentes.

### Datos académicos relacionados

`GET /api/inscripciones?alumnoId=alumno-demo-001` devuelve un arreglo en `data`. El filtro `alumnoId` es un **query param**; el backend no agrega automáticamente un filtro de ciclo lectivo a este listado.

```json
{
  "ok": true,
  "data": [
    {
      "id": "inscripcion-demo-001",
      "alumnoId": "alumno-demo-001",
      "materiaId": "materia-demo-001",
      "cicloLectivo": 2025,
      "estado": "cursando"
    }
  ]
}
```

Para cada `materiaId`, `GET /api/materias/{materiaId}` devuelve el documento de materia:

```json
{
  "ok": true,
  "data": {
    "id": "materia-demo-001",
    "codigo": "M001",
    "nombre": "Matemática",
    "cargaHoraria": 120,
    "cicloLectivo": 2025,
    "docenteId": "docente-demo-001",
    "nivel": "primaria"
  }
}
```

El esquema de alta de materias contempla `codigo`, `nombre`, `cargaHoraria`, `cicloLectivo`, `docenteId` y `nivel`; `docenteId` y `nivel` pueden ser `null`. El detalle de materia no expande el docente ni lo llama `profesor`: solo da `docenteId`.

Los horarios tienen otro endpoint, `GET /api/horarios?alumnoId=alumno-demo-001`. Su respuesta agrega el nombre del docente al bloque de horario cuando existe el vínculo:

```json
{
  "ok": true,
  "data": {
    "dias": [
      {
        "dia": 1,
        "nombre": "Lunes",
        "bloques": [
          {
            "id": "horario-demo-001",
            "materiaId": "materia-demo-001",
            "dia": 1,
            "horaInicio": "08:00",
            "horaFin": "09:15",
            "aula": "Aula 2",
            "docenteId": "docente-demo-001",
            "diaNombre": "Lunes",
            "materiaCodigo": "M001",
            "materiaNombre": "Matemática",
            "docente": {
              "id": "docente-demo-001",
              "nombre": "Sofía Gómez"
            }
          }
        ]
      },
      {
        "dia": 2,
        "nombre": "Martes",
        "bloques": []
      },
      {
        "dia": 3,
        "nombre": "Miércoles",
        "bloques": []
      },
      {
        "dia": 4,
        "nombre": "Jueves",
        "bloques": []
      },
      {
        "dia": 5,
        "nombre": "Viernes",
        "bloques": []
      }
    ],
    "bloques": [
      {
        "id": "horario-demo-001",
        "materiaId": "materia-demo-001",
        "dia": 1,
        "horaInicio": "08:00",
        "horaFin": "09:15",
        "aula": "Aula 2",
        "docenteId": "docente-demo-001",
        "diaNombre": "Lunes",
        "materiaCodigo": "M001",
        "materiaNombre": "Matemática",
        "docente": {
          "id": "docente-demo-001",
          "nombre": "Sofía Gómez"
        }
      }
    ],
    "materias": [
      {
        "id": "materia-demo-001",
        "codigo": "M001",
        "nombre": "Matemática"
      }
    ],
    "alumnos": ["alumno-demo-001"]
  }
}
```

En cada bloque, `aula` se normaliza a `null` si no está informada, y `docente` es `null` si no se encuentra el docente. El campo `docenteId` proviene del bloque si está guardado.

## Padre/familia: consulta de un hijo

No existe un endpoint que devuelva una lista de hijos. El cliente obtiene los IDs desde `GET /api/auth/me`, en el perfil del usuario con rol `familia`: `hijoPrimariaId` y/o `hijoSecundariaId`. El dashboard usa esos valores para consultar `GET /api/alumnos/{id}`; el ID se envía en el **path**, no en query ni en body. Los campos de vínculo solo aparecen en el perfil si tienen valor.

### Respuesta de `GET /api/alumnos/{hijoId}`

El contrato y la respuesta son los mismos que para el alumno: no hay una ruta ni una forma de respuesta específica para familia.

```json
{
  "ok": true,
  "data": {
    "id": "hijo-demo-001",
    "legajo": "AL-2087",
    "nombre": "Mateo",
    "apellido": "Pérez",
    "email": "mateo.perez@example.test",
    "nivel": "secundaria",
    "estado": "activo"
  }
}
```

El perfil consultado para obtener el vínculo tiene esta forma relevante:

```json
{
  "ok": true,
  "data": {
    "uid": "familia-demo-001",
    "email": "tutor@example.test",
    "dni": "30123456",
    "rol": "familia",
    "nivel": null,
    "nombre": "Andrea",
    "apellido": "Pérez",
    "actualizadoEn": "2025-01-15T12:00:00.000Z",
    "hijoPrimariaId": "hijo-demo-002",
    "hijoSecundariaId": "hijo-demo-001",
    "cicloLectivoActual": 2025
  }
}
```

La respuesta real de perfil puede incluir solo uno de los dos IDs de hijo. `GET /api/alumnos` no es una lista para padres: exige rol `admin`.

## Campos pedidos que no forman parte de un contrato existente

| Dato | Resultado según el código |
|---|---|
| `curso` | **NO EXISTE** como campo del registro de alumno ni como ruta/objeto de curso en este flujo. |
| Materias dentro de la respuesta del alumno o del hijo | **NO EXISTE** en `GET /api/alumnos/{id}`. Se obtienen aparte por inscripciones y materias. |
| Nombre del profesor dentro del detalle de materia | **NO EXISTE** como campo expandido; la materia expone `docenteId`. En los bloques de `/api/horarios` el campo se llama `docente` y contiene `id` y `nombre`. |
| Deportes con horario propio | **NO EXISTE** como recurso o campo independiente. El seed registra “Educación Física y Deportes” como materia; eso no define un horario deportivo independiente. |
| Horarios dentro de la respuesta de alumno/hijo | **NO EXISTE** en ese detalle. Hay que llamar a `/api/horarios?alumnoId={id}`. |
| Transporte | **NO EXISTE** en estos esquemas/endpoints. |
| Comedor | **NO EXISTE** en estos esquemas/endpoints. |

`nivel` es el nombre exacto del campo y sus valores canónicos en el backend son `primaria` y `secundaria`. No se encontró un campo `curso`.

## Roles y autorización

- `GET /api/auth/me`, `GET /api/alumnos/{id}`, `GET /api/inscripciones`, `GET /api/materias/{id}` y `GET /api/horarios` requieren token válido, pero no declaran `requireRole`; el backend no limita esas lecturas a los roles `alumno` o `familia`.
- `GET /api/alumnos/{id}` no compara el ID solicitado con `req.perfil.alumnoId`, `hijoPrimariaId` o `hijoSecundariaId`. Por lo tanto, **NO EXISTE** una validación de servidor que garantice que un padre consulte solo sus propios hijos (ni que un alumno consulte solo su registro). El dashboard cliente usa el ID del perfil, pero eso no es una restricción de autorización del endpoint.
- El middleware de rol, cuando una ruta lo usa, rechaza perfiles sin rol con `403` y `Tu usuario no tiene un rol asignado`, y roles no permitidos con `403` y `No tenés permisos para acceder a este recurso`. Las rutas de lectura descritas arriba no usan ese middleware.

## Errores documentados por el código

Las respuestas de error usan `{ "ok": false, "error": "..." }`.

| Ruta/situación | Status | Mensaje |
|---|---:|---|
| Cualquier ruta protegida sin `Authorization: Bearer ...` | 401 | `Falta el token de autenticación` |
| Token inválido o expirado | 401 | `Token inválido o expirado` |
| Error al leer el perfil durante la autenticación | 500 | `No se pudo leer el perfil del usuario: {detalle}` |
| `GET /api/auth/me`, perfil inexistente | 404 | `Perfil no encontrado en Firestore` |
| `GET /api/auth/me`, error de lectura | 500 | `Error al leer el perfil: {detalle}` |
| `GET /api/alumnos/{id}`, ID inexistente | 404 | `Alumno no encontrado` |
| `GET /api/alumnos/{id}`, error de lectura | 500 | `Error al buscar el alumno: {detalle}` |
| `GET /api/materias/{id}`, ID inexistente | 404 | `Materia no encontrada` |
| `GET /api/materias/{id}`, error de lectura | 500 | `Error al buscar la materia: {detalle}` |
| `GET /api/horarios` sin `alumnoId` ni `materiaId` | 400 | `Falta el query param alumnoId o materiaId` |
| `GET /api/horarios`, error de lectura | 500 | `Error al cargar los horarios: {detalle}` |
| `GET /api/inscripciones`, error de lectura | 500 | `Error al listar inscripciones: {detalle}` |
| Ruta no declarada | 404 | `Ruta no encontrada: {método} {ruta}` |

Los detalles entre llaves son concatenados desde el error recibido y no tienen un texto constante. Si el alumno no tiene materias inscriptas en el ciclo usado por `/api/horarios`, el endpoint responde `200` con `dias`, `bloques` y `materias` vacíos; no es un error.
