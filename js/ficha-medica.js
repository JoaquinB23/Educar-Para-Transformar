// js/ficha-medica.js
// GET  /api/fichas-medicas?alumnoId=X   → encabezado + array de atenciones
// POST /api/fichas-medicas              → encabezado (upsert), admin y docente
// POST /api/fichas-medicas/:id/atenciones → suma una atención
// DELETE /api/fichas-medicas/:id/atenciones/:atencionId
//
// Admin puede gestionar cualquier ficha. Docentes sólo pueden gestionar
// fichas de alumnos inscriptos en sus materias del ciclo lectivo actual.
// Alumnos y tutores vinculados sólo pueden leer.

const ROLES_QUE_ESCRIBEN = ['admin', 'docente'];

const state = {
    perfil: null,
    alumnoId: null,
    ficha: null,
};

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
    $('btnRecargar').addEventListener('click', () => cargarFicha());

    await window.authReady;

    const respPerfil = await window.fetchConAuth('/api/auth/me');
    if (!respPerfil.ok) return;
    state.perfil = (await respPerfil.json()).data;
    window.aplicarPermisosNav(state.perfil.rol);

    $('perfilRolFicha').innerText = (state.perfil.rol || '').toUpperCase();
    $('aFecha').value = new Date().toISOString().split('T')[0];

    const puedeEscribir = ROLES_QUE_ESCRIBEN.includes(state.perfil.rol);
    $('btnEditarFicha').classList.toggle('d-none', !puedeEscribir);
    $('btnNuevaAtencion').classList.toggle('d-none', !puedeEscribir);

    // Admin busca cualquier alumno; docentes sólo los de sus materias activas.
    if (state.perfil.rol === 'admin' || state.perfil.rol === 'docente') {
        $('txtAlumnoFicha').innerText = 'Seleccioná un alumno en el buscador.';
        $('panelBuscador').classList.remove('d-none');
        $('inputBuscarAlumno').placeholder = state.perfil.rol === 'docente'
            ? 'Buscá entre tus alumnos por nombre, apellido o legajo...'
            : 'Escribí el nombre, apellido o legajo...';
        $('inputBuscarAlumno').addEventListener('input', (evento) => {
            buscarAlumnos(evento).catch(mostrarErrorBuscador);
        });
        if (state.perfil.rol === 'docente') {
            try {
                await cargarAlumnosBuscables();
                pintarResultadosAlumno('');
            } catch (error) {
                mostrarErrorBuscador(error);
            }
        }
    }

    // El alumnoId puede venir por query (?alumnoId=X) o del propio perfil.
    const porQuery = new URLSearchParams(window.location.search).get('alumnoId');

    if (porQuery) {
        state.alumnoId = porQuery;
        await cargarFicha();
    }

    // Cada rol entra con su alumno por defecto si no vino por query.
    if (!state.alumnoId) {
        state.alumnoId = alumnoPorDefecto(state.perfil);
        if (state.alumnoId) {
            await cargarFicha();
        } else if (state.perfil.rol !== 'docente' && state.perfil.rol !== 'admin') {
            $('msgSinVinculo').classList.remove('d-none');
            $('msgSinVinculoDetalle').textContent =
                ' Tu cuenta no tiene un alumno vinculado. Contactá a administración.';
        }
    }
});

// El alumno que corresponde según el rol: el propio alumno, o el hijo que el
// tutor tiene vinculado en primaria o secundaria.
function alumnoPorDefecto(perfil) {
    if (perfil.alumnoId) return perfil.alumnoId;
    if (perfil.hijoPrimariaId) return perfil.hijoPrimariaId;
    if (perfil.hijoSecundariaId) return perfil.hijoSecundariaId;
    return null;
}

// ─── Buscador de alumnos autorizados ────────────────────────────────────────

let todosLosAlumnos = null;
let errorBuscador = '';

// Sin acentos: buscar "garcia" tiene que encontrar a "García".
const normalizarTexto = (s) =>
    String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const ENTIDADES_HTML = new Map([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
]);

const escaparHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ENTIDADES_HTML.get(c));

async function cargarAlumnosBuscables() {
    if (todosLosAlumnos !== null) return;
    const url = state.perfil.rol === 'docente' ? '/api/docentes/alumnos' : '/api/alumnos';
    const resp = await window.fetchConAuth(url);
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json?.ok) {
        throw new Error(json?.error || 'No se pudo cargar el listado de alumnos.');
    }
    todosLosAlumnos = json.data || [];
}

async function buscarAlumnos(e) {
    const q = normalizarTexto(e.target.value.trim());
    await cargarAlumnosBuscables();
    pintarResultadosAlumno(q);
}

function mostrarErrorBuscador(error) {
    errorBuscador = error.message || 'No se pudo cargar el listado de alumnos.';
    $('resultadosAlumno').innerHTML = `<p class="text-danger small mb-0">${escaparHtml(errorBuscador)}</p>`;
}

function pintarResultadosAlumno(q) {
    const cont = $('resultadosAlumno');
    errorBuscador = '';
    const esDocente = state.perfil.rol === 'docente';
    if (q.length < 2 && !esDocente) { cont.innerHTML = ''; return; }

    const filtrados = todosLosAlumnos.filter((a) =>
        normalizarTexto(`${a.nombre} ${a.apellido} ${a.legajo}`).includes(q)
    ).slice(0, esDocente ? 100 : 10);

    if (filtrados.length === 0) {
        cont.innerHTML = esDocente && todosLosAlumnos.length === 0
            ? '<p class="text-muted small mb-0">No tenés alumnos inscriptos en tus materias este ciclo. Pedí a administración que revise la asignación del docente y las inscripciones.</p>'
            : '<p class="text-muted small mb-0">Sin resultados.</p>';
        return;
    }

    cont.innerHTML = filtrados.map((a) => `
        <button type="button" class="list-group-item list-group-item-action"
                data-alumno-id="${escaparHtml(a.id)}">
            <strong>${escaparHtml(`${a.apellido || ''}, ${a.nombre || ''}`)}</strong>
            <span class="text-muted small"> · ${escaparHtml(a.legajo || 'sin legajo')}</span>
            ${esDocente && a.materias?.length
                ? `<span class="text-muted small d-block">${a.materias.map((materia) => escaparHtml(`${materia.codigo ? `${materia.codigo} — ` : ''}${materia.nombre}`)).join(' · ')}</span>`
                : ''}
        </button>`).join('');

    cont.querySelectorAll('button[data-alumno-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.alumnoId = btn.dataset.alumnoId;
            $('inputBuscarAlumno').value = '';
            cont.innerHTML = '';
            cargarFicha();
        });
    });
}

// ─── Carga principal ───────────────────────────────────────────────────────

async function cargarFicha() {
    if (!state.alumnoId) return;

    const cont = $('contenidoFicha');
    cont.classList.add('d-none');
    $('txtAlumnoFicha').innerText = 'Cargando...';

    try {
        const resp = await window.fetchConAuth(`/api/fichas-medicas?alumnoId=${state.alumnoId}`);
        const json = await resp.json();

        if (!resp.ok || !json.ok) throw new Error(json.error || `HTTP ${resp.status}`);

        const { alumno, ficha, mensaje } = json.data;
        state.ficha = ficha;

        $('txtAlumnoFicha').innerText = `${alumno.nombre} ${alumno.apellido} · ${alumno.legajo || 'sin legajo'}`;

        if (!ficha) {
            $('msgSinVinculo').classList.remove('d-none');
            $('txtEstadoFicha').textContent = 'Ficha médica sin cargar.';
            $('msgSinVinculoDetalle').textContent = ` ${mensaje || 'Podés crearla con el botón Editar.'}`;
            // Si puede escribir, mostramos el formulario igual para que la cree.
            if (ROLES_QUE_ESCRIBEN.includes(state.perfil.rol)) {
                cont.classList.remove('d-none');
                pintarDatosGenerales({ alumnoId: state.alumnoId, alergias: [], condiciones: [], atenciones: [] });
                pintarAtenciones([]);
            }
            return;
        }

        $('msgSinVinculo').classList.add('d-none');
        cont.classList.remove('d-none');
        pintarDatosGenerales(ficha);
        pintarAlertas(ficha);
        pintarAtenciones(ficha.atenciones || []);

    } catch (err) {
        console.error('Error al cargar la ficha:', err);
        $('txtAlumnoFicha').innerText = 'Error al cargar';
        alert(err.message);
    }
}

// ─── Render ────────────────────────────────────────────────────────────────

function pintarDatosGenerales(ficha) {
    const contacto = ficha.contactoEmergencia || {};
    const celdas = [
        ['Alumno', ficha.alumnoId || '-'],
        ['Grupo sanguíneo', ficha.grupoSanguineo || 'No cargado'],
        ['Medicación actual', ficha.medicacion || 'Ninguna'],
        ['Alergias', (ficha.alergias || []).join(', ') || 'Ninguna registrada'],
        ['Condiciones', (ficha.condiciones || []).join(', ') || 'Ninguna registrada'],
        ['Contacto de emergencia', [contacto.nombre, contacto.telefono].filter(Boolean).join(' · ') || 'No cargado'],
        ['Observaciones', ficha.observaciones || '—'],
        ['Actualizada', ficha.actualizadoEn ? new Date(ficha.actualizadoEn).toLocaleDateString('es-AR') : '—'],
    ];

    $('datosGenerales').innerHTML = celdas.map(([k, v]) => `
        <div class="col-md-6 col-lg-3">
            <p class="text-muted text-uppercase small fw-bold mb-1">${k}</p>
            <p class="fw-semibold mb-0 text-break">${v}</p>
        </div>`).join('');
}

function pintarAlertas(ficha) {
    const alertas = [];
    if ((ficha.alergias || []).length > 0) {
        alertas.push({ tipo: 'danger', icon: 'warning', texto: `Alergias: ${ficha.alergias.join(', ')}` });
    }
    if ((ficha.condiciones || []).length > 0) {
        alertas.push({ tipo: 'warning', icon: 'medical_services', texto: `Condiciones: ${ficha.condiciones.join(', ')}` });
    }
    if (ficha.medicacion) {
        alertas.push({ tipo: 'info', icon: 'medication', texto: `Medicación: ${ficha.medicacion}` });
    }

    const bloque = $('bloqueAlertas');
    if (alertas.length === 0) { bloque.classList.add('d-none'); return; }

    bloque.classList.remove('d-none');
    bloque.innerHTML = alertas.map((a) => `
        <div class="alert alert-${a.tipo} border-0 rounded-4 d-flex align-items-center gap-2">
            <span class="material-symbols-outlined">${a.icon}</span> ${a.texto}
        </div>`).join('');
}

function pintarAtenciones(atenciones) {
    const tabla = $('tablaAtenciones');
    const puedeEscribir = ROLES_QUE_ESCRIBEN.includes(state.perfil.rol);

    if (atenciones.length === 0) {
        tabla.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Sin atenciones registradas.</td></tr>';
        return;
    }

    tabla.innerHTML = atenciones.map((a) => `
        <tr>
            <td class="fw-semibold">${formatearFecha(a.fecha)}</td>
            <td>${a.motivo}</td>
            <td>${a.diagnostico || '-'}</td>
            <td>${a.tratamiento || '-'}</td>
            <td class="small text-muted">${a.registradoPor || '-'}</td>
            <td>
                ${puedeEscribir ? `<button class="btn btn-sm btn-outline-danger rounded-pill" data-borrar="${a.id}">Borrar</button>` : ''}
            </td>
        </tr>`).join('');

    tabla.querySelectorAll('button[data-borrar]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (!confirm('¿Borrar esta atención del historial?')) return;
            btn.disabled = true;
            const resp = await window.fetchConAuth(
                `/api/fichas-medicas/${state.alumnoId}/atenciones/${btn.dataset.borrar}`, { method: 'DELETE' });
            if (resp.ok) await cargarFicha();
            else alert((await resp.json()).error || 'No se pudo borrar.');
        });
    });
}

function formatearFecha(f) {
    const d = new Date(`${f}T00:00:00`);
    return isNaN(d) ? f : d.toLocaleDateString('es-AR');
}

const aLista = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

// ─── Modal datos generales ─────────────────────────────────────────────────

$('btnEditarFicha').addEventListener('click', () => {
    const f = state.ficha || { alumnoId: state.alumnoId };
    const contacto = f.contactoEmergencia || {};

    $('fGrupoSanguineo').value = f.grupoSanguineo || '';
    $('fMedicacion').value      = f.medicacion || '';
    $('fAlergias').value        = (f.alergias || []).join(', ');
    $('fCondiciones').value     = (f.condiciones || []).join(', ');
    $('fContactoNombre').value  = contacto.nombre || '';
    $('fContactoTel').value     = contacto.telefono || '';
    $('fObservaciones').value   = f.observaciones || '';
    $('modalFichaError').classList.add('d-none');

    bootstrap.Modal.getOrCreateInstance($('modalFicha')).show();
});

$('btnGuardarFicha').addEventListener('click', async () => {
    const btn = $('btnGuardarFicha');
    const err = $('modalFichaError');

    const nombreContacto = $('fContactoNombre').value.trim();
    const telContacto    = $('fContactoTel').value.trim();

    btn.disabled = true;
    try {
        const resp = await window.fetchConAuth('/api/fichas-medicas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                alumnoId: state.alumnoId,
                grupoSanguineo: $('fGrupoSanguineo').value.trim() || null,
                alergias: aLista($('fAlergias').value),
                condiciones: aLista($('fCondiciones').value),
                medicacion: $('fMedicacion').value.trim() || null,
                observaciones: $('fObservaciones').value.trim() || null,
                contactoEmergencia: (nombreContacto || telContacto)
                    ? { nombre: nombreContacto, telefono: telContacto }
                    : null,
            }),
        });
        const json = await resp.json();

        if (!resp.ok || !json.ok) {
            err.textContent = json.error || 'No se pudo guardar.';
            err.classList.remove('d-none');
            return;
        }

        bootstrap.Modal.getOrCreateInstance($('modalFicha')).hide();
        await cargarFicha();
    } catch (e) {
        console.error(e);
        err.textContent = 'No se pudo conectar con el servidor.';
        err.classList.remove('d-none');
    } finally {
        btn.disabled = false;
    }
});

// ─── Modal atención ────────────────────────────────────────────────────────

$('btnNuevaAtencion').addEventListener('click', () => {
    $('modalAtencionError').classList.add('d-none');
    bootstrap.Modal.getOrCreateInstance($('modalAtencion')).show();
});

$('btnGuardarAtencion').addEventListener('click', async () => {
    const btn = $('btnGuardarAtencion');
    const err = $('modalAtencionError');

    const fecha = $('aFecha').value;
    const motivo = $('aMotivo').value.trim();
    if (!fecha || !motivo) {
        err.textContent = 'La fecha y el motivo son obligatorios.';
        err.classList.remove('d-none');
        return;
    }

    btn.disabled = true;
    try {
        const resp = await window.fetchConAuth(`/api/fichas-medicas/${state.alumnoId}/atenciones`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fecha,
                motivo,
                diagnostico: $('aDiagnostico').value.trim() || null,
                tratamiento: $('aTratamiento').value.trim() || null,
                observaciones: $('aObservaciones').value.trim() || null,
            }),
        });
        const json = await resp.json();

        if (!resp.ok || !json.ok) {
            err.textContent = json.error || 'No se pudo registrar la atención.';
            err.classList.remove('d-none');
            return;
        }

        bootstrap.Modal.getOrCreateInstance($('modalAtencion')).hide();
        $('aMotivo').value = '';
        $('aDiagnostico').value = '';
        $('aTratamiento').value = '';
        $('aObservaciones').value = '';
        await cargarFicha();
    } catch (e) {
        console.error(e);
        err.textContent = 'No se pudo conectar con el servidor.';
        err.classList.remove('d-none');
    } finally {
        btn.disabled = false;
    }
});