// js/admin-usuarios.js
// El alta completa la hace el backend (POST /api/admin/usuarios): Firebase Auth
// + registro en alumnos/docentes + perfil en `usuarios`. Antes esto se creaba
// desde el navegador con setDoc, y las cuentas quedaban sin uid, sin email y
// sin vínculo con un alumno o docente.

const form         = document.getElementById('formCrear');
const btnCrear     = document.getElementById('btnCrear');
const msgError     = document.getElementById('msgError');
const msgAcceso    = document.getElementById('msgAcceso');
const itemsLista   = document.getElementById('itemsUsuarios');
const sinUsuarios  = document.getElementById('sinUsuarios');
const nivelCont    = document.getElementById('nivelContainer');
const legajoCont   = document.getElementById('legajoContainer');

// Sólo alumno y docente tienen nivel educativo.
const ROLES_CON_NIVEL  = ['alumno', 'docente'];
// Sólo alumno y docente tienen legajo: son los que entran a alumnos/docentes.
const ROLES_CON_LEGAJO = ['alumno', 'docente'];

function mostrarError(msg) {
    msgError.textContent = msg;
    msgError.classList.remove('d-none');
}

function mostrarFaltaDeAcceso(msg) {
    msgAcceso.textContent = msg;
    msgAcceso.classList.remove('d-none');
    form.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
}

// Mostrar/ocultar nivel y legajo según el rol
document.querySelectorAll('input[name="rol"]').forEach((radio) => {
    radio.addEventListener('change', () => {
        const rol = radio.value;
        const necesitaNivel = ROLES_CON_NIVEL.includes(rol);

        nivelCont.style.display = necesitaNivel ? 'block' : 'none';
        if (!necesitaNivel) {
            document.querySelectorAll('input[name="nivel"]').forEach((r) => { r.checked = false; });
        }

        legajoCont.classList.toggle('d-none', !ROLES_CON_LEGAJO.includes(rol));
    });
});

// Esta página es sólo para administración: el backend responde 403 con
// requireRole('admin'), pero avisamos antes para no mostrar un form inútil.
//
// El arranque va en DOMContentLoaded porque auth-guard.js es type="module": los
// módulos corren después de cerrarse el <body>, así que con un IIFE directo
// window.authReady todavía era undefined y la lista nunca llegaba a cargar.
document.addEventListener('DOMContentLoaded', chequearAcceso);

async function chequearAcceso() {
    await window.authReady;
    const resp = await window.fetchConAuth('/api/auth/me');
    const { data: perfil } = await resp.json();
    if (perfil.rol !== 'admin') {
        mostrarFaltaDeAcceso('Tu usuario no es administrador, así que no puede crear cuentas.');
        return;
    }
    await cargarUsuarios();
}

// El listado arranca vacío y sólo se llenaba con los usuarios creados en esta
// sesión, así que al recargar desaparecían los demás. Ahora se pide el listado
// completo al backend.
async function cargarUsuarios() {
    try {
        const resp = await window.fetchConAuth('/api/admin/usuarios');
        const json = await resp.json();
        if (!resp.ok || !json.ok) {
            mostrarError(json.error || 'No se pudo cargar el listado de usuarios.');
            return;
        }
        pintarUsuarios(json.data || []);
    } catch (err) {
        console.error(err);
        mostrarError('No se pudo conectar con el servidor.');
    }
}

function pintarUsuarios(usuarios) {
    itemsLista.innerHTML = '';

    if (usuarios.length === 0) {
        sinUsuarios.style.display = '';
        return;
    }
    sinUsuarios.style.display = 'none';

    for (const u of usuarios) {
        itemsLista.appendChild(crearTarjeta(u));
    }
}

function crearTarjeta({ nombre, apellido, dni, email, rol, nivel, legajo, cuentaExiste, habilitado }) {
    const nombreCompleto = window.nombreCompleto({ nombre, apellido });
    const nivelTexto = nivel === 'primaria' ? 'Primario' : nivel === 'secundaria' ? 'Secundario' : '';
    const rolTexto   = rol ? rol.charAt(0).toUpperCase() + rol.slice(1) : 'Sin rol';

    const div = document.createElement('div');
    div.className = 'card border-0 shadow-sm usuario-item p-3 d-flex flex-row align-items-center gap-3';
    div.innerHTML = `
        <span class="material-symbols-outlined text-primary fs-3">account_circle</span>
        <div class="flex-grow-1">
            <div class="fw-bold"></div>
            <div class="text-muted small"></div>
        </div>
        <div class="d-flex gap-1 flex-wrap justify-content-end">
            <span class="badge rounded-pill badge-${rol}"></span>
        </div>
    `;

    // Nombre y detalle van por textContent: los datos vienen de Firestore y no
    // deben interpretarse como HTML.
    div.querySelector('.fw-bold').textContent = nombreCompleto || 'Sin nombre';
    div.querySelector('.text-muted.small').textContent = [
        dni ? `DNI: ${dni}` : null,
        email ? `Email: ${email}` : (dni ? `Email: ${dni}@escuela.edu.ar` : null),
        legajo ? `Legajo: ${legajo}` : null,
    ].filter(Boolean).join(' · ') || 'Sin datos';

    const contBadges = div.querySelector('.d-flex.gap-1');
    contBadges.querySelector('.badge').textContent = rolTexto;
    if (nivelTexto) {
        const b = document.createElement('span');
        b.className = 'badge rounded-pill bg-light text-secondary border';
        b.textContent = nivelTexto;
        contBadges.appendChild(b);
    }
    if (!cuentaExiste || !habilitado) {
        const b = document.createElement('span');
        b.className = 'badge rounded-pill bg-danger-subtle text-danger border border-danger-subtle';
        b.textContent = cuentaExiste ? 'Deshabilitada' : 'Sin cuenta';
        contBadges.appendChild(b);
    }

    return div;
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgError.classList.add('d-none');

    const nombre   = document.getElementById('nombre').value.trim();
    const apellido = document.getElementById('apellido').value.trim();
    const dni      = document.getElementById('dni').value.trim();
    const password = document.getElementById('password').value;
    const rol      = document.querySelector('input[name="rol"]:checked')?.value;
    const nivel    = document.querySelector('input[name="nivel"]:checked')?.value || null;
    const legajo   = document.getElementById('legajo').value.trim().toUpperCase() || null;

    if (!nombre || !apellido || !dni || !password) {
        return mostrarError('Completá todos los campos obligatorios.');
    }
    if (!/^\d+$/.test(dni)) {
        return mostrarError('El DNI debe contener solo números.');
    }
    if (password.length < 6) {
        return mostrarError('La contraseña debe tener al menos 6 caracteres.');
    }
    if (!rol) {
        return mostrarError('Seleccioná un rol.');
    }
    if (ROLES_CON_NIVEL.includes(rol) && !nivel) {
        return mostrarError('Seleccioná un nivel (Primario o Secundario).');
    }
    if (ROLES_CON_LEGAJO.includes(rol) && !legajo) {
        return mostrarError('Alumnos y docentes necesitan un legajo.');
    }

    btnCrear.disabled = true;
    btnCrear.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creando...';

    try {
        const resp = await window.fetchConAuth('/api/admin/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dni, nombre, apellido, password, rol, nivel, legajo }),
        });
        const json = await resp.json();

        if (!resp.ok || !json.ok) {
            return mostrarError(json.error || 'No se pudo crear el usuario.');
        }

        agregarALista({ nombre, apellido, dni, email: `${dni}@escuela.edu.ar`, rol, nivel, legajo, cuentaExiste: true, habilitado: true });
        form.reset();
        nivelCont.style.display = 'block';
        legajoCont.classList.add('d-none');

    } catch (err) {
        console.error(err);
        mostrarError('No se pudo conectar con el servidor.');
    } finally {
        btnCrear.disabled = false;
        btnCrear.innerHTML = '<span class="material-symbols-outlined align-middle me-1" style="font-size:18px">person_add</span>Crear usuario';
    }
});

function agregarALista(usuario) {
    sinUsuarios.style.display = 'none';
    itemsLista.appendChild(crearTarjeta(usuario));
}
