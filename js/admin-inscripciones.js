/* global URLSearchParams, document, window, confirm */

const $form = document.getElementById("formInscripcion");
const $alumno = document.getElementById("inscripcionAlumno");
const $materia = document.getElementById("inscripcionMateria");
const $ciclo = document.getElementById("inscripcionCiclo");
const $estado = document.getElementById("inscripcionEstado");
const $tabla = document.getElementById("tablaInscripciones");
const $contador = document.getElementById("contadorInscripciones");
const $mensaje = document.getElementById("msgInscripciones");
const $mensajeAcceso = document.getElementById("msgAccesoInscripciones");
const $guardar = document.getElementById("btnGuardarInscripcion");

let alumnos = [];
let materias = [];
let inscripciones = [];
const parametros = new URLSearchParams(window.location.search);
const cicloSolicitado = Number(parametros.get("cicloLectivo"));
const materiaSolicitadaId = parametros.get("materiaId");

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

function nombreAlumno(alumno) {
  return [alumno.nombre, alumno.apellido].filter(Boolean).join(" ") || "Alumno sin nombre";
}

function llenarAlumnos() {
  const activos = alumnos.filter((alumno) => !alumno.estado || alumno.estado === "activo");
  $alumno.innerHTML = `<option value="">Seleccioná un alumno</option>` +
    activos.map((alumno) =>
      `<option value="${escapar(alumno.id)}">${escapar(nombreAlumno(alumno))}${alumno.legajo ? ` (${escapar(alumno.legajo)})` : ""}</option>`
    ).join("");

  if (activos.length === 0) {
    $alumno.innerHTML = `<option value="">No hay alumnos activos disponibles</option>`;
  }
}

function llenarMaterias() {
  const ciclo = Number($ciclo.value);
  const disponibles = materias.filter((materia) => Number(materia.cicloLectivo) === ciclo);
  $materia.innerHTML = `<option value="">Seleccioná una materia</option>` +
    disponibles.map((materia) =>
      `<option value="${escapar(materia.id)}">${escapar(materia.nombre)}${materia.codigo ? ` (${escapar(materia.codigo)})` : ""}</option>`
    ).join("");

  if (disponibles.length === 0) {
    $materia.innerHTML = `<option value="">No hay materias para ${escapar(ciclo)}</option>`;
  }
}

function etiquetaEstado(estado) {
  const etiquetas = new Map([
    ["cursando", "Cursando"],
    ["aprobada", "Aprobada"],
    ["libre", "Libre"],
    ["desercion", "Deserción"],
  ]);
  return etiquetas.get(estado) || estado || "Sin estado";
}

function pintarInscripciones() {
  const ciclo = Number($ciclo.value);
  const visibles = inscripciones.filter((inscripcion) => Number(inscripcion.cicloLectivo) === ciclo);
  $contador.textContent = `${visibles.length} inscripción${visibles.length === 1 ? "" : "es"} en ${ciclo}`;

  if (visibles.length === 0) {
    $tabla.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Todavía no hay inscripciones para ${escapar(ciclo)}.</td></tr>`;
    return;
  }

  $tabla.innerHTML = visibles.map((inscripcion) => {
    const alumno = alumnos.find((item) => item.id === inscripcion.alumnoId);
    const materia = materias.find((item) => item.id === inscripcion.materiaId);
    return `
      <tr data-id="${escapar(inscripcion.id)}">
        <td>${escapar(alumno ? nombreAlumno(alumno) : "Alumno no disponible")}</td>
        <td>${escapar(materia?.nombre || "Materia no disponible")}</td>
        <td>${escapar(inscripcion.cicloLectivo)}</td>
        <td>${escapar(etiquetaEstado(inscripcion.estado))}</td>
        <td class="text-end">
          <button type="button" class="btn btn-outline-danger btn-sm rounded-pill" data-accion="eliminar" aria-label="Eliminar inscripción">
            <span class="material-symbols-outlined align-middle" style="font-size:16px">delete</span>
          </button>
        </td>
      </tr>`;
  }).join("");
}

async function cargar() {
  limpiarMensaje();
  $tabla.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Cargando...</td></tr>`;
  $contador.textContent = "Cargando...";

  try {
    const [listaAlumnos, listaMaterias, listaInscripciones] = await Promise.all([
      pedirJson("/api/alumnos"),
      pedirJson("/api/materias"),
      pedirJson("/api/inscripciones"),
    ]);
    alumnos = listaAlumnos;
    materias = listaMaterias;
    inscripciones = listaInscripciones;
    llenarAlumnos();
    llenarMaterias();
    if (materiaSolicitadaId && materias.some((materia) => materia.id === materiaSolicitadaId)) {
      $materia.value = materiaSolicitadaId;
    }
    pintarInscripciones();
  } catch (error) {
    $tabla.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">${escapar(error.message)}</td></tr>`;
    $contador.textContent = "No se pudo cargar el listado";
    if (error.message.includes("permiso") || error.message.includes("administrador")) {
      $mensajeAcceso.textContent = "Esta pantalla es exclusiva para administradores.";
      $mensajeAcceso.classList.remove("d-none");
    } else {
      mostrarMensaje(error.message);
    }
  }
}

async function crearInscripcion(evento) {
  evento.preventDefault();
  limpiarMensaje();

  const datos = {
    alumnoId: $alumno.value,
    materiaId: $materia.value,
    cicloLectivo: Number($ciclo.value),
    estado: $estado.value,
  };

  if (!datos.alumnoId || !datos.materiaId) {
    mostrarMensaje("Seleccioná un alumno y una materia.");
    return;
  }
  if (!Number.isInteger(datos.cicloLectivo) || datos.cicloLectivo < 2000 || datos.cicloLectivo > 2100) {
    mostrarMensaje("Ingresá un ciclo lectivo válido entre 2000 y 2100.");
    return;
  }

  $guardar.disabled = true;
  $guardar.textContent = "Guardando...";
  try {
    await pedirJson("/api/inscripciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    await cargar();
    mostrarMensaje("La inscripción se creó correctamente.", "success");
    $alumno.value = "";
    if (!materiaSolicitadaId) $materia.value = "";
  } catch (error) {
    mostrarMensaje(error.message);
  } finally {
    $guardar.disabled = false;
    $guardar.textContent = "Inscribir alumno";
  }
}

async function eliminarInscripcion(id) {
  const inscripcion = inscripciones.find((item) => item.id === id);
  if (!inscripcion || !confirm("¿Eliminar esta inscripción? Esta acción no se puede deshacer.")) return;

  limpiarMensaje();
  try {
    await pedirJson(`/api/inscripciones/${encodeURIComponent(id)}`, { method: "DELETE" });
    mostrarMensaje("La inscripción se eliminó correctamente.", "success");
    await cargar();
  } catch (error) {
    mostrarMensaje(error.message);
  }
}

$form.addEventListener("submit", crearInscripcion);
$ciclo.addEventListener("input", () => {
  document.getElementById("badgeCicloInscripciones").textContent = `Ciclo lectivo ${$ciclo.value || "—"}`;
  llenarMaterias();
  pintarInscripciones();
});
$tabla.addEventListener("click", (evento) => {
  const boton = evento.target.closest('[data-accion="eliminar"]');
  const fila = boton?.closest("tr[data-id]");
  if (fila) eliminarInscripcion(fila.dataset.id);
});
document.getElementById("btnRefrescarInscripciones").addEventListener("click", cargar);

document.addEventListener("DOMContentLoaded", async () => {
  await window.authReady;
  const respuesta = await window.fetchConAuth("/api/auth/me");
  const json = await respuesta.json().catch(() => null);
  if (json?.ok) {
    const perfil = json.data;
    document.getElementById("navNombreInscripciones").textContent =
      [perfil.nombre, perfil.apellido].filter(Boolean).join(" ") || "Administración";
    if (perfil.rol !== "admin") {
      $mensajeAcceso.textContent = "Esta pantalla es exclusiva para administradores.";
      $mensajeAcceso.classList.remove("d-none");
      $tabla.innerHTML = "";
      $contador.textContent = "";
      return;
    }
    const cicloInicial = Number.isInteger(cicloSolicitado) && cicloSolicitado >= 2000 && cicloSolicitado <= 2100
      ? cicloSolicitado
      : perfil.cicloLectivoActual;
    if (Number.isInteger(cicloInicial)) {
      $ciclo.value = cicloInicial;
      document.getElementById("badgeCicloInscripciones").textContent =
        `Ciclo lectivo ${cicloInicial}`;
    }
  }
  await cargar();
});
