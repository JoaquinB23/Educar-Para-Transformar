import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const form         = document.getElementById('formCrear');
const btnCrear     = document.getElementById('btnCrear');
const msgError     = document.getElementById('msgError');
const itemsLista   = document.getElementById('itemsUsuarios');
const sinUsuarios  = document.getElementById('sinUsuarios');
const nivelCont    = document.getElementById('nivelContainer');

// Mostrar/ocultar nivel según el rol
document.querySelectorAll('input[name="rol"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const necesitaNivel = radio.value !== 'familia';
        nivelCont.style.display = necesitaNivel ? 'block' : 'none';
        if (!necesitaNivel) {
            document.querySelectorAll('input[name="nivel"]').forEach(r => r.checked = false);
        }
    });
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgError.classList.add('d-none');

    const nombre   = document.getElementById('nombre').value.trim();
    const apellido = document.getElementById('apellido').value.trim();
    const dni      = document.getElementById('dni').value.trim();
    const password = document.getElementById('password').value;
    const rol      = document.querySelector('input[name="rol"]:checked')?.value;
    const nivel    = document.querySelector('input[name="nivel"]:checked')?.value || null;

    // Validaciones
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
    if (rol !== 'familia' && !nivel) {
        return mostrarError('Seleccioná un nivel (Primario o Secundario).');
    }

    btnCrear.disabled = true;
    btnCrear.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creando...';

    const email = `${dni}@escuela.edu.ar`;

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);

        await setDoc(doc(db, 'usuarios', cred.user.uid), {
            dni, nombre, apellido, rol, nivel
        });

        agregarALista({ nombre, apellido, dni, rol, nivel });
        form.reset();
        nivelCont.style.display = 'block';

    } catch (err) {
        const msgs = {
            'auth/email-already-in-use': `Ya existe un usuario con DNI ${dni}.`,
            'auth/weak-password':        'La contraseña debe tener al menos 6 caracteres.',
            'auth/invalid-email':        'El formato del DNI no es válido.',
        };
        mostrarError(msgs[err.code] || `Error: ${err.message}`);
    } finally {
        btnCrear.disabled = false;
        btnCrear.innerHTML = '<span class="material-symbols-outlined align-middle me-1" style="font-size:18px">person_add</span>Crear usuario';
    }
});

function mostrarError(msg) {
    msgError.textContent = msg;
    msgError.classList.remove('d-none');
}

function agregarALista({ nombre, apellido, dni, rol, nivel }) {
    sinUsuarios.style.display = 'none';

    const nivelTexto = nivel === 'primaria' ? 'Primario' : nivel === 'secundaria' ? 'Secundario' : '';
    const badgeClass = `badge-${rol}`;
    const rolTexto   = rol.charAt(0).toUpperCase() + rol.slice(1);

    const div = document.createElement('div');
    div.className = 'card border-0 shadow-sm usuario-item p-3 d-flex flex-row align-items-center gap-3';
    div.innerHTML = `
        <span class="material-symbols-outlined text-primary fs-3">account_circle</span>
        <div class="flex-grow-1">
            <div class="fw-bold">${nombre} ${apellido}</div>
            <div class="text-muted small">DNI: ${dni} · Email: ${dni}@escuela.edu.ar</div>
        </div>
        <div class="d-flex gap-1 flex-wrap justify-content-end">
            <span class="badge rounded-pill ${badgeClass}">${rolTexto}</span>
            ${nivelTexto ? `<span class="badge rounded-pill bg-light text-secondary border">${nivelTexto}</span>` : ''}
        </div>
    `;
    itemsLista.appendChild(div);
}
