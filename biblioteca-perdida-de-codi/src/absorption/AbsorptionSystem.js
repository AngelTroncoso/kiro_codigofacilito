/**
 * AbsorptionSystem.js - Sistema_de_Absorcion (Requirements 3.1, 3.4, 3.5).
 *
 * Detecta el contacto entre Codi y un `LibroConocimiento` activo, otorga la
 * `Habilidad` asociada al `ProgressStore` y marca el libro como absorbido
 * (removido de la escena/lista activa, Requisito 3.4).
 *
 * Siguiendo el mismo patrón de diseño que `MovementSystem`/`CameraSystem`,
 * esta clase no mantiene estado interno propio: toda la información
 * necesaria (pose de Codi, libros activos, progreso) entra por parámetros
 * de `revisarContacto`, y el resultado (qué habilidad se otorgó, qué libro
 * se removió) sale como valor de retorno. Esto permite testear el sistema
 * de forma aislada con `ProgressStore` real, sin mocks.
 *
 * Nota sobre la animación de absorción (Requisito 3.2): `revisarContacto`
 * es puro y síncrono, no reproduce animaciones ni bloquea el hilo. La forma
 * en que este diseño satisface el Requisito 3.2 es indirecta: el resultado
 * de `revisarContacto` (`{ habilidadOtorgada, libroRemovidoId }`) es la
 * SEÑAL de que ocurrió una absorción. Es responsabilidad de quien orquesta
 * el `GameLoop` (`main.js`, ver tareas 16.x) usar esa señal para disparar la
 * animación/efecto visual ANTES de continuar procesando el frame como de
 * costumbre, es decir, antes de "devolver el control total al Jugador" en
 * el sentido del Requisito 3.2. `AbsorptionSystem` en sí mismo no conoce
 * `RenderEngine` ni ningún sistema de animación, y no impone ningún retraso:
 * simplemente garantiza que, cuando corresponde reproducir una animación de
 * absorción, la información necesaria (`habilidadOtorgada`, que identifica
 * inequívocamente el evento) está disponible en el resultado devuelto.
 */

/**
 * Distancia euclidiana 3D entre dos puntos `{x, y, z}`.
 *
 * @param {{x:number, y:number, z:number}} a
 * @param {{x:number, y:number, z:number}} b
 * @returns {number}
 */
function distancia(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Radio de contacto por defecto (unidades del mundo) dentro del cual se
 * considera que Codi está en contacto con un `LibroConocimiento`.
 *
 * @type {number}
 */
export const RADIO_CONTACTO_POR_DEFECTO = 1.2;

/**
 * AbsorptionSystem - Sistema_de_Absorcion (Requirements 3.1, 3.4, 3.5).
 */
export class AbsorptionSystem {
  /**
   * @param {Object} [config] - Constantes de configuración de la absorción.
   * @param {number} [config.radioContacto=RADIO_CONTACTO_POR_DEFECTO] - Distancia
   *   máxima (unid) entre Codi y un libro para considerar que hay contacto.
   */
  constructor(config = {}) {
    /** @private */
    this._radioContacto = config.radioContacto ?? RADIO_CONTACTO_POR_DEFECTO;
  }

  /**
   * Revisa si Codi está en contacto con alguno de los `librosActivos` no
   * absorbidos y, de ser así, otorga la habilidad correspondiente (si no la
   * posee ya) y marca el libro como absorbido.
   *
   * Idempotencia (Requisito 3.5): los libros con `absorbido === true` se
   * ignoran por completo (ni se evalúa distancia ni se toca el progreso), y
   * si la habilidad del libro ya fue otorgada previamente (por este mismo
   * libro o por otro de la misma habilidad), NO se vuelve a llamar a
   * `progreso.otorgarHabilidad`; el libro sí se marca `absorbido = true`
   * para que quede removido de la escena, pero el `ProgressStore` no se
   * altera (ver Property 2, tarea 10.3).
   *
   * Solo procesa como máximo un contacto por llamada (el primer libro en
   * contacto encontrado en `librosActivos`), consistente con el
   * pseudocódigo de design.md.
   *
   * @param {import('../movement/MovementSystem.js').CodiPose} poseCodi
   * @param {import('../world/WorldModel.js').LibroConocimiento[]} librosActivos
   * @param {import('../core/ProgressStore.js').ProgressStore} progreso
   * @returns {{ habilidadOtorgada: string|null, libroRemovidoId: string|null }}
   */
  revisarContacto(poseCodi, librosActivos, progreso) {
    for (const libro of librosActivos) {
      if (libro.absorbido) continue; // idempotencia: 3.5

      if (distancia(poseCodi.position, libro.posicion) <= this._radioContacto) {
        if (!progreso.tieneHabilidad(libro.habilidadId)) {
          progreso.otorgarHabilidad(libro.habilidadId);
        }
        libro.absorbido = true; // 3.4: se remueve de la escena/lista activa
        return { habilidadOtorgada: libro.habilidadId, libroRemovidoId: libro.id };
      }
    }
    return { habilidadOtorgada: null, libroRemovidoId: null };
  }
}
