// Backend/middleware/verifyToken.js
const { auth, db } = require("../firebaseAdmin");

/**
 * Espera el header: Authorization: Bearer <idToken>
 * Si es válido, cuelga la info del usuario en req.user,
 * deja su perfil de la colección `usuarios` en req.perfil y sigue.
 * Si no, corta con 401.
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res
      .status(401)
      .json({ ok: false, error: "Falta el token de autenticación" });
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch (err) {
    return res
      .status(401)
      .json({ ok: false, error: "Token inválido o expirado" });
  }

  req.user = {
    uid: decoded.uid,
    email: decoded.email || null,
  };

  // El perfil puede no existir todavía (usuario recién creado, todavía sin
  // pasar por /api/auth/sync), así que acá NO cortamos la cadena: lo dejamos
  // en null y deja que requireRole decida. Si el read revienta por otra
  // razón (Firestore caído), cortamos con 500 en vez de colgar la request.
  try {
    const snap = await db.collection("usuarios").doc(decoded.uid).get();
    req.perfil = snap.exists ? snap.data() : null;
  } catch (err) {
    return res
      .status(500)
      .json({ ok: false, error: "No se pudo leer el perfil del usuario: " + err.message });
  }

  next();
}

module.exports = verifyToken;