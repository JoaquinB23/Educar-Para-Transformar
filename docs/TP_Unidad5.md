# Unidad 5 — HU11: ficha médica por materia

## 1. Historia de usuario

### HU11

- **Como** docente.
- **Quiero** consultar y registrar la ficha médica de los alumnos inscriptos en una materia que tengo a cargo.
- **Para** que la información médica escolar esté disponible sólo para el personal docente relacionado académicamente con el alumno.

### Criterios de aceptación

1. **Dado** un docente autenticado, **cuando** abre la ficha médica, **entonces** ve el listado de alumnos inscriptos en sus materias del ciclo lectivo configurado.
2. **Dado** un docente y un alumno inscripto en una materia del ciclo configurado a cargo de ese docente, **cuando** selecciona al alumno, **entonces** puede consultar la ficha o crearla si todavía no existe.
3. **Dado** un docente que no tiene al alumno inscripto en una materia propia del ciclo configurado, **cuando** intenta consultar o modificar su ficha mediante la API, **entonces** el servidor responde `403` y no entrega ni modifica esa ficha.
4. **Dado** un usuario sin token válido, **cuando** solicita el listado docente o una ficha, **entonces** el servidor responde `401`.
5. **Dado** un alumno o un usuario de familia autenticado, **cuando** consulta una ficha, **entonces** sólo puede acceder, respectivamente, a su propia ficha o a la de sus hijos vinculados.
6. **Dado** un administrador autenticado, **cuando** consulta una ficha, **entonces** puede gestionarla sin la restricción de materia aplicada a docentes.

El ciclo se define en `CICLO_LECTIVO` dentro de `Backend/API_Server.js`; actualmente el valor en el código es **2025**. No debe inferirse del año del calendario.

## 2. Arquitectura verificada en el repositorio

### Tecnologías y capas

- **Frontend:** páginas HTML servidas como archivos estáticos, estilos CSS propios y Bootstrap por CDN; JavaScript nativo en módulos y scripts separados. No se encontró un framework de interfaz como React, Vue o Angular.
- **Servidor y API:** Node.js con Express 5. `Backend/API_Server.js` declara las rutas REST, validaciones y lógica de acceso. Express sirve `html/`, `css/`, `js/` e `img/`.
- **Autenticación:** el navegador usa Firebase Authentication. Las peticiones protegidas envían un Firebase ID token como `Authorization: Bearer ...`; `Backend/middleware/verifyToken.js` lo verifica con Firebase Admin y carga el perfil de `usuarios`.
- **Autorización:** `Backend/middleware/requireRole.js` aplica roles en las rutas que lo declaran. Las rutas de ficha también comprueban la relación docente–materia–inscripción en el servidor; ocultar enlaces del frontend no sustituye este control.
- **Persistencia:** Cloud Firestore mediante Firebase Admin (`Backend/firebaseAdmin.js`). HU11 usa las colecciones `usuarios`, `docentes`, `alumnos`, `materias`, `inscripciones` y `fichasMedicas`.

### Recorrido de HU11

1. `GET /api/auth/me` devuelve el perfil autenticado y el ciclo lectivo configurado.
2. `GET /api/docentes/alumnos` lista para el docente autenticado los alumnos asociados a sus materias del ciclo actual.
3. `GET /api/fichas-medicas?alumnoId=...` consulta la ficha. El backend limita al docente a alumnos inscriptos en una materia suya; el alumno y la familia tienen controles de propiedad/vínculo y el admin conserva acceso general.
4. `POST /api/fichas-medicas` crea o actualiza el encabezado. Está disponible para admin y docente, con comprobación de la relación para docentes.
5. `POST /api/fichas-medicas/:alumnoId/atenciones` agrega una atención, también con comprobación de la relación docente.
6. `DELETE /api/fichas-medicas/:alumnoId/atenciones/:atencionId` elimina una atención según las reglas de rol y relación del servidor.

El selector y las interacciones de la ficha están en `js/ficha-medica.js`; la vista, en `html/ficha-medica.html`.

### Roles

El backend declara los roles `admin`, `alumno`, `docente` y `familia`. La cuenta obtiene su rol del perfil de Firestore en `usuarios`; el formulario de inicio de sesión no debe considerarse fuente de autorización.

### Ejecución local

1. Instalar Node.js y pnpm.
2. Copiar `Backend/.env.example` a `Backend/.env` y completar las variables de Firebase Admin; copiar `js/env.example.js` a `js/env.js` para la configuración web. No publicar los archivos locales ni claves privadas.
3. En PowerShell:

   ```powershell
   Set-Location Backend
   pnpm install
   pnpm start
   ```

4. Abrir `http://localhost:3000/html/login.html`.

El puerto predeterminado es 3000 y puede cambiarse con `PORT`. Para las pruebas automatizadas se usa un Firestore simulado; no necesitan credenciales reales. El E2E de Cypress sí necesita una aplicación accesible y una cuenta/fixture de prueba.

## 3. Peer review

### Buenas prácticas para agilizar la revisión

- Mantener cambios pequeños y relacionados con una HU; describir el problema y la solución en el PR.
- Referenciar la HU y los criterios de aceptación que cubre.
- Mantener validaciones de autenticación, rol y relación de datos en el backend; no confiar en enlaces ocultos ni valores enviados por el navegador.
- Evitar credenciales, datos médicos reales y secretos en el repositorio, capturas, fixtures y logs.
- Usar nombres claros, formato consistente y errores explícitos; no ocultar excepciones con respuestas exitosas.
- Acompañar cambios de lógica con pruebas reproducibles y mostrar los comandos y resultados.
- Revisar impacto en permisos, datos existentes, configuración y compatibilidad antes de aprobar.

### Estrategias y checklist de revisión

1. Comparar el PR con la HU y sus criterios: confirmar el alcance y buscar cambios ajenos.
2. Trazar el flujo de extremo a extremo: pantalla → token → ruta → middleware → regla de autorización → Firestore.
3. Probar camino permitido, denegación y ausencia de autenticación; verificar tanto estado HTTP como datos devueltos.
4. Revisar altas, actualizaciones y borrados, incluyendo campos obligatorios y efectos en otras colecciones.
5. Ejecutar formato, lint, pruebas unitarias y E2E disponible; examinar fallos, no sólo el estado general del pipeline.
6. Confirmar que no se filtran secretos o datos personales y que CI/SonarCloud no reportan bloqueos.

Usar el checklist reproducible de [la plantilla de pull request](../.github/pull_request_template.md).

## 4. Calidad estática y automatización

La configuración del proyecto agrega ESLint para JavaScript, Prettier para formato, Husky con lint-staged para validar archivos staged al crear un commit, y GitHub Actions para ejecutar lint y pruebas en PR hacia `main`. Jest/Supertest ejercitan la API usando autenticación y datos simulados; Cypress define el caso E2E CP-001.

SonarCloud se configura en `sonar-project.properties` y puede importar `Backend/coverage/lcov.info` cuando se genera la cobertura Jest.

### Pasos manuales en GitHub

1. En **Settings → Secrets and variables → Actions**, crear `SONAR_TOKEN`. Para ejecutar CP-001 con datos reales de prueba, cargar además los secretos `CYPRESS_DOCENTE_DNI` y `CYPRESS_DOCENTE_PASSWORD`; configurar las variables `CYPRESS_BASE_URL`, `CYPRESS_DOCENTE_NIVEL`, `CYPRESS_ALUMNO_ASIGNADO` y `CYPRESS_ALUMNO_NO_ASIGNADO` según el entorno de prueba.
2. En **Settings → Branches** o **Rules → Rulesets**, agregar una regla para `main`: exigir pull request antes de integrar, al menos una aprobación, resolver conversaciones y exigir los checks de CI/SonarCloud correspondientes.
3. Elegir explícitamente si se descartan aprobaciones al agregar commits y si se prohíbe el push directo. Adaptar la regla a la política del curso/equipo.
4. No guardar contraseñas de prueba ni tokens en los archivos Cypress o de configuración versionados.

### Pasos manuales en SonarCloud

1. Crear o importar el proyecto desde GitHub y seleccionar el repositorio correcto.
2. Copiar el project key y la organization key que SonarCloud asigna y reemplazar los marcadores de `sonar-project.properties`.
3. Crear `SONAR_TOKEN` como secret del repositorio y confirmar que GitHub Actions puede leerlo.
4. Ejecutar el workflow; verificar que la cobertura LCOV se importe y que el análisis corresponda a la rama/PR.
5. Configurar el Quality Gate y su check como requerido en la regla de `main`. No declarar un umbral de cobertura no acordado por el equipo.

La integración necesita las claves reales de SonarCloud y el secreto de Actions; no se incluyen valores inventados en el repositorio.

## 5. Pruebas HU11

- **Jest + Supertest:** verifican acceso con bearer token, denegación sin token, filtrado del roster por materia y denegación a un docente ajeno a la inscripción.
- **Cypress CP-001:** inicia sesión como docente, busca al alumno asignado, verifica que el alumno no asignado no aparezca, crea/actualiza la ficha con un marcador de prueba y vuelve a abrirla para confirmar persistencia.
- **Regresión:** una prueba de autorización asegura que un docente de otra materia siga recibiendo `403`; previene la regresión de mostrar o permitir fichas fuera de la relación académica.

Para activar CP-001 hay que proporcionar una URL de entorno, DNI/contraseña de una cuenta docente de prueba, nivel de esa cuenta, un texto de búsqueda único del alumno asignado y otro del alumno no asignado. La prueba no debe usar cuentas ni información médica de personas reales.

## 6. Métricas

### Cobertura de código

- **Qué mide:** proporción de líneas/ramas ejecutadas por las pruebas automatizadas.
- **Evaluación:** ejecutar `pnpm test:coverage` desde `Backend`; revisar el resumen Jest y `Backend/coverage/lcov.info`. SonarCloud puede importar LCOV para mostrar cobertura nueva y global en PR. Evaluar la tendencia y las líneas críticas de autorización; un porcentaje alto no reemplaza pruebas de denegación.

### Cycle time de las HU

- **Qué mide:** tiempo transcurrido desde que una HU se toma como trabajo activo hasta que su PR queda integrado en `main`. Acordar y mantener esa definición para que las comparaciones sean consistentes.
- **Evaluación:** registrar los momentos de inicio y merge en GitHub Projects o en el issue asociado; calcular por HU (fecha/hora de merge menos fecha/hora de inicio), comparar mediana por iteración y revisar outliers. GitHub Actions y SonarCloud validan calidad, pero no calculan por sí mismos este cycle time; hace falta mantener timestamps/estados en el tablero o extraerlos de la API de GitHub.
