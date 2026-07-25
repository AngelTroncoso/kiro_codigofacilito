/**
 * @typedef {Object} InputState
 * @property {{x:number, z:number}} vectorMovimiento  // normalizado, [-1,1] por eje
 * @property {{x:number, y:number}} deltaCamara        // delta de mouse del frame, en px o rad
 * @property {boolean} saltar                          // flag "borde de subida" (edge-triggered)
 * @property {boolean} accionInteractuar                // usar/consultar mecanismo cercano
 */

/**
 * InputProvider - Interfaz de abstracción de entrada.
 *
 * `Sistema_de_Movimiento` y `Sistema_de_Camara` nunca leen eventos de
 * teclado/mouse (ni de ningún otro dispositivo) directamente: en cada
 * frame reciben un objeto `InputState` inmutable producido por un
 * `InputProvider`, obtenido a través de `leerEstado()`.
 *
 * Esta capa de abstracción es la `Arquitectura_WebXR_Preparada`: al no
 * acoplarse los sistemas de gameplay a una fuente de entrada concreta,
 * una futura `WebXRInputProvider` (controladores VR, gaze, etc.) podrá
 * implementar esta misma interfaz y conectarse al `GameLoop` sin
 * modificar en absoluto `MovementSystem` ni `CameraSystem`.
 *
 * Esta clase es una interfaz abstracta: no se instancia directamente.
 * Las subclases (p.ej. `KeyboardMouseInputProvider`, y en el futuro
 * `WebXRInputProvider`) deben sobrescribir `leerEstado()`.
 */
export class InputProvider {
  /**
   * Lee el estado de entrada actual del frame.
   * @returns {InputState} Estado de entrada abstracto del frame actual.
   */
  leerEstado() {
    throw new Error('no implementado');
  }
}
