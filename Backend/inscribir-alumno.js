// Backend/inscribir-alumno.js
// Uso: node inscribir-alumno.js
// Inscribe un alumno en una materia sin necesitar token ni curl a mano.

require("dotenv").config();
const readline = require("readline/promises");
const { db } = require("./firebaseAdmin");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pregunta = async (texto) => (await rl.question(texto)).trim();

async function elegirDeLista(coleccion, etiquetaFn) {
  const snap = await db.collection(coleccion).get();
  if (snap.empty) {
    console.log(`(No hay nada cargado en '${coleccion}' todavía)`);
    return null;
  }

  const docs = snap.docs;
  docs.forEach((doc, i) => {
    console.log(`  ${i + 1}. ${etiquetaFn(doc.data())}`);
  });

  const eleccion = await pregunta("Elegí un número: ");
  const idx = Number(eleccion) - 1;
  if (idx < 0 || idx >= docs.length) return null;
  return docs[idx].id;
}

async function main() {
  console.log("=== Inscribir alumno en una materia ===\n");

  console.log("Alumnos:");
  const alumnoId = await elegirDeLista(
    "alumnos",
    (a) => `${a.legajo} — ${a.nombre} ${a.apellido}`
  );
  if (!alumnoId) {
    console.log("No se eligió alumno. Cancelado.");
    process.exit(0);
  }

  console.log("\nMaterias:");
  const materiaId = await elegirDeLista(
    "materias",
    (m) => `${m.codigo} — ${m.nombre}`
  );
  if (!materiaId) {
    console.log("No se eligió materia. Cancelado.");
    process.exit(0);
  }

  const cicloLectivo = Number(await pregunta("\nCiclo lectivo (ej. 2026): "));
  const estado = (await pregunta("Estado [cursando/aprobada/libre] (default: cursando): ")) || "cursando";

  const yaExiste = await db.collection("inscripciones")
    .where("alumnoId", "==", alumnoId)
    .where("materiaId", "==", materiaId)
    .where("cicloLectivo", "==", cicloLectivo)
    .limit(1)
    .get();

  if (!yaExiste.empty) {
    console.log("\n⚠️  Este alumno ya está inscripto en esa materia para ese ciclo lectivo. No se creó nada nuevo.");
    rl.close();
    process.exit(0);
  }

  const ref = await db.collection("inscripciones").add({
    alumnoId,
    materiaId,
    cicloLectivo,
    estado,
  });

  console.log(`\n✅ Inscripción creada (id: ${ref.id})`);
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  rl.close();
  process.exit(1);
});