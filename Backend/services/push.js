// Backend/services/push.js
const crypto = require("crypto");

const { admin, db } = require("../firebaseAdmin");

const COLECCION_TOKENS = "pushTokens";
const TITULO_PUSH = "Educar para Transformar";
const TEXTO_PUSH_GENERICO = "Hay una novedad sobre su hijo/a. Abrí la app para verla.";
const DESTINO_NOTIFICACIONES = "notificaciones";
const CANAL_ANDROID = "default";
// Un FCM lento no debe demorar la respuesta al docente: la operación de
// negocio ya está guardada cuando se llama a enviarPush.
const TIMEOUT_ENVIO_MS = 4000;

function conTimeout(promesa, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`FCM no respondió en ${ms} ms`)), ms);
  });
  return Promise.race([promesa, timeout]).finally(() => clearTimeout(timer));
}

// El ID del documento es el hash del token: el token no aparece en rutas ni en
// logs de Firestore, y el upsert reasigna el mismo dispositivo a otro usuario.
function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function tokensDeUsuario(uid) {
  const snap = await db.collection(COLECCION_TOKENS).where("uid", "==", uid).get();
  return snap.docs.map((doc) => ({ id: doc.id, token: doc.data().token }));
}

// Envía un push genérico. Nunca lanza: si FCM falla, la operación de negocio
// (asistencia, atención) ya quedó guardada y no se revierte por el aviso.
async function enviarPush(usuario, texto) {
  const uid = typeof usuario === "string" ? usuario : usuario && usuario.uid;
  if (!uid) return { enviados: 0, motivo: "sin-uid" };
  if (typeof texto !== "string" || texto.trim() === "") {
    return { enviados: 0, motivo: "sin-texto" };
  }

  try {
    const tokens = await tokensDeUsuario(uid);
    if (tokens.length === 0) return { enviados: 0, motivo: "sin-token" };

    const respuesta = await conTimeout(
      admin.messaging().sendEachForMulticast({
        tokens: tokens.map((t) => t.token),
        notification: { title: TITULO_PUSH, body: texto },
        data: { destino: DESTINO_NOTIFICACIONES },
        android: {
          priority: "high",
          notification: { channelId: CANAL_ANDROID },
        },
      }),
      TIMEOUT_ENVIO_MS,
    );

    const invalidos = [];
    (respuesta.responses || []).forEach((r, i) => {
      const codigo = r && r.error && r.error.code;
      if (
        codigo === "messaging/registration-token-not-registered" ||
        codigo === "messaging/invalid-registration-token"
      ) {
        invalidos.push(tokens[i].id);
      }
    });
    await Promise.all(
      invalidos.map((id) => db.collection(COLECCION_TOKENS).doc(id).delete()),
    );

    const resultado = {
      enviados: respuesta.successCount,
      fallidos: respuesta.failureCount,
      tokensEliminados: invalidos.length,
    };

    if (resultado.enviados > 0) {
      console.log(
        `[push] enviados: ${resultado.enviados}, fallidos: ${resultado.fallidos}, tokensEliminados: ${resultado.tokensEliminados} (uid ${uid})`,
      );
    }

    return resultado;
  } catch (err) {
    console.warn(`[push] No se pudo enviar a ${uid}: ${err.message}`);
    return { enviados: 0, motivo: "error", error: err.message };
  }
}

module.exports = {
  COLECCION_TOKENS,
  DESTINO_NOTIFICACIONES,
  TEXTO_PUSH_GENERICO,
  TIMEOUT_ENVIO_MS,
  TITULO_PUSH,
  enviarPush,
  hashToken,
};
