/**
 * WorldModel.js - Tipos de datos del mundo del juego (Habilidad, Zona,
 * Mecanismo_Ambiental, Libro_de_Conocimiento) y validador de esquema de
 * carga.
 *
 * Este módulo no depende de Three.js ni de ningún estado global: define
 * únicamente typedefs (documentación de forma, sin efecto en runtime) y
 * funciones puras de validación, pensadas para poder testearse con
 * property-based testing (fast-check) sin necesidad de instanciar nada.
 *
 * Referencia: design.md, sección "Data Models".
 */

/**
 * Identificador de una Habilidad del catálogo fijo del MVP.
 *
 * @typedef {'python' | 'javascript' | 'sql'} HabilidadId
 */

/**
 * Capacidad permanente que Codi obtiene al absorber un Libro_de_Conocimiento.
 *
 * @typedef {Object} Habilidad
 * @property {HabilidadId} id
 * @property {string} nombre - Nombre visible, p. ej. "Python", "JavaScript", "SQL".
 * @property {string} descripcionUso - Texto corto mostrado en el mensaje de absorción (Requisito 3.3).
 */

/**
 * Tipo concreto de un Mecanismo_Ambiental. Cada tipo pertenece a exactamente
 * una Habilidad (ver comentario junto a cada valor).
 *
 * @typedef {'puente' | 'solucion-automatizada' | 'dispositivo' | 'plataforma-movil' | 'camino-oculto' | 'fuente-informacion'} TipoMecanismo
 */

/**
 * Estado de la máquina de dos valores compartida por todos los tipos de
 * Mecanismo_Ambiental.
 *
 * @typedef {'bloqueado' | 'resuelto'} EstadoMecanismo
 */

/**
 * Vector 3D simple, sin dependencia de THREE.Vector3, para mantener este
 * módulo puro y fácilmente testeable.
 *
 * @typedef {Object} Vector3
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */

/**
 * Elemento del entorno que puede ser transformado, revelado o activado
 * mediante una Habilidad específica.
 *
 * @typedef {Object} MecanismoAmbiental
 * @property {string} id
 * @property {TipoMecanismo} tipo
 * @property {HabilidadId} habilidadRequerida - Exactamente una (Requisito funcional 6).
 * @property {string} zonaId
 * @property {EstadoMecanismo} estado
 * @property {Vector3} posicion
 * @property {Vector3} [puntoA] - Usado por 'plataforma-movil' / 'puente'.
 * @property {Vector3} [puntoB] - Usado por 'plataforma-movil' / 'puente'.
 * @property {string} [objetivoRevelacionId] - Usado por 'camino-oculto': id del objeto de escena a mostrar.
 */

/**
 * Subdivisión navegable de la Isla que agrupa uno o más Mecanismos_Ambientales
 * y, opcionalmente, un Libro_de_Conocimiento.
 *
 * @typedef {Object} Zona
 * @property {string} id
 * @property {string} nombre
 * @property {HabilidadId[]} habilidadesRequeridas - `[]`, 1, o 3 (Zona del Desafio_Final).
 * @property {string[]} mecanismoIds
 * @property {string} [libroId] - Opcional: no toda Zona tiene un Libro_de_Conocimiento.
 * @property {{ min: Vector3, max: Vector3 }} limites - AABB grueso de la zona, usado para el gating espacial.
 */

/**
 * Objeto interactivo del mundo que representa un lenguaje de programación.
 *
 * @typedef {Object} LibroConocimiento
 * @property {string} id
 * @property {HabilidadId} habilidadId
 * @property {string} zonaId
 * @property {Vector3} posicion
 * @property {boolean} absorbido
 */

/**
 * Estructura completa del mundo cargado, usada como entrada del validador
 * de esquema. Extiende la estructura declarativa de `zones.data.js`.
 *
 * @typedef {Object} ManifiestoMundo
 * @property {Habilidad[]} habilidades
 * @property {Zona[]} zonas
 * @property {MecanismoAmbiental[]} mecanismos
 * @property {LibroConocimiento[]} libros
 */

/**
 * Resultado de una validación de esquema.
 *
 * @typedef {Object} ResultadoValidacion
 * @property {boolean} valido
 * @property {string[]} errores
 */

/**
 * Catálogo fijo de identificadores de Habilidad válidos del MVP. Es la base
 * del invariante de esquema documentado en design.md: "todo
 * MecanismoAmbiental tiene exactamente un habilidadRequerida perteneciente
 * al catálogo de Habilidad" (Requisito funcional 6).
 *
 * @type {HabilidadId[]}
 */
export const HABILIDADES_VALIDAS = ['python', 'javascript', 'sql'];

/**
 * Alias retrocompatible de `HABILIDADES_VALIDAS`, usado internamente por
 * este módulo. Se mantiene como el mismo array (no una copia) para que
 * ambos nombres siempre estén sincronizados.
 *
 * @type {HabilidadId[]}
 */
export const CATALOGO_HABILIDADES_IDS = HABILIDADES_VALIDAS;

/**
 * Lista de los seis tipos de Mecanismo_Ambiental válidos del MVP, dos por
 * cada Habilidad (ver TipoMecanismo).
 *
 * @type {TipoMecanismo[]}
 */
export const TIPOS_MECANISMO_VALIDOS = [
  'puente',
  'solucion-automatizada',
  'dispositivo',
  'plataforma-movil',
  'camino-oculto',
  'fuente-informacion',
];

/**
 * Estados válidos de la máquina de dos valores de un Mecanismo_Ambiental.
 *
 * @type {EstadoMecanismo[]}
 */
export const ESTADOS_MECANISMO_VALIDOS = ['bloqueado', 'resuelto'];

/**
 * Determina si `valor` es exactamente uno de los HabilidadId del catálogo
 * fijo (no `undefined`, no `null`, no un array, no un objeto, no un valor
 * fuera del catálogo).
 *
 * @param {*} valor
 * @returns {boolean}
 */
function esHabilidadIdValida(valor) {
  return typeof valor === 'string' && CATALOGO_HABILIDADES_IDS.includes(valor);
}

/**
 * Valida el invariante de esquema central sobre un Mecanismo_Ambiental: que
 * `habilidadRequerida` sea EXACTAMENTE una Habilidad perteneciente al
 * catálogo fijo (Requisito funcional 6, invariante documentado en
 * design.md junto a la interfaz `MecanismoAmbiental`).
 *
 * Además, como extensión razonable del "validador de esquema de carga"
 * mencionado en la tarea, verifica que:
 *   - los campos básicos requeridos (`id`, `zonaId`, `estado`, `posicion`)
 *     estén presentes;
 *   - `tipo` pertenezca a `TIPOS_MECANISMO_VALIDOS`;
 *   - `estado` pertenezca a `ESTADOS_MECANISMO_VALIDOS`.
 * Estas validaciones adicionales no forman parte del invariante central de
 * `habilidadRequerida` (ese es el foco de Property 14, tarea 8.2), pero son
 * necesarias para que la función cumpla su rol de "validador de esquema de
 * carga" declarado en el título de la tarea 8.1.
 *
 * Esta función es pura: no muta `mecanismo` ni depende de estado externo.
 *
 * @param {MecanismoAmbiental} mecanismo
 * @returns {ResultadoValidacion}
 */
export function validarMecanismoAmbiental(mecanismo) {
  const errores = [];

  if (mecanismo === null || typeof mecanismo !== 'object') {
    return { valido: false, errores: ['El mecanismo debe ser un objeto no nulo.'] };
  }

  // --- Invariante central: exactamente una habilidadRequerida válida. ---
  const { habilidadRequerida } = mecanismo;
  if (habilidadRequerida === undefined) {
    errores.push('habilidadRequerida es requerido y no puede estar ausente.');
  } else if (habilidadRequerida === null) {
    errores.push('habilidadRequerida no puede ser null.');
  } else if (Array.isArray(habilidadRequerida)) {
    errores.push('habilidadRequerida debe ser exactamente una Habilidad, no un array.');
  } else if (!esHabilidadIdValida(habilidadRequerida)) {
    errores.push(
      `habilidadRequerida "${String(habilidadRequerida)}" no pertenece al catálogo de Habilidad (${CATALOGO_HABILIDADES_IDS.join(', ')}).`
    );
  }

  // --- Validaciones adicionales razonables de campos básicos. ---
  if (typeof mecanismo.id !== 'string' || mecanismo.id.length === 0) {
    errores.push('id es requerido y debe ser un string no vacío.');
  }

  if (typeof mecanismo.zonaId !== 'string' || mecanismo.zonaId.length === 0) {
    errores.push('zonaId es requerido y debe ser un string no vacío.');
  }

  if (!ESTADOS_MECANISMO_VALIDOS.includes(mecanismo.estado)) {
    errores.push(
      `estado "${String(mecanismo.estado)}" no es válido (valores permitidos: ${ESTADOS_MECANISMO_VALIDOS.join(', ')}).`
    );
  }

  if (
    mecanismo.posicion === undefined ||
    mecanismo.posicion === null ||
    typeof mecanismo.posicion !== 'object' ||
    typeof mecanismo.posicion.x !== 'number' ||
    typeof mecanismo.posicion.y !== 'number' ||
    typeof mecanismo.posicion.z !== 'number'
  ) {
    errores.push('posicion es requerida y debe tener coordenadas numéricas {x, y, z}.');
  }

  if (mecanismo.tipo !== undefined && !TIPOS_MECANISMO_VALIDOS.includes(mecanismo.tipo)) {
    errores.push(
      `tipo "${String(mecanismo.tipo)}" no pertenece a los tipos de mecanismo válidos (${TIPOS_MECANISMO_VALIDOS.join(', ')}).`
    );
  }

  return { valido: errores.length === 0, errores };
}

/**
 * Valida que `zonaId` referencie una Zona existente dentro de `zonas`.
 *
 * @param {string} zonaId
 * @param {Zona[]} zonas
 * @returns {boolean}
 */
function referenciaZonaExistente(zonaId, zonas) {
  return zonas.some((zona) => zona && zona.id === zonaId);
}

/**
 * Verifica que `valor` sea un número finito (no `NaN`, no `Infinity`, no
 * un string numérico).
 *
 * @param {*} valor
 * @returns {boolean}
 */
function esNumeroFinito(valor) {
  return typeof valor === 'number' && Number.isFinite(valor);
}

/**
 * Verifica que `valor` tenga la forma de un `Vector3` ({x, y, z} numéricos).
 *
 * @param {*} valor
 * @returns {boolean}
 */
function esVector3Valido(valor) {
  return (
    valor !== null &&
    typeof valor === 'object' &&
    esNumeroFinito(valor.x) &&
    esNumeroFinito(valor.y) &&
    esNumeroFinito(valor.z)
  );
}

/**
 * Valida el esquema básico de una `Zona`: presencia y tipo de `id`,
 * `nombre`, `mecanismoIds`, `limites` ({min, max} como Vector3), y que
 * `habilidadesRequeridas` sea un array donde CADA elemento pertenezca al
 * catálogo de Habilidad (`HABILIDADES_VALIDAS`). `libroId` es opcional; si
 * está presente, debe ser un string no vacío.
 *
 * Esta función es pura: no muta `zona`.
 *
 * @param {Zona} zona
 * @returns {ResultadoValidacion}
 */
export function validarZona(zona) {
  const errores = [];

  if (zona === null || typeof zona !== 'object') {
    return { valido: false, errores: ['La zona debe ser un objeto no nulo.'] };
  }

  if (typeof zona.id !== 'string' || zona.id.length === 0) {
    errores.push('id es requerido y debe ser un string no vacío.');
  }

  if (typeof zona.nombre !== 'string' || zona.nombre.length === 0) {
    errores.push('nombre es requerido y debe ser un string no vacío.');
  }

  if (!Array.isArray(zona.habilidadesRequeridas)) {
    errores.push('habilidadesRequeridas es requerido y debe ser un array.');
  } else {
    for (const habilidadId of zona.habilidadesRequeridas) {
      if (!esHabilidadIdValida(habilidadId)) {
        errores.push(
          `habilidadesRequeridas contiene "${String(habilidadId)}", que no pertenece al catálogo de Habilidad (${HABILIDADES_VALIDAS.join(', ')}).`
        );
      }
    }
  }

  if (!Array.isArray(zona.mecanismoIds)) {
    errores.push('mecanismoIds es requerido y debe ser un array.');
  }

  if (zona.libroId !== undefined && (typeof zona.libroId !== 'string' || zona.libroId.length === 0)) {
    errores.push('libroId, si está presente, debe ser un string no vacío.');
  }

  if (
    zona.limites === undefined ||
    zona.limites === null ||
    typeof zona.limites !== 'object' ||
    !esVector3Valido(zona.limites.min) ||
    !esVector3Valido(zona.limites.max)
  ) {
    errores.push('limites es requerido y debe tener {min, max} como Vector3 numéricos.');
  }

  return { valido: errores.length === 0, errores };
}

/**
 * Valida el esquema básico de un `LibroConocimiento`: presencia y tipo de
 * `id`, `posicion` ({x, y, z} numéricos) y `absorbido` (booleano), y que
 * `habilidadId` pertenezca EXACTAMENTE al catálogo de Habilidad
 * (`HABILIDADES_VALIDAS`), en el mismo espíritu que el invariante central
 * de `validarMecanismoAmbiental`.
 *
 * Esta función es pura: no muta `libro`.
 *
 * @param {LibroConocimiento} libro
 * @returns {ResultadoValidacion}
 */
export function validarLibroConocimiento(libro) {
  const errores = [];

  if (libro === null || typeof libro !== 'object') {
    return { valido: false, errores: ['El libro debe ser un objeto no nulo.'] };
  }

  if (typeof libro.id !== 'string' || libro.id.length === 0) {
    errores.push('id es requerido y debe ser un string no vacío.');
  }

  if (!esHabilidadIdValida(libro.habilidadId)) {
    errores.push(
      `habilidadId "${String(libro.habilidadId)}" no pertenece al catálogo de Habilidad (${HABILIDADES_VALIDAS.join(', ')}).`
    );
  }

  if (typeof libro.zonaId !== 'string' || libro.zonaId.length === 0) {
    errores.push('zonaId es requerido y debe ser un string no vacío.');
  }

  if (!esVector3Valido(libro.posicion)) {
    errores.push('posicion es requerida y debe tener coordenadas numéricas {x, y, z}.');
  }

  if (typeof libro.absorbido !== 'boolean') {
    errores.push('absorbido es requerido y debe ser un booleano.');
  }

  return { valido: errores.length === 0, errores };
}

/**
 * Valida el esquema básico de una `Habilidad` del catálogo: presencia y
 * tipo de `nombre` y `descripcionUso` (strings no vacíos), y que `id`
 * pertenezca EXACTAMENTE al catálogo fijo (`HABILIDADES_VALIDAS`).
 *
 * Esta función es pura: no muta `habilidad`.
 *
 * @param {Habilidad} habilidad
 * @returns {ResultadoValidacion}
 */
export function validarHabilidad(habilidad) {
  const errores = [];

  if (habilidad === null || typeof habilidad !== 'object') {
    return { valido: false, errores: ['La habilidad debe ser un objeto no nulo.'] };
  }

  if (!esHabilidadIdValida(habilidad.id)) {
    errores.push(
      `id "${String(habilidad.id)}" no pertenece al catálogo de Habilidad (${HABILIDADES_VALIDAS.join(', ')}).`
    );
  }

  if (typeof habilidad.nombre !== 'string' || habilidad.nombre.length === 0) {
    errores.push('nombre es requerido y debe ser un string no vacío.');
  }

  if (typeof habilidad.descripcionUso !== 'string' || habilidad.descripcionUso.length === 0) {
    errores.push('descripcionUso es requerido y debe ser un string no vacío.');
  }

  return { valido: errores.length === 0, errores };
}

/**
 * Extrae un identificador legible de una entidad para reportarlo en
 * `erroresPorEntidad`, o `'<sin id>'` si la entidad no tiene un `id` de
 * tipo string no vacío (incluye el caso en que la entidad ni siquiera es
 * un objeto).
 *
 * @param {*} entidad
 * @returns {string}
 */
function idDescriptivoDe(entidad) {
  return entidad && typeof entidad === 'object' && typeof entidad.id === 'string' && entidad.id.length > 0
    ? entidad.id
    : '<sin id>';
}

/**
 * Resultado de la validación agregada de un `ManifiestoMundo`.
 *
 * @typedef {Object} ResultadoValidacionMundo
 * @property {boolean} valido
 * @property {Array<{tipo: 'Habilidad'|'Zona'|'MecanismoAmbiental'|'LibroConocimiento'|'ManifiestoMundo', id: string, errores: string[]}>} erroresPorEntidad
 */

/**
 * Valida el esquema de carga completo de un `ManifiestoMundo`: aplica
 * `validarHabilidad`, `validarZona`, `validarMecanismoAmbiental` y
 * `validarLibroConocimiento` a cada elemento de las listas dadas, y agrega
 * validaciones adicionales razonables sobre referencias cruzadas (extensión
 * natural del "validador de esquema de carga" mencionado en la tarea, no
 * completamente enumerada en design.md):
 *   - cada `mecanismo.zonaId` debe referenciar una Zona existente;
 *   - cada `libro.zonaId` debe referenciar una Zona existente.
 *
 * Es la función pensada para validar `world/zones.data.js` al cargar el
 * mundo (tareas 14.x) y para el property test de la tarea 8.2 (Property 14:
 * "todo MecanismoAmbiental cargado debe tener exactamente un
 * habilidadRequerida perteneciente al catálogo fijo de Habilidad").
 *
 * Esta función es pura: no muta ninguna de las listas de entrada.
 *
 * @param {{ habilidades?: Habilidad[], mecanismos?: MecanismoAmbiental[], zonas?: Zona[], libros?: LibroConocimiento[] }} mundo
 * @returns {ResultadoValidacionMundo}
 */
export function validarMundo(mundo) {
  const erroresPorEntidad = [];

  if (mundo === null || typeof mundo !== 'object') {
    return {
      valido: false,
      erroresPorEntidad: [
        { tipo: 'ManifiestoMundo', id: '<sin id>', errores: ['El manifiesto del mundo debe ser un objeto no nulo.'] },
      ],
    };
  }

  const { habilidades, mecanismos, zonas, libros } = mundo;

  const listaHabilidades = Array.isArray(habilidades) ? habilidades : [];
  const listaZonas = Array.isArray(zonas) ? zonas : [];
  const listaMecanismos = Array.isArray(mecanismos) ? mecanismos : [];
  const listaLibros = Array.isArray(libros) ? libros : [];

  if (!Array.isArray(habilidades)) {
    erroresPorEntidad.push({ tipo: 'ManifiestoMundo', id: 'habilidades', errores: ['habilidades es requerido y debe ser un array.'] });
  }
  if (!Array.isArray(zonas)) {
    erroresPorEntidad.push({ tipo: 'ManifiestoMundo', id: 'zonas', errores: ['zonas es requerido y debe ser un array.'] });
  }
  if (!Array.isArray(mecanismos)) {
    erroresPorEntidad.push({ tipo: 'ManifiestoMundo', id: 'mecanismos', errores: ['mecanismos es requerido y debe ser un array.'] });
  }
  if (!Array.isArray(libros)) {
    erroresPorEntidad.push({ tipo: 'ManifiestoMundo', id: 'libros', errores: ['libros es requerido y debe ser un array.'] });
  }

  for (const habilidad of listaHabilidades) {
    const resultado = validarHabilidad(habilidad);
    if (!resultado.valido) {
      erroresPorEntidad.push({ tipo: 'Habilidad', id: idDescriptivoDe(habilidad), errores: resultado.errores });
    }
  }

  for (const zona of listaZonas) {
    const resultado = validarZona(zona);
    if (!resultado.valido) {
      erroresPorEntidad.push({ tipo: 'Zona', id: idDescriptivoDe(zona), errores: resultado.errores });
    }
  }

  for (const mecanismo of listaMecanismos) {
    const resultado = validarMecanismoAmbiental(mecanismo);
    const errores = [...resultado.errores];
    if (resultado.valido && !referenciaZonaExistente(mecanismo.zonaId, listaZonas)) {
      errores.push(`zonaId "${mecanismo.zonaId}" no referencia ninguna Zona existente.`);
    }
    if (errores.length > 0) {
      erroresPorEntidad.push({ tipo: 'MecanismoAmbiental', id: idDescriptivoDe(mecanismo), errores });
    }
  }

  for (const libro of listaLibros) {
    const resultado = validarLibroConocimiento(libro);
    const errores = [...resultado.errores];
    if (resultado.valido && !referenciaZonaExistente(libro.zonaId, listaZonas)) {
      errores.push(`zonaId "${libro.zonaId}" no referencia ninguna Zona existente.`);
    }
    if (errores.length > 0) {
      erroresPorEntidad.push({ tipo: 'LibroConocimiento', id: idDescriptivoDe(libro), errores });
    }
  }

  return { valido: erroresPorEntidad.length === 0, erroresPorEntidad };
}
