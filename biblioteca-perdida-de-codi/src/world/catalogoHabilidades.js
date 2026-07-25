/**
 * catalogoHabilidades.js - Catálogo fijo de las tres Habilidades jugables
 * del MVP: Python, JavaScript y SQL (Alcance del MVP, punto 5).
 *
 * Este catálogo es intencionalmente estático y cerrado: el juego no
 * contempla añadir, quitar ni reordenar Habilidades en tiempo de ejecución.
 * `HABILIDADES_VALIDAS` en `WorldModel.js` ya codifica los `HabilidadId`
 * permitidos; este módulo aporta los objetos `Habilidad` completos
 * (incluyendo `descripcionUso`) que se muestran al Jugador en el mensaje de
 * absorción (Requisito 3.3).
 *
 * Los textos de `descripcionUso` mantienen el tono narrativo optimista,
 * curioso y no amenazante exigido por el Requisito 11.3, y describen cada
 * Habilidad como una capacidad creativa, nunca destructiva (Requisito
 * 11.4): Python construye puentes y soluciones automatizadas, JavaScript
 * activa mecanismos y mueve plataformas, SQL descubre caminos ocultos y
 * consulta información antigua.
 *
 * Referencia: design.md, sección "Data Models" — catálogo fijo de Habilidad.
 */

/**
 * @typedef {import('./WorldModel.js').Habilidad} Habilidad
 */

/**
 * Catálogo fijo de exactamente 3 Habilidades del MVP. El orden refleja el
 * recorrido narrativo esperado (Python → JavaScript → SQL), aunque el
 * gating real de Zonas y Mecanismos no depende de este orden.
 *
 * @type {Habilidad[]}
 */
export const CATALOGO_HABILIDADES = [
  {
    id: 'python',
    nombre: 'Python',
    descripcionUso:
      '¡Has absorbido Python! Ahora puedes tejer puentes de código y crear ' +
      'soluciones automatizadas para cruzar los huecos de la Isla.',
  },
  {
    id: 'javascript',
    nombre: 'JavaScript',
    descripcionUso:
      '¡Has absorbido JavaScript! Ahora puedes activar mecanismos dormidos ' +
      'y poner en movimiento plataformas para alcanzar nuevos lugares.',
  },
  {
    id: 'sql',
    nombre: 'SQL',
    descripcionUso:
      '¡Has absorbido SQL! Ahora puedes consultar la información antigua ' +
      'de la Isla y descubrir caminos ocultos que esperaban ser encontrados.',
  },
];
