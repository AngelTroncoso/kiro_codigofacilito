/**
 * GameLoop - Orquesta la actualización de los sistemas de gameplay y el
 * renderizado en cada frame de la Sesion_de_Juego.
 *
 * Usa `renderDriver.setAnimationLoop(callback)` en vez de un
 * `requestAnimationFrame` manual porque esta es la misma API que Three.js
 * reutiliza al entrar en una `XRSession`, lo que prepara el bucle de juego
 * para una futura integración con WebXR sin reescribirlo (ver
 * Arquitectura_WebXR_Preparada en el diseño).
 *
 * `GameLoop` es agnóstico de sistemas concretos: no importa `RenderEngine`,
 * `UISystem` ni ningún otro subsistema. Recibe por inyección:
 * - `renderDriver`: cualquier objeto con un método `setAnimationLoop(cb)`
 *   (duck typing), que en producción será el `RenderEngine` (tarea 16.1) y
 *   en pruebas puede ser un mock simple.
 * - `updateFn`: callback que actualiza todos los sistemas de gameplay
 *   (movimiento, cámara, absorción, habilidades, render) para el frame.
 * - `onError`: callback opcional invocado si `updateFn` lanza una
 *   excepción; si no se provee, se usa `console.error` como fallback.
 *
 * El callback de `setAnimationLoop` se envuelve en un try/catch de nivel
 * superior: si `updateFn` lanza, el bucle se detiene (evitando que un
 * frame roto deje la pantalla congelada sin explicación) y se notifica el
 * error vía `onError` en vez de dejar que la excepción se propague sin
 * control (Requisitos funcionales 3).
 */
export class GameLoop {
  /**
   * @param {{ setAnimationLoop: (cb: ((time: number) => void)|null) => void }} renderDriver -
   *   Objeto que expone `setAnimationLoop`, típicamente el `RenderEngine`.
   * @param {(deltaTime: number, elapsedTime: number) => void} updateFn -
   *   Callback de actualización de sistemas por frame. Recibe el
   *   `deltaTime` (segundos transcurridos desde el frame anterior) y el
   *   `elapsedTime` (segundos transcurridos desde el primer frame).
   * @param {(error: Error) => void} [onError] - Callback opcional de
   *   manejo de errores, invocado si `updateFn` lanza una excepción.
   */
  constructor(renderDriver, updateFn, onError) {
    /** @private */
    this._renderDriver = renderDriver;
    /** @private */
    this._updateFn = updateFn;
    /** @private */
    this._onError = onError;
    /** @private @type {number|null} - timestamp (ms) del último tick, o null si aún no hubo ningún frame */
    this._lastTime = null;
    /** @private @type {number} - segundos transcurridos desde el primer frame */
    this._elapsedTime = 0;
    /** @private @type {boolean} */
    this._running = false;

    // Se enlaza una sola vez para poder pasarla como referencia estable a
    // `setAnimationLoop` y para poder removerla en `stop()`.
    this._tick = this._tick.bind(this);
  }

  /**
   * Inicia el bucle de juego, delegando en `renderDriver.setAnimationLoop`.
   * @returns {void}
   */
  start() {
    this._running = true;
    this._lastTime = null;
    this._elapsedTime = 0;
    this._renderDriver.setAnimationLoop(this._tick);
  }

  /**
   * Detiene el bucle de juego, removiendo el callback de
   * `renderDriver.setAnimationLoop`.
   * @returns {void}
   */
  stop() {
    this._running = false;
    this._renderDriver.setAnimationLoop(null);
  }

  /**
   * Callback invocado por `renderDriver.setAnimationLoop` en cada frame.
   * Calcula el `deltaTime` en segundos y ejecuta `updateFn` dentro de un
   * try/catch de nivel superior.
   * @private
   * @param {number} time - Timestamp de alta resolución en milisegundos,
   *   provisto por `setAnimationLoop`.
   * @returns {void}
   */
  _tick(time) {
    // Primer frame: no hay `lastTime` de referencia todavía, así que se usa
    // deltaTime = 0 en vez de NaN o de un salto enorme.
    const deltaTime = this._lastTime === null ? 0 : (time - this._lastTime) / 1000;
    this._lastTime = time;
    this._elapsedTime += deltaTime;

    try {
      this._updateFn(deltaTime, this._elapsedTime);
    } catch (error) {
      this.stop();
      if (this._onError) {
        this._onError(error);
      } else {
        // eslint-disable-next-line no-console
        console.error(error);
      }
    }
  }
}
