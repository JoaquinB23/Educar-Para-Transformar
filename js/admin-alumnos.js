// Listado, alta, edición y baja de alumnos.
//
// El CRUD ya existía en el backend (GET/POST/PUT/DELETE /api/alumnos) pero no
// había ninguna pantalla que lo usara: el panel de administración sólo mostraba
// un contador y un gráfico. Esta página es esa pantalla.
//
// Requiere que auth-guard.js ya haya corrido (define window.fetchConAuth y
// window.cerrarSesion). Ojo: fetchConAuth devuelve la Response cruda, así que
// en cada llamada hay que leer el JSON con .json().

const $tabla = document.getElementById("tablaAlumnos");
const $msg = document.getElementById("msgAlumnos");
const $msgAcceso = document.getElementById("msgAccesoAlumnos");
const $buscar = document.getElementById("buscarAlumno");
const $filtroEstado = document.getElementById("filtroEstadoAlumno");
const $contador = document.getElementById("contadorAlumnos");

const $modalEl = document.getElementById("modalAlumnoForm");
const $modal = bootstrap.Modal.getOrCreateInstance($modalEl);
const $errorForm = document.getElementById("errorFormAlumno");
const $btnGuardar = document.getElementById("btnGuardarAlumno");

let alumnos = [];

const escapar = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function mostrarError(texto) {
  $msg.textContent = texto;
  $msg.classList.remove("d-none");
}
function limpiarError() {
  $msg.classList.add("d-none");
  $msg.textContent = "";
}

function fila(alumno) {
  const activo = alumno.estado === "activo";
  const estado = activo
    ? `<span class="badge bg-success-subtle text-success border border-success-subtle">Activo</span>`
    : `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">Inactivo</span>`;

  const nivel = alumno.nivel === "secundaria"
    ? `<span class="badge bg-info-subtle text-info border border-info-subtle">Secundario</span>`
    : `<span class="badge bg-primary-subtle text-primary border border-primary-subtle">Primario</span>`;

  const iniciales = escapar(`${alumno.nombre || ""} ${alumno.apellido || ""}`.trim() || "?");
  const avatar = `
    <span class="material-symbols-outlined align-middle me-2 text-primary" style="font-size:20px">account_circle</span>`;

  return `
    <tr data-id="${escapar(alumno.id)}">
      <td><code>${escapar(alumno.legajo) || "-"}</code></td>
      <td>
        <div class="fw-bold">${avatar}${iniciales}</div>
      </td>
      <td>${nivel}</td>
      <td class="text-muted small">${escapar(alumno.email) || "-"}</td>
      <td>${estado}</td>
      <td class="text-end">
        <button class="btn btn-outline-secondary btn-sm rounded-pill" data-accion="editar">
            <span class="material-symbols-outlined align-middle" style="font-size:16px">edit</span>
        </button>
        <button class="btn btn-outline-danger btn-sm rounded-pill" data-accion="borrar">
            <span class="material-symbols-outlined align-middle" style="font-size:16px">delete</span>
        </button>
      </td>
    </tr>`;
}

// El filtro corre en el navegador a propósito: el backend trae la colección
// entera en una sola respuesta (143 ms con 5 alumnos) y filtrar en cada tecla
// sin ir al servidor hace que la búsqueda sea instantánea.
// Se comparan los textos sin acentos: escribir "garcia" tiene que encontrar a
// "García", si no el buscador parece roto.
const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function filtrados() {
  const texto = normalizar($buscar.value.trim());
  const estado = $filtroEstado.value;

  return alumnos.filter((a) => {
    if (estado !== "todos" && (a.estado || "activo") !== estado) return false;
    if (!texto) return true;
    return ["legajo", "nombre", "apellido", "email", "nivel"].some((campo) =>
      normalizar(a[campo]).includes(texto)
    );
  });
}

function pintar() {
  const lista = filtrados();
  $contador.textContent = `${lista.length} alumno${lista.length === 1 ? "" : "s"}`;

  if (alumnos.length === 0) {
    $tabla.innerHTML =
      `<tr><td colspan="6" class="text-center text-muted py-4">Todavía no hay alumnos cargados.</td></tr>`;
    return;
  }
  if (lista.length === 0) {
    $tabla.innerHTML =
      `<tr><td colspan="6" class="text-center text-muted py-4">Ningún alumno coincide con la búsqueda.</td></tr>`;
    return;
  }
  $tabla.innerHTML = lista.map(fila).join("");
}

async function cargar() {
  $tabla.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Cargando...</td></tr>`;
  limpiarError();

  try {
    const resp = await window.fetchConAuth("/api/alumnos");
    const json = await resp.json();

    if (resp.status === 403) {
      $msgAcceso.textContent = "Tu usuario no es administrador, así que no puede ver ni editar alumnos.";
      $msgAcceso.classList.remove("d-none");
      $tabla.innerHTML = "";
      return;
    }
    if (!resp.ok || !json.ok) {
      mostrarError(json.error || "No se pudo cargar el listado de alumnos.");
      return;
    }

    alumnos = json.data || [];
    pintar();
  } catch (err) {
    console.error(err);
    mostrarError("No se pudo conectar con el servidor.");
    $tabla.innerHTML = "";
  }
}

// ─── Formulario ─────────────────────────────────────────────────────────────

function limpiarFormulario() {
  $errorForm.classList.add("d-none");
  $errorForm.textContent = "";
  document.getElementById("alumnoId").value = "";
  document.getElementById("alumnoLegajo").value = "";
  document.getElementById("alumnoNombre").value = "";
  document.getElementById("alumnoApellido").value = "";
  document.getElementById("alumnoEmail").value = "";
  document.getElementById("alumnoEstado").value = "activo";
  document.getElementById("alumnoNivel").value = "primaria";
}

function abrirFormulario(id = null) {
  limpiarFormulario();

  if (id) {
    const alumno = alumnos.find((a) => a.id === id);
    if (!alumno) return;
    document.getElementById("tituloModalAlumno").textContent = `Editar ${alumno.nombre} ${alumno.apellido}`;
    document.getElementById("alumnoId").value = alumno.id;
    document.getElementById("alumnoLegajo").value = alumno.legajo || "";
    document.getElementById("alumnoNombre").value = alumno.nombre || "";
    document.getElementById("alumnoApellido").value = alumno.apellido || "";
    document.getElementById("alumnoEmail").value = alumno.email || "";
    document.getElementById("alumnoEstado").value = alumno.estado || "activo";
    document.getElementById("alumnoNivel").value = alumno.nivel || "primaria";
  } else {
    document.getElementById("tituloModalAlumno").textContent = "Nuevo alumno";
  }

  $modal.show();
}

function errorFormulario(texto) {
  $errorForm.textContent = texto;
  $errorForm.classList.remove("d-none");
}

async function guardar() {
  const id = document.getElementById("alumnoId").value;
  const datos = {
    legajo: document.getElementById("alumnoLegajo").value.trim().toUpperCase(),
    nombre: document.getElementById("alumnoNombre").value.trim(),
    apellido: document.getElementById("alumnoApellido").value.trim(),
    email: document.getElementById("alumnoEmail").value.trim(),
    estado: document.getElementById("alumnoEstado").value,
    nivel: document.getElementById("alumnoNivel").value,
  };

  if (!datos.legajo || !datos.nombre || !datos.apellido || !datos.email) {
    return errorFormulario("Completá legajo, nombre, apellido y email.");
  }
  if (!/^\S+@\S+\.\S+$/.test(datos.email)) {
    return errorFormulario("El email no tiene un formato válido.");
  }

  $btnGuardar.disabled = true;
  $btnGuardar.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';

  try {
    const esAlta = !id;
    const resp = await window.fetchConAuth(esAlta ? "/api/alumnos" : `/api/alumnos/${id}`, {
      method: esAlta ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const json = await resp.json();

    if (!resp.ok || !json.ok) {
      return errorFormulario(json.error || "No se pudo guardar el alumno.");
    }

    $modal.hide();
    await cargar();
  } catch (err) {
    console.error(err);
    errorFormulario("No se pudo conectar con el servidor.");
  } finally {
    $btnGuardar.disabled = false;
    $btnGuardar.textContent = "Guardar";
  }
}

async function borrar(id) {
  const alumno = alumnos.find((a) => a.id === id);
  if (!alumno) return;

  // Antes de borrar avisamos cuántas inscripciones tiene, porque GET
  // /api/alumnos/:id no las trae y el borrado se lleva los datos =>
  // /api/alumnos/:id también. Si el conteo falla seguimos igual: es un aviso,
  // no un requisito.
  let inscripciones = 0;
  try {
    const resp = await window.fetchConAuth(`/api/inscripciones?alumnoId=${id}`);
    if (resp.ok) {
      const json = await resp.json();
      inscripciones = Array.isArray(json.data) ? json.data.length : 0;
    }
  } catch (err) {
    console.warn("No se pudo leer las inscripciones del alumno:", err);
  }

  let mensaje = `¿Eliminar a ${alumno.nombre} ${alumno.apellido}? Esta acción no se puede deshacer.`;
  if (inscripciones > 0) {
    mensaje += `\n\nEl alumno tiene ${inscripciones} inscripción(es) y también se van a perder.`;
  }
  if (!confirm(mensaje)) return;

  try {
    const resp = await window.fetchConAuth(`/api/alumnos/${id}`, { method: "DELETE" });
    const json = await resp.json();

    if (!resp.ok || !json.ok) {
      return mostrarError(json.error || "No se pudo eliminar el alumno.");
    }
    await cargar();
  } catch (err) {
    console.error(err);
    mostrarError("No se pudo conectar con el servidor.");
  }
}

// ─── Eventos ────────────────────────────────────────────────────────────────

document.getElementById("btnNuevoAlumno").addEventListener("click", () => abrirFormulario());
document.getElementById("btnRefrescarAlumnos").addEventListener("click", cargar);
$btnGuardar.addEventListener("click", guardar);

// El buscador filtra al tipear y con Enter, para probar rápido. Sirve también
// el atajo / como en los buscadores de escritorio.
$buscar.addEventListener("input", pintar);
$buscar.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); pintar(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== $buscar) { e.preventDefault(); $buscar.focus(); }
});
$filtroEstado.addEventListener("change", pintar);

$tabla.addEventListener("click", (e) => {
  const boton = e.target.closest("button[data-accion]");
  if (!boton) return;
  const id = boton.closest("tr").dataset.id;
  if (boton.dataset.accion === "editar") abrirFormulario(id);
  else borrar(id);
});

// auth-guard.js entra como <script type="module"> y los módulos corren después de
// terminar el <body>, así que al ejecutar este IIFE directo window.authReady
// todavía no existía (await undefined no espera nada) y la página se caía al
// primer fetch. DOMContentLoaded sí se dispara con los módulos ya ejecutados.
document.addEventListener("DOMContentLoaded", iniciar);

async function iniciar() {
  await window.authReady;

  // La búsqueda puede venir del buscador del panel: dashboard.html manda a
  // admin-alumnos.html?q=... cuando apretás Enter arriba.
  const q = new URLSearchParams(window.location.search).get("q");
  if (q) $buscar.value = q;

  try {
    const resp = await window.fetchConAuth("/api/auth/me");
    const json = await resp.json();
    if (json && json.data) {
      const nombre = [json.data.nombre, json.data.apellido].filter(Boolean).join(" ") || "Administración";
      document.getElementById("navNombreAlumnos").textContent = nombre;
      if (json.data.rol !== "admin") {
        $msgAcceso.textContent = "Tu usuario no es administrador, así que no puede ver ni editar alumnos.";
        $msgAcceso.classList.remove("d-none");
      }
    }
  } catch (err) {
    console.warn("No se pudo leer el perfil para el encabezado:", err);
  }
  await cargar();
}
