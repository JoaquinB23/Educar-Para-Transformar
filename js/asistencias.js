document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('asistencias-container');
    if (container) {
        const alumnoId = container.dataset.alumnoId;
        if (alumnoId) {
            cargarAsistencias(alumnoId, container);
        }
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
        // En el futuro esto será el fetch real:
        // const response = await fetch(`/api/asistencias?alumnoId=${alumnoId}`, {
        //     headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        // });
        // const json = await response.json();
        
        // Simulando delay de red
        await new Promise(resolve => setTimeout(resolve, 800));

        // Datos de prueba (mock) basados en el contrato
        const json = {
            "ok": true,
            "data": [
                {
                    "id": "abc123",
                    "alumnoId": alumnoId,
                    "materiaId": "xyz789",
                    "fecha": "2026-09-20",
                    "estado": "presente"
                },
                {
                    "id": "abc124",
                    "alumnoId": alumnoId,
                    "materiaId": "xyz789",
                    "fecha": "2026-09-19",
                    "estado": "ausente"
                },
                {
                    "id": "abc125",
                    "alumnoId": alumnoId,
                    "materiaId": "xyz789",
                    "fecha": "2026-09-18",
                    "estado": "presente"
                },
                {
                    "id": "abc126",
                    "alumnoId": alumnoId,
                    "materiaId": "xyz789",
                    "fecha": "2026-09-17",
                    "estado": "presente"
                },
                {
                    "id": "abc127",
                    "alumnoId": alumnoId,
                    "materiaId": "xyz789",
                    "fecha": "2026-09-16",
                    "estado": "presente"
                }
            ]
        };

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

    // Ordenar por fecha descendente (más reciente primero)
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

        // Estilos según estado
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

        // Formatear la fecha para que sea legible (ej: Lun, 20 Sep)
        const dateParts = a.fecha.split('-'); // asumiendo YYYY-MM-DD
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
