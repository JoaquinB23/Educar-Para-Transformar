// Backend/crear-usuario.js
// Uso: node crear-usuario.js
// Crea el usuario en Firebase Auth + su registro institucional (si aplica)
// + su perfil en la colección 'usuarios', todo en un solo paso.

require("dotenv").config();
const readline = require("readline/promises");
const { auth, db } = require("./firebaseAdmin");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

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

async function main() {
  console.log("=== Crear usuario — Educar para Transformar ===\n");

  const rol = (await pregunta("Rol [alumno/docente/familia]: ")).toLowerCase();
  if (!["alumno", "docente", "familia"].includes(rol)) {
    console.error("Rol inválido. Usá: alumno, docente o familia.");
    process.exit(1);
  }

  const dni = await pregunta("DNI: ");
  const password = await pregunta("Contraseña: ");
  const nombreCompleto = await pregunta("Nombre y apellido: ");
  const [nombre, ...resto] = nombreCompleto.split(" ");
  const apellido = resto.join(" ") || "";

  let nivel = null;
  if (rol === "alumno" || rol === "docente") {
    nivel = (await pregunta("Nivel [primaria/secundaria]: ")).toLowerCase();
  }

  const email = `${dni}@escuela.edu.ar`;

  console.log(`\nCreando usuario en Firebase Auth (${email})...`);
  const userRecord = await auth.createUser({ email, password });
  console.log(`✅ Usuario creado. UID: ${userRecord.uid}`);

  let referenciaId = null; // alumnoId o docenteId, según corresponda
  let hijoPrimariaId = null;
  let hijoSecundariaId = null;

  if (rol === "alumno") {
    const legajo = await pregunta("Legajo (ej. A004): ");
    const nuevo = { legajo, nombre, apellido, email, estado: "activo" };
    const ref = await db.collection("alumnos").add(nuevo);
    referenciaId = ref.id;
    console.log(`✅ Registro de alumno creado en Firestore (id: ${ref.id})`);
  }

  if (rol === "docente") {
    const legajo = await pregunta("Legajo (ej. D003): ");
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
    referenciaId = ref.id;
    console.log(`✅ Registro de docente creado en Firestore (id: ${ref.id})`);

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

  const perfil = {
    uid: userRecord.uid,
    email,
    rol,
    nivel,
    nombre: nombreCompleto,
  };
  if (referenciaId && rol === "alumno") perfil.alumnoId = referenciaId;
  if (referenciaId && rol === "docente") perfil.docenteId = referenciaId;
  if (hijoPrimariaId) perfil.hijoPrimariaId = hijoPrimariaId;
  if (hijoSecundariaId) perfil.hijoSecundariaId = hijoSecundariaId;

  await db.collection("usuarios").doc(userRecord.uid).set(perfil);
  console.log(`✅ Perfil creado en la colección 'usuarios'\n`);

  console.log("=== Listo ===");
  console.log(`Email de login: ${email}`);
  console.log(`DNI a tipear en el form: ${dni}`);
  console.log(`Rol: ${rol}${nivel ? " / Nivel: " + nivel : ""}`);

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  rl.close();
  process.exit(1);
});