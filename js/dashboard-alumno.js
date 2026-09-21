// js/dashboard-alumno.js
// Requiere que auth-guard.js ya haya corrido (define window.fetchConAuth y window.cerrarSesion)

document.addEventListener('DOMContentLoaded', async () => {

    // Seguridad básica: si no hay usuario en localStorage, ya nos habría redirigido
    // auth-guard.js, pero por las dudas cortamos acá también.
    const usuarioGuardado = JSON.parse(localStorage.getItem('usuario') || 'null');
    if (!usuarioGuardado) return; // auth-guard.js ya está redirigiendo

    const tabla = document.getElementById('tablaMateriasAlumno');
    const btnCerrar = document.getElementById('btnCerrarSesionTop');
    if (btnCerrar) btnCerrar.addEventListener('click', () => window.cerrarSesion());

    try {
        // 1. Perfil real desde el backend (más confiable que lo cacheado en localStorage)
        const respPerfil = await window.fetchConAuth('/api/auth/me');
        if (!respPerfil.ok) throw new Error('No se pudo cargar el perfil');
        const { data: perfil } = await respPerfil.json();

        // Pintamos los datos del perfil en la pantalla
        document.getElementById('txtBienvenida').innerText = `Bienvenido, ${perfil.nombre || ''}`;
        document.getElementById('txtNombreSidebar').innerText = perfil.nombre || '';
        document.getElementById('navNombreAlumno').innerText = perfil.nombre || '';
        document.getElementById('perfilNombreCompleto').innerText = perfil.nombre || '';
        document.getElementById('perfilRol').innerText = `Rol verificado: ${(perfil.rol || '').toUpperCase()}`;

        if (!perfil.alumnoId) {
            if (tabla) {
                tabla.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">
                    Tu cuenta todavía no está vinculada a un registro de alumno. Contactá a administración.
                </td></tr>`;
            }
            return;
        }

        // 2. Inscripciones de este alumno
        const respInsc = await window.fetchConAuth(`/api/inscripciones?alumnoId=${perfil.alumnoId}`);
        if (!respInsc.ok) throw new Error('No se pudieron cargar las inscripciones');
        const { data: inscripciones } = await respInsc.json();

        if (inscripciones.length === 0) {
            if (tabla) {
                tabla.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">
                    No tenés materias inscriptas este ciclo lectivo.
                </td></tr>`;
            }
            return;
        }

        // 3. Traemos el detalle de cada materia inscripta (en paralelo)
        const materias = await Promise.all(
            inscripciones.map(async (insc) => {
                const resp = await window.fetchConAuth(`/api/materias/${insc.materiaId}`);
                if (!resp.ok) return null;
                const { data: materia } = await resp.json();
                return { ...materia, estadoInscripcion: insc.estado };
            })
        );

        // 4. Renderizamos la tabla
        if (tabla) {
            tabla.innerHTML = materias
                .filter(Boolean)
                .map((m) => `
                    <tr>
                        <td><code>${m.codigo}</code></td>
                        <td class="fw-bold">${m.nombre}</td>
                        <td>${m.cargaHoraria} Horas</td>
                        <td>
                            <span class="badge bg-success-subtle text-success border border-success-subtle">
                                ${estadoLegible(m.estadoInscripcion)}
                            </span>
                        </td>
                    </tr>
                `)
                .join('');
        }

    } catch (err) {
        console.error('Error cargando el dashboard del alumno:', err);
        if (tabla) {
            tabla.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-4">
                Ocurrió un error al cargar tus datos. Intentá recargar la página.
            </td></tr>`;
        }
    }
});

function estadoLegible(estado) {
    const mapa = {
        cursando: 'Cursando Regular',
        aprobada: 'Aprobada',
        libre: 'Libre',
    };
    return mapa[estado] || estado;
}