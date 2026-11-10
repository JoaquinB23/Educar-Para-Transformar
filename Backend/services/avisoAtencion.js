// Backend/services/avisoAtencion.js
const { db } = require("../firebaseAdmin");

const { enviarPush, TEXTO_PUSH_GENERICO } = require("./push");
const { buscarTutoresDe } = require("./usuarios");

// Crea el aviso en `notificaciones` y dispara el push genérico. El documento
// guardado no incluye diagnóstico, motivo ni tratamiento: eso queda sólo en la
// ficha médica, que se consulta desde la app.
async function avisarAtencion({ alumno, atencion }) {
  const alumnoId = alumno && alumno.id;
  if (!alumnoId || !atencion || !atencion.id) {
    return { generadas: 0, sinTutor: [] };
  }

  const tutores = await buscarTutoresDe(alumnoId);
  if (tutores.length === 0) {
    console.warn(`[notificaciones] alumno ${alumnoId} sin tutor vinculado para aviso de atención`);
    return { generadas: 0, sinTutor: [alumnoId] };
  }

  const nombre = [alumno.nombre, alumno.apellido].filter(Boolean).join(" ") || "el alumno";
  const avisos = tutores.map((tutor) => ({
    destinatarioUid: tutor.uid,
    tipo: "atencion",
    titulo: "Atención en enfermería",
    mensaje: `Se registró una atención de ${nombre} el ${atencion.fecha}. Consultá el detalle en la app.`,
    alumnoId,
    atencionId: atencion.id,
    fecha: atencion.fecha,
    leida: false,
    creadaEn: new Date().toISOString(),
  }));

  const batch = db.batch();
  const refs = avisos.map(() => db.collection("notificaciones").doc());
  refs.forEach((ref, i) => batch.set(ref, avisos[i]));
  await batch.commit();

  await Promise.allSettled(
    tutores.map((tutor) => enviarPush(tutor.uid, TEXTO_PUSH_GENERICO)),
  );

  return { generadas: avisos.length, sinTutor: [] };
}

module.exports = { avisarAtencion };
