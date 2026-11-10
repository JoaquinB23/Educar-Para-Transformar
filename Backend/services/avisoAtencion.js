const { db } = require("../firebaseAdmin");

async function buscarTutoresDe(alumnoId) {
  // Replica buscarTutoresDe, que es privada en API_Server.js.
  const [primaria, secundaria] = await Promise.all([
    db.collection("usuarios").where("hijoPrimariaId", "==", alumnoId).get(),
    db.collection("usuarios").where("hijoSecundariaId", "==", alumnoId).get(),
  ]);

  const vistos = new Set();
  const tutores = [];
  for (const snap of [primaria, secundaria]) {
    for (const doc of snap.docs) {
      const datos = doc.data();
      if (datos.rol !== "familia") continue;

      const uid = datos.uid || doc.id;
      if (vistos.has(uid)) continue;
      vistos.add(uid);
      tutores.push({ uid });
    }
  }
  return tutores;
}

async function avisarAtencion({ alumno, atencion }) {
  const tutores = await buscarTutoresDe(alumno.id);
  if (tutores.length === 0) {
    console.warn("[notificaciones] Atención sin tutores vinculados.");
    return 0;
  }

  const batch = db.batch();
  for (const tutor of tutores) {
    const ref = db.collection("notificaciones").doc();
    batch.set(ref, {
      destinatarioUid: tutor.uid,
      tipo: "atencion",
      titulo: "Atención en enfermería",
      mensaje: `Se registró una atención de ${alumno.nombre || "Alumno"} ${alumno.apellido || ""} el ${atencion.fecha}. Consultá el detalle en la app.`,
      alumnoId: alumno.id,
      atencionId: atencion.id,
      fecha: atencion.fecha,
      leida: false,
      creadaEn: new Date().toISOString(),
    });
    // TODO push: cuando exista enviarPush(uid, { titulo, cuerpo, data }) llamarlo acá por cada tutor
  }
  await batch.commit();

  return tutores.length;
}

module.exports = { avisarAtencion };
