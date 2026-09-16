// Backend/middleware/verifyToken.js
const { auth } = require("../firebaseAdmin");

/**
 * Espera el header: Authorization: Bearer <idToken>
 * Si es válido, cuelga la info del usuario en req.user y sigue.
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

  try {
    const decoded = await auth.verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
    };
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ ok: false, error: "Token inválido o expirado" });
  }
}

module.exports = verifyToken;