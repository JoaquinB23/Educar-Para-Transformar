require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { db } = require("./firebaseAdmin");
const verifyToken = require("./middleware/verifyToken");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static('../'));

// ─── HELPER RESPUESTA ───────────────────────────────────────────────────────

const ok   = (res, data, status = 200) => res.status(status).json({ ok: true,  data });
const fail = (res, msg,  status = 400) => res.status(status).json({ ok: false, error: msg });

// Convierte un snapshot de Firestore en { id, ...datos }
const withId = (doc) => ({ id: doc.id, ...doc.data() });

// ─── AUTH (Firebase) ────────────────────────────────────────────────────────

app.post("/api/auth/sync", verifyToken, async (req, res) => {
  try {
    const { rol, nivel, nombre } = req.body;
    if (!rol) return fail(res, "Falta el campo rol");

    const userRef = db.collection("usuarios").doc(req.user.uid);
    const data = {
      uid: req.user.uid,
      email: req.user.email,
      rol,
      nivel: nivel || null,
      nombre: nombre || null,
      actualizadoEn: new Date().toISOString(),
    };

    await userRef.set(data, { merge: true });
    ok(res, data);
  } catch (err) {
    fail(res, "Error al sincronizar el perfil: " + err.message, 500);
  }
});

app.get("/api/auth/me", verifyToken, async (req, res) => {
  try {
    const snap = await db.collection("usuarios").doc(req.user.uid).get();
    if (!snap.exists) return fail(res, "Perfil no encontrado en Firestore", 404);
    ok(res, snap.data());
  } catch (err) {
    fail(res, "Error al leer el perfil: " + err.message, 500);
  }
});

// ─── DASHBOARD ──────────────────────────────────────────────────────────────

app.get("/api/dashboard", verifyToken, async (req, res) => {
  try {
    const cicloActual = 2025;

    const [alumnosSnap, docentesSnap, materiasSnap, inscripcionesSnap] = await Promise.all([
      db.collection("alumnos").where("estado", "==", "activo").get(),
      db.collection("docentes").get(),
      db.collection("materias").get(),
      db.collection("inscripciones").where("cicloLectivo", "==", cicloActual).get(),
    ]);

    ok(res, {
      alumnosActivos:       alumnosSnap.size,
      docentesRegistrados:  docentesSnap.size,
      materiasDisponibles:  materiasSnap.size,
      inscripcionesPeriodo: inscripcionesSnap.size,
    });
  } catch (err) {
    fail(res, "Error al cargar el dashboard: " + err.message, 500);
  }
});

// ─── ALUMNOS ────────────────────────────────────────────────────────────────

app.get("/api/alumnos", verifyToken, async (req, res) => {
  try {
    const snap = await db.collection("alumnos").get();
    let resultado = snap.docs.map(withId);

    if (req.query.nombre) {
      const q = req.query.nombre.toLowerCase();
      resultado = resultado.filter(
        (a) => a.nombre.toLowerCase().includes(q) || a.apellido.toLowerCase().includes(q)
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

app.get("/api/alumnos/:id", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("alumnos").doc(req.params.id).get();
    if (!doc.exists) return fail(res, "Alumno no encontrado", 404);
    ok(res, withId(doc));
  } catch (err) {
    fail(res, "Error al buscar el alumno: " + err.message, 500);
  }
});

app.post("/api/alumnos", verifyToken, async (req, res) => {
  try {
    const { legajo, nombre, apellido, email, estado = "activo" } = req.body;
    if (!legajo || !nombre || !apellido || !email)
      return fail(res, "Faltan campos obligatorios: legajo, nombre, apellido, email");

    const existe = await db.collection("alumnos").where("legajo", "==", legajo).limit(1).get();
    if (!existe.empty) return fail(res, "Ya existe un alumno con ese legajo");

    const nuevo = { legajo, nombre, apellido, email, estado };
    const ref = await db.collection("alumnos").add(nuevo);
    ok(res, { id: ref.id, ...nuevo }, 201);
  } catch (err) {
    fail(res, "Error al crear el alumno: " + err.message, 500);
  }
});

app.put("/api/alumnos/:id", verifyToken, async (req, res) => {
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

app.delete("/api/alumnos/:id", verifyToken, async (req, res) => {
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

app.get("/api/docentes", verifyToken, async (req, res) => {
  try {
    const snap = await db.collection("docentes").get();
    let resultado = snap.docs.map(withId);

    if (req.query.nombre) {
      const q = req.query.nombre.toLowerCase();
      resultado = resultado.filter(
        (d) => d.nombre.toLowerCase().includes(q) || d.apellido.toLowerCase().includes(q)
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

app.get("/api/docentes/:id", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("docentes").doc(req.params.id).get();
    if (!doc.exists) return fail(res, "Docente no encontrado", 404);
    ok(res, withId(doc));
  } catch (err) {
    fail(res, "Error al buscar el docente: " + err.message, 500);
  }
});

app.post("/api/docentes", verifyToken, async (req, res) => {
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

app.put("/api/docentes/:id", verifyToken, async (req, res) => {
  try {
    const ref = db.collection("docentes").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Docente no encontrado", 404);

    const { id: _ignored, ...cambios } = req.body;
    await ref.update(cambios);
    const actualizado = await ref.get();
    ok(res, withId(actualizado));
  } catch (err) {
    fail(res, "Error al actualizar el docente: " + err.message, 500);
  }
});

app.delete("/api/docentes/:id", verifyToken, async (req, res) => {
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

app.get("/api/materias", verifyToken, async (req, res) => {
  try {
    const snap = await db.collection("materias").get();
    let resultado = snap.docs.map(withId);

    if (req.query.nombre) {
      const q = req.query.nombre.toLowerCase();
      resultado = resultado.filter((m) => m.nombre.toLowerCase().includes(q));
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

app.post("/api/materias", verifyToken, async (req, res) => {
  try {
    const { codigo, nombre, cargaHoraria, cicloLectivo, docenteId } = req.body;
    if (!codigo || !nombre || !cargaHoraria || !cicloLectivo)
      return fail(res, "Faltan campos obligatorios: codigo, nombre, cargaHoraria, cicloLectivo");

    const existe = await db.collection("materias").where("codigo", "==", codigo).limit(1).get();
    if (!existe.empty) return fail(res, "Ya existe una materia con ese código");

    const nuevo = { codigo, nombre, cargaHoraria, cicloLectivo, docenteId: docenteId || null };
    const ref = await db.collection("materias").add(nuevo);
    ok(res, { id: ref.id, ...nuevo }, 201);
  } catch (err) {
    fail(res, "Error al crear la materia: " + err.message, 500);
  }
});

app.put("/api/materias/:id", verifyToken, async (req, res) => {
  try {
    const ref = db.collection("materias").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Materia no encontrada", 404);

    const { id: _ignored, ...cambios } = req.body;
    await ref.update(cambios);
    const actualizado = await ref.get();
    ok(res, withId(actualizado));
  } catch (err) {
    fail(res, "Error al actualizar la materia: " + err.message, 500);
  }
});

app.delete("/api/materias/:id", verifyToken, async (req, res) => {
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

app.post("/api/inscripciones", verifyToken, async (req, res) => {
  try {
    const { alumnoId, materiaId, cicloLectivo, estado = "cursando" } = req.body;
    if (!alumnoId || !materiaId || !cicloLectivo)
      return fail(res, "Faltan campos obligatorios: alumnoId, materiaId, cicloLectivo");

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

app.delete("/api/inscripciones/:id", verifyToken, async (req, res) => {
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

// ─── 404 CATCH-ALL ──────────────────────────────────────────────────────────

app.use((req, res) => fail(res, `Ruta no encontrada: ${req.method} ${req.path}`, 404));

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
app.post("/api/asistencias", verifyToken, async (req, res) => {
  try {
    const { materiaId, fecha, registros } = req.body;

    if (!materiaId || !fecha || !Array.isArray(registros) || registros.length === 0) {
      return fail(res, "Faltan campos obligatorios: materiaId, fecha, registros (array)");
    }

    const materiaDoc = await db.collection("materias").doc(materiaId).get();
    if (!materiaDoc.exists) return fail(res, "Materia no encontrada");

    const batch = db.batch();
    const guardados = [];

    for (const registro of registros) {
      const { alumnoId, estado } = registro;
      if (!alumnoId || !estado) continue;

      const existente = await db.collection("asistencias")
        .where("alumnoId", "==", alumnoId)
        .where("materiaId", "==", materiaId)
        .where("fecha", "==", fecha)
        .limit(1)
        .get();

      const data = { alumnoId, materiaId, fecha, estado };

      if (!existente.empty) {
        const ref = existente.docs[0].ref;
        batch.set(ref, data);
        guardados.push({ id: ref.id, ...data });
      } else {
        const ref = db.collection("asistencias").doc();
        batch.set(ref, data);
        guardados.push({ id: ref.id, ...data });
      }
    }

    await batch.commit();
    ok(res, guardados, 201);
  } catch (err) {
    fail(res, "Error al guardar la asistencia: " + err.message, 500);
  }
});

// ─── INICIO ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n NovaSYS API corriendo en http://localhost:${PORT}`);
  console.log("Datos servidos desde Firestore (colecciones: alumnos, docentes, materias, inscripciones, usuarios)\n");
});