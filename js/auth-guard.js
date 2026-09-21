import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// Redirige al login si Firebase no tiene sesión activa
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    localStorage.removeItem('usuario');
    sessionStorage.removeItem('idToken');
    window.location.href = 'login.html';
    return;
  }
  // Refrescamos el token guardado cada vez que se confirma la sesión (ej. al recargar la página)
  const idToken = await user.getIdToken();
  sessionStorage.setItem('idToken', idToken);
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

// Helper global para hacer fetch al backend con el token de Firebase.
// Si el token venció (dura ~1h), lo refresca y reintenta una sola vez.
window.fetchConAuth = async (url, options = {}) => {
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