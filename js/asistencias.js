document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('asistencias-container');
    if (container) {
        const alumnoId = container.dataset.alumnoId;
        if (alumnoId) {
            cargarAsistencias(alumnoId, container);
        }
        // Si no hay alumnoId todavía (lo va a setear el script de la página
        // después de resolver la sesión), no hacemos nada acá — se llama
        // manualmente vía window.cargarAsistencias más abajo.
    }
});

async function cargarAsistencias(alumnoId, container) {
    container.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2 text-muted">Cargando asistencias...</p>
        </div>
    `;

    try {
        const token = sessionStorage.getItem('idToken') || '';
        const response = await fetch(`/api/asistencias?alumnoId=${alumnoId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const json = await response.json();

        if (json.ok && json.data) {
            renderAsistencias(json.data, container);
        } else {
            container.innerHTML = '<div class="alert alert-danger mt-3">Error al cargar el registro de asistencias.</div>';
        }

    } catch (error) {
        console.error("Error fetching asistencias:", error);
        container.innerHTML = '<div class="alert alert-danger mt-3">Ocurrió un error de conexión al cargar las asistencias.</div>';
    }
}

function renderAsistencias(asistencias, container) {
    if (!asistencias || asistencias.length === 0) {
        container.innerHTML = '<p class="text-muted mt-3 mb-0">No hay registros de asistencia para mostrar.</p>';
        return;
    }

    asistencias.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    let html = `
    <div class="table-responsive mt-3">
        <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
                <tr>
                    <th scope="col" class="text-secondary fw-semibold">Fecha</th>
                    <th scope="col" class="text-secondary fw-semibold">Estado</th>
                </tr>
            </thead>
            <tbody>
    `;

    asistencias.forEach(a => {
        let badgeClass = 'bg-secondary';
        let icon = 'help';
        let estadoLabel = a.estado;

        if (a.estado.toLowerCase() === 'presente') {
            badgeClass = 'bg-success-subtle text-success border border-success-subtle';
            icon = 'check_circle';
        } else if (a.estado.toLowerCase() === 'ausente') {
            badgeClass = 'bg-danger-subtle text-danger border border-danger-subtle';
            icon = 'cancel';
        } else if (a.estado.toLowerCase() === 'tarde') {
            badgeClass = 'bg-warning-subtle text-warning border-warning-subtle text-dark border';
            icon = 'schedule';
        }

        const dateParts = a.fecha.split('-');
        const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        const formattedDate = dateObj.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });

        html += `
            <tr>
                <td class="fw-bold text-capitalize text-dark py-3">${formattedDate}</td>
                <td class="py-3">
                    <span class="badge ${badgeClass} d-inline-flex align-items-center gap-1 px-3 py-2 rounded-pill shadow-sm">
                        <span class="material-symbols-outlined fs-6">${icon}</span>
                        <span class="text-capitalize fw-bold">${estadoLabel}</span>
                    </span>
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    </div>
    `;

    container.innerHTML = html;
}

// Exponemos la función para que otros scripts (como el que resuelve
// dinámicamente el alumnoId del tutor) puedan llamarla manualmente.
window.cargarAsistencias = cargarAsistencias;