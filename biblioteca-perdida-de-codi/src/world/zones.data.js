/**
 * zones.data.js - Estructura declarativa completa del mundo del MVP:
 * Zonas, Mecanismos_Ambientales y Libros_de_Conocimiento (tarea 14).
 *
 * Este archivo es la fuente de datos declarativa de la Isla (Alcance del
 * MVP, punto 5): una única Isla dividida en Zonas conectadas, con
 * gating por Habilidad, Mecanismos reutilizables y exactamente un Libro
 * por Habilidad.
 *
 * Recorrido narrativo:
 *   1. `claro-de-llegada` (sin requisitos) — contiene el Libro de Python.
 *   2. `sendero-del-puente` (requiere Python) — contiene el Libro de
 *      JavaScript, un Mecanismo de tipo 'puente' (Python) y un Mecanismo
 *      de tipo 'dispositivo' (JavaScript, recién obtenido en esta misma
 *      Zona: el Jugador puede volver a activarlo apenas absorbe el libro).
 *   3. `plataforma-mecanica` (requiere JavaScript) — contiene el Libro de
 *      SQL y Mecanismos de tipo 'solucion-automatizada' (Python,
 *      reutilizado) y 'plataforma-movil' (JavaScript, reutilizado).
 *   4. `biblioteca-corrupta` (requiere las tres Habilidades) — Zona del
 *      Desafío_Final (Requisito 10), con Mecanismos de tipo
 *      'camino-oculto' y 'fuente-informacion' (SQL).
 *
 * Los seis tipos de `TIPOS_MECANISMO_VALIDOS` están representados, con
 * Python y JavaScript reutilizados en más de una Zona/instancia (Alcance
 * del MVP, punto 6: "Al menos un Mecanismo_Ambiental funcional por
 * Habilidad, reutilizado en distintas Zonas"): los Mecanismos de Python
 * (`puente` en `sendero-del-puente`, `solucion-automatizada` en
 * `plataforma-mecanica`) y los de JavaScript (`dispositivo` en
 * `sendero-del-puente`, `plataforma-movil` en `plataforma-mecanica`)
 * aparecen cada uno en más de una Zona distinta.
 *
 * Las Zonas están dispuestas como bloques de 20x10x20 unidades separados
 * a lo largo del eje X, sin solaparse entre sí.
 *
 * Referencia: design.md, sección "Data Models"; requirements.md, "Alcance
 * del MVP" puntos 1, 4, 5 y 6, y Requisito 10 (Desafío Final).
 */

import { CATALOGO_HABILIDADES } from './catalogoHabilidades.js';
import { validarMundo } from './WorldModel.js';

/**
 * @typedef {import('./WorldModel.js').Zona} Zona
 * @typedef {import('./WorldModel.js').MecanismoAmbiental} MecanismoAmbiental
 * @typedef {import('./WorldModel.js').LibroConocimiento} LibroConocimiento
 */

/**
 * Las 3-4 Zonas conectadas de la única Isla del MVP (Alcance del MVP,
 * punto 1). `mecanismoIds` y `libroId` referencian entidades definidas más
 * abajo en `MECANISMOS` y `LIBROS` respectivamente.
 *
 * @type {Zona[]}
 */
export const ZONAS = [
  {
    id: 'claro-de-llegada',
    nombre: 'Claro de Llegada',
    habilidadesRequeridas: [],
    mecanismoIds: [],
    libroId: 'libro-python',
    limites: {
      min: { x: -10, y: 0, z: -10 },
      max: { x: 10, y: 10, z: 10 },
    },
  },
  {
    id: 'sendero-del-puente',
    nombre: 'Sendero del Puente',
    habilidadesRequeridas: ['python'],
    mecanismoIds: ['puente-sendero-01', 'dispositivo-sendero-01'],
    libroId: 'libro-javascript',
    limites: {
      min: { x: 10, y: 0, z: -10 },
      max: { x: 30, y: 10, z: 10 },
    },
  },
  {
    id: 'plataforma-mecanica',
    nombre: 'Plataforma Mecánica',
    habilidadesRequeridas: ['javascript'],
    mecanismoIds: [
      'solucion-automatizada-plataforma-01',
      'plataforma-movil-mecanica-01',
    ],
    libroId: 'libro-sql',
    limites: {
      min: { x: 30, y: 0, z: -10 },
      max: { x: 50, y: 10, z: 10 },
    },
  },
  {
    id: 'biblioteca-corrupta',
    nombre: 'Biblioteca Corrupta',
    habilidadesRequeridas: ['python', 'javascript', 'sql'],
    mecanismoIds: ['camino-oculto-biblioteca-01', 'fuente-informacion-biblioteca-01'],
    limites: {
      min: { x: 50, y: 0, z: -10 },
      max: { x: 70, y: 10, z: 10 },
    },
  },
];

/**
 * Mecanismos_Ambientales del MVP: al menos uno de cada uno de los seis
 * tipos de `TIPOS_MECANISMO_VALIDOS`, con reutilización de la misma
 * Habilidad en más de una Zona (Alcance del MVP, punto 6):
 *   - Python: 'puente' (sendero-del-puente) y 'solucion-automatizada'
 *     (plataforma-mecanica) — dos Zonas distintas.
 *   - JavaScript: 'dispositivo' (sendero-del-puente) y 'plataforma-movil'
 *     (plataforma-mecanica) — dos Zonas distintas.
 *   - SQL: 'camino-oculto' y 'fuente-informacion' (ambos en
 *     biblioteca-corrupta, la Zona del Desafío_Final; SQL solo se obtiene
 *     justo antes de esta Zona, por lo que no hay una Zona previa donde
 *     reutilizar sus mecanismos dentro del recorrido lineal del MVP).
 *
 * @type {MecanismoAmbiental[]}
 */
export const MECANISMOS = [
  {
    id: 'puente-sendero-01',
    tipo: 'puente',
    habilidadRequerida: 'python',
    zonaId: 'sendero-del-puente',
    estado: 'bloqueado',
    posicion: { x: 20, y: 1, z: 0 },
    puntoA: { x: 15, y: 1, z: 0 },
    puntoB: { x: 25, y: 1, z: 0 },
  },
  {
    id: 'solucion-automatizada-plataforma-01',
    tipo: 'solucion-automatizada',
    habilidadRequerida: 'python',
    zonaId: 'plataforma-mecanica',
    estado: 'bloqueado',
    posicion: { x: 45, y: 1, z: -6 },
  },
  {
    id: 'dispositivo-sendero-01',
    tipo: 'dispositivo',
    habilidadRequerida: 'javascript',
    zonaId: 'sendero-del-puente',
    estado: 'bloqueado',
    posicion: { x: 15, y: 1, z: 5 },
  },
  {
    id: 'plataforma-movil-mecanica-01',
    tipo: 'plataforma-movil',
    habilidadRequerida: 'javascript',
    zonaId: 'plataforma-mecanica',
    estado: 'bloqueado',
    posicion: { x: 48, y: 1, z: 0 },
    puntoA: { x: 48, y: 1, z: -8 },
    puntoB: { x: 48, y: 1, z: 8 },
  },
  {
    id: 'camino-oculto-biblioteca-01',
    tipo: 'camino-oculto',
    habilidadRequerida: 'sql',
    zonaId: 'biblioteca-corrupta',
    estado: 'bloqueado',
    posicion: { x: 55, y: 1, z: 0 },
    objetivoRevelacionId: 'objetivo-revelacion-camino-biblioteca-01',
  },
  {
    id: 'fuente-informacion-biblioteca-01',
    tipo: 'fuente-informacion',
    habilidadRequerida: 'sql',
    zonaId: 'biblioteca-corrupta',
    estado: 'bloqueado',
    posicion: { x: 65, y: 1, z: 5 },
  },
];

/**
 * Los tres Libros_de_Conocimiento del MVP, uno por Habilidad del catálogo
 * fijo (Alcance del MVP, puntos 4 y 5). Cada uno vive en una Zona real
 * definida en `ZONAS` y comienza sin absorber.
 *
 * @type {LibroConocimiento[]}
 */
export const LIBROS = [
  {
    id: 'libro-python',
    habilidadId: 'python',
    zonaId: 'claro-de-llegada',
    posicion: { x: 0, y: 1, z: 0 },
    absorbido: false,
  },
  {
    id: 'libro-javascript',
    habilidadId: 'javascript',
    zonaId: 'sendero-del-puente',
    posicion: { x: 20, y: 1, z: 5 },
    absorbido: false,
  },
  {
    id: 'libro-sql',
    habilidadId: 'sql',
    zonaId: 'plataforma-mecanica',
    posicion: { x: 40, y: 1, z: 5 },
    absorbido: false,
  },
];

/**
 * Resultado de validar el manifiesto completo de este módulo contra el
 * esquema de `WorldModel.js`. Se expone para que los tests puedan
 * inspeccionarlo sin depender de que el `throw` de más abajo se dispare.
 *
 * @type {import('./WorldModel.js').ResultadoValidacionMundo}
 */
export const resultadoValidacion = validarMundo({
  habilidades: CATALOGO_HABILIDADES,
  zonas: ZONAS,
  mecanismos: MECANISMOS,
  libros: LIBROS,
});

// Salvaguarda "fail fast": si los datos declarativos de este módulo son
// inconsistentes con el esquema de WorldModel (referencias a Zonas
// inexistentes, Habilidades fuera de catálogo, campos faltantes, etc.),
// lanzamos de inmediato al cargar el módulo en vez de dejar que el juego
// arranque con un mundo corrupto. Ver design.md, "validador de esquema de
// carga".
if (!resultadoValidacion.valido) {
  const detalle = resultadoValidacion.erroresPorEntidad
    .map(({ tipo, id, errores }) => `  - [${tipo} ${id}]: ${errores.join(' | ')}`)
    .join('\n');
  throw new Error(
    `zones.data.js contiene un mundo inválido según validarMundo():\n${detalle}`
  );
}
