// Alta, edición y baja de noticias.
//
// Requiere que auth-guard.js ya haya corrido (define window.fetchConAuth y
// window.cerrarSesion). Ojo: fetchConAuth devuelve la Response cruda, así que
// en cada llamada hay que leer el JSON con .json().

const $tabla = document.getElementById("tablaNoticias");
const $msg = document.getElementById("msgNoticias");
const $filtro = document.getElementById("filtroNoticias");

const $modalEl = document.getElementById("modalNoticiaForm");
const $modal = bootstrap.Modal.getOrCreateInstance($modalEl);
const $errorForm = document.getElementById("errorFormNoticia");

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

let noticias = [];

const escapar = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fechaLegible(iso) {
  const [a, m, d] = String(iso).split("-");
  const mes = MESES[Number(m) - 1];
  return mes ? `${Number(d)} ${mes} ${a}` : iso;
}

function mostrarError(texto) {
  $msg.textContent = texto;
  $msg.classList.remove("d-none");
}
function limpiarError() {
  $msg.classList.add("d-none");
  $msg.textContent = "";
}

function fila(noticia) {
  const estado = noticia.publicada
    ? `<span class="badge bg-success-subtle text-success border border-success-subtle">Publicada</span>`
    : `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">Borrador</span>`;

  const destacada = noticia.destacada
    ? `<span class="material-symbols-outlined text-warning" title="Destacada">star</span>`
    : `<span class="text-muted">&mdash;</span>`;

  return `
    <tr data-id="${escapar(noticia.id)}">
      <td class="text-nowrap">${escapar(fechaLegible(noticia.fecha))}</td>
      <td>
        <div class="fw-bold">${escapar(noticia.titulo)}</div>
        ${noticia.bajada ? `<small class="text-muted d-block">${escapar(noticia.bajada)}</small>` : ""}
      </td>
      <td>${estado}</td>
      <td class="text-center">${destacada}</td>
      <td class="text-end text-nowrap">
        <a class="btn btn-sm btn-outline-primary rounded-pill me-1 js-ver-publico"
           href="noticias.html" target="_blank" title="Ver en el sitio público">
          <span class="material-symbols-outlined align-middle" style="font-size:16px">visibility</span>
        </a>
        <button class="btn btn-sm btn-outline-secondary rounded-pill me-1 js-editar" title="Editar">
          <span class="material-symbols-outlined align-middle" style="font-size:16px">edit</span>
        </button>
        <button class="btn btn-sm btn-outline-danger rounded-pill js-borrar" title="Eliminar">
          <span class="material-symbols-outlined align-middle" style="font-size:16px">delete</span>
        </button>
      </td>
    </tr>`;
}

function pintar() {
  const filtro = $filtro.value;
  const filtradas = noticias.filter((n) =>
    filtro === "publicadas" ? n.publicada
      : filtro === "borradores" ? !n.publicada
        : true);

  if (filtradas.length === 0) {
    const texto = noticias.length === 0
      ? "Todavía no hay noticias cargadas."
      : "Ninguna noticia coincide con el filtro.";
    $tabla.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">${texto}</td></tr>`;
    return;
  }

  $tabla.innerHTML = filtradas.map(fila).join("");
}

async function cargar() {
  $tabla.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Cargando...</td></tr>`;
  try {
    const resp = await window.fetchConAuth("/api/noticias/todas");
    const json = await resp.json().catch(() => null);
    if (!json || !json.ok) throw new Error((json && json.error) || `HTTP ${resp.status}`);

    noticias = json.data.noticias || [];
    limpiarError();
    pintar();
  } catch (err) {
    $tabla.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">${escapar(err.message)}</td></tr>`;
  }
}

/** Escribe los datos del formulario y abre el modal. Sin id = noticia nueva. */
function abrirFormulario(id = null) {
  $errorForm.classList.add("d-none");

  const n = id ? noticias.find((x) => x.id === id) : null;
  document.getElementById("tituloModalNoticia").textContent = n ? "Editar noticia" : "Nueva noticia";
  document.getElementById("noticiaId").value = n ? n.id : "";
  document.getElementById("noticiaTitulo").value = n ? n.titulo : "";
  document.getElementById("noticiaBajada").value = n ? (n.bajada || "") : "";
  document.getElementById("noticiaCuerpo").value = n ? n.cuerpo : "";
  document.getElementById("noticiaImagen").value = n ? (n.imagen || "") : "";
  document.getElementById("noticiaPublicada").checked = n ? Boolean(n.publicada) : true;
  document.getElementById("noticiaDestacada").checked = n ? Boolean(n.destacada) : false;

  // Si el admin no completa la fecha, por defecto va la de hoy.
  if (!n) document.getElementById("noticiaFecha").value = new Date().toISOString().slice(0, 10);

  $modal.show();
  document.getElementById("noticiaTitulo").focus();
}

function leerFormulario() {
  return {
    titulo: document.getElementById("noticiaTitulo").value,
    bajada: document.getElementById("noticiaBajada").value,
    cuerpo: document.getElementById("noticiaCuerpo").value,
    imagen: document.getElementById("noticiaImagen").value,
    fecha: document.getElementById("noticiaFecha").value,
    publicada: document.getElementById("noticiaPublicada").checked,
    destacada: document.getElementById("noticiaDestacada").checked,
  };
}

async function guardar() {
  const id = document.getElementById("noticiaId").value;
  const btn = document.getElementById("btnGuardarNoticia");
  const datos = leerFormulario();

  btn.disabled = true;
  $errorForm.classList.add("d-none");

  try {
    const url = id ? `/api/noticias/${id}` : "/api/noticias";
    const resp = await window.fetchConAuth(url, {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const json = await resp.json().catch(() => null);
    if (!json || !json.ok) throw new Error((json && json.error) || `HTTP ${resp.status}`);

    $modal.hide();
    await cargar();
  } catch (err) {
    $errorForm.textContent = err.message;
    $errorForm.classList.remove("d-none");
  } finally {
    btn.disabled = false;
  }
}

async function borrar(id) {
  const n = noticias.find((x) => x.id === id);
  if (!n) return;
  if (!confirm(`¿Eliminar la noticia "${n.titulo}"? Esta acción no se puede deshacer.`)) return;

  try {
    const resp = await window.fetchConAuth(`/api/noticias/${id}`, { method: "DELETE" });
    const json = await resp.json().catch(() => null);
    if (!json || !json.ok) throw new Error((json && json.error) || `HTTP ${resp.status}`);

    await cargar();
  } catch (err) {
    mostrarError(err.message);
  }
}

// Las filas se redibujan en cada carga, así que usamos delegación de eventos.
$tabla.addEventListener("click", (ev) => {
  const tr = ev.target.closest("tr[data-id]");
  if (!tr) return;

  if (ev.target.closest(".js-editar")) abrirFormulario(tr.dataset.id);
  else if (ev.target.closest(".js-borrar")) borrar(tr.dataset.id);
});

document.getElementById("btnNuevaNoticia").addEventListener("click", () => abrirFormulario());
document.getElementById("btnGuardarNoticia").addEventListener("click", guardar);
document.getElementById("btnRefrescarNoticias").addEventListener("click", cargar);
$filtro.addEventListener("change", pintar);

// Limpiar el formulario al cerrar el modal, así no queda data de la edición anterior.
$modalEl.addEventListener("hidden.bs.modal", () => {
  document.getElementById("noticiaId").value = "";
  $errorForm.classList.add("d-none");
});

// Arranque en DOMContentLoaded: auth-guard.js es type="module" y los módulos se
// ejecutan después de cerrarse el <body>, así que window.fetchConAuth todavía no
// estaba definido con un IIFE directo.
document.addEventListener("DOMContentLoaded", iniciar);

async function iniciar() {
  const resp = await window.fetchConAuth("/api/auth/me");
  const json = await resp.json().catch(() => null);
  if (json && json.ok) {
    const lbl = document.getElementById("navNombreNoticias");
    if (lbl) lbl.textContent = [json.data.nombre, json.data.apellido].filter(Boolean).join(" ") || "Administración";
  }

  await cargar();
}
