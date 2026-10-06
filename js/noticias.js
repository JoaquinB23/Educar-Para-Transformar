// Listado público de noticias. Lee GET /api/noticias, que en el backend ya
// filtra por `publicada: true`, así que acá nunca hay que filtrar nada.

const $lista = document.getElementById("listaNoticias");
let cache = [];

const escapar = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fechaLegible(iso) {
  const [a, m, d] = String(iso).split("-");
  const mes = MESES[Number(m) - 1];
  return mes ? `${Number(d)} ${mes}, ${a}` : iso;
}

function tarjeta(noticia) {
  const imagen = noticia.imagen
    ? `<img src="${escapar(noticia.imagen)}" class="card-img-top object-fit-cover" alt="${escapar(noticia.titulo)}" style="height: 200px;">`
    : `<div class="d-flex align-items-center justify-content-center bg-primary-subtle" style="height: 200px;">
         <span class="material-symbols-outlined display-4 text-primary">campaign</span>
       </div>`;

  return `
    <div class="col-lg-4 col-md-6">
      <div class="card h-100 border-0 shadow-sm rounded-4 overflow-hidden custom-hover-card">
        ${imagen}
        <div class="card-body p-4 d-flex flex-column">
          <div class="mb-2 d-flex align-items-center gap-2">
            ${noticia.destacada ? `<span class="badge bg-warning text-dark">Destacada</span>` : ""}
            <small class="text-muted">${escapar(fechaLegible(noticia.fecha))}</small>
          </div>
          <h4 class="card-title fw-bold">${escapar(noticia.titulo)}</h4>
          ${noticia.bajada ? `<p class="card-text text-secondary mb-3">${escapar(noticia.bajada)}</p>` : ""}
          <p class="card-text text-secondary mb-4">${escapar(noticia.cuerpo.length > 220 ? noticia.cuerpo.slice(0, 220) + "..." : noticia.cuerpo)}</p>
          <button class="btn btn-link text-primary fw-bold p-0 mt-auto text-decoration-none text-start js-leer"
                  data-id="${escapar(noticia.id)}" style="align-self: flex-start;">
            Leer más <i class="bi bi-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>`;
}

function pintar(noticias) {
  if (noticias.length === 0) {
    $lista.innerHTML = `
      <div class="col-12">
        <div class="text-center py-5">
          <span class="material-symbols-outlined fs-1 text-secondary mb-2 d-block">campaign</span>
          <h2 class="h5 fw-bold mb-1">Todavía no hay noticias publicadas</h2>
          <p class="text-muted mb-0">Apenas la institución publique algo, lo vas a ver acá.</p>
        </div>
      </div>`;
    return;
  }

  $lista.innerHTML = noticias.map(tarjeta).join("");
}

// El botón "Leer más" abre la noticia completa en un modal. Las tarjetas se
// dibujan después de cargar los datos, así que el click va delegado en el
// contenedor en lugar de atado a cada botón.
$lista.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".js-leer");
  if (btn) abrirDetalle(btn.dataset.id);
});

function abrirDetalle(id) {
  const noticia = cache.find((n) => n.id === id);
  if (!noticia) return;

  document.getElementById("mdTitulo").textContent = noticia.titulo;
  document.getElementById("mdFecha").textContent = fechaLegible(noticia.fecha);
  document.getElementById("mdCuerpo").innerHTML = escapar(noticia.cuerpo)
    .split(/\n{2,}/).map((p) => `<p class="mb-3">${p.replace(/\n/g, "<br>")}</p>`).join("");

  const img = document.getElementById("mdImagen");
  if (noticia.imagen) {
    img.src = noticia.imagen;
    img.alt = noticia.titulo;
    img.classList.remove("d-none");
  } else {
    img.classList.add("d-none");
  }

  bootstrap.Modal.getOrCreateInstance(document.getElementById("modalNoticia")).show();
}

(async function cargar() {
  try {
    const resp = await fetch("/api/noticias");
    const json = await resp.json();

    if (!json.ok) throw new Error(json.error || "No pudimos cargar las noticias.");
    cache = json.data.noticias || [];
    pintar(cache);
  } catch (err) {
    $lista.innerHTML = `
      <div class="col-12">
        <div class="text-center py-5">
          <span class="material-symbols-outlined fs-1 text-danger mb-2 d-block">cloud_off</span>
          <h2 class="h5 fw-bold mb-1">No pudimos cargar las noticias</h2>
          <p class="text-muted mb-3">${escapar(err.message)}</p>
          <button class="btn btn-outline-primary rounded-pill fw-bold" onclick="location.reload()">Reintentar</button>
        </div>
      </div>`;
  }
})();
