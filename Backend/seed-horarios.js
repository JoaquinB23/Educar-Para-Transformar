/**
 * seed-horarios.js
 *
 * Arma la grilla de horarios a partir de las materias que ya están en Firestore.
 * La cargaHoraria de cada materia es anual, así que se la divide entre las
 * semanas lectivas y el resultado se parte en dos módulos por semana, que es
 * como funciona el horario real de una escuela (módulos de 60 a 90 minutos).
 *
 * Es idempotente: sólo crea los bloques de las materias que todavía no tienen
 * ningún horario cargado, así que se puede volver a correr sin duplicar nada.
 *
 *   cd Backend && node seed-horarios.js          → sólo muestra qué haría
 *   cd Backend && node seed-horarios.js --aplicar → escribe en Firestore
 */

require("dotenv").config();
const { db } = require("./firebaseAdmin");

const CICLO_LECTIVO = 2025;
const SEMANAS_LECTIVAS = 32;
const APLICAR = process.argv.includes("--aplicar");

// Franjas horarias posibles. Los huecos de 15 minutos son los de los cambios de
// clase entre módulos. El reparto queda fijo (bloques de 75 a 90 min, con el
// turno tarde después del recreo) para que la grilla sea siempre la misma.
const HORAS = ["08:00", "09:15", "10:30", "11:45", "13:15"];
const DIAS = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes" };
const AULAS = ["A-101", "A-102", "A-201", "LAB-1"];
const FIN_JORNADA = 14 * 60 + 30;

const aMinutos = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};
const aHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const sePisan = (a, b) =>
  a.dia === b.dia && aMinutos(a.horaInicio) < aMinutos(b.horaFin) && aMinutos(b.horaInicio) < aMinutos(a.horaFin);

/** Carga horaria anual → minutos por semana, redondeados a 15. */
function minutosPorSemana(cargaHoraria) {
  const carga = Number(cargaHoraria);
  if (!Number.isFinite(carga) || carga <= 0) return 120;
  return Math.max(60, Math.round((carga / SEMANAS_LECTIVAS) * 60 / 15) * 15);
}

/** Reparte los minutos de la semana en dos módulos parejos. */
function repartirEnDos(minutos) {
  const mitad = Math.round(minutos / 2 / 15) * 15;
  return [mitad, minutos - mitad];
}

/**
 * Dos bloques se pisan si comparten día y franja, y además coincidirían en aula,
 * en docente o en algún alumno. Lo último es lo que impide que un alumno tenga
 * dos materias en el mismo horario.
 */
function choca(cand, materia, bloque, alumnosPorMateria) {
  if (!sePisan(cand, bloque)) return false;
  if (cand.aula && bloque.aula === cand.aula) return true;
  if (materia.docenteId && bloque.docenteId === materia.docenteId) return true;
  const mios = alumnosPorMateria.get(materia.id) || [];
  const suyos = bloque.alumnos || [];
  return mios.some((a) => suyos.includes(a));
}

/**
 * Primer día + hora + aula libre. Los días se recorren de menor a mayor carga
 * para que la grilla quede repartida en vez de acumulada en el lunes.
 */
function buscarEspacio(duracion, materia, ocupados, cargaPorDia, alumnosPorMateria) {
  const diasOrdenados = [1, 2, 3, 4, 5].sort((a, b) => cargaPorDia[a] - cargaPorDia[b]);

  for (const dia of diasOrdenados) {
    for (const hora of HORAS) {
      const base = { dia, horaInicio: hora, horaFin: aHHMM(aMinutos(hora) + duracion) };
      if (aMinutos(base.horaFin) > FIN_JORNADA) continue;
      for (const aula of AULAS) {
        const cand = { ...base, aula };
        if (!ocupados.some((b) => choca(cand, materia, b, alumnosPorMateria))) return cand;
      }
    }
  }
  return null;
}

(async () => {
  console.log(`Ciclo lectivo ${CICLO_LECTIVO} — ${SEMANAS_LECTIVAS} semanas\n`);

  const materiasSnap = await db.collection("materias").where("cicloLectivo", "==", CICLO_LECTIVO).get();
  if (materiasSnap.empty) {
    console.log("No hay materias del ciclo. Corré seed.js primero o cargá materias desde el panel.");
    process.exit(0);
  }

  // Alumnos inscriptos por materia: un alumno no puede estar en dos materias
  // en el mismo horario.
  const inscSnap = await db.collection("inscripciones").where("cicloLectivo", "==", CICLO_LECTIVO).get();
  const alumnosPorMateria = new Map();
  for (const d of inscSnap.docs) {
    const { materiaId, alumnoId } = d.data();
    alumnosPorMateria.set(materiaId, [...(alumnosPorMateria.get(materiaId) || []), alumnoId]);
  }

  const horariosSnap = await db.collection("horarios").get();

  // Ocupación global: todos los bloques ya cargados, con los alumnos de su
  // materia resueltos, para poder detectar choques de cualquier tipo.
  const ocupados = horariosSnap.docs.map((d) => {
    const h = d.data();
    return { ...h, alumnos: alumnosPorMateria.get(h.materiaId) || [] };
  });

  const cargaPorDia = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const h of ocupados) if (cargaPorDia[h.dia] !== undefined) cargaPorDia[h.dia] += 1;

  const nuevos = [];
  const saltadas = [];

  // Por código, así la grilla siempre queda en el mismo orden.
  const materias = materiasSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));

  for (const materia of materias) {
    const yaCargados = ocupados.filter((h) => h.materiaId === materia.id);
    if (yaCargados.length > 0) {
      saltadas.push(`${materia.codigo} ${materia.nombre}: ya tiene ${yaCargados.length} bloque(s)`);
      continue;
    }

    const porSemana = minutosPorSemana(materia.cargaHoraria);
    let completo = true;

    for (const duracion of repartirEnDos(porSemana)) {
      const espacio = buscarEspacio(duracion, materia, ocupados, cargaPorDia, alumnosPorMateria);
      if (!espacio) {
        console.log(`  ! ${materia.codigo}: no quedó lugar libre para un módulo de ${duracion} min.`);
        completo = false;
        break;
      }

      // El bloque se agrega a `ocupados` para que las materias siguientes lo vean.
      ocupados.push({ ...espacio, materiaId: materia.id, docenteId: materia.docenteId || null, alumnos: alumnosPorMateria.get(materia.id) || [] });
      cargaPorDia[espacio.dia] += 1;

      nuevos.push({
        materiaId: materia.id,
        dia: espacio.dia,
        horaInicio: espacio.horaInicio,
        horaFin: espacio.horaFin,
        aula: espacio.aula,
        docenteId: materia.docenteId || null,
        cicloLectivo: CICLO_LECTIVO,
        creadoEn: new Date().toISOString(),
      });
    }

    if (!completo) {
      // Si no entró la materia completa, no dejamos la mitad cargada.
      for (let i = nuevos.length - 1; i >= 0 && nuevos[i].materiaId === materia.id; i--) nuevos.pop();
    }
  }

  console.log(`Materias del ciclo: ${materias.length}`);
  console.log(`Bloques nuevos:     ${nuevos.length}`);
  if (saltadas.length > 0) {
    console.log(`\nSin tocar (ya tenían horario):`);
    saltadas.forEach((s) => console.log(`  - ${s}`));
  }

  console.log("\nGrilla resultante:");
  for (const n of nuevos.sort((a, b) => {
    const ma = materias.find((m) => m.id === a.materiaId);
    const mb = materias.find((m) => m.id === b.materiaId);
    return String(ma.codigo).localeCompare(String(mb.codigo))
      || a.dia - b.dia || aMinutos(a.horaInicio) - aMinutos(b.horaInicio);
  })) {
    const m = materias.find((x) => x.id === n.materiaId);
    const sem = minutosPorSemana(m.cargaHoraria);
    console.log(
      `  ${m.codigo} ${m.nombre.padEnd(18)} ${DIAS[n.dia].padEnd(10)} ` +
      `${n.horaInicio}-${n.horaFin}  aula ${n.aula || "—"}  (${m.cargaHoraria}h anuales = ${sem} min/sem)`
    );
  }

  if (!APLICAR) {
    console.log("\nNada escrito. Si la grilla está bien, corré:  node seed-horarios.js --aplicar");
    process.exit(0);
  }

  if (nuevos.length === 0) {
    console.log("\nNo hay bloques nuevos que escribir.");
    process.exit(0);
  }

  const lote = db.batch();
  for (const n of nuevos) lote.set(db.collection("horarios").doc(), n);
  await lote.commit();

  console.log(`\nListo: ${nuevos.length} bloques escritos en la colección "horarios".`);
  process.exit(0);
})().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
