document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('formPagoFamilia');
    const selectAlumno = document.getElementById('pagoAlumno');
    const tabla = document.getElementById('tablaPagosFamilia');
    const estado = document.getElementById('estadoPagoFamilia');
    const boton = document.getElementById('btnEnviarPago');
    const fechaPago = document.getElementById('pagoFecha');
    const escaparHTML = (valor) => String(valor ?? '').replace(/[&<>"']/g, (caracter) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[caracter]);

    const cargarPagos = async () => {
        const respuesta = await window.fetchConAuth('/api/pagos');
        const json = await respuesta.json();
        if (!respuesta.ok || !json.ok) throw new Error(json.error || 'No se pudieron cargar tus pagos.');
        tabla.innerHTML = json.data.length
            ? json.data.map((pago) => `
                <tr>
                    <td>${escaparHTML(pago.periodo)}</td>
                    <td>${escaparHTML(pago.alumnoNombre)}</td>
                    <td>${new Intl.NumberFormat('es-AR', { style: 'currency', currency: pago.moneda || 'ARS' }).format(pago.monto)}</td>
                    <td><span class="badge ${pago.estado === 'pendiente' ? 'text-bg-warning' : pago.estado === 'aprobado' ? 'text-bg-success' : 'text-bg-danger'}">${escaparHTML(pago.estado)}</span></td>
                </tr>`).join('')
            : '<tr><td colspan="4" class="text-muted">Todavía no informaste pagos.</td></tr>';
    };

    const hoy = new Date();
    fechaPago.value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

    try {
        await window.authReady;
        const respuestaPerfil = await window.fetchConAuth('/api/auth/me');
        const jsonPerfil = await respuestaPerfil.json();
        if (!respuestaPerfil.ok || !jsonPerfil.ok) throw new Error(jsonPerfil.error || 'No se pudo cargar el perfil.');

        const perfil = jsonPerfil.data;
        const relaciones = [perfil.hijoPrimariaId, perfil.hijoSecundariaId].filter(Boolean);
        const alumnos = await Promise.all(relaciones.map(async (alumnoId) => {
            const respuesta = await window.fetchConAuth(`/api/alumnos/${encodeURIComponent(alumnoId)}`);
            if (!respuesta.ok) return null;
            const json = await respuesta.json();
            return json.ok ? json.data : null;
        }));
        const hijos = alumnos.filter(Boolean);
        selectAlumno.innerHTML = hijos.length
            ? hijos.map((alumno) => `<option value="${escaparHTML(alumno.id)}">${escaparHTML(`${alumno.nombre} ${alumno.apellido || ''}`.trim())}</option>`).join('')
            : '<option value="">No hay hijos vinculados</option>';
        selectAlumno.disabled = hijos.length === 0;
        boton.disabled = hijos.length === 0;
        await cargarPagos();
    } catch (error) {
        console.error('Error cargando pagos de familia:', error);
        estado.textContent = error.message;
        estado.className = 'small mt-3 mb-0 text-danger';
        tabla.innerHTML = '<tr><td colspan="4" class="text-danger">No se pudieron cargar los pagos.</td></tr>';
    }

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        estado.textContent = 'Enviando pago...';
        estado.className = 'small mt-3 mb-0 text-muted';
        boton.disabled = true;
        try {
            const respuesta = await window.fetchConAuth('/api/pagos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    alumnoId: selectAlumno.value,
                    periodo: document.getElementById('pagoPeriodo').value,
                    fechaPago: fechaPago.value,
                    monto: document.getElementById('pagoMonto').value,
                    medioPago: document.getElementById('pagoMedio').value,
                    referencia: document.getElementById('pagoReferencia').value,
                }),
            });
            const json = await respuesta.json();
            if (!respuesta.ok || !json.ok) throw new Error(json.error || 'No se pudo informar el pago.');
            form.reset();
            fechaPago.value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
            estado.textContent = 'Pago informado. Quedó pendiente de revisión administrativa.';
            estado.className = 'small mt-3 mb-0 text-success';
            await cargarPagos();
        } catch (error) {
            estado.textContent = error.message;
            estado.className = 'small mt-3 mb-0 text-danger';
        } finally {
            boton.disabled = selectAlumno.disabled;
        }
    });
});