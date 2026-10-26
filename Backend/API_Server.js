require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const { db, auth } = require("./firebaseAdmin");
const verifyToken = require("./middleware/verifyToken");
const requireRole = require("./middleware/requireRole");

const app = express();
const PORT = process.env.PORT || 3000;

// El backend y toda la UI usan este mismo número. Si cambia el ciclo,
// se cambia acá y en los badges de los dashboards.
const CICLO_LECTIVO = 2025;

// Dominios cerrados. El front manda estos valores, pero el backend los
// valida igual porque un POST directo podría mandar cualquier string.
const ESTADOS_ASISTENCIA = ["presente", "tarde", "ausente"];
const ESTADOS_CURSADA = ["cursando", "aprobada", "libre", "desercion"];
const TRIMESTRES = [1, 2, 3];
const ROLES = ["admin", "alumno", "docente", "familia"];
// Los únicos niveles educativos del proyecto. Vive acá arriba porque lo usan
// varias rutas (alumnos y preinscripciones), no en una sola.
const NIVELES = ["primaria", "secundaria"];

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// El sitio estático se sirve carpeta por carpeta, cada una en su prefijo. Antes
// era express.static(path.join(__dirname, '..')) sobre la raíz del repo, que
// además del sitio publicaba /Backend/API_Server.js y el resto del código del
// backend para cualquiera que abriera la URL. Montar sólo estas cuatro
// carpetas mantiene /html/..., /css/..., /js/... e /img/... funcionando igual.
for (const carpeta of ["html", "css", "js", "img"]) {
  app.use(`/${carpeta}`, express.static(path.join(__dirname, "..", carpeta)));
}

// ─── HELPER RESPUESTA ───────────────────────────────────────────────────────

const ok   = (res, data, status = 200) => res.status(status).json({ ok: true,  data });
const fail = (res, msg,  status = 400) => res.status(status).json({ ok: false, error: msg });

// Convierte un snapshot de Firestore en { id, ...datos }
const withId = (doc) => ({ id: doc.id, ...doc.data() });

// ─── HELPERS DE DOMINIO ─────────────────────────────────────────────────────

// Esquema único de `usuarios`. Lo respetan /api/auth/sync, el alta por consola
// (crear-usuario.js) y el panel de administración (POST /api/admin/usuarios).
function armarPerfil({ uid, email, dni, rol, nivel, nombre, apellido, alumnoId, docenteId, hijoPrimariaId, hijoSecundariaId }) {
  const perfil = {
    uid,
    email: email || null,
    dni: dni || null,
    rol,
    nivel: nivel || null,
    nombre: nombre || null,
    apellido: apellido || null,
    actualizadoEn: new Date().toISOString(),
  };
  if (alumnoId) perfil.alumnoId = alumnoId;
  if (docenteId) perfil.docenteId = docenteId;
  if (hijoPrimariaId) perfil.hijoPrimariaId = hijoPrimariaId;
  if (hijoSecundariaId) perfil.hijoSecundariaId = hijoSecundariaId;
  return perfil;
}

const nombreCompleto = (p) => [p.nombre, p.apellido].filter(Boolean).join(" ");

// Búsqueda insensible a acentos: "fernandez" tiene que encontrar "Fernández".
const sinAcentos = (s) =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Firestore no tiene OR, así que para buscar al tutor de un alumno tenemos que
// preguntar por los dos campos por separado y unir los resultados.
async function buscarTutoresDe(alumnoId) {
  const [primaria, secundaria] = await Promise.all([
    db.collection("usuarios").where("hijoPrimariaId", "==", alumnoId).get(),
    db.collection("usuarios").where("hijoSecundariaId", "==", alumnoId).get(),
  ]);

  const vistos = new Set();
  const tutores = [];
  for (const snap of [primaria, secundaria]) {
    for (const doc of snap.docs) {
      if (vistos.has(doc.id)) continue;
      vistos.add(doc.id);
      const d = doc.data();
      tutores.push({ uid: d.uid || doc.id, nombre: d.nombre || "", email: d.email || null });
    }
  }
  return tutores;
}

// ─── AUTH (Firebase) ────────────────────────────────────────────────────────

// POST /api/auth/sync
// Vincula el perfil de Firebase con el registro institucional. NO puede setear
// el rol: el rol se define al crear la cuenta (consola o panel de admin), así
// que un POST suícito no puede autopromoverse a admin.
app.post("/api/auth/sync", verifyToken, async (req, res) => {
  try {
    const { nombre, apellido, nivel, alumnoId, docenteId, hijoPrimariaId, hijoSecundariaId } = req.body;

    if (req.body.rol !== undefined) {
      return fail(res, "El rol no se puede setear por este endpoint");
    }
    if (!alumnoId && !docenteId && !hijoPrimariaId && !hijoSecundariaId
        && !nombre && !apellido && !nivel) {
      return fail(res, "No enviaste ningún campo para vincular");
    }

    const userRef = db.collection("usuarios").doc(req.user.uid);
    const actual = await userRef.get();
    const previo = actual.exists ? actual.data() : {};

    // Un vínculo no se sobreescribe: si ya está, hay que corregirlo desde el panel.
    const repetido = ["alumnoId", "docenteId", "hijoPrimariaId", "hijoSecundariaId"]
      .find((campo) => req.body[campo] && previo[campo]);
    if (repetido) {
      return fail(res, `El perfil ya tiene ${repetido} vinculado`);
    }

    // Para vincular a uno mismo exigimos que el email del registro
    // institucional sea el de la cuenta. Para los hijos NO: el tutor es una
    // persona distinta al alumno, así que sus emails nunca coinciden y la
    // comparación rechazaba siempre el vínculo.
    for (const campo of ["alumnoId"]) {
      if (!req.body[campo]) continue;
      const doc = await db.collection("alumnos").doc(req.body[campo]).get();
      if (!doc.exists) return fail(res, `No existe el alumno ${req.body[campo]} para ${campo}`);
      if (doc.data().email && doc.data().email !== req.user.email) {
        return fail(res, `El email de ${campo} no coincide con el de tu cuenta`);
      }
    }
    for (const campo of ["hijoPrimariaId", "hijoSecundariaId"]) {
      if (!req.body[campo]) continue;
      const doc = await db.collection("alumnos").doc(req.body[campo]).get();
      if (!doc.exists) return fail(res, `No existe el alumno ${req.body[campo]} para ${campo}`);
    }
    if (req.body.docenteId) {
      const doc = await db.collection("docentes").doc(req.body.docenteId).get();
      if (!doc.exists) return fail(res, "No existe el docente para docenteId");
    }

    const perfil = armarPerfil({
      ...previo,
      uid: req.user.uid,
      email: req.user.email,
      rol: previo.rol,
      nombre: nombre || previo.nombre,
      apellido: apellido || previo.apellido,
      nivel: nivel || previo.nivel,
      alumnoId: alumnoId || previo.alumnoId,
      docenteId: docenteId || previo.docenteId,
      hijoPrimariaId: hijoPrimariaId || previo.hijoPrimariaId,
      hijoSecundariaId: hijoSecundariaId || previo.hijoSecundariaId,
    });

    await userRef.set(perfil);
    ok(res, perfil);
  } catch (err) {
    fail(res, "Error al sincronizar el perfil: " + err.message, 500);
  }
});

// GET /api/auth/me — cualquier usuario autenticado, sin filtro de rol.
app.get("/api/auth/me", verifyToken, async (req, res) => {
  try {
    if (!req.perfil) return fail(res, "Perfil no encontrado en Firestore", 404);
    ok(res, { ...req.perfil, cicloLectivoActual: CICLO_LECTIVO });
  } catch (err) {
    fail(res, "Error al leer el perfil: " + err.message, 500);
  }
});

// ─── DASHBOARD ──────────────────────────────────────────────────────────────

app.get("/api/dashboard", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const [alumnosSnap, docentesSnap, materiasSnap, inscripcionesSnap] = await Promise.all([
      db.collection("alumnos").where("estado", "==", "activo").get(),
      db.collection("docentes").get(),
      db.collection("materias").get(),
      db.collection("inscripciones").where("cicloLectivo", "==", CICLO_LECTIVO).get(),
    ]);

    ok(res, {
      alumnosActivos:       alumnosSnap.size,
      docentesRegistrados:  docentesSnap.size,
      materiasDisponibles:  materiasSnap.size,
      inscripcionesPeriodo: inscripcionesSnap.size,
      cicloLectivo:         CICLO_LECTIVO,
    });
  } catch (err) {
    fail(res, "Error al cargar el dashboard: " + err.message, 500);
  }
});

// ─── ALUMNOS ────────────────────────────────────────────────────────────────

app.get("/api/alumnos", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const snap = await db.collection("alumnos").get();
    let resultado = snap.docs.map(withId);

    if (req.query.nombre) {
      const q = req.query.nombre.toLowerCase();
      resultado = resultado.filter(
        (a) => (a.nombre || "").toLowerCase().includes(q) || (a.apellido || "").toLowerCase().includes(q)
      );
    }
    if (req.query.estado) {
      resultado = resultado.filter((a) => a.estado === req.query.estado);
    }
    ok(res, resultado);
  } catch (err) {
    fail(res, "Error al listar alumnos: " + err.message, 500);
  }
});

// El detalle de un alumno lo necesitan el docente (para tomar asistencia) y la
// familia (para ver a su hijo), así que alcanza con estar autenticado.
app.get("/api/alumnos/:id", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("alumnos").doc(req.params.id).get();
    if (!doc.exists) return fail(res, "Alumno no encontrado", 404);
    ok(res, withId(doc));
  } catch (err) {
    fail(res, "Error al buscar el alumno: " + err.message, 500);
  }
});

app.post("/api/alumnos", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { legajo, nombre, apellido, email, nivel, estado = "activo" } = req.body;
    if (!legajo || !nombre || !apellido || !email)
      return fail(res, "Faltan campos obligatorios: legajo, nombre, apellido, email");
    if (nivel !== undefined && nivel !== null && !NIVELES.includes(nivel))
      return fail(res, `Nivel inválido. Valores permitidos: ${NIVELES.join(", ")}`);

    const existe = await db.collection("alumnos").where("legajo", "==", legajo).limit(1).get();
    if (!existe.empty) return fail(res, "Ya existe un alumno con ese legajo");

    // El nivel es un atributo del alumno, no de la cuenta: lo usan el gráfico
    // "Alumnos por nivel" del panel y las páginas de cada hijo. Antes no se
    // guardaba en ningún lado y por eso ese gráfico salía siempre vacío.
    const nuevo = { legajo, nombre, apellido, email, nivel: nivel || "primaria", estado };
    const ref = await db.collection("alumnos").add(nuevo);
    ok(res, { id: ref.id, ...nuevo }, 201);
  } catch (err) {
    fail(res, "Error al crear el alumno: " + err.message, 500);
  }
});

app.put("/api/alumnos/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const ref = db.collection("alumnos").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Alumno no encontrado", 404);

    const { id: _ignored, ...cambios } = req.body;
    await ref.update(cambios);
    const actualizado = await ref.get();
    ok(res, withId(actualizado));
  } catch (err) {
    fail(res, "Error al actualizar el alumno: " + err.message, 500);
  }
});

app.delete("/api/alumnos/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const ref = db.collection("alumnos").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Alumno no encontrado", 404);

    const eliminado = withId(doc);
    await ref.delete();
    ok(res, { mensaje: "Alumno eliminado", alumno: eliminado });
  } catch (err) {
    fail(res, "Error al eliminar el alumno: " + err.message, 500);
  }
});

// ─── DOCENTES ───────────────────────────────────────────────────────────────

app.get("/api/docentes", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const snap = await db.collection("docentes").get();
    let resultado = snap.docs.map(withId);

    if (req.query.nombre) {
      const q = req.query.nombre.toLowerCase();
      resultado = resultado.filter(
        (d) => (d.nombre || "").toLowerCase().includes(q) || (d.apellido || "").toLowerCase().includes(q)
      );
    }
    if (req.query.estado) {
      resultado = resultado.filter((d) => d.estado === req.query.estado);
    }
    ok(res, resultado);
  } catch (err) {
    fail(res, "Error al listar docentes: " + err.message, 500);
  }
});

// GET /api/docentes/alumnos — docentes: alumnos inscriptos en sus materias
// del ciclo actual, para gestión de fichas médicas.
app.get("/api/docentes/alumnos", verifyToken, requireRole("docente"), async (req, res) => {
  try {
    if (!req.perfil.docenteId) {
      return fail(res, "La cuenta no está vinculada a un registro de docente", 403);
    }

    const alumnos = await alumnosDeMateriasDelDocente(req.perfil.docenteId);
    ok(res, alumnos);
  } catch (err) {
    fail(res, "Error al listar los alumnos de tus materias: " + err.message, 500);
  }
});

app.get("/api/docentes/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const doc = await db.collection("docentes").doc(req.params.id).get();
    if (!doc.exists) return fail(res, "Docente no encontrado", 404);
    ok(res, withId(doc));
  } catch (err) {
    fail(res, "Error al buscar el docente: " + err.message, 500);
  }
});

app.post("/api/docentes", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { legajo, nombre, apellido, email, materiasACargo = [], estado = "activo" } = req.body;
    if (!legajo || !nombre || !apellido || !email)
      return fail(res, "Faltan campos obligatorios: legajo, nombre, apellido, email");

    const existe = await db.collection("docentes").where("legajo", "==", legajo).limit(1).get();
    if (!existe.empty) return fail(res, "Ya existe un docente con ese legajo");

    const nuevo = { legajo, nombre, apellido, email, materiasACargo, estado };
    const ref = await db.collection("docentes").add(nuevo);
    ok(res, { id: ref.id, ...nuevo }, 201);
  } catch (err) {
    fail(res, "Error al crear el docente: " + err.message, 500);
  }
});

app.put("/api/docentes/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const ref = db.collection("docentes").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Docente no encontrado", 404);

    const nombre = textoLimpio(req.body?.nombre, 80);
    const apellido = textoLimpio(req.body?.apellido, 80);
    const legajo = textoLimpio(req.body?.legajo, 30).toUpperCase();
    const estado = textoLimpio(req.body?.estado, 20).toLowerCase();
    if (!nombre || !apellido || !legajo || !estado)
      return fail(res, "Faltan campos obligatorios: nombre, apellido, legajo, estado");
    if (!["activo", "inactivo"].includes(estado))
      return fail(res, "Estado inválido. Valores permitidos: activo, inactivo");

    const duplicado = await db.collection("docentes").where("legajo", "==", legajo).get();
    if (duplicado.docs.some((docente) => docente.id !== req.params.id))
      return fail(res, `Ya existe otro docente con el legajo ${legajo}`);

    const batch = db.batch();
    batch.update(ref, { nombre, apellido, legajo, estado });
    const perfiles = await db.collection("usuarios")
      .where("docenteId", "==", req.params.id)
      .get();
    for (const perfil of perfiles.docs) {
      batch.update(perfil.ref, {
        nombre,
        apellido,
        actualizadoEn: new Date().toISOString(),
      });
    }
    await batch.commit();

    const actualizado = await ref.get();
    ok(res, withId(actualizado));
  } catch (err) {
    fail(res, "Error al actualizar el docente: " + err.message, 500);
  }
});

app.delete("/api/docentes/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const ref = db.collection("docentes").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Docente no encontrado", 404);

    const eliminado = withId(doc);
    await ref.delete();
    ok(res, { mensaje: "Docente eliminado", docente: eliminado });
  } catch (err) {
    fail(res, "Error al eliminar el docente: " + err.message, 500);
  }
});

// ─── MATERIAS ───────────────────────────────────────────────────────────────

// Toda la UI de alumno y docentearmia estos dos endpoints, así que quedan
// abiertos a cualquier usuario autenticado.
app.get("/api/materias", verifyToken, async (req, res) => {
  try {
    const snap = await db.collection("materias").get();
    let resultado = snap.docs.map(withId);

    if (req.query.nombre) {
      const q = req.query.nombre.toLowerCase();
      resultado = resultado.filter((m) => (m.nombre || "").toLowerCase().includes(q));
    }
    if (req.query.cicloLectivo) {
      resultado = resultado.filter((m) => m.cicloLectivo === Number(req.query.cicloLectivo));
    }
    ok(res, resultado);
  } catch (err) {
    fail(res, "Error al listar materias: " + err.message, 500);
  }
});

app.get("/api/materias/:id", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("materias").doc(req.params.id).get();
    if (!doc.exists) return fail(res, "Materia no encontrada", 404);
    ok(res, withId(doc));
  } catch (err) {
    fail(res, "Error al buscar la materia: " + err.message, 500);
  }
});

app.post("/api/materias", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { codigo, nombre, cargaHoraria, cicloLectivo, docenteId, nivel } = req.body;
    if (!codigo || !nombre || !cargaHoraria)
      return fail(res, "Faltan campos obligatorios: codigo, nombre, cargaHoraria");

    // El ciclo se toma del que está en curso: el panel de administración no
    // tiene por qué mandar un año que puede quedar desactualizado.
    const ciclo = Number(cicloLectivo) || CICLO_LECTIVO;

    // El nivel es opcional: hay materias que dan en los dos niveles. Si viene,
    // tiene que ser uno de los canónicos, porque el dashboard agrupa por esto.
    if (nivel !== undefined && nivel !== null && nivel !== "" && !NIVELES.includes(nivel))
      return fail(res, `Nivel inválido. Valores permitidos: ${NIVELES.join(", ")}`);

    if (docenteId) {
      const docenteDoc = await db.collection("docentes").doc(docenteId).get();
      if (!docenteDoc.exists) return fail(res, "El docente indicado no existe");
    }

    const existe = await db.collection("materias").where("codigo", "==", codigo).limit(1).get();
    if (!existe.empty) return fail(res, "Ya existe una materia con ese código");

    const nuevo = {
      codigo,
      nombre,
      cargaHoraria,
      cicloLectivo: ciclo,
      docenteId: docenteId || null,
      nivel: nivel || null,
    };
    const ref = await db.collection("materias").add(nuevo);
    ok(res, { id: ref.id, ...nuevo }, 201);
  } catch (err) {
    fail(res, "Error al crear la materia: " + err.message, 500);
  }
});

app.put("/api/materias/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const ref = db.collection("materias").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Materia no encontrada", 404);

    const { id: _ignored, ...cambios } = req.body;

    // Antes el PUT escribía el body tal cual, así que un `nivel` inválido o un
    // docente inexistente entraban sin revisar.
    if ("nivel" in cambios && cambios.nivel !== null && cambios.nivel !== "" && !NIVELES.includes(cambios.nivel))
      return fail(res, `Nivel inválido. Valores permitidos: ${NIVELES.join(", ")}`);
    if ("docenteId" in cambios && cambios.docenteId) {
      const docenteDoc = await db.collection("docentes").doc(cambios.docenteId).get();
      if (!docenteDoc.exists) return fail(res, "El docente indicado no existe");
    }
    if ("codigo" in cambios && cambios.codigo) {
      const choque = await db.collection("materias").where("codigo", "==", cambios.codigo).get();
      if (!choque.empty && !choque.docs.some((d) => d.id === req.params.id))
        return fail(res, "Ya existe una materia con ese código");
    }

    await ref.update(cambios);
    const actualizado = await ref.get();
    ok(res, withId(actualizado));
  } catch (err) {
    fail(res, "Error al actualizar la materia: " + err.message, 500);
  }
});

app.delete("/api/materias/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const ref = db.collection("materias").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Materia no encontrada", 404);

    const eliminada = withId(doc);
    await ref.delete();
    ok(res, { mensaje: "Materia eliminada", materia: eliminada });
  } catch (err) {
    fail(res, "Error al eliminar la materia: " + err.message, 500);
  }
});

// ─── INSCRIPCIONES ──────────────────────────────────────────────────────────

app.get("/api/inscripciones", verifyToken, async (req, res) => {
  try {
    const snap = await db.collection("inscripciones").get();
    let resultado = snap.docs.map(withId);

    if (req.query.alumnoId)
      resultado = resultado.filter((i) => i.alumnoId === req.query.alumnoId);
    if (req.query.materiaId)
      resultado = resultado.filter((i) => i.materiaId === req.query.materiaId);
    if (req.query.cicloLectivo)
      resultado = resultado.filter((i) => i.cicloLectivo === Number(req.query.cicloLectivo));
    ok(res, resultado);
  } catch (err) {
    fail(res, "Error al listar inscripciones: " + err.message, 500);
  }
});

app.get("/api/inscripciones/:id", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("inscripciones").doc(req.params.id).get();
    if (!doc.exists) return fail(res, "Inscripción no encontrada", 404);
    ok(res, withId(doc));
  } catch (err) {
    fail(res, "Error al buscar la inscripción: " + err.message, 500);
  }
});

app.post("/api/inscripciones", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { alumnoId, materiaId, cicloLectivo = CICLO_LECTIVO, estado = "cursando" } = req.body;
    if (!alumnoId || !materiaId || !cicloLectivo)
      return fail(res, "Faltan campos obligatorios: alumnoId, materiaId, cicloLectivo");
    if (!ESTADOS_CURSADA.includes(estado))
      return fail(res, `estado inválido. Valores permitidos: ${ESTADOS_CURSADA.join(", ")}`);

    const [alumnoDoc, materiaDoc] = await Promise.all([
      db.collection("alumnos").doc(alumnoId).get(),
      db.collection("materias").doc(materiaId).get(),
    ]);
    if (!alumnoDoc.exists) return fail(res, "Alumno no encontrado");
    if (!materiaDoc.exists) return fail(res, "Materia no encontrada");

    const yaInscripto = await db.collection("inscripciones")
      .where("alumnoId", "==", alumnoId)
      .where("materiaId", "==", materiaId)
      .where("cicloLectivo", "==", cicloLectivo)
      .limit(1)
      .get();
    if (!yaInscripto.empty)
      return fail(res, "El alumno ya está inscripto en esa materia para ese ciclo lectivo");

    const nueva = { alumnoId, materiaId, cicloLectivo, estado };
    const ref = await db.collection("inscripciones").add(nueva);
    ok(res, { id: ref.id, ...nueva }, 201);
  } catch (err) {
    fail(res, "Error al crear la inscripción: " + err.message, 500);
  }
});

app.delete("/api/inscripciones/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const ref = db.collection("inscripciones").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Inscripción no encontrada", 404);

    const eliminada = withId(doc);
    await ref.delete();
    ok(res, { mensaje: "Inscripción eliminada", inscripcion: eliminada });
  } catch (err) {
    fail(res, "Error al eliminar la inscripción: " + err.message, 500);
  }
});

// ─── CALIFICACIONES ─────────────────────────────────────────────────────────
//
// Misma idea que asistencias: la clave natural de un documento es
// alumnoId + materiaId + trimestre, así que guardar es un upsert. El docente
// precarga con GET y después manda sólo los que cambió.

function notaValida(nota) {
  const n = Number(nota);
  return Number.isFinite(n) && n >= 0 && n <= 10;
}

// Los umbrales salen de lo que ya mostraba la tabla de calificaciones.html:
// 10 es "Promocionado", 6 o más es "Regular" y menos de 6 es "Riesgo".
function estadoSegunPromedio(promedio) {
  if (promedio === null) return { estado: "sin_notas", etiqueta: "Sin notas" };
  if (promedio >= 10) return { estado: "promovido", etiqueta: "Promocionado" };
  if (promedio >= 6)  return { estado: "regular",   etiqueta: "Regular" };
  return { estado: "riesgo", etiqueta: "Riesgo" };
}

// GET /api/calificaciones?alumnoId=X | ?materiaId=X | ?alumnoId=X&materiaId=X&trimestre=1
app.get("/api/calificaciones", verifyToken, async (req, res) => {
  try {
    let query = db.collection("calificaciones").where("cicloLectivo", "==", CICLO_LECTIVO);

    if (req.query.alumnoId) query = query.where("alumnoId", "==", req.query.alumnoId);
    if (req.query.materiaId) query = query.where("materiaId", "==", req.query.materiaId);
    if (req.query.trimestre) query = query.where("trimestre", "==", Number(req.query.trimestre));

    const snap = await query.get();
    ok(res, snap.docs.map(withId));
  } catch (err) {
    fail(res, "Error al listar calificaciones: " + err.message, 500);
  }
});

// GET /api/calificaciones/boletin?alumnoId=X
// Devuelve una fila por materia inscripta con los 3 trimestres, el promedio y
// el estado, que es exactamente lo que necesita la tabla del alumno.
app.get("/api/calificaciones/boletin", verifyToken, async (req, res) => {
  try {
    const alumnoId = req.query.alumnoId;
    if (!alumnoId) return fail(res, "Falta el query param alumnoId");

    const [inscripSnap, notasSnap, alumnoDoc] = await Promise.all([
      db.collection("inscripciones")
        .where("alumnoId", "==", alumnoId)
        .where("cicloLectivo", "==", CICLO_LECTIVO)
        .get(),
      db.collection("calificaciones")
        .where("alumnoId", "==", alumnoId)
        .where("cicloLectivo", "==", CICLO_LECTIVO)
        .get(),
      db.collection("alumnos").doc(alumnoId).get(),
    ]);

    if (!alumnoDoc.exists) return fail(res, "Alumno no encontrado", 404);

    const materiaIds = inscripSnap.docs.map((d) => d.data().materiaId);
    const materiasSnap = await db.collection("materias")
      .where("__name__", "in", materiaIds.slice(0, 30))
      .get();

    const materias = new Map(materiasSnap.docs.map((d) => [d.id, withId(d)]));

    // notas agrupadas por materiaId
    const porMateria = new Map();
    for (const doc of notasSnap.docs) {
      const n = doc.data();
      if (!porMateria.has(n.materiaId)) porMateria.set(n.materiaId, {});
      porMateria.get(n.materiaId)[n.trimestre] = n.nota;
    }

    const filas = inscripSnap.docs.map((d) => {
      const insc = d.data();
      const materia = materias.get(insc.materiaId) || { id: insc.materiaId, codigo: "—", nombre: "Materia eliminada" };
      const notas = porMateria.get(insc.materiaId) || {};

      const cargadas = TRIMESTRES.map((t) => notas[t]).filter((n) => notaValida(n));
      const promedio = cargadas.length
        ? Math.round((cargadas.reduce((a, b) => a + Number(b), 0) / cargadas.length) * 100) / 100
        : null;

      return {
        inscripcionId: d.id,
        materiaId: materia.id,
        codigo: materia.codigo,
        nombre: materia.nombre,
        cargaHoraria: materia.cargaHoraria ?? null,
        estadoInscripcion: insc.estado,
        trimestre1: notas[1] ?? null,
        trimestre2: notas[2] ?? null,
        trimestre3: notas[3] ?? null,
        promedio,
        ...estadoSegunPromedio(promedio),
      };
    });

    ok(res, {
      alumno: withId(alumnoDoc),
      cicloLectivo: CICLO_LECTIVO,
      filas,
    });
  } catch (err) {
    fail(res, "Error al cargar el boletín: " + err.message, 500);
  }
});

// POST /api/calificaciones
// Body: { materiaId, trimestre, notas: [{ alumnoId, nota }, ...] }
//(null o "" en `nota` borra la calificación de ese trimestre.)
app.post("/api/calificaciones", verifyToken, requireRole("docente", "admin"), async (req, res) => {
  try {
    const { materiaId, trimestre, notas } = req.body;

    if (!materiaId || trimestre === undefined || !Array.isArray(notas) || notas.length === 0) {
      return fail(res, "Faltan campos obligatorios: materiaId, trimestre, notas (array)");
    }
    const trim = Number(trimestre);
    if (!TRIMESTRES.includes(trim)) {
      return fail(res, `trimestre inválido. Valores permitidos: ${TRIMESTRES.join(", ")}`);
    }

    const materiaDoc = await db.collection("materias").doc(materiaId).get();
    if (!materiaDoc.exists) return fail(res, "Materia no encontrada");

    const descartados = [];
    const validas = [];
    for (const item of notas) {
      const alumnoId = item && item.alumnoId;
      if (!alumnoId) {
        descartados.push({ item, motivo: "Falta alumnoId" });
        continue;
      }
      const vacia = item.nota === null || item.nota === undefined || item.nota === "";
      if (!vacia && !notaValida(item.nota)) {
        descartados.push({ item, motivo: `nota inválida: ${item.nota} (debe estar entre 0 y 10)` });
        continue;
      }
      validas.push({ alumnoId, nota: vacia ? null : Number(item.nota) });
    }
    if (descartados.length) {
      console.warn("[calificaciones] registros descartados:", JSON.stringify(descartados));
    }
    if (validas.length === 0) {
      return fail(res, "Ninguna de las notas enviadas es válida.");
    }

    // Una sola query en vez de un get por alumno.
    const existentesSnap = await db.collection("calificaciones")
      .where("materiaId", "==", materiaId)
      .where("trimestre", "==", trim)
      .where("cicloLectivo", "==", CICLO_LECTIVO)
      .get();
    const porAlumno = new Map(existentesSnap.docs.map((d) => [d.data().alumnoId, d.ref]));

    const batch = db.batch();
    const guardados = [];
    for (const { alumnoId, nota } of validas) {
      const ref = porAlumno.get(alumnoId) || db.collection("calificaciones").doc();

      if (nota === null) {
        // Borrar la nota del trimestre si ya existía.
        if (porAlumno.has(alumnoId)) batch.delete(ref);
        continue;
      }

      const data = {
        alumnoId,
        materiaId,
        cicloLectivo: CICLO_LECTIVO,
        trimestre: trim,
        nota,
        docenteId: materiaDoc.data().docenteId || null,
        actualizadoEn: new Date().toISOString(),
      };
      batch.set(ref, data);
      guardados.push({ id: ref.id, ...data });
    }
    await batch.commit();

    ok(res, { registros: guardados, descartados }, 201);
  } catch (err) {
    fail(res, "Error al guardar las calificaciones: " + err.message, 500);
  }
});

// ─── ASISTENCIAS ────────────────────────────────────────────────────────────

// GET /api/asistencias?alumnoId=X | ?materiaId=X&fecha=Y | ?materiaId=X
app.get("/api/asistencias", verifyToken, async (req, res) => {
  try {
    let query = db.collection("asistencias");

    if (req.query.alumnoId) {
      query = query.where("alumnoId", "==", req.query.alumnoId);
    }
    if (req.query.materiaId) {
      query = query.where("materiaId", "==", req.query.materiaId);
    }
    if (req.query.fecha) {
      query = query.where("fecha", "==", req.query.fecha);
    }

    const snap = await query.get();
    ok(res, snap.docs.map(withId));
  } catch (err) {
    fail(res, "Error al listar asistencias: " + err.message, 500);
  }
});

// POST /api/asistencias
// Body: { materiaId, fecha, registros: [{ alumnoId, estado }, ...] }
// Además de guardar, deja el aviso al tutor de cada ausente en `notificaciones`,
// en este mismo request: no hay worker ni cola detrás.
app.post("/api/asistencias", verifyToken, requireRole("docente", "admin"), async (req, res) => {
  try {
    const { materiaId, fecha, registros } = req.body;

    if (!materiaId || !fecha || !Array.isArray(registros) || registros.length === 0) {
      return fail(res, "Faltan campos obligatorios: materiaId, fecha, registros (array)");
    }

    const materiaDoc = await db.collection("materias").doc(materiaId).get();
    if (!materiaDoc.exists) return fail(res, "Materia no encontrada");
    const materia = materiaDoc.data();

    // Antes los registros incompletos se salteaban con un `continue` en
    // silencio: el docente guardaba 27 de 30 sin enterarse. Ahora se anotan.
    const descartados = [];
    const validos = [];
    for (const registro of registros) {
      const alumnoId = registro && registro.alumnoId;
      const estado = registro && String(registro.estado || "").toLowerCase();

      if (!alumnoId || !estado) {
        descartados.push({ registro, motivo: "Falta alumnoId o estado" });
        continue;
      }
      if (!ESTADOS_ASISTENCIA.includes(estado)) {
        descartados.push({ registro, motivo: `estado inválido: ${estado} (permitidos: ${ESTADOS_ASISTENCIA.join(", ")})` });
        continue;
      }
      validos.push({ alumnoId, estado });
    }
    if (descartados.length) {
      console.warn(`[asistencias] ${descartados.length} registro(s) descartado(s):`, JSON.stringify(descartados));
    }
    if (validos.length === 0) {
      return fail(res, `Ninguno de los ${registros.length} registros es válido. Revisar la lista de alumnos.`);
    }

    // Una sola query para toda la materia+fecha, en vez de un get por alumno.
    const existentesSnap = await db.collection("asistencias")
      .where("materiaId", "==", materiaId)
      .where("fecha", "==", fecha)
      .get();
    const porAlumno = new Map(existentesSnap.docs.map((d) => [d.data().alumnoId, d.ref]));

    const batch = db.batch();
    const guardados = [];
    for (const { alumnoId, estado } of validos) {
      const ref = porAlumno.get(alumnoId) || db.collection("asistencias").doc();
      const data = { alumnoId, materiaId, fecha, estado };
      batch.set(ref, data);
      guardados.push({ id: ref.id, ...data });
    }
    await batch.commit();

    const avisos = await avisarAusencias({ guardados, materia, fecha });

    ok(res, { registros: guardados, descartados, avisos }, 201);
  } catch (err) {
    fail(res, "Error al guardar la asistencia: " + err.message, 500);
  }
});

// ─── AVISO A TUTORES ─────────────────────────────────────────────────────────

// Recorre los registros con estado "ausente", busca al tutor de cada alumno y
// escribe un documento en `notificaciones`. Si el alumno no tiene tutor
// vinculado se loguea y se sigue: la asistencia ya quedó guardada igual.
async function avisarAusencias({ guardados, materia, fecha }) {
  const ausentes = guardados.filter((a) => a.estado === "ausente");
  if (ausentes.length === 0) return { generadas: 0, sinTutor: [] };

  const sinTutor = [];
  const aInsertar = [];

  for (const asistencia of ausentes) {
    const tutor = await buscarTutoresDe(asistencia.alumnoId);
    if (tutor.length === 0) {
      sinTutor.push(asistencia.alumnoId);
      continue;
    }
    const alumnoDoc = await db.collection("alumnos").doc(asistencia.alumnoId).get();
    const alumno = alumnoDoc.exists ? alumnoDoc.data() : {};

    for (const t of tutor) {
      aInsertar.push({
        destinatarioUid: t.uid,
        tipo: "ausencia",
        titulo: `${alumno.nombre || "Alumno"} ${alumno.apellido || ""} estuvo ausente`.trim(),
        mensaje: `El alumno fue marcado como ausente el ${fecha} en ${materia.nombre}.`,
        alumnoId: asistencia.alumnoId,
        asistenciaId: asistencia.id,
        materiaId: asistencia.materiaId,
        fecha,
        leida: false,
        creadaEn: new Date().toISOString(),
      });
    }
  }

  if (sinTutor.length) {
    console.warn(`[notificaciones] ${sinTutor.length} alumno(s) ausente(s) sin tutor vinculado:`, sinTutor);
  }

  if (aInsertar.length === 0) return { generadas: 0, sinTutor };

  const batch = db.batch();
  const refs = aInsertar.map((n) => db.collection("notificaciones").doc());
  refs.forEach((ref, i) => batch.set(ref, aInsertar[i]));
  await batch.commit();

  return { generadas: aInsertar.length, sinTutor };
}

// GET /api/notificaciones?leidas=true|false
app.get("/api/notificaciones", verifyToken, async (req, res) => {
  try {
    const snap = await db.collection("notificaciones")
      .where("destinatarioUid", "==", req.user.uid)
      .get();

    let resultado = snap.docs.map(withId);
    if (req.query.leidas !== undefined) {
      const filtro = req.query.leidas === "true";
      resultado = resultado.filter((n) => Boolean(n.leida) === filtro);
    }
    resultado.sort((a, b) => String(b.creadaEn).localeCompare(String(a.creadaEn)));

    ok(res, {
      notificaciones: resultado,
      sinLeer: resultado.filter((n) => !n.leida).length,
    });
  } catch (err) {
    fail(res, "Error al listar notificaciones: " + err.message, 500);
  }
});

// PUT /api/notificaciones/:id/leida
app.put("/api/notificaciones/:id/leida", verifyToken, async (req, res) => {
  try {
    const ref = db.collection("notificaciones").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Notificación no encontrada", 404);

    const leida = Boolean(req.body.leida);
    if (doc.data().destinatarioUid !== req.user.uid) {
      return fail(res, "Esa notificación no es tuya", 403);
    }

    await ref.update({ leida, leidaEn: leida ? new Date().toISOString() : null });
    const actualizada = await ref.get();
    ok(res, withId(actualizada));
  } catch (err) {
    fail(res, "Error al actualizar la notificación: " + err.message, 500);
  }
});

// ─── FICHAS MÉDICAS ─────────────────────────────────────────────────────────
//
// Un documento por alumno (el ID del documento es el alumnoId) con un array
// `atenciones`. Así toda la ficha se lee con un solo get.

async function docenteTieneAccesoAlumno(docenteId, alumnoId) {
  if (!docenteId || !alumnoId) return false;

  const [materiasDocente, inscripcionesAlumno] = await Promise.all([
    db.collection("materias").where("docenteId", "==", docenteId).get(),
    db.collection("inscripciones")
      .where("alumnoId", "==", alumnoId)
      .where("cicloLectivo", "==", CICLO_LECTIVO)
      .get(),
  ]);
  const materiasInscripto = new Set(
    inscripcionesAlumno.docs.map((inscripcion) => inscripcion.data().materiaId)
  );

  return materiasDocente.docs.some((materia) =>
    Number(materia.data().cicloLectivo) === CICLO_LECTIVO &&
    materiasInscripto.has(materia.id)
  );
}

async function docenteTieneAccesoFicha(req, res, alumnoId) {
  if (req.perfil?.rol !== "docente") return true;
  const permitido = await docenteTieneAccesoAlumno(req.perfil.docenteId, alumnoId);
  if (permitido) return true;

  fail(res, "Sólo podés acceder a fichas de alumnos inscriptos en tus materias del ciclo lectivo actual", 403);
  return false;
}

async function alumnosDeMateriasDelDocente(docenteId) {
  if (!docenteId) return [];

  const [materiasDocente, inscripcionesCiclo] = await Promise.all([
    db.collection("materias").where("docenteId", "==", docenteId).get(),
    db.collection("inscripciones").where("cicloLectivo", "==", CICLO_LECTIVO).get(),
  ]);
  const materias = new Map(
    materiasDocente.docs
      .map((materia) => [materia.id, withId(materia)])
      .filter(([, materia]) => Number(materia.cicloLectivo) === CICLO_LECTIVO)
  );
  const materiasPorAlumno = new Map();
  for (const inscripcion of inscripcionesCiclo.docs) {
    const data = inscripcion.data();
    const materia = materias.get(data.materiaId);
    if (!materia) continue;

    if (!materiasPorAlumno.has(data.alumnoId)) materiasPorAlumno.set(data.alumnoId, new Map());
    materiasPorAlumno.get(data.alumnoId).set(materia.id, {
      id: materia.id,
      codigo: materia.codigo || "",
      nombre: materia.nombre || "",
      nivel: materia.nivel || null,
    });
  }

  return Promise.all([...materiasPorAlumno.entries()].map(async ([alumnoId, materiasAlumno]) => {
    const alumnoDoc = await db.collection("alumnos").doc(alumnoId).get();
    if (!alumnoDoc.exists) return null;
    const alumno = withId(alumnoDoc);
    return {
      id: alumno.id,
      nombre: alumno.nombre || "",
      apellido: alumno.apellido || "",
      legajo: alumno.legajo || null,
      nivel: alumno.nivel || null,
      estado: alumno.estado || null,
      materias: [...materiasAlumno.values()],
    };
  })).then((alumnos) => alumnos
    .filter(Boolean)
    .sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, "es")));
}

app.get("/api/fichas-medicas", verifyToken, async (req, res) => {
  try {
    const alumnoId = req.query.alumnoId;
    if (!alumnoId) return fail(res, "Falta el query param alumnoId");

    const alumnoDoc = await db.collection("alumnos").doc(alumnoId).get();
    if (!alumnoDoc.exists) return fail(res, "Alumno no encontrado", 404);

    if (req.perfil?.rol === "docente") {
      if (!await docenteTieneAccesoFicha(req, res, alumnoId)) return;
    } else if (req.perfil?.rol === "alumno") {
      if (req.perfil.alumnoId !== alumnoId) return fail(res, "Sólo podés consultar tu propia ficha médica", 403);
    } else if (req.perfil?.rol === "familia") {
      if (![req.perfil.hijoPrimariaId, req.perfil.hijoSecundariaId].includes(alumnoId))
        return fail(res, "Sólo podés consultar la ficha médica de tus hijos vinculados", 403);
    } else if (req.perfil?.rol !== "admin") {
      return fail(res, "No tenés permisos para consultar fichas médicas", 403);
    }

    const fichaDoc = await db.collection("fichasMedicas").doc(alumnoId).get();
    if (!fichaDoc.exists) {
      return ok(res, {
        alumno: withId(alumnoDoc),
        ficha: null,
        mensaje: "El alumno todavía no tiene ficha médica cargada",
      });
    }

    const ficha = fichaDoc.data();
    ok(res, {
      alumno: withId(alumnoDoc),
      ficha: { id: fichaDoc.id, ...ficha, atenciones: ficha.atenciones || [] },
    });
  } catch (err) {
    fail(res, "Error al leer la ficha médica: " + err.message, 500);
  }
});

// POST /api/fichas-medicas
// Body: { alumnoId, grupoSanguineo, alergias, condiciones, medicacion,
//         contactoEmergencia, observaciones }
// Crea la ficha o completa la existente (upsert del encabezado).
app.post("/api/fichas-medicas", verifyToken, requireRole("admin", "docente"), async (req, res) => {
  try {
    const { alumnoId, grupoSanguineo, alergias, condiciones, medicacion,
            contactoEmergencia, observaciones } = req.body;

    if (!alumnoId) return fail(res, "Falta el campo alumnoId");

    const alumnoDoc = await db.collection("alumnos").doc(alumnoId).get();
    if (!alumnoDoc.exists) return fail(res, "Alumno no encontrado", 404);
    if (!await docenteTieneAccesoFicha(req, res, alumnoId)) return;

    const ref = db.collection("fichasMedicas").doc(alumnoId);
    const fichaDoc = await ref.get();
    const ahora = new Date().toISOString();

    const encabezado = {
      alumnoId,
      grupoSanguineo: grupoSanguineo ?? null,
      alergias: Array.isArray(alergias) ? alergias : [],
      condiciones: Array.isArray(condiciones) ? condiciones : [],
      medicacion: medicacion || null,
      contactoEmergencia: contactoEmergencia || null,
      observaciones: observaciones || null,
      actualizadoEn: ahora,
    };

    if (fichaDoc.exists) {
      await ref.update(encabezado);
    } else {
      await ref.set({ ...encabezado, atenciones: [], creadoEn: ahora });
    }

    const actualizada = await ref.get();
    ok(res, withId(actualizada), fichaDoc.exists ? 200 : 201);
  } catch (err) {
    fail(res, "Error al guardar la ficha médica: " + err.message, 500);
  }
});

// POST /api/fichas-medicas/:alumnoId/atenciones
// Body: { fecha, motivo, diagnostico, tratamiento, observaciones }
app.post("/api/fichas-medicas/:alumnoId/atenciones", verifyToken, requireRole("admin", "docente"), async (req, res) => {
  try {
    const alumnoId = req.params.alumnoId;
    const { fecha, motivo, diagnostico, tratamiento, observaciones } = req.body;

    if (!fecha || !motivo)
      return fail(res, "Faltan campos obligatorios: fecha, motivo");

    const alumnoDoc = await db.collection("alumnos").doc(alumnoId).get();
    if (!alumnoDoc.exists) return fail(res, "Alumno no encontrado", 404);
    if (!await docenteTieneAccesoFicha(req, res, alumnoId)) return;

    const ref = db.collection("fichasMedicas").doc(alumnoId);
    const fichaDoc = await ref.get();

    const atencion = {
      id: ref.collection("atenciones").doc().id,
      fecha,
      motivo,
      diagnostico: diagnostico || null,
      tratamiento: tratamiento || null,
      observaciones: observaciones || null,
      registradoPor: nombreCompleto(req.perfil) || req.user.email || req.user.uid,
      registradoPorRol: (req.perfil && req.perfil.rol) || null,
      registradaEn: new Date().toISOString(),
    };

    if (fichaDoc.exists) {
      await ref.update({
        atenciones: [...(fichaDoc.data().atenciones || []), atencion],
        actualizadoEn: atencion.registradaEn,
      });
    } else {
      // Si el alumno no tenía ficha, se crea con la primera atención.
      await ref.set({
        alumnoId,
        grupoSanguineo: null,
        alergias: [],
        condiciones: [],
        medicacion: null,
        contactoEmergencia: null,
        observaciones: null,
        atenciones: [atencion],
        creadoEn: atencion.registradaEn,
        actualizadoEn: atencion.registradaEn,
      });
    }

    ok(res, atencion, 201);
  } catch (err) {
    fail(res, "Error al registrar la atención: " + err.message, 500);
  }
});

// DELETE /api/fichas-medicas/:alumnoId/atenciones/:atencionId
app.delete("/api/fichas-medicas/:alumnoId/atenciones/:atencionId", verifyToken, requireRole("admin", "docente"), async (req, res) => {
  try {
    if (!await docenteTieneAccesoFicha(req, res, req.params.alumnoId)) return;

    const ref = db.collection("fichasMedicas").doc(req.params.alumnoId);
    const alumnoDoc = await db.collection("alumnos").doc(req.params.alumnoId).get();
    if (!alumnoDoc.exists) return fail(res, "Alumno no encontrado", 404);
    const fichaDoc = await ref.get();
    if (!fichaDoc.exists) return fail(res, "Ficha médica no encontrada", 404);

    const atenciones = fichaDoc.data().atenciones || [];
    const quitar = atenciones.filter((a) => a.id !== req.params.atencionId);
    if (quitar.length === atenciones.length) {
      return fail(res, "Atención no encontrada", 404);
    }

    await ref.update({ atenciones: quitar, actualizadoEn: new Date().toISOString() });
    ok(res, { mensaje: "Atención eliminada", restantes: quitar.length });
  } catch (err) {
    fail(res, "Error al eliminar la atención: " + err.message, 500);
  }
});

// ─── ADMINISTRACIÓN DE USUARIOS ─────────────────────────────────────────────

// GET /api/admin/usuarios
// Listado real de las cuentas, para que el panel no muestre sólo las altas de la
// sesión actual. Se arma desde los perfiles de `usuarios` y se cruza con Auth
// para reportar el estado real de la cuenta (habilitada, sin email, etc).
app.get("/api/admin/usuarios", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { q, rol } = req.query;
    const snap = await db.collection("usuarios").orderBy("nombre").get();

    // El perfil en `usuarios` guarda la identidad mínima (rol, vínculos y a
    // veces email). El legajo, el nivel y el nombre completo viven en el registro
    // institucional, así que se leen de `alumnos`/`docentes` para no mostrar
    // filas a medio completar.
    const [alumnosSnap, docentesSnap] = await Promise.all([
      db.collection("alumnos").get(),
      db.collection("docentes").get(),
    ]);
    const alumnosPorId = new Map(alumnosSnap.docs.map((d) => [d.id, d.data()]));
    const docentesPorId = new Map(docentesSnap.docs.map((d) => [d.id, d.data()]));

    let lista = snap.docs.map((d) => {
      const u = d.data();
      const inst = u.alumnoId ? alumnosPorId.get(u.alumnoId) : u.docenteId ? docentesPorId.get(u.docenteId) : null;

      const nombre = (inst && inst.nombre) || u.nombre || "";
      const apellido = (inst && inst.apellido) || u.apellido || "";
      const emailPerfil = u.email || (inst && inst.email) || null;

      const item = {
        uid: d.id,
        dni: u.dni || null,
        nombre,
        apellido,
        // Nombre ya normalizado, para mostrar y para buscar.
        nombreCompleto: [nombre, apellido].filter(Boolean).join(" "),
        email: emailPerfil,
        rol: u.rol || null,
        nivel: u.nivel || (inst && inst.nivel) || null,
        legajo: u.legajo || (inst && inst.legajo) || null,
        alumnoId: u.alumnoId || null,
        docenteId: u.docenteId || null,
        hijoPrimariaId: u.hijoPrimariaId || null,
        hijoSecundariaId: u.hijoSecundariaId || null,
        actualizadoEn: u.actualizadoEn || null,
      };
      return item;
    });

    if (rol) lista = lista.filter((u) => u.rol === rol);

    if (q) {
      const t = sinAcentos(String(q).toLowerCase());
      lista = lista.filter((u) =>
        [u.nombreCompleto, u.email, u.dni, u.legajo]
          .filter(Boolean)
          .some((v) => sinAcentos(String(v).toLowerCase()).includes(t))
      );
    }

    // Estado de la cuenta en Auth: si el perfil quedó sin cuenta, el usuario no
    // puede iniciar sesión aunque el panel lo muestre.
    const authPorUid = new Map();
    try {
      let page;
      do {
        page = await auth.listUsers(500, page ? page.nextPageToken : undefined);
        for (const u of page.users) authPorUid.set(u.uid, { deshabilitado: u.disabled, email: u.email });
      } while (page && page.nextPageToken);
    } catch (e) {
      console.error("No se pudo listar Auth:", e.message);
    }

    for (const u of lista) {
      const a = authPorUid.get(u.uid);
      u.cuentaExiste = Boolean(a);
      u.habilitado = a ? !a.deshabilitado : false;
      if (!u.email && a && a.email) u.email = a.email;
    }

    ok(res, lista);
  } catch (e) {
    console.error("GET /api/admin/usuarios:", e);
    fail(res, e.message, 500);
  }
});

// POST /api/admin/usuarios
// Alta completa desde el panel web: cuenta de Firebase Auth + registro
// institucional (alumnos/docentes) + perfil en `usuarios`. Es el mismo camino
// que hace crear-usuario.js por consola, con el mismo esquema de perfil.
app.post("/api/admin/usuarios", verifyToken, requireRole("admin"), async (req, res) => {
  let userRecord = null;
  try {
    const { dni, nombre, apellido, password, rol, nivel, legajo, hijoPrimariaId, hijoSecundariaId } = req.body;

    if (!dni || !nombre || !apellido || !password || !rol)
      return fail(res, "Faltan campos obligatorios: dni, nombre, apellido, password, rol");
    if (!/^\d+$/.test(String(dni)))
      return fail(res, "El DNI debe contener solo números");
    if (String(password).length < 6)
      return fail(res, "La contraseña debe tener al menos 6 caracteres");
    if (!ROLES.includes(rol))
      return fail(res, `Rol inválido. Valores permitidos: ${ROLES.join(", ")}`);
    if (rol !== "admin" && rol !== "familia" && !nivel)
      return fail(res, "Los roles alumno y docente necesitan un nivel");
    if (rol === "alumno" && !legajo)
      return fail(res, "El rol alumno necesita un legajo");
    if (rol === "docente" && !legajo)
      return fail(res, "El rol docente necesita un legajo");

    const email = `${dni}@escuela.edu.ar`;

    // Si el legajo ya existe, no duplicamos el registro institucional.
    let referenciaId = null;
    if (legajo) {
      const coleccion = rol === "alumno" ? "alumnos" : "docentes";
      const duplicado = await db.collection(coleccion).where("legajo", "==", legajo).limit(1).get();
      if (!duplicado.empty) {
        return fail(res, `Ya existe un registro con el legajo ${legajo} en ${coleccion}`);
      }
    }

    // 1. Cuenta de Firebase Auth
    userRecord = await auth.createUser({ email, password: String(password) });

    // 2. Registro institucional
    if (rol === "alumno") {
      const ref = await db.collection("alumnos").add({
        legajo, nombre, apellido, email, estado: "activo",
      });
      referenciaId = ref.id;
    }
    if (rol === "docente") {
      const ref = await db.collection("docentes").add({
        legajo, nombre, apellido, email, materiasACargo: [], estado: "activo",
      });
      referenciaId = ref.id;
    }

    // 3. Perfil
    const perfil = armarPerfil({
      uid: userRecord.uid,
      email,
      dni: String(dni),
      rol,
      nivel: rol === "admin" || rol === "familia" ? null : nivel,
      nombre,
      apellido,
      alumnoId: rol === "alumno" ? referenciaId : null,
      docenteId: rol === "docente" ? referenciaId : null,
      hijoPrimariaId: rol === "familia" ? hijoPrimariaId : null,
      hijoSecundariaId: rol === "familia" ? hijoSecundariaId : null,
    });
    await db.collection("usuarios").doc(userRecord.uid).set(perfil);

    ok(res, {
      uid: userRecord.uid,
      email,
      alumnoId: perfil.alumnoId || null,
      docenteId: perfil.docenteId || null,
      perfil,
    }, 201);
  } catch (err) {
    // Si creamos la cuenta de Auth pero falló algo después, la borramos para no
    // dejar cuentas huérfanas que el usuario no puede usar.
    if (userRecord) {
      try { await auth.deleteUser(userRecord.uid); } catch (e) {
        console.error("[admin/usuarios] no se pudo revertir la cuenta:", e.message);
      }
    }
    const mensaje = err.code === "auth/email-already-exists"
      ? `Ya existe un usuario con DNI ${req.body.dni}`
      : "Error al crear el usuario: " + err.message;
    fail(res, mensaje, err.code === "auth/email-already-exists" ? 400 : 500);
  }
});

// ─── PREINSCRIPCIONES ───────────────────────────────────────────────────────
//
// La página pública html/preinscripcion.html NO escribe en Firestore desde el
// navegador: pasa por acá. Así el cliente anónimo nunca necesita permisos de
// escritura y las validaciones viven en un solo lugar.

// Nivel Inicial no existe como nivel propio del sistema: se gestiona dentro de
// Primaria. Los únicos niveles reales son primaria y secundaria (ver NIVELES).
const ESTADOS_PREINSCRIPCION = ["pendiente", "contactado", "visita", "inscripto", "descartada"];
const GRUPOS_SANGUINEOS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const VINCULOS = ["madre", "padre", "tutor_legal"];

// Freno básico contra spam: máx. 3 envíos por IP cada 10 minutos. Es en
// memoria (se pierde al reiniciar), alcanza para una preinscripción y no
// obliga a montar Redis ni Cloud Functions.
const VENTANA_MS = 10 * 60 * 1000;
const MAX_POR_VENTANA = 3;
const enviosPorIp = new Map();

function rateLimitePreinscripcion(ip) {
  const ahora = Date.now();
  const previos = (enviosPorIp.get(ip) || []).filter((t) => ahora - t < VENTANA_MS);
  if (previos.length >= MAX_POR_VENTANA) {
    return false;
  }
  previos.push(ahora);
  enviosPorIp.set(ip, previos);
  return true;
}

const textoLimpio = (v, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function validarPreinscripcion(body) {
  const errores = [];

  const alumnoNombre = textoLimpio(body.alumno?.nombre);
  const alumnoEdad = Number(body.alumno?.edad);
  const alumnoDni = textoLimpio(body.alumno?.dni, 20);
  const nivel = textoLimpio(body.alumno?.nivel, 20).toLowerCase();
  const domicilio = textoLimpio(body.alumno?.domicilio);
  const telEmergencia = textoLimpio(body.alumno?.telefonoEmergencia, 40);
  const tipoSangre = textoLimpio(body.alumno?.tipoSangre, 3);

  if (alumnoNombre.length < 3) errores.push("El nombre del alumno es obligatorio.");
  if (!Number.isInteger(alumnoEdad) || alumnoEdad < 2 || alumnoEdad > 25) {
    errores.push("La edad del alumno debe estar entre 2 y 25.");
  }
  if (!/^\d{6,10}$/.test(alumnoDni)) errores.push("El DNI del alumno debe tener entre 6 y 10 dígitos, sin guiones.");
    if (!NIVELES.includes(nivel)) {
      errores.push(`Nivel inválido. Valores permitidos: ${NIVELES.join(", ")}.`);
  }
  if (domicilio.length < 5) errores.push("El domicilio del alumno es obligatorio.");
  if (telEmergencia.length < 6) errores.push("El teléfono de emergencia es obligatorio.");
  if (tipoSangre && !GRUPOS_SANGUINEOS.includes(tipoSangre)) {
    errores.push("Tipo de sangre inválido.");
  }

  const tutorNombre = textoLimpio(body.tutor?.nombre);
  const tutorEdad = Number(body.tutor?.edad);
  const tutorDni = textoLimpio(body.tutor?.dni, 20);
  const vinculo = textoLimpio(body.tutor?.vinculo, 20).toLowerCase();
  const tutorTel = textoLimpio(body.tutor?.telefono, 40);

  if (tutorNombre.length < 3) errores.push("El nombre del responsable es obligatorio.");
  if (!Number.isInteger(tutorEdad) || tutorEdad < 18 || tutorEdad > 120) {
    errores.push("La edad del responsable debe estar entre 18 y 120.");
  }
  if (!/^\d{6,10}$/.test(tutorDni)) errores.push("El DNI del responsable debe tener entre 6 y 10 dígitos, sin guiones.");
  if (!VINCULOS.includes(vinculo)) errores.push("El vínculo con el alumno es obligatorio.");
  if (tutorTel.length < 6) errores.push("El teléfono de contacto del responsable es obligatorio.");

  return {
    errores,
    datos: {
      alumno: {
        nombre: alumnoNombre,
        edad: alumnoEdad,
        dni: alumnoDni,
        nivel,
        tipoSangre: tipoSangre || null,
        domicilio,
        telefonoEmergencia: telEmergencia,
      },
      tutor: {
        nombre: tutorNombre,
        edad: tutorEdad,
        dni: tutorDni,
        vinculo,
        domicilio: textoLimpio(body.tutor?.domicilio) || null,
        telefono: tutorTel,
      },
    },
  };
}

// POST /api/preinscripciones — público, sin token. Es el único endpoint
// anónimo del sistema, y a propósito sólo escribe en su propia colección.
app.post("/api/preinscripciones", async (req, res) => {
  try {
    // Campo trampa: los bots llenan todos los inputs, un humano no ve el oculto.
    if (req.body && req.body.trampa) {
      return ok(res, { id: null, mensaje: "Preinscripción recibida." });
    }

    // Primero valida, y recién después consume cuota: si no, tres errores de
    // tipeo del DNI dejan al visitante bloqueado diez minutos.
    const { errores, datos } = validarPreinscripcion(req.body || {});
    if (errores.length > 0) return fail(res, errores.join(" "), 422);

    if (!rateLimitePreinscripcion(req.ip || "desconocida")) {
      return fail(res, "Demasiados envíos seguidos. Intentá de nuevo en unos minutos.", 429);
    }

    // Un mismo alumno no debería mandar el form cada rato.
    const repetida = await db.collection("preinscripciones")
      .where("alumno.dni", "==", datos.alumno.dni)
      .limit(1)
      .get();
    if (!repetida.empty) {
      return fail(res, "Ya recibimos una preinscripción con ese DNI. Te vamos a contactar.", 409);
    }

    const ref = await db.collection("preinscripciones").add({
      ...datos,
      estado: "pendiente",
      cicloLectivo: CICLO_LECTIVO,
      observaciones: null,
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    });

    ok(res, {
      id: ref.id,
      mensaje: "Preinscripción recibida. Te vamos a contactar para coordinar la visita.",
    }, 201);
  } catch (err) {
    fail(res, "Error al registrar la preinscripción: " + err.message, 500);
  }
});

// GET /api/preinscripciones?estado=pendiente — sólo administración.
app.get("/api/preinscripciones", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    let query = db.collection("preinscripciones");
    if (req.query.estado) {
      const estado = String(req.query.estado);
      if (!ESTADOS_PREINSCRIPCION.includes(estado)) {
        return fail(res, `Estado inválido. Valores permitidos: ${ESTADOS_PREINSCRIPCION.join(", ")}.`);
      }
      query = query.where("estado", "==", estado);
    }

    const snap = await query.get();
    const lista = snap.docs.map(withId)
      .sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)));

    const conteo = {};
    for (const e of ESTADOS_PREINSCRIPCION) {
      conteo[e] = snap.docs.filter((d) => d.data().estado === e).length;
    }

    ok(res, {
      preinscripciones: lista,
      total: lista.length,
      porEstado: conteo,
    });
  } catch (err) {
    fail(res, "Error al listar las preinscripciones: " + err.message, 500);
  }
});

// PUT /api/preinscripciones/:id — sólo administración. Mueve el estado y deja
// nota del seguimiento.
app.put("/api/preinscripciones/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { estado, observaciones } = req.body || {};
    if (!ESTADOS_PREINSCRIPCION.includes(estado)) {
      return fail(res, `Estado inválido. Valores permitidos: ${ESTADOS_PREINSCRIPCION.join(", ")}.`);
    }

    const ref = db.collection("preinscripciones").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Preinscripción no encontrada", 404);

    await ref.update({
      estado,
      observaciones: textoLimpio(observaciones, 500) || null,
      actualizadoEn: new Date().toISOString(),
    });

    const actualizada = await ref.get();
    ok(res, withId(actualizada));
  } catch (err) {
    fail(res, "Error al actualizar la preinscripción: " + err.message, 500);
  }
});

// ─── HORARIOS ───────────────────────────────────────────────────────────────
//
// Un bloque por documento: { materiaId, dia (1=Lunes..5=Viernes), horaInicio,
// horaFin, aula }. El módulo de 75 minutos es el habitual de las escuelas, y
// `Backend/seed-horarios.js` arma la grilla a partir de la cargaHoraria de cada
// materia respetando los choques de aula, docente y alumnos.

const DIAS = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes" };
const HORAS = ["08:00", "09:15", "10:30", "11:45", "13:15"];

const aMinutos = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};
const aHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function horarioSePisa(a, b) {
  return a.dia === b.dia && aMinutos(a.horaInicio) < aMinutos(b.horaFin)
    && aMinutos(b.horaInicio) < aMinutos(a.horaFin);
}

// GET /api/horarios?alumnoId=X | ?materiaId=X | (sin params, sólo admin)
app.get("/api/horarios", verifyToken, async (req, res) => {
  try {
    const { alumnoId, materiaId } = req.query;

    let materiaIds;
    if (alumnoId) {
      const insc = await db.collection("inscripciones")
        .where("alumnoId", "==", alumnoId)
        .where("cicloLectivo", "==", CICLO_LECTIVO)
        .get();
      materiaIds = insc.docs.map((d) => d.data().materiaId);
    } else if (materiaId) {
      materiaIds = [materiaId];
    } else {
      return fail(res, "Falta el query param alumnoId o materiaId");
    }

    if (materiaIds.length === 0) {
      return ok(res, { dias: [], bloques: [], materias: [] });
    }

    const [bloquesSnap, materiasSnap, docentesSnap, inscSnap] = await Promise.all([
      db.collection("horarios").where("materiaId", "in", materiaIds.slice(0, 30)).get(),
      db.collection("materias").where("__name__", "in", materiaIds.slice(0, 30)).get(),
      db.collection("docentes").get(),
      db.collection("inscripciones").where("cicloLectivo", "==", CICLO_LECTIVO).get(),
    ]);

    const materias = new Map(materiasSnap.docs.map((d) => [d.id, withId(d)]));
    const docentes = new Map(docentesSnap.docs.map((d) => [d.id, withId(d)]));
    const alumnosPorMateria = new Map();
    for (const d of inscSnap.docs) {
      const i = d.data();
      if (!alumnosPorMateria.has(i.materiaId)) alumnosPorMateria.set(i.materiaId, []);
      alumnosPorMateria.get(i.materiaId).push(i.alumnoId);
    }

    const bloques = bloquesSnap.docs.map(withId)
      .map((b) => {
        const m = materias.get(b.materiaId) || {};
        const docente = b.docenteId ? docentes.get(b.docenteId) : null;
        return {
          ...b,
          diaNombre: DIAS[b.dia] || `Día ${b.dia}`,
          materiaCodigo: m.codigo || "—",
          materiaNombre: m.nombre || "Materia eliminada",
          aula: b.aula || null,
          docente: docente ? { id: docente.id, nombre: `${docente.nombre} ${docente.apellido || ""}`.trim() } : null,
        };
      })
      .sort((x, y) => x.dia - y.dia || aMinutos(x.horaInicio) - aMinutos(y.horaInicio));

    // Armamos la grilla: un array por día, con los bloques ya ordenados.
    const dias = Object.keys(DIAS).map((d) => ({
      dia: Number(d),
      nombre: DIAS[d],
      bloques: bloques.filter((b) => b.dia === Number(d)),
    }));

    ok(res, {
      dias,
      bloques,
      materias: [...materias.values()].map((m) => ({ id: m.id, codigo: m.codigo, nombre: m.nombre })),
      alumnos: alumnoId ? (alumnosPorMateria.get(alumnoId) || []) : [],
    });
  } catch (err) {
    fail(res, "Error al cargar los horarios: " + err.message, 500);
  }
});

// GET /api/horarios/grilla — sólo administración. La grilla completa para
// cargarla o revisarla de un vistazo.
app.get("/api/horarios/grilla", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const [materiasSnap, horariosSnap] = await Promise.all([
      db.collection("materias").where("cicloLectivo", "==", CICLO_LECTIVO).get(),
      db.collection("horarios").get(),
    ]);

    const horariosPorMateria = new Map();
    for (const d of horariosSnap.docs) {
      const h = d.data();
      if (!horariosPorMateria.has(h.materiaId)) horariosPorMateria.set(h.materiaId, []);
      horariosPorMateria.get(h.materiaId).push(withId(d));
    }

    const materias = materiasSnap.docs.map((d) => {
      const m = withId(d);
      return {
        ...m,
        bloques: (horariosPorMateria.get(m.id) || [])
          .sort((a, b) => a.dia - b.dia || aMinutos(a.horaInicio) - aMinutos(b.horaInicio)),
      };
    });

    ok(res, { materias, total: horariosSnap.size });
  } catch (err) {
    fail(res, "Error al cargar la grilla de horarios: " + err.message, 500);
  }
});

// POST /api/horarios — sólo administración. Rechaza el bloque si choca con otro
// de la misma materia, del mismo docente o en la misma aula.
app.post("/api/horarios", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { materiaId, dia, horaInicio, horaFin, aula } = req.body || {};

    if (!materiaId) return fail(res, "Falta el campo materiaId");
    const nDia = Number(dia);
    if (!DIAS[nDia]) return fail(res, `Día inválido. Valores permitidos: 1 (Lunes) a 5 (Viernes).`);
    if (!/^\d{2}:\d{2}$/.test(horaInicio || "") || !/^\d{2}:\d{2}$/.test(horaFin || "")) {
      return fail(res, "horaInicio y horaFin van en formato HH:MM");
    }
    if (aMinutos(horaFin) <= aMinutos(horaInicio)) {
      return fail(res, "horaFin tiene que ser posterior a horaInicio");
    }

    const materiaDoc = await db.collection("materias").doc(materiaId).get();
    if (!materiaDoc.exists) return fail(res, "Materia no encontrada");

    const nuevo = {
      materiaId,
      dia: nDia,
      horaInicio,
      horaFin,
      aula: textoLimpio(aula, 20) || null,
      docenteId: materiaDoc.data().docenteId || null,
      cicloLectivo: CICLO_LECTIVO,
    };

    // Antes sólo se miraban los bloques de la MISMA materia, así que una materia
    // nueva podía meterse en un aula ya ocupada, en el aula del propio docente o
    // pisarle el turno a un alumno de otra materia sin que nada lo rechazara.
    // Ahora se comparan todos los bloques del día contra aula, docente y
    // alumnos, igual que hace seed-horarios.js al generar la grilla.
    const [delDia, inscsMateria, todasInsc] = await Promise.all([
      db.collection("horarios")
        .where("dia", "==", nDia)
        .where("cicloLectivo", "==", CICLO_LECTIVO)
        .get(),
      db.collection("inscripciones")
        .where("materiaId", "==", materiaId)
        .where("cicloLectivo", "==", CICLO_LECTIVO)
        .get(),
      db.collection("inscripciones").where("cicloLectivo", "==", CICLO_LECTIVO).get(),
    ]);

    const alumnosPorMateria = new Map();
    for (const d of todasInsc.docs) {
      const { materiaId: mid, alumnoId } = d.data();
      if (!alumnosPorMateria.has(mid)) alumnosPorMateria.set(mid, []);
      alumnosPorMateria.get(mid).push(alumnoId);
    }
    const misAlumnos = inscsMateria.docs.map((d) => d.data().alumnoId);
    const nombresMateria = new Map();

    for (const doc of delDia.docs) {
      const e = doc.data();
      if (e.materiaId === materiaId && horarioSePisa(nuevo, e)) {
        return fail(res, `Choca con un bloque ya cargado de "${materiaDoc.data().nombre}": ` +
          `${DIAS[e.dia]} ${e.horaInicio}-${e.horaFin}${e.aula ? ` (aula ${e.aula})` : ""}.`);
      }
      if (!horarioSePisa(nuevo, e)) continue;

      const detalle = async () => {
        if (!nombresMateria.has(e.materiaId)) {
          const md = await db.collection("materias").doc(e.materiaId).get();
          nombresMateria.set(e.materiaId, md.exists ? md.data().nombre : e.materiaId);
        }
        return nombresMateria.get(e.materiaId);
      };
      const franja = `${DIAS[e.dia]} ${e.horaInicio}-${e.horaFin}`;

      if (nuevo.aula && e.aula === nuevo.aula) {
        return fail(res, `El aula ${nuevo.aula} ya está ocupada por "${await detalle()}" (${franja}).`);
      }
      if (nuevo.docenteId && e.docenteId === nuevo.docenteId) {
        return fail(res, `El docente de "${materiaDoc.data().nombre}" ya tiene "${await detalle()}" en ese horario (${franja}).`);
      }
      const suyosAlumnos = alumnosPorMateria.get(e.materiaId) || [];
      if (misAlumnos.some((a) => suyosAlumnos.includes(a))) {
        return fail(res, `Hay alumnos inscritos en "${materiaDoc.data().nombre}" que ya tienen "${await detalle()}" en ese horario (${franja}).`);
      }
    }

    const ref = await db.collection("horarios").add({ ...nuevo, creadoEn: new Date().toISOString() });
    ok(res, withId(await ref.get()), 201);
  } catch (err) {
    fail(res, "Error al crear el bloque de horario: " + err.message, 500);
  }
});

// DELETE /api/horarios/:id — sólo administración.
app.delete("/api/horarios/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const ref = db.collection("horarios").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Bloque de horario no encontrado", 404);

    await ref.delete();
    ok(res, { mensaje: "Bloque eliminado" });
  } catch (err) {
    fail(res, "Error al eliminar el bloque: " + err.message, 500);
  }
});

// ─── NOTICIAS ───────────────────────────────────────────────────────────────
//
// Las noticias las carga la administración desde admin-noticias.html y se
// leen públicas desde noticias.html. `publicada: false` las deja como borrador.

// GET /api/noticias — público, sólo devuelve las publicadas.
app.get("/api/noticias", async (req, res) => {
  try {
    const snap = await db.collection("noticias").where("publicada", "==", true).get();
    const noticias = snap.docs.map(withId)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

    ok(res, { noticias, total: noticias.length });
  } catch (err) {
    fail(res, "Error al cargar las noticias: " + err.message, 500);
  }
});

// GET /api/noticias/todas — sólo administración, incluye los borradores.
app.get("/api/noticias/todas", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const snap = await db.collection("noticias").get();
    const noticias = snap.docs.map(withId)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

    ok(res, { noticias, total: noticias.length });
  } catch (err) {
    fail(res, "Error al cargar las noticias: " + err.message, 500);
  }
});

function validarNoticia(body) {
  const errores = [];
  const titulo = textoLimpio(body.titulo, 120);
  const bajada = textoLimpio(body.bajada, 250);
  const cuerpo = textoLimpio(body.cuerpo, 8000);
  const fecha = textoLimpio(body.fecha, 10);
  const imagen = textoLimpio(body.imagen, 300);

  if (titulo.length < 5) errores.push("El título debe tener al menos 5 caracteres.");
  if (cuerpo.length < 20) errores.push("El cuerpo de la noticia debe tener al menos 20 caracteres.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) errores.push("La fecha va en formato AAAA-MM-DD.");
  if (imagen && !/^https?:\/\//i.test(imagen)) errores.push("La imagen tiene que ser una URL completa (http:// o https://).");

  return { errores, datos: { titulo, bajada: bajada || null, cuerpo, fecha, imagen: imagen || null } };
}

// POST /api/noticias — sólo administración.
app.post("/api/noticias", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { errores, datos } = validarNoticia(req.body || {});
    if (errores.length > 0) return fail(res, errores.join(" "), 422);

    const ref = await db.collection("noticias").add({
      ...datos,
      destacada: Boolean(req.body.destacada),
      publicada: Boolean(req.body.publicada),
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    });

    ok(res, withId(await ref.get()), 201);
  } catch (err) {
    fail(res, "Error al crear la noticia: " + err.message, 500);
  }
});

// PUT /api/noticias/:id — sólo administración.
app.put("/api/noticias/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { errores, datos } = validarNoticia(req.body || {});
    if (errores.length > 0) return fail(res, errores.join(" "), 422);

    const ref = db.collection("noticias").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Noticia no encontrada", 404);

    await ref.update({
      ...datos,
      destacada: Boolean(req.body.destacada),
      publicada: Boolean(req.body.publicada),
      actualizadoEn: new Date().toISOString(),
    });

    ok(res, withId(await ref.get()));
  } catch (err) {
    fail(res, "Error al actualizar la noticia: " + err.message, 500);
  }
});

// DELETE /api/noticias/:id — sólo administración.
app.delete("/api/noticias/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const ref = db.collection("noticias").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Noticia no encontrada", 404);

    await ref.delete();
    ok(res, { mensaje: "Noticia eliminada" });
  } catch (err) {
    fail(res, "Error al eliminar la noticia: " + err.message, 500);
  }
});

// ─── 404 CATCH-ALL ──────────────────────────────────────────────────────────

app.use((req, res) => fail(res, `Ruta no encontrada: ${req.method} ${req.path}`, 404));

// ─── INICIO ─────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n NovaSYS API corriendo en http://localhost:${PORT}`);
    console.log(` Ciclo lectivo activo: ${CICLO_LECTIVO}`);
    console.log(" Colecciones: alumnos, docentes, materias, inscripciones, calificaciones, asistencias, notificaciones, fichasMedicas, usuarios, preinscripciones\n");
  });
}

module.exports = app;