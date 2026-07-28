/**
 * ui/messages.js - Generación pura de mensajes contextuales para el
 * Sistema_de_Interfaz (Requirements 3.3, 8.2, 11.3).
 *
 * `generarMensaje(evento)` mapea un objeto `evento` (discriminado por su
 * campo `tipo`) a un string no vacío con tono narrativo optimista, curioso
 * y no amenazante (Requisito 11.3). Es una función PURA: no accede al DOM
 * ni mantiene estado, para poder probarse con property-based testing
 * (Property 13) de forma determinista.
 *
 * Catálogo de eventos soportados:
 *   - `{ tipo: 'absorcion', habilidadId, nombreHabilidad?, descripcionUso?, nombrePersonaje? }`
 *     Requisito 3.3: mensaje que identifica la Habilidad obtenida y su
 *     forma general de uso. Si no se provee `nombreHabilidad`/
 *     `descripcionUso`, se buscan en `CATALOGO_HABILIDADES`
 *     (`world/catalogoHabilidades.js`) por `habilidadId`.
 *     `nombrePersonaje` ('Codi' | 'Kiro') personaliza el saludo de gratitud;
 *     por defecto 'Codi'. Lo inyecta `main.js` usando `nombrePersonaje()`,
 *     ya que este módulo es puro y no accede al `ProgressStore`.
 *   - `{ tipo: 'denegado', habilidadRequerida }`
 *     Mensaje de carencia. Compatible con la firma inyectable
 *     `AbilitySystem`'s `config.generarMensajeCarencia` (ver JSDoc de
 *     `AbilitySystem`): `generarMensajeCarenciaAdapter` exportado más
 *     abajo tiene exactamente esa firma `(habilidadRequerida) => string`.
 *   - `{ tipo: 'resuelto', mecanismoId, mecanismoTipo? }`
 *     Mensaje de éxito al resolver un Mecanismo_Ambiental.
 *   - `{ tipo: 'zona-bloqueada', zonaNombre?, habilidadesFaltantes? }`
 *     Pista contextual de zona bloqueada (Requisito 7.1).
 *
 * Para cualquier `evento.tipo` no reconocido, se devuelve un mensaje
 * genérico no vacío (fallback documentado) en vez de lanzar una excepción
 * o devolver una cadena vacía, preservando la garantía de la Property 13
 * para el catálogo soportado y evitando romper al Sistema_de_Interfaz ante
 * un evento inesperado.
 */

import { CATALOGO_HABILIDADES } from '../world/catalogoHabilidades.js';

/**
 * Busca el nombre visible de una habilidad por su id en el catálogo fijo.
 * Si no se encuentra (id desconocido), devuelve el propio id como fallback
 * legible.
 * @param {string} habilidadId
 * @returns {string}
 */
function nombreHabilidadPorId(habilidadId) {
  const entrada = CATALOGO_HABILIDADES.find((h) => h.id === habilidadId);
  return entrada?.nombre ?? habilidadId;
}

/**
 * Nombre visible del personaje activo ('Codi' o 'Kiro'), leído desde el
 * `ProgressStore`, que es la única fuente de verdad de la selección.
 *
 * Centraliza aquí la traducción id → nombre para que los textos de fin de
 * misión (mensaje del Desafío Final, felicitación del portal y panel de
 * Victoria) no repitan el mismo condicional. Para los textos en
 * mayúsculas basta aplicar `.toUpperCase()` sobre el resultado.
 *
 * Tolerante por diseño: si se recibe un progreso parcial (por ejemplo un
 * stub sin `personajeSeleccionado`), cae a 'Codi' en vez de lanzar, para no
 * romper el panel de Victoria.
 *
 * @param {{personajeSeleccionado?: () => ('codi'|'kiro')}} [progreso]
 * @returns {'Codi'|'Kiro'}
 */
export function nombrePersonaje(progreso) {
  const id =
    typeof progreso?.personajeSeleccionado === 'function'
      ? progreso.personajeSeleccionado()
      : 'codi';
  return id === 'kiro' ? 'Kiro' : 'Codi';
}

/**
 * Busca la descripción de uso de una habilidad por su id en el catálogo
 * fijo. Si no se encuentra, devuelve una descripción genérica pero no
 * vacía.
 * @param {string} habilidadId
 * @returns {string}
 */
function descripcionUsoPorId(habilidadId) {
  const entrada = CATALOGO_HABILIDADES.find((h) => h.id === habilidadId);
  return entrada?.descripcionUso ?? `¡Has absorbido ${nombreHabilidadPorId(habilidadId)}! Una nueva forma de explorar la Isla se abre ante ti.`;
}

/**
 * Mensaje contextual de absorción de una Habilidad (Requisito 3.3).
 * Incluye mensajes narrativos especiales de gratitud para cada lenguaje.
 *
 * `nombrePersonaje` es OPCIONAL para preservar la pureza de esta función:
 * `messages.js` no conoce el `ProgressStore`, así que quien orquesta el
 * juego (`main.js`) inyecta el nombre resuelto. Si no se provee, se usa
 * 'Codi' como valor por defecto, de modo que las llamadas existentes (y los
 * property tests, que invocan sin este campo) siguen funcionando igual.
 *
 * @param {{ habilidadId: string, nombreHabilidad?: string, descripcionUso?: string, nombrePersonaje?: string }} evento
 * @returns {string}
 */
function mensajeAbsorcion(evento) {
  const nombre = evento.nombreHabilidad ?? nombreHabilidadPorId(evento.habilidadId);
  const personaje = evento.nombrePersonaje ?? 'Codi';

  // Mensajes narrativos especiales de gratitud por lenguaje
  const MENSAJES_ESPECIALES = {
    python: `¡Increíble ${personaje}! Has recuperado el Lenguaje de la Lógica y los Datos: Python. Con él, los sistemas de la Biblioteca volverán a procesar información.`,
    javascript: `¡Gran trabajo ${personaje}! Has restaurado el Lenguaje de la Interactividad: JavaScript. La Biblioteca vuelve a tener vida y movimiento.`,
    sql: `¡Excelente ${personaje}! Has rescatado el Lenguaje de la Memoria: SQL. Todos los registros y ancestros del conocimiento han sido salvados.`,
  };

  // Si existe un mensaje especial para esta habilidad, usarlo
  if (MENSAJES_ESPECIALES[evento.habilidadId]) {
    return MENSAJES_ESPECIALES[evento.habilidadId];
  }

  // Fallback a los mensajes originales
  if (evento.descripcionUso) {
    return `¡Has absorbido ${nombre}! ${evento.descripcionUso}`;
  }
  return descripcionUsoPorId(evento.habilidadId);
}

/**
 * Mensaje de carencia cuando se deniega una interacción por falta de la
 * habilidad requerida. Tono curioso y no amenazante: invita a explorar en
 * busca del conocimiento faltante, en vez de sonar a "prohibido".
 * @param {{ habilidadRequerida: string }} evento
 * @returns {string}
 */
function mensajeDenegado(evento) {
  const nombre = nombreHabilidadPorId(evento.habilidadRequerida);
  return `Esto parece requerir el conocimiento de ${nombre}. Quizá haya un Libro de ${nombre} esperando en algún rincón de la Isla.`;
}

/**
 * Mensaje de éxito al resolver un Mecanismo_Ambiental por primera vez.
 * @param {{ mecanismoId: string, mecanismoTipo?: string }} evento
 * @returns {string}
 */
function mensajeResuelto(evento) {
  const etiqueta = evento.mecanismoTipo ?? evento.mecanismoId;
  return `¡"${etiqueta}" (${evento.mecanismoId}) responde a tu conocimiento! Un nuevo camino se despliega ante ti.`;
}

/**
 * Pista contextual cuando el Jugador se aproxima a una Zona_Bloqueada
 * (Requisito 7.1).
 * @param {{ zonaNombre?: string, habilidadesFaltantes?: string[] }} evento
 * @returns {string}
 */
function mensajeZonaBloqueada(evento) {
  const nombreZona = evento.zonaNombre ?? 'esta zona';
  const faltantes = evento.habilidadesFaltantes ?? [];
  if (faltantes.length === 0) {
    return `${nombreZona} guarda secretos que aún no puedes alcanzar. Sigue explorando para descubrir qué conocimiento necesitas.`;
  }
  const nombresFaltantes = faltantes.map(nombreHabilidadPorId).join(', ');
  return `${nombreZona} parece esperar a alguien con más conocimiento (${nombresFaltantes}). ¡Sigue explorando la Isla!`;
}

/**
 * Mensaje genérico de fallback para eventos de tipo no reconocido. No
 * forma parte del catálogo soportado por la Property 13, pero garantiza
 * que `generarMensaje` nunca lanza ni devuelve una cadena vacía.
 * @returns {string}
 */
function mensajeGenericoFallback() {
  return 'Algo interesante ha ocurrido en la Isla.';
}

/**
 * Genera un mensaje contextual no vacío a partir de un `evento` del
 * catálogo soportado (Requisitos 3.3, 8.2, 11.3; Property 13).
 *
 * @param {{ tipo: string, [key: string]: any }} evento
 * @returns {string} Mensaje no vacío, con tono optimista/curioso/no amenazante.
 */
export function generarMensaje(evento) {
  switch (evento?.tipo) {
    case 'absorcion':
      return mensajeAbsorcion(evento);
    case 'denegado':
      return mensajeDenegado(evento);
    case 'resuelto':
      return mensajeResuelto(evento);
    case 'zona-bloqueada':
      return mensajeZonaBloqueada(evento);
    default:
      return mensajeGenericoFallback();
  }
}

/**
 * Adaptador con la firma exacta esperada por
 * `AbilitySystem`'s `config.generarMensajeCarencia`
 * (`(habilidadRequerida: string) => string`), para poder inyectar estos
 * mensajes más ricos en `AbilitySystem` desde `main.js` sin crear una
 * dependencia circular entre `abilities/` y `ui/`.
 *
 * @param {string} habilidadRequerida
 * @returns {string}
 */
export function generarMensajeCarenciaAdapter(habilidadRequerida) {
  return generarMensaje({ tipo: 'denegado', habilidadRequerida });
}

/**
 * Adaptador con la firma exacta esperada por
 * `AbilitySystem`'s `config.generarMensajeExito`
 * (`(mecanismo: MecanismoAmbiental) => string`).
 *
 * @param {import('../world/WorldModel.js').MecanismoAmbiental} mecanismo
 * @returns {string}
 */
export function generarMensajeExitoAdapter(mecanismo) {
  return generarMensaje({ tipo: 'resuelto', mecanismoId: mecanismo.id, mecanismoTipo: mecanismo.tipo });
}
