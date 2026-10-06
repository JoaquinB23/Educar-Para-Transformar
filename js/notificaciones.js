// js/notificaciones.js
// Lee GET /api/notificaciones (los avisos que dejó POST /api/asistencias cuando
// un alumno fue marcado ausente) y las muestra. Si el elemento #contenedor
// existe, pinta la lista; si no, sólo actualiza los contadores .badge-notif.
//
// Cualquier página puede incluirlo con:
//   <span class="badge-notif" id="contadorNotif">0</span>
//   <script src="../js/notificaciones.js"></script>

async function cargarNotificaciones() {
    // Esperar a que Firebase confirme la sesión antes de pedir el token.
    await window.authReady;

    const resp = await window.fetchConAuth('/api/notificaciones');
    if (!resp.ok) {
        const { error } = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        console.error('No se pudieron cargar las notificaciones:', error);
        return null;
    }

    const { data } = await resp.json();
    const lista = data.notificaciones || [];
    const sinLeer = data.sinLeer || 0;

    document.querySelectorAll('.badge-notif').forEach((el) => {
        el.textContent = sinLeer;
        el.classList.toggle('d-none', sinLeer === 0);
    });

    const contenedor = document.getElementById('contenedorNotificaciones');
    if (contenedor) pintarLista(contenedor, lista);

    return lista;
}

function pintarLista(contenedor, lista) {
    if (lista.length === 0) {
        contenedor.innerHTML = '<p class="text-muted mb-0">No tenés avisos por ahora.</p>';
        return;
    }

    contenedor.innerHTML = lista.map((n) => {
        const fecha = new Date(n.creadaEn);
        const classes = n.leida ? 'alert-secondary' : (n.tipo === 'ausencia' ? 'alert-warning' : 'alert-info');
        return `
            <div class="alert ${classes} border-0 rounded-4 d-flex justify-content-between align-items-start gap-3 ${n.leida ? '' : 'fw-semibold'}">
                <div>
                    <div>${n.titulo || 'Aviso'}</div>
                    <small class="d-block fw-normal text-muted">${n.mensaje || ''}</small>
                    <small class="d-block fw-normal text-muted mt-1">
                        ${isNaN(fecha) ? '' : fecha.toLocaleString('es-AR')}
                    </small>
                </div>
                ${n.leida ? '' : `<button class="btn btn-sm btn-outline-secondary rounded-pill nowrap" data-marcar="${n.id}">Marcar leída</button>`}
            </div>`;
    }).join('');

    contenedor.querySelectorAll('button[data-marcar]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                const resp = await window.fetchConAuth(`/api/notificaciones/${btn.dataset.marcar}/leida`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leida: true }),
                });
                if (resp.ok) await cargarNotificaciones();
                else btn.disabled = false;
            } catch (e) {
                console.error(e);
                btn.disabled = false;
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // El badge amarillo de los sidebars es un botón con data-toggle-notif; al
    // apretarlo se despliega el panel que diga aria-controls y se recarga la
    // lista para que no quede vieja.
    document.querySelectorAll('[data-toggle-notif]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const panel = document.getElementById(btn.getAttribute('aria-controls'));
            if (!panel) return;
            const seOculta = panel.classList.toggle('d-none');
            btn.setAttribute('aria-expanded', String(!seOculta));
            if (!seOculta) cargarNotificaciones().catch((e) => console.error(e));
        });
    });

    cargarNotificaciones().catch((e) => console.error(e));
});

window.cargarNotificaciones = cargarNotificaciones;