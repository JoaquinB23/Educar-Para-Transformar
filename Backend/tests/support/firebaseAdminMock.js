/* global module */
const colecciones = new Map();
const tokens = new Map();
let siguienteId = 0;

function clonar(valor) {
  return valor === undefined ? undefined : JSON.parse(JSON.stringify(valor));
}

function mapaColeccion(nombre) {
  if (!colecciones.has(nombre)) colecciones.set(nombre, new Map());
  return colecciones.get(nombre);
}

class ReferenciaDocumento {
  constructor(nombreColeccion, id) {
    this.nombreColeccion = nombreColeccion;
    this.id = id || `test-${++siguienteId}`;
  }

  async get() {
    const data = mapaColeccion(this.nombreColeccion).get(this.id);
    return {
      id: this.id,
      exists: data !== undefined,
      data: () => clonar(data),
    };
  }

  async set(data) {
    mapaColeccion(this.nombreColeccion).set(this.id, clonar(data));
  }

  async update(cambios) {
    const actual = mapaColeccion(this.nombreColeccion).get(this.id);
    if (actual === undefined) throw new Error(`Documento inexistente: ${this.id}`);
    mapaColeccion(this.nombreColeccion).set(this.id, { ...actual, ...clonar(cambios) });
  }

  async delete() {
    mapaColeccion(this.nombreColeccion).delete(this.id);
  }

  collection(nombre) {
    return {
      doc: (id) => new ReferenciaDocumento(`${this.nombreColeccion}/${this.id}/${nombre}`, id),
    };
  }
}

class Consulta {
  constructor(nombreColeccion, filtros = []) {
    this.nombreColeccion = nombreColeccion;
    this.filtros = filtros;
  }

  where(campo, operador, valor) {
    if (operador !== '==') throw new Error(`Operador no soportado: ${operador}`);
    return new Consulta(this.nombreColeccion, [...this.filtros, [campo, valor]]);
  }

  limit() {
    return this;
  }

  async get() {
    const docs = [...mapaColeccion(this.nombreColeccion)].filter(([, data]) =>
      this.filtros.every(([campo, valor]) =>
        Object.entries(data).some(([nombre, actual]) => nombre === campo && actual === valor),
      ),
    );
    return {
      docs: docs.map(([id, data]) => ({
        id,
        data: () => clonar(data),
      })),
      empty: docs.length === 0,
      size: docs.length,
    };
  }
}

function collection(nombre) {
  return {
    doc: (id) => new ReferenciaDocumento(nombre, id),
    where: (campo, operador, valor) => new Consulta(nombre).where(campo, operador, valor),
    async add(data) {
      const referencia = new ReferenciaDocumento(nombre);
      await referencia.set(data);
      return referencia;
    },
    async get() {
      return new Consulta(nombre).get();
    },
  };
}

module.exports = {
  db: {
    collection,
    reset() {
      colecciones.clear();
      tokens.clear();
      siguienteId = 0;
    },
    set(nombreColeccion, id, data) {
      mapaColeccion(nombreColeccion).set(id, clonar(data));
    },
  },
  auth: {
    async verifyIdToken(token) {
      const decoded = tokens.get(token);
      if (!decoded) throw new Error('Token de prueba inválido');
      return decoded;
    },
    token(uid) {
      const token = `token-${uid}`;
      tokens.set(token, { uid, email: `${uid}@test.invalid` });
      return token;
    },
  },
};
