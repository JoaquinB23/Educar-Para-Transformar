function puedeVerAlumno(perfil, alumnoId) {
  if (perfil?.rol === "familia") {
    return alumnoId === perfil.hijoPrimariaId || alumnoId === perfil.hijoSecundariaId;
  }
  if (perfil?.rol === "alumno") {
    return alumnoId === perfil.alumnoId;
  }
  return true;
}

module.exports = puedeVerAlumno;
