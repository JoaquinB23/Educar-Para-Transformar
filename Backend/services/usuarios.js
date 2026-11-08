// Backend/services/usuarios.js
const { db } = require("../firebaseAdmin");

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

module.exports = { buscarTutoresDe };
