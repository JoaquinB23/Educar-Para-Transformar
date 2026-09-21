// js/dashboard-docente.js
// Requiere que auth-guard.js ya haya corrido (window.fetchConAuth, window.cerrarSesion)

document.addEventListener('DOMContentLoaded', async () => {

    const selectMateria = document.getElementById('selectMateriaAsistencia');
    const fechaInput = document.getElementById('fechaAsistencia');
    const tablaAsistencia = document.getElementById('tablaAsistencia');
    const btnGuardar = document.getElementById('btnGuardarAsistencia');
    const btnCerrar = document.getElementById('btnCerrarSesionTop');

    if (btnCerrar) btnCerrar.addEventListener('click', () => window.cerrarSesion());

    // Fecha de hoy por default, formato YYYY-MM-DD (el que espera el input type="date")
    if (fechaInput) {
        const hoy = new Date().toISOString().split('T')[0];
        fechaInput.value = hoy;
    }

    let perfil = null;
    let materiasDocente = [];

    try {
        await window.authReady;
        // 1. Perfil real del docente logueado
        const respPerfil = await window.fetchConAuth('/api/auth/me');
        if (!respPerfil.ok) throw new Error('No se pudo cargar el perfil');
        const perfilData = await respPerfil.json();
        perfil = perfilData.data;

        document.getElementById('txtBienvenida').innerText = `Bienvenido, Prof. ${perfil.nombre || ''}`;
        document.getElementById('txtNombreSidebar').innerText = perfil.nombre || '';
        document.getElementById('navNombreDocente').innerText = perfil.nombre || '';
        document.getElementById('perfilNombreCompleto').innerText = perfil.nombre || '';
        document.getElementById('perfilRol').innerText = `Rol verificado: ${(perfil.rol || '').toUpperCase()}`;

        if (!perfil.docenteId) {
            selectMateria.innerHTML = '<option value="">Tu cuenta no está vinculada a un registro de docente</option>';
            return;
        }

        // 2. Materias a cargo de este docente
        const respMaterias = await window.fetchConAuth('/api/materias');
        if (!respMaterias.ok) throw new Error('No se pudieron cargar las materias');
        const { data: todasLasMaterias } = await respMaterias.json();
        materiasDocente = todasLasMaterias.filter((m) => m.docenteId === perfil.docenteId);

        if (materiasDocente.length === 0) {
            selectMateria.innerHTML = '<option value="">No tenés materias asignadas</option>';
            return;
        }

        selectMateria.innerHTML = materiasDocente
            .map((m) => `<option value="${m.id}">${m.codigo} — ${m.nombre}</option>`)
            .join('');

        // Cargamos la lista de alumnos de la primera materia por default
        await cargarAlumnosDeMateria(selectMateria.value);

    } catch (err) {
        console.error('Error inicializando asistencia:', err);
        if (tablaAsistencia) {
            tablaAsistencia.innerHTML = `<tr><td colspan="3" class="text-center text-danger py-4">
                Ocurrió un error al cargar tus materias. Intentá recargar la página.
            </td></tr>`;
        }
    }

    if (selectMateria) {
        selectMateria.addEventListener('change', () => cargarAlumnosDeMateria(selectMateria.value));
    }
    if (fechaInput) {
        fechaInput.addEventListener('change', () => cargarAlumnosDeMateria(selectMateria.value));
    }

    async function cargarAlumnosDeMateria(materiaId) {
        if (!materiaId || !tablaAsistencia) return;

        tablaAsistencia.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">Cargando...</td></tr>`;

        try {
            // Alumnos inscriptos en esta materia
            const respInsc = await window.fetchConAuth(`/api/inscripciones?materiaId=${materiaId}`);
            const { data: inscripciones } = await respInsc.json();

            if (inscripciones.length === 0) {
                tablaAsistencia.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">
                    No hay alumnos inscriptos en esta materia.
                </td></tr>`;
                return;
            }

            // Detalle de cada alumno
            const alumnos = await Promise.all(
                inscripciones.map(async (insc) => {
                    const resp = await window.fetchConAuth(`/api/alumnos/${insc.alumnoId}`);
                    if (!resp.ok) return null;
                    const { data } = await resp.json();
                    return data;
                })
            );

            // Si ya se tomó asistencia hoy para esta materia, la traemos para
            // pre-marcar los estados en vez de arrancar de cero
            const fecha = fechaInput.value;
            const respExistente = await window.fetchConAuth(`/api/asistencias?materiaId=${materiaId}&fecha=${fecha}`);
            let asistenciasExistentes = [];
            if (respExistente.ok) {
                const result = await respExistente.json();
                if (result.data) asistenciasExistentes = result.data;
            }
            
            const estadoPrevio = {};
            asistenciasExistentes.forEach((a) => { estadoPrevio[a.alumnoId] = a.estado; });

            tablaAsistencia.innerHTML = alumnos
                .filter(Boolean)
                .map((a) => `
                    <tr data-alumno-id="${a.id}">
                        <td><code>${a.legajo}</code></td>
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
                    </tr>
                `)
                .join('');

        } catch (err) {
            console.error('Error cargando alumnos de la materia:', err);
            tablaAsistencia.innerHTML = `<tr><td colspan="3" class="text-center text-danger py-4">
                Error al cargar los alumnos.
            </td></tr>`;
        }
    }

    if (btnGuardar) {
        btnGuardar.addEventListener('click', async () => {
            const materiaId = selectMateria.value;
            const fecha = fechaInput.value;
            if (!materiaId || !fecha) return;

            const filas = tablaAsistencia.querySelectorAll('tr[data-alumno-id]');
            const registros = Array.from(filas).map((fila) => {
                const alumnoId = fila.dataset.alumnoId;
                const seleccionado = fila.querySelector(`input[name="estado-${alumnoId}"]:checked`);
                return { alumnoId, estado: seleccionado ? seleccionado.value : 'presente' };
            });

            btnGuardar.disabled = true;
            btnGuardar.innerText = 'Guardando...';

            try {
                const resp = await window.fetchConAuth('/api/asistencias', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ materiaId, fecha, registros }),
                });
                const result = await resp.json();

                if (result.ok) {
                    alert('Asistencia guardada correctamente.');
                } else {
                    alert(result.error || 'Error al guardar la asistencia.');
                }
            } catch (err) {
                console.error(err);
                alert('No se pudo conectar con el servidor.');
            } finally {
                btnGuardar.disabled = false;
                btnGuardar.innerText = 'Guardar Asistencia';
            }
        });
    }
});