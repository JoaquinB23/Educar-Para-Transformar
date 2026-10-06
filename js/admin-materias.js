// Listado, alta, edición, baja y asignación de materias a docentes.
//
// El backend ya tenía GET/POST/PUT/DELETE /api/materias, pero `nivel` no se
// aceptaba en el alta y el PUT escribía el body sin validar, así que el gráfico
// "Materias por nivel" del Inicio no tenía con qué contar.
//
// Requiere que auth-guard.js ya haya corrido (define window.fetchConAuth y
// window.cerrarSesion). Ojo: fetchConAuth devuelve la Response cruda, así que
// en cada llamada hay que leer el JSON con .json().

const $tabla = document.getElementById("tablaMaterias");
const $msg = document.getElementById("msgMaterias");
const $msgAcceso = document.getElementById("msgAccesoMaterias");
const $buscar = document.getElementById("buscarMateria");
const $filtroNivel = document.getElementById("filtroNivelMateria");
const $filtroDocente = document.getElementById("filtroDocenteMateria");
const $contador = document.getElementById("contadorMaterias");

const $modalEl = document.getElementById("modalMateriaForm");
const $modal = bootstrap.Modal.getOrCreateInstance($modalEl);
const $errorForm = document.getElementById("errorFormMateria");
const $btnGuardar = document.getElementById("btnGuardarMateria");

let materias = [];
let docentes = [];

const escapar = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// El filtro corre en el navegador: el backend trae la colección entera en una
// sola respuesta y filtrar en cada tecla sin ir al servidor lo hace instantáneo.
// Se comparan los textos sin acentos: "programacion" tiene que encontrar
// "Programación", si no el buscador parece roto.
const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const nombreDocente = (id) => {
  const d = docentes.find((x) => x.id === id);
  return d ? `${d.nombre} ${d.apellido || ""}`.trim() : null;
};

function mostrarError(texto) {
  $msg.textContent = texto;
  $msg.classList.remove("d-none");
}
function limpiarError() {
  $msg.classList.add("d-none");
  $msg.textContent = "";
}

function fila(materia) {
  const nivel = materia.nivel === "primaria"
    ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle">Primaria</span>`
    : materia.nivel === "secundaria"
      ? `<span class="badge bg-info-subtle text-info border border-info-subtle">Secundaria</span>`
      : `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">Sin nivel</span>`;

  const docente = nombreDocente(materia.docenteId);

  return `
    <tr data-id="${escapar(materia.id)}">
      <td><code>${escapar(materia.codigo) || "-"}</code></td>
      <td>
        <div class="fw-bold">
          <span class="material-symbols-outlined align-middle me-2 text-primary" style="font-size:20px">menu_book</span>${escapar(materia.nombre)}
        </div>
      </td>
      <td>${nivel}</td>
      <td class="text-muted small">${materia.cargaHoraria ?? "-"} min</td>
      <td>${docente
        ? escapar(docente)
        : `<span class="text-muted small">Sin asignar</span>`}</td>
      <td class="text-end">
        <button class="btn btn-outline-secondary btn-sm rounded-pill" data-accion="editar" title="Editar">
            <span class="material-symbols-outlined align-middle" style="font-size:16px">edit</span>
        </button>
        <button class="btn btn-outline-danger btn-sm rounded-pill" data-accion="borrar" title="Eliminar">
            <span class="material-symbols-outlined align-middle" style="font-size:16px">delete</span>
        </button>
      </td>
    </tr>`;
}

function filtrados() {
  const texto = normalizar($buscar.value.trim());
  const nivel = $filtroNivel.value;
  const docenteSel = $filtroDocente.value;

  return materias.filter((m) => {
    if (nivel === "sin" && m.nivel) return false;
    if (nivel !== "todos" && nivel !== "sin" && m.nivel !== nivel) return false;

    if (docenteSel !== "todos") {
      if (docenteSel === "sin") {
        if (m.docenteId) return false;
      } else if (m.docenteId !== docenteSel) {
        return false;
      }
    }

    if (!texto) return true;
    const campos = [m.codigo, m.nombre, m.nivel, nombreDocente(m.docenteId)];
    return campos.some((c) => normalizar(c).includes(texto));
  });
}

function pintarResumen() {
  const prim = materias.filter((m) => m.nivel === "primaria").length;
  const sec = materias.filter((m) => m.nivel === "secundaria").length;
  document.getElementById("resumenPrimaria").textContent = prim;
  document.getElementById("resumenSecundaria").textContent = sec;

  // Un docente "libre" es el que no tiene ninguna materia asignada, que es justo
  // lo que hay que mirar cuando falta repartir la carga.
  const conMateria = new Set(materias.map((m) => m.docenteId).filter(Boolean));
  const libres = docentes.filter((d) => !conMateria.has(d.id));
  document.getElementById("resumenSinDocente").textContent =
    `${libres.length} de ${docentes.length}`;
}

function pintar() {
  const lista = filtrados();
  $contador.textContent = `${lista.length} materia${lista.length === 1 ? "" : "s"}`;
  pintarResumen();

  if (materias.length === 0) {
    $tabla.innerHTML =
      `<tr><td colspan="6" class="text-center text-muted py-4">Todavía no hay materias cargadas.</td></tr>`;
    return;
  }
  if (lista.length === 0) {
    $tabla.innerHTML =
      `<tr><td colspan="6" class="text-center text-muted py-4">Ninguna materia coincide con la búsqueda.</td></tr>`;
    return;
  }
  $tabla.innerHTML = lista.map(fila).join("");
}

function llenarSelectDocentes(select, valorActual) {
  select.innerHTML = `<option value="">Sin asignar</option>`;
  for (const d of docentes) {
    const o = document.createElement("option");
    o.value = d.id;
    o.textContent = `${d.nombre} ${d.apellido || ""}`.trim() + (d.legajo ? ` (${d.legajo})` : "");
    select.appendChild(o);
  }
  select.value = valorActual || "";
}

function llenarFiltroDocentes() {
  const actual = $filtroDocente.value;
  $filtroDocente.innerHTML = `<option value="todos">Todos los docentes</option>
                              <option value="sin">Sin docente asignado</option>`;
  for (const d of docentes) {
    const o = document.createElement("option");
    o.value = d.id;
    o.textContent = `${d.nombre} ${d.apellido || ""}`.trim();
    $filtroDocente.appendChild(o);
  }
  $filtroDocente.value = actual && $filtroDocente.querySelector(`option[value="${CSS.escape(actual)}"]`)
    ? actual
    : "todos";
}

async function cargarDocentes() {
  try {
    const resp = await window.fetchConAuth("/api/docentes");
    const json = await resp.json();
    // Si no es admin el backend responde 403: seguimos con la lista vacía y el
    // resto de la página muestra el aviso de acceso.
    docentes = resp.ok && json.ok ? json.data || [] : [];
  } catch (err) {
    console.warn("No se pudieron cargar los docentes:", err);
    docentes = [];
  }
  llenarFiltroDocentes();
  llenarSelectDocentes(document.getElementById("materiaDocente"));
}

async function cargar() {
  $tabla.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Cargando...</td></tr>`;
  limpiarError();

  try {
    const resp = await window.fetchConAuth("/api/materias");
    const json = await resp.json();

    if (resp.status === 403) {
      $msgAcceso.textContent = "Tu usuario no es administrador, así que no puede ver ni editar materias.";
      $msgAcceso.classList.remove("d-none");
      $tabla.innerHTML = "";
      return;
    }
    if (!resp.ok || !json.ok) {
      mostrarError(json.error || "No se pudo cargar el listado de materias.");
      return;
    }

    materias = json.data || [];
    pintar();
  } catch (err) {
    console.error(err);
    mostrarError("No se pudo conectar con el servidor.");
    $tabla.innerHTML = "";
  }
}

// ─── Formulario ─────────────────────────────────────────────────────────────

function abrirFormulario(id = null) {
  $errorForm.classList.add("d-none");
  $errorForm.textContent = "";

  const $selectDocente = document.getElementById("materiaDocente");
  llenarSelectDocentes($selectDocente);

  if (id) {
    const m = materias.find((x) => x.id === id);
    if (!m) return;
    document.getElementById("tituloModalMateria").textContent = `Editar ${m.nombre}`;
    document.getElementById("materiaId").value = m.id;
    document.getElementById("materiaCodigo").value = m.codigo || "";
    document.getElementById("materiaNombre").value = m.nombre || "";
    document.getElementById("materiaCarga").value = m.cargaHoraria ?? "";
    document.getElementById("materiaNivel").value = m.nivel || "";
    $selectDocente.value = m.docenteId || "";
  } else {
    document.getElementById("tituloModalMateria").textContent = "Nueva materia";
    document.getElementById("materiaId").value = "";
    document.getElementById("materiaCodigo").value = "";
    document.getElementById("materiaNombre").value = "";
    document.getElementById("materiaCarga").value = "";
    document.getElementById("materiaNivel").value = "";
    $selectDocente.value = "";
  }

  $modal.show();
}

function errorFormulario(texto) {
  $errorForm.textContent = texto;
  $errorForm.classList.remove("d-none");
}

async function guardar() {
  const id = document.getElementById("materiaId").value;
  const datos = {
    codigo: document.getElementById("materiaCodigo").value.trim().toUpperCase(),
    nombre: document.getElementById("materiaNombre").value.trim(),
    cargaHoraria: Number(document.getElementById("materiaCarga").value),
    nivel: document.getElementById("materiaNivel").value || null,
    docenteId: document.getElementById("materiaDocente").value || null,
  };

  if (!datos.codigo || !datos.nombre) {
    return errorFormulario("Completá código y nombre.");
  }
  if (!Number.isFinite(datos.cargaHoraria) || datos.cargaHoraria <= 0) {
    return errorFormulario("La carga horaria tiene que ser un número mayor a 0.");
  }

  $btnGuardar.disabled = true;
  $btnGuardar.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';

  try {
    const esAlta = !id;
    // El ciclo lo hereda el backend (CICLO_LECTIVO) si no lo mandamos.
    const resp = await window.fetchConAuth(esAlta ? "/api/materias" : `/api/materias/${id}`, {
      method: esAlta ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const json = await resp.json();

    if (!resp.ok || !json.ok) {
      return errorFormulario(json.error || "No se pudo guardar la materia.");
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
  const m = materias.find((x) => x.id === id);
  if (!m) return;

  // Avisamos cuántos alumnos están inscritos, porque al borrar la materia se
  // llevan también sus horarios e inscripciones.
  let impactados = 0;
  try {
    const resp = await window.fetchConAuth(`/api/inscripciones?materiaId=${id}`);
    if (resp.ok) {
      const json = await resp.json();
      impactados = Array.isArray(json.data) ? json.data.length : 0;
    }
  } catch (err) {
    console.warn("No se pudo leer las inscripciones de la materia:", err);
  }

  let mensaje = `¿Eliminar la materia "${m.nombre}" (${m.codigo})? Esta acción no se puede deshacer.`;
  if (impactados > 0) {
    mensaje += `\n\n${impactados} alumno(s) están inscritos y también se van a quedar sin esa materia.`;
  }
  if (!confirm(mensaje)) return;

  try {
    const resp = await window.fetchConAuth(`/api/materias/${id}`, { method: "DELETE" });
    const json = await resp.json();

    if (!resp.ok || !json.ok) {
      return mostrarError(json.error || "No se pudo eliminar la materia.");
    }
    await cargar();
  } catch (err) {
    console.error(err);
    mostrarError("No se pudo conectar con el servidor.");
  }
}

// ─── Eventos ────────────────────────────────────────────────────────────────

document.getElementById("btnNuevaMateria").addEventListener("click", () => abrirFormulario());
document.getElementById("btnRefrescarMaterias").addEventListener("click", cargar);
$btnGuardar.addEventListener("click", guardar);

$buscar.addEventListener("input", pintar);
$buscar.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); pintar(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== $buscar) { e.preventDefault(); $buscar.focus(); }
});
$filtroNivel.addEventListener("change", pintar);
$filtroDocente.addEventListener("change", pintar);

$tabla.addEventListener("click", (e) => {
  const boton = e.target.closest("button[data-accion]");
  if (!boton) return;
  const id = boton.closest("tr").dataset.id;
  if (boton.dataset.accion === "editar") abrirFormulario(id);
  else borrar(id);
});

// Ojo con el arranque: auth-guard.js entra como <script type="module">, y los
// módulos se ejecutan DESPUÉS de que el parser llega al </body>. Si este IIFE
// corriera directo, window.authReady todavía sería undefined (await undefined no
// espera nada) y el primer fetchConAuth explotaría. Por eso se espera a
// DOMContentLoaded, que sí se dispara con los módulos ya ejecutados.
document.addEventListener("DOMContentLoaded", iniciar);

async function iniciar() {
  await window.authReady;

  const q = new URLSearchParams(window.location.search).get("q");
  if (q) $buscar.value = q;

  try {
    const resp = await window.fetchConAuth("/api/auth/me");
    const json = await resp.json();
    if (json && json.data) {
      document.getElementById("navNombreMaterias").textContent =
        window.nombreCompleto(json.data) || "Administración";
      if (json.data.rol !== "admin") {
        $msgAcceso.textContent = "Tu usuario no es administrador, así que no puede ver ni editar materias.";
        $msgAcceso.classList.remove("d-none");
      }
    }
  } catch (err) {
    console.warn("No se pudo leer el perfil para el encabezado:", err);
  }

  await cargarDocentes();
  await cargar();
}
