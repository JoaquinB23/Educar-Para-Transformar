// js/admin-preinscripciones.js
// GET /api/preinscripciones?estado=X   → listado + conteo por estado
// PUT /api/preinscripciones/:id        → cambia estado y guarda observaciones

const ESTADOS = [
    { valor: 'pendiente', etiqueta: 'Pendiente',   clase: 'bg-warning-subtle text-warning border border-warning-subtle' },
    { valor: 'contactado', etiqueta: 'Contactado',  clase: 'bg-info-subtle text-info border border-info-subtle' },
    { valor: 'visita',     etiqueta: 'Visita',      clase: 'bg-primary-subtle text-primary border border-primary-subtle' },
    { valor: 'inscripto',  etiqueta: 'Inscripto',   clase: 'bg-success-subtle text-success border border-success-subtle' },
    { valor: 'descartada', etiqueta: 'Descartada',  clase: 'bg-secondary-subtle text-secondary border border-secondary-subtle' },
];

const NIVELES = { inicial: 'Inicial', primaria: 'Primaria', secundaria: 'Secundaria' };
const VINCULOS = { madre: 'Madre', padre: 'Padre', tutor_legal: 'Tutor legal' };

let filaEnEdicion = null;

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('btnRefrescar').addEventListener('click', cargar);

    const filtro = document.getElementById('filtroEstado');
    filtro.innerHTML = `<option value="">Todos los estados</option>` +
        ESTADOS.map((e) => `<option value="${e.valor}">${e.etiqueta}</option>`).join('');
    filtro.addEventListener('change', cargar);

    document.getElementById('nuevoEstado').innerHTML =
        ESTADOS.map((e) => `<option value="${e.valor}">${e.etiqueta}</option>`).join('');

    document.getElementById('btnGuardarSeguimiento').addEventListener('click', guardarSeguimiento);

    await window.authReady;

    const respPerfil = await window.fetchConAuth('/api/auth/me');
    if (respPerfil.ok) {
        const { data: perfil } = await respPerfil.json();
        document.getElementById('navNombrePre').innerText =
            [perfil.nombre, perfil.apellido].filter(Boolean).join(' ') || 'Administración';
        document.getElementById('badgeCicloPre').innerText = `Ciclo Lectivo ${perfil.cicloLectivoActual}`;
    }

    await cargar();
});

async function cargar() {
    const tabla = document.getElementById('tablaPreinscripciones');
    const msg = document.getElementById('msgPre');
    const estado = document.getElementById('filtroEstado').value;

    tabla.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">
        <div class="spinner-border text-primary" role="status"></div>
    </td></tr>`;
    msg.classList.add('d-none');

    try {
        const resp = await window.fetchConAuth(
            `/api/preinscripciones${estado ? `?estado=${estado}` : ''}`);
        const json = await resp.json();

        if (!resp.ok || !json.ok) throw new Error(json.error || `HTTP ${resp.status}`);

        const { preinscripciones, porEstado } = json.data;
        pintarKpis(porEstado, preinscripciones.length);
        pintarTabla(preinscripciones);

    } catch (err) {
        console.error(err);
        msg.textContent = `No se pudieron cargar las preinscripciones: ${err.message}`;
        msg.classList.remove('d-none');
        tabla.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Sin datos para mostrar.</td></tr>`;
    }
}

function pintarKpis(porEstado, total) {
    const cards = ESTADOS.map((e) => `
        <div class="col-6 col-lg">
            <div class="card card-dash p-3 bg-white shadow-sm border-0 h-100">
                <p class="text-muted text-uppercase small fw-bold mb-1">${e.etiqueta}</p>
                <p class="h4 fw-bold mb-0">${porEstado[e.valor] ?? 0}</p>
            </div>
        </div>`).join('');

    document.getElementById('kpis').innerHTML = cards;
}

function pintarTabla(lista) {
    const tabla = document.getElementById('tablaPreinscripciones');

    if (lista.length === 0) {
        tabla.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">
            No hay preinscripciones${document.getElementById('filtroEstado').value ? ' en ese estado' : ''}.
        </td></tr>`;
        return;
    }

    tabla.innerHTML = lista.map((p) => {
        const estado = ESTADOS.find((e) => e.valor === p.estado);
        return `
            <tr>
                <td>
                    <span class="fw-bold">${p.alumno.nombre}</span><br>
                    <small class="text-muted">${p.alumno.edad} años · DNI ${p.alumno.dni}</small>
                </td>
                <td>${NIVELES[p.alumno.nivel] || p.alumno.nivel}</td>
                <td>
                    ${p.tutor.nombre}<br>
                    <small class="text-muted">${VINCULOS[p.tutor.vinculo] || p.tutor.vinculo} · DNI ${p.tutor.dni}</small>
                </td>
                <td>
                    <small>${p.tutor.telefono}</small><br>
                    <small class="text-muted">${p.alumno.telefonoEmergencia}</small>
                </td>
                <td><small class="text-muted">${fecha(p.creadoEn)}</small></td>
                <td><span class="badge ${estado ? estado.clase : ''}">${estado ? estado.etiqueta : p.estado}</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary rounded-pill" data-seguir="${p.id}">
                        Gestionar
                    </button>
                </td>
            </tr>`;
    }).join('');

    tabla.querySelectorAll('button[data-seguir]').forEach((btn) => {
        btn.addEventListener('click', () => abrirSeguimiento(lista, btn.dataset.seguir));
    });
}

function abrirSeguimiento(lista, id) {
    filaEnEdicion = lista.find((p) => p.id === id);
    if (!filaEnEdicion) return;

    const p = filaEnEdicion;
    document.getElementById('detalleSolicitud').innerHTML = `
        <strong>${p.alumno.nombre}</strong> (${p.alumno.edad} años, DNI ${p.alumno.dni})<br>
        Domicilio: ${p.alumno.domicilio}<br>
        Responsable: ${p.tutor.nombre} · ${p.tutor.telefono}
        ${p.tutor.domicilio ? `<br>Su domicilio: ${p.tutor.domicilio}` : ''}
        ${p.alumno.tipoSangre ? `<br>Tipo de sangre: ${p.alumno.tipoSangre}` : ''}`;

    document.getElementById('nuevoEstado').value = p.estado;
    document.getElementById('nuevasObservaciones').value = p.observaciones || '';
    document.getElementById('modalSeguimientoError').classList.add('d-none');

    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalSeguimiento')).show();
}

async function guardarSeguimiento() {
    if (!filaEnEdicion) return;

    const btn = document.getElementById('btnGuardarSeguimiento');
    const err = document.getElementById('modalSeguimientoError');

    btn.disabled = true;
    try {
        const resp = await window.fetchConAuth(`/api/preinscripciones/${filaEnEdicion.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                estado: document.getElementById('nuevoEstado').value,
                observaciones: document.getElementById('nuevasObservaciones').value.trim() || null,
            }),
        });
        const json = await resp.json();

        if (!resp.ok || !json.ok) {
            err.textContent = json.error || 'No se pudo guardar.';
            err.classList.remove('d-none');
            return;
        }

        bootstrap.Modal.getOrCreateInstance(document.getElementById('modalSeguimiento')).hide();
        await cargar();
    } catch (e) {
        console.error(e);
        err.textContent = 'No se pudo conectar con el servidor.';
        err.classList.remove('d-none');
    } finally {
        btn.disabled = false;
    }
}

function fecha(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '-' : d.toLocaleDateString('es-AR');
}