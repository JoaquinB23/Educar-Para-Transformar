// js/calificaciones.js
// Carga el boletín del alumno con GET /api/calificaciones/boletin, que ya
// devuelve una fila por materia con los 3 trimestres, el promedio y el estado.

document.addEventListener('DOMContentLoaded', async () => {

    const btnCerrar   = document.getElementById('btnCerrarSesionTop');
    const btnRefrescar = document.getElementById('btnRefrescar');
    const tabla       = document.getElementById('tablaCalificaciones');
    const pie         = document.getElementById('pieCalificaciones');

    if (btnCerrar) btnCerrar.addEventListener('click', () => window.cerrarSesion());
    if (btnRefrescar) btnRefrescar.addEventListener('click', () => cargarBoletin());

    await window.authReady;

    const respPerfil = await window.fetchConAuth('/api/auth/me');
    const { data: perfil } = await respPerfil.json();

    const nombre = [perfil.nombre, perfil.apellido].filter(Boolean).join(' ');
    document.getElementById('txtNombreSidebar').innerText = nombre || 'Alumno';
    document.getElementById('navNombreAlumno').innerText  = nombre || 'Alumno';
    document.getElementById('badgeCiclo').innerHTML =
        `<span class="material-symbols-outlined fs-6 align-middle me-1">calendar_today</span> Ciclo Lectivo ${perfil.cicloLectivoActual}`;

    if (!perfil.alumnoId) {
        tabla.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">
            Tu cuenta todavía no está vinculada a un registro de alumno. Contactá a administración.
        </td></tr>`;
        document.getElementById('subtituloCiclo').textContent = '';
        return;
    }

    await cargarBoletin(perfil.alumnoId);
});

async function cargarBoletin(alumnoIdResuelto) {
    const tabla = document.getElementById('tablaCalificaciones');
    const pie   = document.getElementById('pieCalificaciones');
    const subtitulo = document.getElementById('subtituloCiclo');

    let alumnoId = alumnoIdResuelto;
    if (!alumnoId) {
        const respPerfil = await window.fetchConAuth('/api/auth/me');
        const { data: perfil } = await respPerfil.json();
        window.aplicarPermisosNav(perfil.rol);
        alumnoId = perfil.alumnoId;
        if (!alumnoId) {
            tabla.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">
                Tu cuenta no está vinculada a un alumno.
            </td></tr>`;
            return;
        }
    }

    tabla.innerHTML = `
        <tr><td colspan="6" class="text-center text-muted py-4">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2 mb-0">Cargando boletín...</p>
        </td></tr>`;

    try {
        const resp = await window.fetchConAuth(`/api/calificaciones/boletin?alumnoId=${alumnoId}`);
        const json = await resp.json();

        if (resp.status === 403 || !resp.ok || !json.ok) {
            throw new Error(json.error || `Error HTTP ${resp.status}`);
        }

        const { filas, cicloLectivo, alumno } = json.data;
        subtitulo.textContent = `${alumno.nombre} ${alumno.apellido} · Ciclo ${cicloLectivo}`;

        if (filas.length === 0) {
            tabla.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">
                Todavía no estás inscripto en ninguna materia este ciclo lectivo.
            </td></tr>`;
            pie.classList.add('d-none');
            return;
        }

        tabla.innerHTML = filas.map((f) => `
            <tr>
                <td class="text-start fw-bold">${f.codigo} — ${f.nombre}</td>
                <td>${celdaNota(f.trimestre1)}</td>
                <td>${celdaNota(f.trimestre2)}</td>
                <td>${celdaNota(f.trimestre3)}</td>
                <td class="fw-bold">${f.promedio === null ? '-' : f.promedio.toFixed(2)}</td>
                <td>${badgeEstado(f.estado, f.etiqueta)}</td>
            </tr>`).join('');

        const conNotas = filas.filter((f) => f.promedio !== null);
        if (conNotas.length > 0) {
            const promedioGeneral = conNotas.reduce((a, f) => a + f.promedio, 0) / conNotas.length;
            pie.classList.remove('d-none');
            pie.innerHTML = `
                <tr class="fw-bold">
                    <td class="text-start">Promedio general (${conNotas.length} materia${conNotas.length > 1 ? 's' : ''})</td>
                    <td>-</td><td>-</td><td>-</td>
                    <td>${promedioGeneral.toFixed(2)}</td>
                    <td>${badgeEstado(estadoDe(promedioGeneral).estado, estadoDe(promedioGeneral).etiqueta)}</td>
                </tr>`;
        } else {
            pie.classList.add('d-none');
        }

    } catch (err) {
        console.error('Error al cargar el boletín:', err);
        tabla.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">
            No se pudo cargar tu boletín (${err.message}).
        </td></tr>`;
        pie.classList.add('d-none');
    }
}

// Si el usuario entra a la página sin id en la URL, igual tiene que funcionar.
window.cargarBoletin = cargarBoletin;

function celdaNota(nota) {
    if (nota === null || nota === undefined) return '<span class="text-muted">-</span>';
    return Number(nota).toFixed(2);
}

// Los mismos umbrales que calcula el backend en estadoSegunPromedio().
function estadoDe(promedio) {
    if (promedio >= 10) return { estado: 'promovido', etiqueta: 'Promocionado' };
    if (promedio >= 6)  return { estado: 'regular',   etiqueta: 'Regular' };
    return { estado: 'riesgo', etiqueta: 'Riesgo' };
}

function badgeEstado(estado, etiqueta) {
    const mapa = {
        promovido:      'bg-primary-subtle text-primary border border-primary-subtle',
        regular:        'bg-success-subtle text-success border border-success-subtle',
        riesgo:         'bg-danger-subtle text-danger border border-danger-subtle',
        sin_notas:      'bg-secondary-subtle text-secondary border border-secondary-subtle',
    };
    return `<span class="badge ${mapa[estado] || mapa.sin_notas}">${etiqueta || estado}</span>`;
}