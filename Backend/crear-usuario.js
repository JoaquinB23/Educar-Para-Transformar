// Backend/crear-usuario.js
// Uso: node crear-usuario.js
// Crea el usuario en Firebase Auth + su registro institucional (si aplica)
// + su perfil en la colección 'usuarios', todo en un solo paso.
//
// El esquema del perfil es el mismo que usa POST /api/admin/usuarios, así que
// las cuentas creadas por acá y por el panel web son indistinguibles.

require("dotenv").config();
const readline = require("readline/promises");
const { auth, db } = require("./firebaseAdmin");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const ROLES = ["admin", "alumno", "docente", "familia"];
// Roles que necesitan nivel educativo (primaria/secundaria).
const ROLES_CON_NIVEL = ["alumno", "docente"];
const PREFIJOS = { admin: "AD", alumno: "A", docente: "D", familia: "T" };

const pregunta = async (texto) => (await rl.question(texto)).trim();

async function elegirDeLista(coleccion, etiqueta) {
  const snap = await db.collection(coleccion).get();
  if (snap.empty) {
    console.log(`(No hay ningún ${etiqueta} cargado todavía, se deja sin vincular)`);
    return null;
  }

  console.log(`\n${etiqueta}s disponibles:`);
  const docs = snap.docs;
  docs.forEach((doc, i) => {
    const d = doc.data();
    console.log(`  ${i + 1}. ${d.nombre} ${d.apellido || ""} (${d.legajo || "sin legajo"})`);
  });
  console.log(`  0. Ninguno / omitir`);

  const eleccion = await pregunta(`Elegí el número del ${etiqueta}: `);
  const idx = Number(eleccion) - 1;
  if (idx < 0 || idx >= docs.length) return null;
  return docs[idx].id;
}

async function elegirMateriasParaDocente() {
  const snap = await db.collection("materias").get();
  if (snap.empty) {
    console.log("(No hay materias cargadas todavía, se deja sin asignar)");
    return [];
  }

  console.log("\nMaterias disponibles:");
  const docs = snap.docs;
  docs.forEach((doc, i) => {
    const d = doc.data();
    const yaAsignada = d.docenteId ? " (ya tiene docente asignado)" : "";
    console.log(`  ${i + 1}. ${d.codigo} — ${d.nombre}${yaAsignada}`);
  });
  console.log("  0. Ninguna / omitir");

  const eleccion = await pregunta(
    "Elegí los números de las materias a cargo (separados por coma, ej. 1,3): "
  );
  if (!eleccion || eleccion === "0") return [];

  const indices = eleccion
    .split(",")
    .map((n) => Number(n.trim()) - 1)
    .filter((i) => i >= 0 && i < docs.length);

  return indices.map((i) => docs[i].id);
}

// Si el usuario no escribe legajo le armamos uno con el prefijo del rol y un
// correlativo de 3 dígitos, y avisamos por si quiere cambiarlo.
async function legajoSugerido(rol, nombre) {
  const coleccion = rol === "alumno" ? "alumnos" : "docentes";
  const snap = await db.collection(coleccion).get();
  const prefijo = PREFIJOS[rol] || "X";

  let mayor = 0;
  for (const doc of snap.docs) {
    const n = Number(String(doc.data().legajo || "").replace(/\D/g, ""));
    if (Number.isFinite(n) && n > mayor) mayor = n;
  }
  const sugerido = `${prefijo}${String(mayor + 1).padStart(3, "0")}`;
  console.log(`  (Sugerido: ${sugerido} — para ${nombre})`);
  return sugerido;
}

async function main() {
  console.log("=== Crear usuario — Educar para Transformar ===\n");

  const rol = (await pregunta(`Rol [${ROLES.join("/")}]: `)).toLowerCase();
  if (!ROLES.includes(rol)) {
    console.error(`Rol inválido. Usá: ${ROLES.join(", ")}.`);
    process.exit(1);
  }

  const dni = await pregunta("DNI: ");
  const password = await pregunta("Contraseña: ");
  const nombre = (await pregunta("Nombre: ")).trim();
  const apellido = (await pregunta("Apellido: ")).trim();

  if (!dni || !password || !nombre || !apellido) {
    console.error("Faltan datos obligatorios (DNI, contraseña, nombre y apellido).");
    process.exit(1);
  }

  let nivel = null;
  if (ROLES_CON_NIVEL.includes(rol)) {
    nivel = (await pregunta("Nivel [primaria/secundaria]: ")).toLowerCase();
    if (!["primaria", "secundaria"].includes(nivel)) {
      console.error("Nivel inválido. Usá: primaria o secundaria.");
      process.exit(1);
    }
  }

  const email = `${dni}@escuela.edu.ar`;

  let legajo = null;
  if (rol === "alumno" || rol === "docente") {
    legajo = (await pregunta("Legajo: ")).toUpperCase()
      || await legajoSugerido(rol, nombre);
  }

  console.log(`\nCreando usuario en Firebase Auth (${email})...`);
  const userRecord = await auth.createUser({ email, password });
  console.log(`✅ Usuario creado. UID: ${userRecord.uid}`);

  let alumnoId = null;
  let docenteId = null;
  let hijoPrimariaId = null;
  let hijoSecundariaId = null;

  if (rol === "alumno") {
    const nuevo = { legajo, nombre, apellido, email, estado: "activo" };
    const ref = await db.collection("alumnos").add(nuevo);
    alumnoId = ref.id;
    console.log(`✅ Registro de alumno creado en Firestore (id: ${ref.id}, legajo: ${legajo})`);
  }

  if (rol === "docente") {
    console.log("\nAsignación de materias (podés dejarla vacía y cargarla después):");
    const materiasSeleccionadas = await elegirMateriasParaDocente();

    const nuevo = {
      legajo,
      nombre,
      apellido,
      email,
      materiasACargo: materiasSeleccionadas,
      estado: "activo",
    };
    const ref = await db.collection("docentes").add(nuevo);
    docenteId = ref.id;
    console.log(`✅ Registro de docente creado en Firestore (id: ${ref.id}, legajo: ${legajo})`);

    if (materiasSeleccionadas.length > 0) {
      const batch = db.batch();
      materiasSeleccionadas.forEach((materiaId) => {
        batch.update(db.collection("materias").doc(materiaId), { docenteId: ref.id });
      });
      await batch.commit();
      console.log(`✅ ${materiasSeleccionadas.length} materia(s) asignada(s) a este docente`);
    }
  }

  if (rol === "familia") {
    console.log("\n¿Este tutor tiene un hijo en Primaria?");
    hijoPrimariaId = await elegirDeLista("alumnos", "alumno (para Primaria)");
    console.log("\n¿Este tutor tiene un hijo en Secundaria?");
    hijoSecundariaId = await elegirDeLista("alumnos", "alumno (para Secundaria)");
  }

  if (rol === "admin") {
    console.log("\n⚠️  Vas a crear una cuenta con acceso TOTAL a la API:");
    console.log("    Puede ver y modificar alumnos, docentes, materias, inscripciones,");
    console.log("    calificaciones y fichas médicas. Usala sólo para administración.");
    const confirmacion = (await pregunta("¿Confirmás? [s/N]: ")).toLowerCase();
    if (confirmacion !== "s" && confirmacion !== "si") {
      console.error("Cancelado. No se creó ninguna cuenta.");
      process.exit(1);
    }
  }

  const perfil = {
    uid: userRecord.uid,
    email,
    dni,
    rol,
    nivel,
    nombre,
    apellido,
    actualizadoEn: new Date().toISOString(),
  };
  if (alumnoId) perfil.alumnoId = alumnoId;
  if (docenteId) perfil.docenteId = docenteId;
  if (hijoPrimariaId) perfil.hijoPrimariaId = hijoPrimariaId;
  if (hijoSecundariaId) perfil.hijoSecundariaId = hijoSecundariaId;

  await db.collection("usuarios").doc(userRecord.uid).set(perfil);
  console.log(`✅ Perfil creado en la colección 'usuarios'`);

  console.log("\n=== Listo ===");
  console.log(`Email de login: ${email}`);
  console.log(`DNI a tipear en el form: ${dni}`);
  console.log(`Rol: ${rol}${nivel ? " / Nivel: " + nivel : ""}`);
  if (legajo) console.log(`Legajo: ${legajo}`);
  if (alumnoId) console.log(`alumnoId: ${alumnoId}`);
  if (docenteId) console.log(`docenteId: ${docenteId}`);
  if (hijoPrimariaId) console.log(`hijoPrimariaId: ${hijoPrimariaId}`);
  if (hijoSecundariaId) console.log(`hijoSecundariaId: ${hijoSecundariaId}`);

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  rl.close();
  process.exit(1);
});