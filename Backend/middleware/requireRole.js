// Backend/middleware/requireRole.js
// Va SIEMPRE después de verifyToken en la cadena:
//   app.get("/api/alumnos", verifyToken, requireRole("admin"), handler)

/**
 * Fábrica de middleware: corta con 403 si el usuario autenticado
 * no tiene ninguno de los roles indicados.
 *
 *   requireRole("admin")
 *   requireRole("admin", "docente")
 */
function requireRole(...rolesPermitidos) {
  if (rolesPermitidos.length === 0) {
    throw new Error("requireRole necesita al menos un rol");
  }

  const permitidos = rolesPermitidos.map((r) => String(r).toLowerCase());

  return function (req, res, next) {
    // Si verifyToken no corrió o cortó, no hay sesión que validar.
    if (!req.user || !req.user.uid) {
      return res
        .status(401)
        .json({ ok: false, error: "Falta el token de autenticación" });
    }

    // verifyToken deja req.perfil en null cuando el documento de Firestore
    // todavía no existe (usuario recién creado, todavía sin /api/auth/sync).
    if (!req.perfil || !req.perfil.rol) {
      return res
        .status(403)
        .json({ ok: false, error: "Tu usuario no tiene un rol asignado" });
    }

    const rol = String(req.perfil.rol).toLowerCase();

    if (!permitidos.includes(rol)) {
      return res
        .status(403)
        .json({ ok: false, error: "No tenés permisos para acceder a este recurso" });
    }

    // Normalizamos en minúscula para que los handlers puedan comparar
    // con perfil.rol === "docente" sin importar cómo se guardó el alta.
    req.perfil.rol = rol;
    next();
  };
}

module.exports = requireRole;