document.addEventListener('DOMContentLoaded', async () => {
    const listaHijos = document.getElementById('listaHijos');
    const nombreTutor = document.getElementById('nombreTutor');

    try {
        await window.authReady;
        const perfilResponse = await window.fetchConAuth('/api/auth/me');
        if (!perfilResponse.ok) throw new Error('No se pudo cargar el perfil');

        const { data: perfil } = await perfilResponse.json();
        nombreTutor.textContent = `${perfil.nombre || 'Tutor'} (Tutor)`;

        const relaciones = [
            { id: perfil.hijoPrimariaId, nivel: 'Primaria', pagina: 'hijo-primaria.html', icono: 'face' },
            { id: perfil.hijoSecundariaId, nivel: 'Secundaria', pagina: 'hijo-secundaria.html', icono: 'face_4' },
        ].filter((hijo) => hijo.id);

        const hijos = await Promise.all(relaciones.map(async (relacion) => {
            const alumnoResponse = await window.fetchConAuth(`/api/alumnos/${relacion.id}`);
            if (!alumnoResponse.ok) return null;
            const { data: alumno } = await alumnoResponse.json();
            return { ...relacion, alumno };
        }));

        const hijosValidos = hijos.filter(Boolean);
        listaHijos.innerHTML = hijosValidos.length
            ? hijosValidos.map(({ alumno, nivel, pagina, icono }) => `
                <li class="nav-item">
                    <a class="nav-link d-flex align-items-center gap-2" href="${pagina}">
                        <span class="material-symbols-outlined fs-5">${icono}</span>
                        ${alumno.nombre} ${alumno.apellido} (${nivel})
                    </a>
                </li>`).join('')
            : '<li class="nav-item"><span class="nav-link text-white-50">Sin hijos asignados</span></li>';
    } catch (error) {
        console.error('Error cargando los hijos del tutor:', error);
        listaHijos.innerHTML = '<li class="nav-item"><span class="nav-link text-warning">No se pudieron cargar</span></li>';
    }
});
