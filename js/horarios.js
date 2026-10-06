// Horarios del alumno. La grilla sale de la colección "horarios", que se arma
// en Backend/seed-horarios.js a partir de la cargaHoraria de cada materia.
//
// Requiere que auth-guard.js ya haya corrido (define window.fetchConAuth y
// window.cerrarSesion).

const DIAS = [
  { dia: 1, nombre: "Lunes" },
  { dia: 2, nombre: "Martes" },
  { dia: 3, nombre: "Miércoles" },
  { dia: 4, nombre: "Jueves" },
  { dia: 5, nombre: "Viernes" },
];

const usuarioGuardado = JSON.parse(localStorage.getItem("usuario") || "null");
if (!usuarioGuardado) return; // auth-guard.js ya está redirigiendo

const $grilla = document.getElementById("grillaHorario");
const $resumen = document.getElementById("resumenHorario");
const $materias = document.getElementById("listaMaterias");

const aMinutos = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};
const duracionMin = (b) => aMinutos(b.horaFin) - aMinutos(b.horaInicio);
const mins = (n) => `${n} min`;
const escapar = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function mensajeVacio(titulo, detalle) {
  return `
    <div class="text-center py-5">
      <span class="material-symbols-outlined fs-1 text-secondary mb-2 d-block">event_busy</span>
      <h3 class="h6 fw-bold mb-1">${escapar(titulo)}</h3>
      <p class="text-muted mb-0 small">${escapar(detalle)}</p>
    </div>`;
}

/** Una fila por franja horaria distinta que el alumno tenga clases. */
function frenas(bloques) {
  const mapa = new Map();
  for (const b of bloques) {
    const clave = `${b.horaInicio}-${b.horaFin}`;
    if (!mapa.has(clave)) mapa.set(clave, { horaInicio: b.horaInicio, horaFin: b.horaFin });
  }
  return [...mapa.values()].sort((a, b) => aMinutos(a.horaInicio) - aMinutos(b.horaInicio));
}

function celda(bloques) {
  if (bloques.length === 0) return `<td class="text-center align-middle"><span class="text-muted small">—</span></td>`;

  return bloques.map((b) => `
    <td class="align-middle">
      <div class="border-start border-4 border-primary ps-2 py-1">
        <div class="fw-bold small">${escapar(b.materiaNombre)}</div>
        <small class="text-muted d-block">${escapar(b.aula || "Aula a definir")}</small>
        ${b.docente ? `<small class="text-muted d-block">${escapar(b.docente.nombre)}</small>` : ""}
      </div>
    </td>`).join("");
}

function pintarGrilla(dias) {
  const bloques = dias.flatMap((d) => d.bloques);
  if (bloques.length === 0) {
    $grilla.innerHTML = mensajeVacio(
      "Todavía no tenés horarios cargados",
      "Cuando la administración cargue la grilla del ciclo, va a aparecer acá."
    );
    return;
  }

  const filas = frenas(bloques);

  $grilla.innerHTML = `
    <table class="table table-bordered align-middle text-center mb-0">
      <thead class="table-light">
        <tr>
          <th style="min-width: 130px;">Horario</th>
          ${DIAS.map((d) => `<th>${d.nombre}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${filas.map((f) => {
          const delDia = (d) => d.bloques.filter((b) => b.horaInicio === f.horaInicio && b.horaFin === f.horaFin);
          return `
            <tr>
              <td class="fw-bold text-muted bg-light text-nowrap">
                ${escapar(f.horaInicio)}<br class="d-md-none" /><span class="d-none d-md-inline">&ndash; </span>${escapar(f.horaFin)}
                <small class="d-block fw-normal">${mins(duracionMin(f))}</small>
              </td>
              ${DIAS.map((d) => celda(delDia(d))).join("")}
            </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

function pintarResumen(bloques, materias) {
  const minutosTotales = bloques.reduce((suma, b) => suma + duracionMin(b), 0);
  const aulas = new Set(bloques.map((b) => b.aula).filter(Boolean));
  const diasConClase = new Set(bloques.map((b) => b.dia));

  const tarjetas = [
    { icono: "menu_book", valor: materias.length, texto: "Materias inscriptas" },
    { icono: "schedule", valor: `${Math.floor(minutosTotales / 60)}h ${minutosTotales % 60}m`, texto: "Carga semanal" },
    { icono: "event", valor: diasConClase.size, texto: "Días con clases" },
    { icono: "meeting_room", valor: aulas.size, texto: "Aulas utilizadas" },
  ];

  $resumen.innerHTML = tarjetas.map((t) => `
    <div class="col-6 col-lg-3">
      <div class="card card-dash p-3 bg-white shadow-sm border-0 h-100">
        <div class="d-flex align-items-center gap-3">
          <span class="material-symbols-outlined text-primary fs-3">${t.icono}</span>
          <div>
            <div class="fw-bold fs-5 lh-1">${escapar(t.valor)}</div>
            <small class="text-muted">${escapar(t.texto)}</small>
          </div>
        </div>
      </div>
    </div>`).join("");
}

function pintarMaterias(materias, bloques) {
  if (materias.length === 0) {
    $materias.innerHTML = `<p class="text-muted mb-0 small">No estás inscripto a ninguna materia este ciclo.</p>`;
    return;
  }

  const sorted = [...materias].sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));

  $materias.innerHTML = sorted.map((m) => {
    const propios = bloques.filter((b) => b.materiaId === m.id);
    const horas = propias.reduce((s, b) => s + duracionMin(b), 0);
    const cuando = propios.length === 0
      ? "Sin horario asignado"
      : propios.map((b) => `${b.diaNombre} ${b.horaInicio}`).join(" · ");

    return `
      <div class="col-md-6 col-xl-4">
        <div class="border rounded-3 p-3 h-100">
          <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
            <span class="badge text-bg-secondary">${escapar(m.codigo)}</span>
            <small class="text-muted">${Math.floor(horas / 60)}h ${horas % 60}m/sem</small>
          </div>
          <div class="fw-bold mb-1">${escapar(m.nombre)}</div>
          <small class="text-muted d-block">${escapar(cuando)}</small>
        </div>
      </div>`;
  }).join("");
}

// auth-guard.js entra como <script type="module"> y los módulos se ejecutan
// después de cerrarse el <body>: si este IIFE corriera directo, window.authReady
// sería undefined y el primer fetchConAuth fallaría. DOMContentLoaded ya pasa con
// los módulos ejecutados.
document.addEventListener("DOMContentLoaded", iniciar);

async function iniciar() {
  // Nombre en el sidebar y en la barra superior.
  const nombre = usuarioGuardado.nombre || "Alumno";
  const lblSidebar = document.getElementById("txtNombreSidebar");
  const lblTop = document.getElementById("navNombreAlumno");
  if (lblSidebar) lblSidebar.textContent = nombre;
  if (lblTop) lblTop.textContent = nombre;

  const btnCerrar = document.getElementById("btnCerrarSesionTop");
  if (btnCerrar) btnCerrar.addEventListener("click", () => window.cerrarSesion && window.cerrarSesion());

  try {
    // fetchConAuth devuelve la Response cruda, hay que leer el JSON.
    const respPerfil = await window.fetchConAuth("/api/auth/me");
    const jsonPerfil = await respPerfil.json().catch(() => null);
    if (!jsonPerfil || !jsonPerfil.ok) {
      $grilla.innerHTML = mensajeVacio("No pudimos identificar tu cuenta", (jsonPerfil && jsonPerfil.error) || "Volvé a iniciar sesión.");
      return;
    }
    const perfil = jsonPerfil.data;
    window.aplicarPermisosNav(perfil.rol);

    if (!perfil.alumnoId) {
      $grilla.innerHTML = mensajeVacio("Tu cuenta no está asociada a un alumno",
        "Avisale al administrator para que vincule tu legajo con tu usuario.");
      return;
    }

    const resp = await window.fetchConAuth(`/api/horarios?alumnoId=${perfil.alumnoId}`);
    const json = await resp.json().catch(() => null);
    if (!json || !json.ok) {
      $grilla.innerHTML = mensajeVacio("No pudimos cargar tu horario", (json && json.error) || `HTTP ${resp.status}`);
      return;
    }

    const { dias, materias, bloques } = json.data;
    pintarGrilla(dias || []);
    pintarResumen(bloques || [], materias || []);
    pintarMaterias(materias || [], bloques || []);
  } catch (err) {
    $grilla.innerHTML = mensajeVacio("Error de conexión", err.message);
  }
}
