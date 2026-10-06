document.addEventListener('DOMContentLoaded', async () => {
    const pagina = document.body;
    const campoHijo = pagina.dataset.hijoField;
    const nivel = pagina.dataset.nivel;
    const nombre = document.getElementById('hijoNombre');

    try {
        await window.authReady;
        const perfilResponse = await window.fetchConAuth('/api/auth/me');
        if (!perfilResponse.ok) throw new Error('No se pudo cargar el perfil');

        const { data: perfil } = await perfilResponse.json();
        const alumnoId = perfil[campoHijo];
        if (!alumnoId) {
            nombre.textContent = `No hay hijo asignado en ${nivel}`;
            return;
        }

        const alumnoResponse = await window.fetchConAuth(`/api/alumnos/${alumnoId}`);
        if (!alumnoResponse.ok) throw new Error('No se pudo cargar el alumno');

        const { data: alumno } = await alumnoResponse.json();
        const nombreCompleto = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();
        nombre.textContent = nombreCompleto || 'Alumno sin nombre';
        document.title = `${nombreCompleto || 'Alumno'} - ${nivel} | NovaSYS`;

        const navPrimaria = document.getElementById('navHijoPrimaria');
        const navSecundaria = document.getElementById('navHijoSecundaria');
        if (!perfil.hijoPrimariaId && navPrimaria) navPrimaria.closest('li').style.display = 'none';
        if (!perfil.hijoSecundariaId && navSecundaria) navSecundaria.closest('li').style.display = 'none';

        const navActual = nivel === 'Primaria' ? navPrimaria : navSecundaria;
        if (navActual) navActual.textContent = `${nombreCompleto} (${nivel})`;
    } catch (error) {
        console.error('Error cargando el alumno vinculado:', error);
        nombre.textContent = 'No se pudo cargar el alumno';
    }
});
