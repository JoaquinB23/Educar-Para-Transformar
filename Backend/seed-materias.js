// Backend/seed-materias.js
// Carga la oferta académica que describe el propio sitio (primario.html,
// secundario.html e index.html) y le asigna el nivel a las materias que ya
// existían.
//
// Contexto: el gráfico "Materias por nivel" del panel venía mostrando
// "sin nivel" en todas porque `materias` no tenía el campo `nivel`. Nadie
// sabía qué nivel tenía cada materia, así que no se inventa nada a ciegas: acá
// el nivel sale de las áreas que el propio sitio publica para cada nivel y
// queda todo editable desde admin-materias.html.
//
// Uso:  node seed-materias.js          (no hace nada si ya están cargadas)
//       node seed-materias.js --reset  (borra las de este script y las vuelve a crear)

const { db } = require("./firebaseAdmin");

const CICLO = 2025;
const reset = process.argv.includes("--reset");

// Docentes que ya existen en la institución.
const DOC = {
  ana: "4tYQpi02PuKH8mroIUnn",      // D001 Ana López
  mayra: "8F0hYRLFknmQaVOrNluH",    // D005 Mayra Mendoza
  carlos: "AgtHlP1pvE2PzGoN0JtD",   // D002 Carlos Martínez
};

// Para poder imprimir el nombre del docente en el reporte.
const NOMBRE_DOC = Object.fromEntries(Object.entries(DOC).map(([k, v]) => [v, k]));

// Nivel de las 4 materias que ya estaban cargadas. No había dato: se asigna por
// coherencia con el nombre y con el nivel del docente que las da.
const NIVEL_EXISTENTES = {
  M001: "primaria",    // Programación I      → Alfabetización Digital
  M002: "primaria",    // Base de Datos I     → Alfabetización Digital
  M003: "secundaria",  // Programación III    → Tecnología y Programación
  M004: "primaria",    // Matematicas I       → Pensamiento Lógico
};

// Oferta académica del sitio. `docente: null` queda sin asignar: son las que
// necesitan docentes nuevos, que es justo lo que hay que contratar.
const NUEVAS = [
  // ── Nivel Primario (las 5 áreas de primario.html + idiomas y deportes) ──
  { codigo: "M005", nombre: "Pensamiento Lógico",        cargaHoraria: 90, nivel: "primaria", docenteId: DOC.mayra },
  { codigo: "M006", nombre: "Indagación Científica",       cargaHoraria: 90, nivel: "primaria", docenteId: null },
  { codigo: "M007", nombre: "Alfabetización Digital",      cargaHoraria: 80, nivel: "primaria", docenteId: DOC.ana },
  { codigo: "M008", nombre: "Trabajo Colaborativo",        cargaHoraria: 60, nivel: "primaria", docenteId: null },
  { codigo: "M009", nombre: "Gestión y Seguimiento 360",   cargaHoraria: 60, nivel: "primaria", docenteId: null },
  { codigo: "M010", nombre: "Educación Física y Deportes", cargaHoraria: 60, nivel: "primaria", docenteId: DOC.carlos },
  { codigo: "M011", nombre: "Inglés",                      cargaHoraria: 80, nivel: "primaria", docenteId: null },
  { codigo: "M012", nombre: "Francés",                     cargaHoraria: 60, nivel: "primaria", docenteId: null },

  // ── Nivel Secundario (las 5 áreas de secundario.html + idiomas y deportes) ──
  { codigo: "M013", nombre: "Habilidades del Ciclo Básico", cargaHoraria: 90, nivel: "secundaria", docenteId: DOC.mayra },
  { codigo: "M014", nombre: "Economía y Administración",     cargaHoraria: 80, nivel: "secundaria", docenteId: null },
  { codigo: "M015", nombre: "Tecnología y Programación",    cargaHoraria: 90, nivel: "secundaria", docenteId: DOC.ana },
  { codigo: "M016", nombre: "Ciencias Sociales",            cargaHoraria: 80, nivel: "secundaria", docenteId: DOC.carlos },
  { codigo: "M017", nombre: "Química y Salud",              cargaHoraria: 90, nivel: "secundaria", docenteId: DOC.mayra },
  { codigo: "M018", nombre: "Educación Física y Deportes",  cargaHoraria: 60, nivel: "secundaria", docenteId: DOC.carlos },
  { codigo: "M019", nombre: "Inglés",                       cargaHoraria: 80, nivel: "secundaria", docenteId: null },
  { codigo: "M020", nombre: "Portugués Regional",           cargaHoraria: 60, nivel: "secundaria", docenteId: null },
];

(async () => {
  const snap = await db.collection("materias").get();
  const porCodigo = new Map(snap.docs.map((d) => [d.data().codigo, d]));

  // El nivel tiene que existir como canónico, si no el dashboard cuenta basura.
  const NIVELES = ["primaria", "secundaria"];
  for (const m of NUEVAS) {
    if (!NIVELES.includes(m.nivel)) throw new Error(`Nivel inválido en ${m.codigo}: ${m.nivel}`);
  }

  if (reset) {
    // Primero se junta todo lo que se va a tocar y se revisa que nada dependa de
    // esas materias. Recién después se borra, así un conflicto no deja la
    // colección a medias.
    const aBorrar = [];
    for (const m of NUEVAS) {
      const doc = porCodigo.get(m.codigo);
      // Sólo se borra lo que este script creó: si alguien cargó el código a mano
      // con otros datos, se respeta.
      if (doc && doc.data().nombre === m.nombre) aBorrar.push({ m, doc });
    }

    // Una materia nueva se crea con id aleatorio, así que borrarla y recrearla
    // cambia su id. Inscripciones, horarios, calificaciones y asistencias guardan
    // esa referencia, así que si algo las usa el reset dejaría datos apuntando a
    // un id inexistente.
    const CON_DEPENDIENTES = [];
    for (const { m, doc } of aBorrar) {
      const usos = await Promise.all([
        db.collection("inscripciones").where("materiaId", "==", doc.id).limit(1).get(),
        db.collection("horarios").where("materiaId", "==", doc.id).limit(1).get(),
        db.collection("calificaciones").where("materiaId", "==", doc.id).limit(1).get(),
        db.collection("asistencias").where("materiaId", "==", doc.id).limit(1).get(),
      ]);
      if (usos.some((u) => !u.empty)) CON_DEPENDIENTES.push(`${m.codigo} ${m.nombre} (${doc.id})`);
    }

    if (CON_DEPENDIENTES.length) {
      throw new Error(
        `Reset abortado: nada se borró. Estas materias tienen inscripciones, horarios, ` +
        `calificaciones o asistencias, y recrearlas les cambiaría el id y rompería esos datos:\n` +
        CON_DEPENDIENTES.map((c) => `  - ${c}`).join("\n") +
        `\n\nCargalas o corregilas desde admin-materias.html en vez de usar --reset.`
      );
    }

    for (const { m, doc } of aBorrar) {
      await doc.ref.delete();
      // Sacarla del snapshot: si se deja, el paso 2 la ve como "ya existe" y no la
      // vuelve a crear, que es lo que dejaba --reset sin hacer nada.
      porCodigo.delete(m.codigo);
    }
    console.log(`Reset: ${aBorrar.length} materia(s) de este script eliminadas.\n`);
  }

  // ── 1. Nivel de las materias que ya existían ──
  const batchNivel = db.batch();
  let cambios = 0;
  for (const [codigo, nivel] of Object.entries(NIVEL_EXISTENTES)) {
    const doc = porCodigo.get(codigo);
    if (!doc) { console.log(`  (${codigo} no existe, se omite)`); continue; }
    if (doc.data().nivel === nivel) continue;
    batchNivel.update(doc.ref, { nivel });
    cambios++;
    console.log(`  ${codigo} ${doc.data().nombre}: nivel -> ${nivel}`);
  }
  if (cambios) { await batchNivel.commit(); console.log(`\n${cambios} materia(s) existentes niveladas.`); }
  else console.log("Las materias existentes ya tenían nivel.");

  // ── 2. Materias nuevas ──
  const batch = db.batch();
  const aCrear = [];
  let ya_existian = 0;

  for (const m of NUEVAS) {
    const existente = porCodigo.get(m.codigo);
    if (existente) {
      ya_existian++;
      console.log(`  ${m.codigo} ya existe, se omite`);
      continue;
    }
    batch.set(db.collection("materias").doc(), { ...m, cicloLectivo: CICLO, creadoEn: new Date().toISOString() });
    aCrear.push(m);
  }

  if (aCrear.length) {
    await batch.commit();
    console.log(`\n${aCrear.length} materia(s) creadas, ${ya_existian} omitida(s).`);
    for (const m of aCrear) {
      const d = m.docenteId ? NOMBRE_DOC[m.docenteId] : null;
      console.log(`  ${m.codigo}  ${m.nombre.padEnd(32)} ${m.nivel.padEnd(11)} ${d || "SIN DOCENTE"}`);
    }
  } else {
    console.log("\nNo se creó ninguna materia nueva: ya estaban todas cargadas.");
  }

  // ── 3. Resumen ──
  const final = await db.collection("materias").get();
  const docs = final.docs.map((d) => d.data());
  const porNivel = (n) => docs.filter((m) => m.nivel === n).length;
  const sinNivel = docs.filter((m) => !m.nivel).length;
  const sinDocente = docs.filter((m) => !m.docenteId).length;

  console.log(`\n─── Resumen ───`);
  console.log(`Total de materias: ${docs.length}`);
  console.log(`  Primaria:   ${porNivel("primaria")}`);
  console.log(`  Secundaria: ${porNivel("secundaria")}`);
  console.log(`  Sin nivel:  ${sinNivel}`);
  console.log(`  Sin docente asignado: ${sinDocente}`);
  console.log(`\nLas que quedan sin docente necesitan personal docente nuevo, o`);
  console.log(`asignarlas desde admin-materias.html.`);

  process.exit(0);
})();
