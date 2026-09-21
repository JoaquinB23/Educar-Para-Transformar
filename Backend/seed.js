// Backend/seed.js
// Corré esto UNA SOLA VEZ para migrar los datos mock a Firestore:
//   node seed.js
//
// Si corrés esto dos veces vas a duplicar los datos (no chequea si ya existen).

require("dotenv").config();
const { db } = require("./firebaseAdmin");

const alumnosMock = [
  { legajo: "A001", nombre: "Lucas", apellido: "Fernández", email: "lucas.fernandez@mail.com", estado: "activo" },
  { legajo: "A002", nombre: "Camila", apellido: "Romero",    email: "camila.romero@mail.com",    estado: "activo" },
  { legajo: "A003", nombre: "Mateo",  apellido: "García",    email: "mateo.garcia@mail.com",     estado: "inactivo" },
];

// docenteId acá es el índice viejo (1, 2) — se traduce a Firestore ID durante el seed
const docentesMock = [
  { _oldId: 1, legajo: "D001", nombre: "Ana",    apellido: "López",    email: "ana.lopez@mail.com",    estado: "activo" },
  { _oldId: 2, legajo: "D002", nombre: "Carlos", apellido: "Martínez", email: "carlos.martinez@mail.com", estado: "activo" },
];

// docenteId referencia el _oldId de arriba
const materiasMock = [
  { _oldId: 1, codigo: "M001", nombre: "Programación I",   cargaHoraria: 80, cicloLectivo: 2025, docenteOldId: 1 },
  { _oldId: 2, codigo: "M002", nombre: "Base de Datos I",  cargaHoraria: 64, cicloLectivo: 2025, docenteOldId: 1 },
  { _oldId: 3, codigo: "M003", nombre: "Programación III", cargaHoraria: 96, cicloLectivo: 2025, docenteOldId: 2 },
];

// alumnoOldId / materiaOldId referencian los índices de arriba
const inscripcionesMock = [
  { alumnoOldId: 1, materiaOldId: 1, cicloLectivo: 2025, estado: "cursando" },
  { alumnoOldId: 1, materiaOldId: 2, cicloLectivo: 2025, estado: "cursando" },
  { alumnoOldId: 2, materiaOldId: 3, cicloLectivo: 2025, estado: "cursando" },
];

async function seed() {
  console.log("Migrando alumnos...");
  const alumnoIdMap = {}; // índice del array mock -> Firestore ID
  for (let i = 0; i < alumnosMock.length; i++) {
    const ref = await db.collection("alumnos").add(alumnosMock[i]);
    alumnoIdMap[i + 1] = ref.id; // los mocks originales usaban id 1, 2, 3...
  }

  console.log("Migrando docentes...");
  const docenteIdMap = {};
  for (const docente of docentesMock) {
    const { _oldId, ...data } = docente;
    const ref = await db.collection("docentes").add(data);
    docenteIdMap[_oldId] = ref.id;
  }

  console.log("Migrando materias...");
  const materiaIdMap = {};
  for (const materia of materiasMock) {
    const { _oldId, docenteOldId, ...data } = materia;
    const ref = await db.collection("materias").add({
      ...data,
      docenteId: docenteIdMap[docenteOldId] || null,
    });
    materiaIdMap[_oldId] = ref.id;
  }

  console.log("Migrando inscripciones...");
  for (const inscripcion of inscripcionesMock) {
    const { alumnoOldId, materiaOldId, ...data } = inscripcion;
    await db.collection("inscripciones").add({
      ...data,
      alumnoId: alumnoIdMap[alumnoOldId],
      materiaId: materiaIdMap[materiaOldId],
    });
  }

  console.log("\n✅ Migración completa.");
  console.log("Mapeo de IDs (por si necesitás referenciarlos a mano):");
  console.log("alumnos:", alumnoIdMap);
  console.log("docentes:", docenteIdMap);
  console.log("materias:", materiaIdMap);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Error en la migración:", err);
  process.exit(1);
});