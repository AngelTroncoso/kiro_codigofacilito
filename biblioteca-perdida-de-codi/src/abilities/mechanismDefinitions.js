/**
 * mechanismDefinitions.js - Catálogo declarativo de los seis tipos de
 * `MecanismoAmbiental` válidos (`TIPOS_MECANISMO_VALIDOS`, ver
 * `world/WorldModel.js`), asociando cada tipo con su `HabilidadId` y con
 * metadata declarativa sobre el efecto visual/de escena que debe disparar
 * al resolverse (Requirements 4.2, 5.2, 6.2).
 *
 * Este módulo NO contiene lógica de gating ni de transición de estado (eso
 * vive en `AbilitySystem`, ver `interactuar`): es puramente datos, pensado
 * como base declarativa para `mechanismEffects.js` (tarea 11.5) y para
 * `world/zones.data.js` (tarea 14.x), evitando repetir la asociación
 * tipo→habilidad→efecto en cada punto del código que la necesite.
 *
 * Todos los `descripcionEfecto` se redactan como acciones creativas o
 * constructivas (Requisito 11.4: "THE Sistema_de_Habilidades SHALL
 * representar cada efecto de Habilidad como una acción creativa o
 * constructiva, nunca como una acción agresiva o destructiva").
 */

import { HABILIDADES_VALIDAS, TIPOS_MECANISMO_VALIDOS } from '../world/WorldModel.js';

/**
 * @typedef {Object} DefinicionMecanismo
 * @property {import('../world/WorldModel.js').TipoMecanismo} tipo
 * @property {import('../world/WorldModel.js').HabilidadId} habilidad - Habilidad
 *   asociada a este tipo de mecanismo (Requisito funcional 6: cada tipo
 *   pertenece a exactamente una Habilidad).
 * @property {string} descripcionEfecto - Identificador corto del efecto
 *   visual/de escena a disparar al resolverse, en clave `mechanismEffects.js`.
 * @property {string} descripcion - Descripción legible de la acción
 *   creativa/constructiva representada (Requisito 11.4).
 */

/**
 * Catálogo fijo: mapa `TipoMecanismo -> DefinicionMecanismo`, cubriendo los
 * seis tipos de `TIPOS_MECANISMO_VALIDOS`, dos por cada una de las tres
 * `HABILIDADES_VALIDAS`.
 *
 * @type {Record<import('../world/WorldModel.js').TipoMecanismo, DefinicionMecanismo>}
 */
export const DEFINICIONES_MECANISMO = {
  puente: {
    tipo: 'puente',
    habilidad: 'python',
    descripcionEfecto: 'extender-puente',
    descripcion: 'Codi escribe un script Python que construye y extiende un puente para cruzar.',
  },
  'solucion-automatizada': {
    tipo: 'solucion-automatizada',
    habilidad: 'python',
    descripcionEfecto: 'ejecutar-solucion-automatizada',
    descripcion: 'Codi automatiza una tarea repetitiva con Python, despejando el camino.',
  },
  dispositivo: {
    tipo: 'dispositivo',
    habilidad: 'javascript',
    descripcionEfecto: 'activar-dispositivo',
    descripcion: 'Codi programa la lógica interactiva de un dispositivo con JavaScript para encenderlo.',
  },
  'plataforma-movil': {
    tipo: 'plataforma-movil',
    habilidad: 'javascript',
    descripcionEfecto: 'iniciar-recorrido-plataforma',
    descripcion: 'Codi programa el movimiento de una plataforma con JavaScript para iniciar su recorrido.',
  },
  'camino-oculto': {
    tipo: 'camino-oculto',
    habilidad: 'sql',
    descripcionEfecto: 'revelar-geometria-oculta',
    descripcion: 'Codi consulta una base de datos con SQL y descubre un camino que estaba oculto.',
  },
  'fuente-informacion': {
    tipo: 'fuente-informacion',
    habilidad: 'sql',
    descripcionEfecto: 'revelar-fuente-informacion',
    descripcion: 'Codi consulta una base de datos con SQL y revela una fuente de información oculta.',
  },
};

// --- Invariantes de consistencia del catálogo (verificadas en tiempo de
// carga del módulo, no en cada llamada): garantizan que este catálogo se
// mantiene sincronizado con `TIPOS_MECANISMO_VALIDOS`/`HABILIDADES_VALIDAS`
// de `world/WorldModel.js` si alguno de los dos cambia en el futuro.
for (const tipo of TIPOS_MECANISMO_VALIDOS) {
  if (!DEFINICIONES_MECANISMO[tipo]) {
    throw new Error(`mechanismDefinitions.js: falta la definición del tipo de mecanismo "${tipo}".`);
  }
  if (!HABILIDADES_VALIDAS.includes(DEFINICIONES_MECANISMO[tipo].habilidad)) {
    throw new Error(
      `mechanismDefinitions.js: la definición de "${tipo}" referencia una habilidad inválida "${DEFINICIONES_MECANISMO[tipo].habilidad}".`
    );
  }
}

/**
 * Devuelve la `DefinicionMecanismo` asociada a `tipo`, o `undefined` si
 * `tipo` no pertenece al catálogo fijo.
 *
 * @param {string} tipo
 * @returns {DefinicionMecanismo|undefined}
 */
export function obtenerDefinicionMecanismo(tipo) {
  return DEFINICIONES_MECANISMO[tipo];
}
