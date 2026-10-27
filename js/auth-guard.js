import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// Semáforo: los dashboards hacen `await window.authReady;` antes de su primer
// fetch, así no salen a pedir datos antes de que Firebase confirme la sesión.
let resolverAuthReady;
window.authReady = new Promise((resolve) => { resolverAuthReady = resolve; });

const rolesRequeridos = (document.body.dataset.requiredRoles || '')
  .split(/\s+/)
  .filter(Boolean);
if (rolesRequeridos.length > 0) {
  document.documentElement.style.visibility = 'hidden';
}

// Redirige al login si Firebase no tiene sesión activa
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    localStorage.removeItem('usuario');
    sessionStorage.removeItem('idToken');
    resolverAuthReady(null);
    window.location.href = 'login.html';
    return;
  }
  const idToken = await user.getIdToken();
  sessionStorage.setItem('idToken', idToken);

  if (rolesRequeridos.length > 0) {
    try {
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      const rol = String(result.data?.rol || '').toLowerCase();
      if (!rolesRequeridos.includes(rol)) {
        let paginaInicial = 'login.html';
        if (rol === 'admin') paginaInicial = 'dashboard.html';
        if (rol === 'alumno') paginaInicial = 'dashboard-alumno.html';
        if (rol === 'docente') paginaInicial = 'dashboard-docente.html';
        if (rol === 'familia') paginaInicial = 'dashboard-familia.html';
        window.location.replace(paginaInicial);
        return;
      }
    } catch (error) {
      console.error('No se pudo validar el acceso a esta página:', error);
      window.location.replace('login.html');
      return;
    }
  }

  document.documentElement.style.visibility = 'visible';
  resolverAuthReady(user);
});

// Función global de logout: cierra sesión en Firebase + limpia todo
window.cerrarSesion = async () => {
  try {
    await signOut(auth);
  } finally {
    localStorage.removeItem('usuario');
    sessionStorage.removeItem('idToken');
    window.location.href = 'login.html';
  }
};

// Oculta los links de navegación que el rol actual no puede usar.
//
// Antes cada panel mostraba su menú completo y el backend respondía 403 recién
// al hacer clic: el docente veía "Dashboard Admin", lo pulsaba y aterrizaba en
// una pantalla con "Tu usuario no tiene permisos de administración". Ahora cada
// link declara data-roles="admin docente" y se esconde si el rol no está.
//
// Se llama después de traer /api/auth/me, porque hasta entonces no se conoce
// el rol del usuario.
window.aplicarPermisosNav = (rol) => {
  const links = document.querySelectorAll('[data-roles]');
  links.forEach((link) => {
    const permitidos = (link.dataset.roles || '').split(/\s+/).filter(Boolean);
    if (!permitidos.includes(rol)) {
      const item = link.closest('.nav-item') || link;
      item.style.display = 'none';
    } else {
      const item = link.closest('.nav-item') || link;
      item.style.display = '';
    }
  });
};

// Nombre completo de una persona, tolerante a los dos esquemas que conviven
// en `usuarios`: los perfiles creados por el panel guardan `nombre` y
// `apellido` por separado, pero los cargados a mano guardan el nombre completo
// en `nombre` y no tienen `apellido`. Sin este fallback, esas cuentas veían
// "Familia" o un "undefined" pegado al lado.
window.nombreCompleto = (persona) => {
  if (!persona) return '';
  const nombre = (persona.nombre || '').trim();
  const apellido = (persona.apellido || '').trim();
  if (apellido) return `${nombre} ${apellido}`.trim();
  // Última palabra del nombre completo como apellido.
  const partes = nombre.split(/\s+/).filter(Boolean);
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1]}` : nombre;
};

// Sólo el apellido, para los encabezados del tipo "Familia López".
window.apellidoDe = (persona) => {
  if (!persona) return '';
  const apellido = (persona.apellido || '').trim();
  if (apellido) return apellido;
  const partes = (persona.nombre || '').trim().split(/\s+/).filter(Boolean);
  return partes.length > 1 ? partes[partes.length - 1] : '';
};

// Helper global para hacer fetch al backend con el token de Firebase.
// Si el token venció (dura ~1h), lo refresca y reintenta una sola vez.
window.fetchConAuth = async (url, options = {}) => {
  await window.authReady; // esperamos a que Firebase confirme la sesión

  let token = sessionStorage.getItem('idToken');

  if (!token && auth.currentUser) {
    token = await auth.currentUser.getIdToken();
    sessionStorage.setItem('idToken', token);
  }

  const buildHeaders = (t) => ({
    ...(options.headers || {}),
    'Authorization': `Bearer ${t}`,
  });

  let response = await fetch(url, { ...options, headers: buildHeaders(token) });

  if (response.status === 401 && auth.currentUser) {
    token = await auth.currentUser.getIdToken(true); // fuerza refresh
    sessionStorage.setItem('idToken', token);
    response = await fetch(url, { ...options, headers: buildHeaders(token) });
  }

  if (response.status === 401) {
    window.location.href = 'login.html';
  }

  return response;
};