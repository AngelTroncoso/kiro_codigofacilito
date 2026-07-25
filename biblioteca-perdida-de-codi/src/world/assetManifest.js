/**
 * assetManifest.js - Manifiesto declarativo de assets GLB/GLTF del MVP
 * (tarea 14.6), consumido por `AssetLoader.cargarTodos()`.
 *
 * Cubre las cuatro categorías de modelos 3D que necesita el juego:
 *   1. `codi` — el Personaje_Jugable. Marcado `critico: true` porque, según
 *      la tabla de Error Handling de design.md, sin este modelo no hay
 *      juego jugable: su fallo de carga debe producir `fallaCritica: true`
 *      en el resultado de `cargarTodos()`.
 *   2. Un asset de entorno por cada Zona real de `ZONAS` (zones.data.js).
 *   3. Un asset por cada uno de los seis tipos de Mecanismo_Ambiental de
 *      `TIPOS_MECANISMO_VALIDOS` (ver WorldModel.js / zones.data.js): un
 *      único asset por TIPO, no por instancia, ya que el mismo modelo se
 *      reutiliza en varias instancias/Zonas (Alcance del MVP, punto 6).
 *   4. Un único asset de "libro" genérico, reutilizado para los tres
 *      Libros_de_Conocimiento — visualmente podrán diferenciarse por
 *      color/material en tiempo de ejecución en una tarea posterior, sin
 *      necesitar tres modelos GLB distintos.
 *
 * IMPORTANTE — placeholders: todas las `url` de este manifiesto son rutas
 * placeholder (los archivos GLB reales todavía no existen en
 * `public/assets/models/`). Deben reemplazarse por assets reales de
 * producción (Mixamo/Sketchfab/Poly Pizza) durante la hackatón, respetando
 * la convención de carpetas documentada en design.md:
 * `public/assets/models/<categoria>/<nombre-en-kebab-case>.glb`. Ver
 * también `docs/assets-licencias.md` para el registro de licencias de
 * cada asset de terceros que se incorpore.
 *
 * Los `id` de este manifiesto son el contrato que usará `main.js` (tarea
 * 16.1) para localizar cada objeto 3D ya cargado y normalizado dentro del
 * `Map` devuelto por `AssetLoader.cargarTodos()` (campo `modelos`).
 *
 * Referencia: design.md, "Convención de nombres de assets" y tabla de
 * Error Handling; requirements.md, Requisitos funcionales 1, Restricciones
 * técnicas 3 y 9.
 */

import { ZONAS, MECANISMOS } from './zones.data.js';

/**
 * @typedef {import('../assets/AssetLoader.js').AssetManifestEntry} AssetManifestEntry
 */

/**
 * Entrada del Personaje_Jugable Codi. Único asset crítico del manifiesto:
 * su fallo de carga debe bloquear el arranque del juego (ver JSDoc de
 * `fallaCritica` en AssetLoader.js).
 *
 * @type {AssetManifestEntry}
 */
const ASSET_CODI = {
  id: 'codi',
  url: '/assets/models/codi/codi.glb',
  critico: true,
  categoria: 'codi',
};

/**
 * Un asset de entorno no crítico por cada Zona real definida en `ZONAS`.
 * Si el entorno de una Zona falla al cargar, el juego puede seguir
 * funcionando (degradado) en vez de bloquearse por completo.
 *
 * @type {AssetManifestEntry[]}
 */
const ASSETS_ENTORNO = ZONAS.map((zona) => ({
  id: `entorno-${zona.id}`,
  url: `/assets/models/entorno/${zona.id}.glb`,
  critico: false,
  categoria: 'entorno',
}));

/**
 * Un único asset reutilizable por cada tipo de Mecanismo_Ambiental
 * presente en `MECANISMOS` (no uno por instancia): varias instancias del
 * mismo `tipo`, aunque vivan en Zonas distintas, comparten el mismo modelo
 * GLB. Se deriva de los tipos realmente usados en `MECANISMOS` para evitar
 * que este manifiesto y `zones.data.js` puedan desincronizarse.
 *
 * @type {AssetManifestEntry[]}
 */
const ASSETS_MECANISMOS = [...new Set(MECANISMOS.map((mecanismo) => mecanismo.tipo))].map(
  (tipo) => ({
    id: `mecanismo-${tipo}`,
    url: `/assets/models/mecanismos/${tipo}.glb`,
    critico: false,
    categoria: 'mecanismo',
  })
);

/**
 * Único modelo base de "libro", reutilizado para los tres
 * Libros_de_Conocimiento (python, javascript, sql). La diferenciación
 * visual por Habilidad (color/material) se resuelve en tiempo de
 * ejecución en una tarea posterior, no mediante modelos GLB distintos.
 *
 * @type {AssetManifestEntry}
 */
const ASSET_LIBRO = {
  id: 'libro-conocimiento',
  url: '/assets/models/libro/libro-conocimiento.glb',
  critico: false,
  categoria: 'libro',
};

/**
 * Manifiesto completo de assets GLB/GLTF del MVP, listo para pasarse a
 * `AssetLoader.cargarTodos(MANIFIESTO_ASSETS, onProgreso)`.
 *
 * @type {AssetManifestEntry[]}
 */
export const MANIFIESTO_ASSETS = [
  ASSET_CODI,
  ...ASSETS_ENTORNO,
  ...ASSETS_MECANISMOS,
  ASSET_LIBRO,
];
