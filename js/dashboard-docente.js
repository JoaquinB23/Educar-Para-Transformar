// js/dashboard-docente.js
// Requiere que auth-guard.js ya haya corrido (window.fetchConAuth, window.cerrarSesion)
//
// Maneja dos secciones que comparten la misma fuente de datos (materias del
// docente -> inscripciones -> alumnos):
//   - asistencia:      GET/POST /api/asistencias
//   - calificaciones:  GET/POST /api/calificaciones

document.addEventListener('DOMContentLoaded', async () => {

    // ─── Estado ──────────────────────────────────────────────────────────────
    const state = {
        perfil: null,
        materias: [],        // [{ ...materia, alumnos: [{id, legajo, apellido, nombre}] }]
    };

    const $ = (id) => document.getElementById(id);

    const btnCerrar = $('btnCerrarSesionTop');
    if (btnCerrar) btnCerrar.addEventListener('click', () => window.cerrarSesion());

    // ─── Referencias asistencia ──────────────────────────────────────────────
    const selMateria     = $('selectMateriaAsistencia');
    const fechaInput     = $('fechaAsistencia');
    const tablaAsistencia = $('tablaAsistencia');
    const btnGuardarAsis = $('btnGuardarAsistencia');

    // Fecha de hoy por default, formato YYYY-MM-DD (el que espera input type="date")
    if (fechaInput) fechaInput.value = new Date().toISOString().split('T')[0];

    // ─── Referencias calificaciones ──────────────────────────────────────────
    const selMateriaCal   = $('selectMateriaCalificaciones');
    const selTrimestre    = $('selectTrimestre');
    const tablaCal        = $('tablaCalificacionesDocente');
    const btnGuardarCal   = $('btnGuardarCalificaciones');
    const estadoCal       = $('estadoCalificaciones');

    // ─── Referencias tabla de alumnos ────────────────────────────────────────
    const tablaAlumnos    = $('tablaAlumnos');
    const filtroMateria   = $('filtroMateria');

    // ═══ CARGA INICIAL ═══════════════════════════════════════════════════════

    await window.authReady;

    try {
        // 1. Perfil real del docente logueado
        const respPerfil = await window.fetchConAuth('/api/auth/me');
        if (!respPerfil.ok) throw new Error('No se pudo cargar el perfil');
        state.perfil = (await respPerfil.json()).data;

        // Esconde los links del menú que este rol no puede usar (p.ej. el panel
        // de administración). Va recién acá porque antes no se sabe el rol.
        window.aplicarPermisosNav(state.perfil.rol);

        const nombreDocente = [state.perfil.nombre, state.perfil.apellido].filter(Boolean).join(' ');
        $('txtBienvenida').innerText      = `Bienvenido, Prof. ${nombreDocente}`;
        $('txtNombreSidebar').innerText   = nombreDocente;
        $('navNombreDocente').innerText   = nombreDocente;
        $('perfilNombreCompleto').innerText = nombreDocente;
        $('perfilRol').innerText          = `Rol verificado: ${(state.perfil.rol || '').toUpperCase()}`;
        $('badgeCicloDocente').innerText  = `Ciclo Lectivo ${state.perfil.cicloLectivoActual}`;

        if (!state.perfil.docenteId) {
            aviso('Tu cuenta no está vinculada a un registro de docente.', selMateria, tablaAsistencia);
            return;
        }

        // 2. Materias a cargo + alumnos inscriptos de cada una
        const respMaterias = await window.fetchConAuth('/api/materias');
        if (!respMaterias.ok) throw new Error('No se pudieron cargar las materias');
        const { data: todasLasMaterias } = await respMaterias.json();

        state.materias = todasLasMaterias
            .filter((m) => m.docenteId === state.perfil.docenteId)
            .map((m) => ({ ...m, alumnos: [] }));

        if (state.materias.length === 0) {
            aviso('No tenés materias asignadas.', selMateria, tablaAsistencia);
            aviso('No tenés materias asignadas.', selMateriaCal, tablaCal);
            return;
        }

        await cargarAlumnosDeTodasLasMaterias();
        pintarSelectores();

        // 3. Primera materia en ambos selectores
        if (selMateria) {
            selMateria.value = state.materias[0].id;
            selMateria.addEventListener('change', () => {
                pintarAlumnosDeMateria(selMateria.value, tablaAsistencia, fechaInput.value);
            });
            await pintarAlumnosDeMateria(selMateria.value, tablaAsistencia, fechaInput.value);
        }
        if (fechaInput) {
            fechaInput.addEventListener('change', () => {
                pintarAlumnosDeMateria(selMateria.value, tablaAsistencia, fechaInput.value);
            });
        }
        if (btnGuardarAsis) btnGuardarAsis.addEventListener('click', guardarAsistencia);

        if (selMateriaCal) {
            selMateriaCal.value = state.materias[0].id;
            selMateriaCal.addEventListener('change', () => pintarGrillaCalificaciones());
        }
        if (selTrimestre) {
            selTrimestre.addEventListener('change', () => pintarGrillaCalificaciones());
        }
        if (btnGuardarCal) btnGuardarCal.addEventListener('click', guardarCalificaciones);
        await pintarGrillaCalificaciones();

        if (filtroMateria) {
            pintarFiltroMaterias();
            filtroMateria.addEventListener('change', filtrarAlumnos);
        }
        pintarTablaAlumnos();

    } catch (err) {
        console.error('Error inicializando el portal docente:', err);
        aviso('Ocurrió un error al cargar tus materias. Intentá recargar la página.',
              selMateria, tablaAsistencia);
    }

    // ═══ HELPERS ════════════════════════════════════════════════════════════

    function aviso(mensaje, select, tabla) {
        if (select) select.innerHTML = '<option value="">—</option>';
        if (tabla) {
            const colspan = tabla === tablaCal ? 4 : 3;
            tabla.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted py-4">${mensaje}</td></tr>`;
        }
    }

    // Trae los alumnos inscriptos de cada materia del docente, una sola vez.
    async function cargarAlumnosDeTodasLasMaterias() {
        const todasLasInscripciones = await Promise.all(
            state.materias.map((m) =>
                window.fetchConAuth(`/api/inscripciones?materiaId=${m.id}`)
                    .then((r) => r.json())
                    .then((j) => j.data || [])
            )
        );

        await Promise.all(state.materias.map(async (materia, i) => {
            const inscripciones = todasLasInscripciones[i];
            if (inscripciones.length === 0) { materia.alumnos = []; return; }

            const alumnos = await Promise.all(
                inscripciones.map(async (insc) => {
                    const r = await window.fetchConAuth(`/api/alumnos/${insc.alumnoId}`);
                    if (!r.ok) return null;
                    return (await r.json()).data;
                })
            );
            materia.alumnos = alumnos.filter(Boolean);
        }));
    }

    function pintarSelectores() {
        const opciones = state.materias
            .map((m) => `<option value="${m.id}">${m.codigo} — ${m.nombre}</option>`)
            .join('');
        if (selMateria)     selMateria.innerHTML = opciones;
        if (selMateriaCal)  selMateriaCal.innerHTML = opciones;
    }

    function pintarFiltroMaterias() {
        filtroMateria.innerHTML = '<option value="">Todas las materias</option>' +
            state.materias.map((m) => `<option value="${m.id}">${m.codigo} — ${m.nombre}</option>`).join('');
    }

    function filtrarAlumnos() {
        const valor = filtroMateria.value;
        document.querySelectorAll('#tablaAlumnos tr[data-materia]').forEach((tr) => {
            tr.style.display = (!valor || tr.dataset.materia === valor) ? '' : 'none';
        });
    }

    // Tabla de alumnos del docente: ahora sale de las inscripciones reales,
    // no de las filas fijas que había antes en el HTML.
    function pintarTablaAlumnos() {
        if (!tablaAlumnos) return;

        const filas = [];
        for (const materia of state.materias) {
            for (const alumno of materia.alumnos) {
                filas.push({ materia, alumno });
            }
        }

        if (filas.length === 0) {
            tablaAlumnos.innerHTML =
                '<tr><td colspan="5" class="text-center text-muted py-4">No tenés alumnos inscriptos.</td></tr>';
            return;
        }

        tablaAlumnos.innerHTML = filas.map(({ materia, alumno }) => `
            <tr data-materia="${materia.id}">
                <td><code>${alumno.legajo || '-'}</code></td>
                <td class="fw-bold">${alumno.apellido}, ${alumno.nombre}</td>
                <td>${materia.codigo} — ${materia.nombre}</td>
                <td><span class="badge bg-success-subtle text-success border border-success-subtle">Inscripto</span></td>
                <td>
                    <div class="d-flex gap-1 flex-wrap">
                        <button class="btn btn-sm btn-outline-primary rounded-pill"
                                data-materia="${materia.id}" data-legajo="${alumno.legajo || ''}">
                            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">grading</span> Notas
                        </button>
                        <a class="btn btn-sm btn-outline-secondary rounded-pill"
                           href="ficha-medica.html?alumnoId=${alumno.id}"
                           title="Abrir la ficha médica de ${alumno.nombre} ${alumno.apellido}">
                            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">medical_information</span> Ficha
                        </a>
                    </div>
                </td>
            </tr>`).join('');

        // El botón precarga la grilla de esa materia
        tablaAlumnos.querySelectorAll('button[data-materia]').forEach((btn) => {
            btn.addEventListener('click', () => {
                selMateriaCal.value = btn.dataset.materia;
                pintarGrillaCalificaciones();
                $('seccionCalificaciones').scrollIntoView({ behavior: 'smooth' });
            });
        });
    }

    // ═══ ASISTENCIA ═════════════════════════════════════════════════════════

    async function pintarAlumnosDeMateria(materiaId, tabla, fecha) {
        if (!materiaId || !tabla) return;

        tabla.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">Cargando...</td></tr>`;

        const materia = state.materias.find((m) => m.id === materiaId);
        if (!materia) return;

        if (materia.alumnos.length === 0) {
            tabla.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">
                No hay alumnos inscriptos en esta materia.
            </td></tr>`;
            return;
        }

        // Si ya se tomó asistencia para esa fecha, la cargamos para pre-marcar.
        const estadoPrevio = {};
        try {
            const resp = await window.fetchConAuth(`/api/asistencias?materiaId=${materiaId}&fecha=${fecha}`);
            if (resp.ok) {
                const { data } = await resp.json();
                (data || []).forEach((a) => { estadoPrevio[a.alumnoId] = a.estado; });
            }
        } catch (e) {
            console.error('No se pudieron precargar las asistencias:', e);
        }

        tabla.innerHTML = materia.alumnos.map((a) => `
            <tr data-alumno-id="${a.id}">
                <td><code>${a.legajo || '-'}</code></td>
                <td class="fw-bold">${a.apellido}, ${a.nombre}</td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        <input type="radio" class="btn-check" name="estado-${a.id}" id="presente-${a.id}" value="presente" ${estadoPrevio[a.id] === 'presente' || !estadoPrevio[a.id] ? 'checked' : ''}>
                        <label class="btn btn-outline-success" for="presente-${a.id}">Presente</label>
                        <input type="radio" class="btn-check" name="estado-${a.id}" id="tarde-${a.id}" value="tarde" ${estadoPrevio[a.id] === 'tarde' ? 'checked' : ''}>
                        <label class="btn btn-outline-warning" for="tarde-${a.id}">Tarde</label>
                        <input type="radio" class="btn-check" name="estado-${a.id}" id="ausente-${a.id}" value="ausente" ${estadoPrevio[a.id] === 'ausente' ? 'checked' : ''}>
                        <label class="btn btn-outline-danger" for="ausente-${a.id}">Ausente</label>
                    </div>
                </td>
            </tr>`).join('');
    }

    async function guardarAsistencia() {
        const materiaId = selMateria.value;
        const fecha = fechaInput.value;
        if (!materiaId || !fecha) return;

        const registros = Array.from(tablaAsistencia.querySelectorAll('tr[data-alumno-id]')).map((fila) => {
            const alumnoId = fila.dataset.alumnoId;
            const seleccionado = fila.querySelector(`input[name="estado-${alumnoId}"]:checked`);
            return { alumnoId, estado: seleccionado ? seleccionado.value : 'presente' };
        });

        if (registros.length === 0) return alert('No hay alumnos para marcar.');

        btnGuardarAsis.disabled = true;
        btnGuardarAsis.innerText = 'Guardando...';

        try {
            const resp = await window.fetchConAuth('/api/asistencias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ materiaId, fecha, registros }),
            });
            const result = await resp.json();

            if (!resp.ok || !result.ok) {
                alert(result.error || 'Error al guardar la asistencia.');
                return;
            }

            // El backend devuelve { registros, descartados, avisos }.
            // Ojo con el nombre: `registros` ya existe arriba con lo que se envía.
            // Redeclararlo acá creaba una zona muerta y el body de la línea 294
            // reventaba con ReferenceError antes de llegar al fetch.
            const {
                registros: guardados = [],
                descartados = [],
                avisos = { generadas: 0, sinTutor: [] }
            } = result.data;

            let mensaje = `Asistencia guardada: ${guardados.length} alumnos.`;
            if (avisos.generadas > 0) mensaje += ` Se avisó a ${avisos.generadas} tutor(es).`;
            if (descartados.length > 0) mensaje += ` ⚠ ${descartados.length} registro(s) descartados por datos inválidos.`;
            if (avisos.sinTutor && avisos.sinTutor.length > 0) {
                mensaje += ` ${avisos.sinTutor.length} alumno(s) sin tutor vinculado.`;
            }
            alert(mensaje);

        } catch (err) {
            console.error(err);
            alert('No se pudo conectar con el servidor.');
        } finally {
            btnGuardarAsis.disabled = false;
            btnGuardarAsis.innerText = 'Guardar Asistencia';
        }
    }

    // ═══ CALIFICACIONES ══════════════════════════════════════════════════════

    // Precarga con GET /api/calificaciones para que el docente vea lo ya cargado.
    async function pintarGrillaCalificaciones() {
        if (!tablaCal) return;
        const materiaId = selMateriaCal ? selMateriaCal.value : '';
        const trimestre = selTrimestre ? Number(selTrimestre.value) : 1;

        if (!materiaId) return aviso('Seleccioná una materia.', null, tablaCal);

        const materia = state.materias.find((m) => m.id === materiaId);
        if (!materia || materia.alumnos.length === 0) {
            return aviso('No hay alumnos inscriptos en esta materia.', null, tablaCal);
        }

        tablaCal.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">Cargando notas...</td></tr>`;

        let previas = {};
        try {
            const resp = await window.fetchConAuth(
                `/api/calificaciones?materiaId=${materiaId}&trimestre=${trimestre}`);
            if (resp.ok) {
                const { data } = await resp.json();
                (data || []).forEach((c) => { previas[c.alumnoId] = c.nota; });
            }
        } catch (e) {
            console.error('No se pudieron precargar las notas:', e);
        }

        if (estadoCal) {
            estadoCal.textContent = `${materia.codigo} — ${materia.nombre} · ${trimestre}° trimestre`;
        }

        tablaCal.innerHTML = materia.alumnos.map((a) => `
            <tr data-alumno-id="${a.id}">
                <td><code>${a.legajo || '-'}</code></td>
                <td class="fw-bold">${a.apellido}, ${a.nombre}</td>
                <td class="text-center" style="width:140px">
                    <input type="number" class="form-control form-control-sm text-center nota-input"
                           data-alumno-id="${a.id}" min="0" max="10" step="0.01"
                           placeholder="-"
                           value="${previas[a.id] !== undefined ? previas[a.id] : ''}">
                </td>
                <td class="text-center">
                    <span class="badge ${previas[a.id] !== undefined ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-secondary-subtle text-secondary border'}">
                        ${previas[a.id] !== undefined ? 'Cargada' : 'Sin nota'}
                    </span>
                </td>
            </tr>`).join('');
    }

    async function guardarCalificaciones() {
        const materiaId = selMateriaCal.value;
        const trimestre = Number(selTrimestre.value);
        if (!materiaId) return;

        // Campo vacío = borrar la nota de ese trimestre.
        const notas = Array.from(tablaCal.querySelectorAll('input.nota-input')).map((input) => ({
            alumnoId: input.dataset.alumnoId,
            nota: input.value.trim() === '' ? null : input.value,
        }));

        if (notas.length === 0) return alert('No hay alumnos para cargar.');

        btnGuardarCal.disabled = true;
        btnGuardarCal.innerText = 'Guardando...';

        try {
            const resp = await window.fetchConAuth('/api/calificaciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ materiaId, trimestre, notas }),
            });
            const result = await resp.json();

            if (!resp.ok || !result.ok) {
                alert(result.error || 'Error al guardar las calificaciones.');
                return;
            }

            const { registros = [], descartados = [] } = result.data;
            let mensaje = `Notas guardadas: ${registros.length}.`;
            if (descartados.length > 0) mensaje += ` ⚠ ${descartados.length} descartada(s) por datos inválidos.`;
            alert(mensaje);

            await pintarGrillaCalificaciones();
        } catch (err) {
            console.error(err);
            alert('No se pudo conectar con el servidor.');
        } finally {
            btnGuardarCal.disabled = false;
            btnGuardarCal.innerText = 'Guardar Notas';
        }
    }
});