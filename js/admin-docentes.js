/* global bootstrap, document, window */

const $lista = document.getElementById("listaDocentes");
const $buscar = document.getElementById("buscarDocente");
const $nivel = document.getElementById("filtroNivelDocente");
const $estadoFiltro = document.getElementById("filtroEstadoDocente");
const $materiaFiltro = document.getElementById("filtroMateriaDocente");
const $ciclo = document.getElementById("cicloDocente");
const $contador = document.getElementById("contadorDocentes");
const $mensaje = document.getElementById("msgDocentes");
const $mensajeAcceso = document.getElementById("msgAccesoDocentes");
const $formulario = document.getElementById("formEditarDocente");
const $modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("modalEditarDocente"));
const $errorFormulario = document.getElementById("errorFormularioDocente");
const $btnGuardar = document.getElementById("btnGuardarDocente");

let docentes = [];
let materias = [];
let alumnos = [];
let inscripciones = [];

const ENTIDADES_HTML = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&#39;"],
]);

const escapar = (valor) => String(valor ?? "").replace(/[&<>"']/g, (caracter) =>
  ENTIDADES_HTML.get(caracter));

function mostrarMensaje(texto, tipo = "danger") {
  $mensaje.textContent = texto;
  $mensaje.className = `alert alert-${tipo}`;
}

function limpiarMensaje() {
  $mensaje.textContent = "";
  $mensaje.className = "alert d-none";
}

async function pedirJson(url, opciones) {
  const respuesta = await window.fetchConAuth(url, opciones);
  const json = await respuesta.json().catch(() => null);
  if (!respuesta.ok || !json?.ok) {
    throw new Error(json?.error || `Error HTTP ${respuesta.status}`);
  }
  return json.data;
}

function nombreDocente(docente) {
  return [docente.nombre, docente.apellido].filter(Boolean).join(" ") || "Docente sin nombre";
}

function materiasDelDocente(docente) {
  const ciclo = Number($ciclo.value);
  return materias.filter((materia) =>
    materia.docenteId === docente.id && Number(materia.cicloLectivo) === ciclo
  );
}

function actualizarFiltroMaterias() {
  const valorAnterior = $materiaFiltro.value;
  const ciclo = Number($ciclo.value);
  const nivel = $nivel.value;
  const disponibles = materias.filter((materia) =>
    Number(materia.cicloLectivo) === ciclo &&
    (nivel === "todos" || (nivel === "sin" ? !materia.nivel : materia.nivel === nivel))
  );

  $materiaFiltro.innerHTML = `<option value="todas">Todas las materias</option>` +
    disponibles.map((materia) =>
      `<option value="${escapar(materia.id)}">${escapar(materia.codigo || "")} — ${escapar(materia.nombre || "Sin nombre")}</option>`
    ).join("");
  if (disponibles.some((materia) => materia.id === valorAnterior)) {
    $materiaFiltro.value = valorAnterior;
  }
}

function docentesFiltrados() {
  const texto = $buscar.value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const materiaId = $materiaFiltro.value;
  return docentes.filter((docente) => {
    const materiasAsignadas = materiasDelDocente(docente);
    if ($estadoFiltro.value !== "todos" && (docente.estado || "activo") !== $estadoFiltro.value) return false;
    if (materiaId !== "todas" && !materiasAsignadas.some((materia) => materia.id === materiaId)) return false;
    if ($nivel.value === "sin" && materiasAsignadas.some((materia) => materia.nivel)) return false;
    if ($nivel.value !== "todos" && $nivel.value !== "sin" &&
        !materiasAsignadas.some((materia) => materia.nivel === $nivel.value)) return false;
    if (!texto) return true;
    return [docente.nombre, docente.apellido, docente.legajo, docente.email]
      .some((campo) => String(campo || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(texto));
  });
}

function nivelMateria(nivel) {
  const niveles = new Map([["primaria", "Primaria"], ["secundaria", "Secundaria"]]);
  return niveles.get(nivel) || "Sin nivel";
}

function estudiantesDeMateria(materia) {
  const porAlumno = new Map();
  for (const inscripcion of inscripciones) {
    if (inscripcion.materiaId !== materia.id || Number(inscripcion.cicloLectivo) !== Number($ciclo.value)) continue;
    const alumno = alumnos.find((item) => item.id === inscripcion.alumnoId);
    if (alumno) porAlumno.set(alumno.id, { alumno, estado: inscripcion.estado });
  }
  return [...porAlumno.values()].sort((a, b) =>
    nombreDocente({ nombre: a.alumno.apellido, apellido: a.alumno.nombre })
      .localeCompare(nombreDocente({ nombre: b.alumno.apellido, apellido: b.alumno.nombre }), "es"));
}

function opcionesDocentes(docenteActualId) {
  return `<option value="">Sin asignar</option>` + docentes
    .map((docente) => `<option value="${escapar(docente.id)}" ${docente.id === docenteActualId ? "selected" : ""}>${escapar(nombreDocente(docente))}</option>`)
    .join("");
}

function tarjetaDocente(docente) {
  const materiasAsignadas = materiasDelDocente(docente);
  const cantidadAlumnos = new Set(materiasAsignadas.flatMap((materia) =>
    estudiantesDeMateria(materia).map(({ alumno }) => alumno.id)
  )).size;
  const estado = docente.estado === "inactivo"
    ? `<span class="badge bg-secondary-subtle text-secondary">Inactivo</span>`
    : `<span class="badge bg-success-subtle text-success">Activo</span>`;

  const filasMateria = materiasAsignadas.map((materia) => {
    const inscriptos = estudiantesDeMateria(materia);
    return `
      <div class="border rounded-3 p-3 mb-3">
        <div class="row g-3 align-items-start">
          <div class="col-lg-3">
            <div class="fw-bold">${escapar(materia.nombre || "Materia sin nombre")}</div>
            <div class="small text-muted">${escapar(materia.codigo || "Sin código")} · ${escapar(nivelMateria(materia.nivel))}</div>
          </div>
          <div class="col-lg-4">
            <label class="form-label small fw-bold text-secondary" for="materia-${escapar(materia.id)}">Docente responsable</label>
            <select id="materia-${escapar(materia.id)}" class="form-select form-select-sm" data-cambiar-docente="${escapar(materia.id)}">
              ${opcionesDocentes(materia.docenteId)}
            </select>
          </div>
          <div class="col-lg-5">
            <div class="d-flex justify-content-between align-items-center gap-2">
              <span class="small fw-bold text-secondary">Alumnos (${inscriptos.length})</span>
              <a class="small text-decoration-none" href="admin-inscripciones.html?materiaId=${encodeURIComponent(materia.id)}&amp;cicloLectivo=${encodeURIComponent($ciclo.value)}">Gestionar inscripciones</a>
            </div>
            ${inscriptos.length
              ? `<ul class="small mb-0 mt-2 ps-3">${inscriptos.map(({ alumno, estado: cursada }) =>
                `<li>${escapar([alumno.apellido, alumno.nombre].filter(Boolean).join(", "))}${cursada ? ` <span class="text-muted">(${escapar(cursada)})</span>` : ""}</li>`
              ).join("")}</ul>`
              : `<p class="small text-muted mb-0 mt-2">No hay alumnos inscriptos en este ciclo.</p>`}
          </div>
        </div>
      </div>`;
  }).join("");

  return `
    <article class="card card-dash bg-white shadow-sm border-0" data-docente-id="${escapar(docente.id)}">
      <div class="card-body p-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
          <div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <h3 class="h5 fw-bold mb-0">${escapar(nombreDocente(docente))}</h3>
              ${estado}
            </div>
            <div class="small text-muted mt-1">Legajo ${escapar(docente.legajo || "—")} · ${escapar(docente.email || "Sin email")}</div>
            <div class="small text-muted mt-1">${materiasAsignadas.length} materia${materiasAsignadas.length === 1 ? "" : "s"} · ${cantidadAlumnos} alumno${cantidadAlumnos === 1 ? "" : "s"} distintos en ${escapar($ciclo.value)}</div>
          </div>
          <button type="button" class="btn btn-outline-primary btn-sm rounded-pill" data-editar-docente="${escapar(docente.id)}">
            <span class="material-symbols-outlined align-middle me-1" style="font-size:16px">edit</span> Editar docente
          </button>
        </div>
        <hr>
        ${filasMateria || `<p class="text-muted small mb-0">No tiene materias asignadas en este ciclo. Para crear una cuenta docente, usá Usuarios.</p>`}
      </div>
    </article>`;
}

function pintar() {
  const lista = docentesFiltrados();
  $contador.textContent = `${lista.length} de ${docentes.length} docente${docentes.length === 1 ? "" : "s"}`;
  if (lista.length === 0) {
    $lista.innerHTML = `<div class="card card-dash p-4 bg-white shadow-sm border-0 text-center text-muted">No hay docentes que coincidan con los filtros seleccionados.</div>`;
    return;
  }
  $lista.innerHTML = lista.map(tarjetaDocente).join("");
}

function abrirEdicion(id) {
  const docente = docentes.find((item) => item.id === id);
  if (!docente) return;
  document.getElementById("docenteId").value = docente.id;
  document.getElementById("docenteNombre").value = docente.nombre || "";
  document.getElementById("docenteApellido").value = docente.apellido || "";
  document.getElementById("docenteLegajo").value = docente.legajo || "";
  document.getElementById("docenteEmail").value = docente.email || "";
  document.getElementById("docenteEstado").value = docente.estado === "inactivo" ? "inactivo" : "activo";
  $errorFormulario.classList.add("d-none");
  $errorFormulario.textContent = "";
  $modal.show();
}

async function guardarDocente(evento) {
  evento.preventDefault();
  const id = document.getElementById("docenteId").value;
  const datos = {
    nombre: document.getElementById("docenteNombre").value.trim(),
    apellido: document.getElementById("docenteApellido").value.trim(),
    legajo: document.getElementById("docenteLegajo").value.trim().toUpperCase(),
    estado: document.getElementById("docenteEstado").value,
  };
  if (!datos.nombre || !datos.apellido || !datos.legajo) {
    $errorFormulario.textContent = "Completá nombre, apellido y legajo.";
    $errorFormulario.classList.remove("d-none");
    return;
  }

  $btnGuardar.disabled = true;
  try {
    await pedirJson(`/api/docentes/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    $modal.hide();
    await cargar();
    mostrarMensaje("Los datos del docente se actualizaron.", "success");
  } catch (error) {
    $errorFormulario.textContent = error.message;
    $errorFormulario.classList.remove("d-none");
  } finally {
    $btnGuardar.disabled = false;
  }
}

async function cambiarResponsable(materiaId, docenteId, select) {
  const materia = materias.find((item) => item.id === materiaId);
  if (!materia) return;
  select.disabled = true;
  limpiarMensaje();
  try {
    await pedirJson(`/api/materias/${encodeURIComponent(materiaId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docenteId: docenteId || null }),
    });
    await cargar();
    mostrarMensaje("Se actualizó el docente responsable de la materia.", "success");
  } catch (error) {
    select.value = materia.docenteId || "";
    mostrarMensaje(error.message);
    select.disabled = false;
  }
}

async function cargar() {
  limpiarMensaje();
  $lista.innerHTML = `<div class="card card-dash p-4 bg-white shadow-sm border-0 text-center text-muted">Cargando docentes y cursadas...</div>`;
  try {
    const [listaDocentes, listaMaterias, listaAlumnos, listaInscripciones] = await Promise.all([
      pedirJson("/api/docentes"),
      pedirJson("/api/materias"),
      pedirJson("/api/alumnos"),
      pedirJson("/api/inscripciones"),
    ]);
    docentes = listaDocentes;
    materias = listaMaterias;
    alumnos = listaAlumnos;
    inscripciones = listaInscripciones;
    actualizarFiltroMaterias();
    pintar();
  } catch (error) {
    $lista.innerHTML = `<div class="card card-dash p-4 bg-white shadow-sm border-0 text-center text-danger">${escapar(error.message)}</div>`;
    $contador.textContent = "No se pudo cargar el listado";
    if (error.message.includes("permisos") || error.message.includes("administrador") || error.message.includes("rol")) {
      $mensajeAcceso.textContent = "Esta pantalla es exclusiva para administradores.";
      $mensajeAcceso.classList.remove("d-none");
    } else {
      mostrarMensaje(error.message);
    }
  }
}

$lista.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-editar-docente]");
  if (boton) abrirEdicion(boton.dataset.editarDocente);
});

$lista.addEventListener("change", (evento) => {
  const select = evento.target.closest("[data-cambiar-docente]");
  if (select) cambiarResponsable(select.dataset.cambiarDocente, select.value, select);
});

$formulario.addEventListener("submit", guardarDocente);
$buscar.addEventListener("input", pintar);
$nivel.addEventListener("change", () => {
  actualizarFiltroMaterias();
  pintar();
});
$estadoFiltro.addEventListener("change", pintar);
$materiaFiltro.addEventListener("change", pintar);
$ciclo.addEventListener("input", () => {
  document.getElementById("badgeCicloDocentes").textContent = `Ciclo lectivo ${$ciclo.value || "—"}`;
  actualizarFiltroMaterias();
  pintar();
});
document.getElementById("btnRefrescarDocentes").addEventListener("click", cargar);

document.addEventListener("DOMContentLoaded", async () => {
  await window.authReady;
  try {
    const perfil = await pedirJson("/api/auth/me");
    if (perfil.rol !== "admin") {
      $mensajeAcceso.textContent = "Esta pantalla es exclusiva para administradores.";
      $mensajeAcceso.classList.remove("d-none");
      $lista.innerHTML = "";
      $contador.textContent = "";
      return;
    }
    document.getElementById("navNombreDocentes").textContent =
      [perfil.nombre, perfil.apellido].filter(Boolean).join(" ") || "Administración";
    if (Number.isInteger(perfil.cicloLectivoActual)) {
      $ciclo.value = perfil.cicloLectivoActual;
      document.getElementById("badgeCicloDocentes").textContent =
        `Ciclo lectivo ${perfil.cicloLectivoActual}`;
    }
    await cargar();
  } catch (error) {
    $mensajeAcceso.textContent = error.message;
    $mensajeAcceso.classList.remove("d-none");
    $lista.innerHTML = "";
    $contador.textContent = "";
  }
});
