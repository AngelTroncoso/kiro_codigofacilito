import { InputProvider } from './InputProvider.js';

/**
 * Convención de teclas de este proveedor (MVP: solo teclado y mouse, sin
 * gamepad — Restricciones técnicas 10):
 *
 * - Movimiento: WASD y flechas de dirección, combinadas libremente.
 *   Convención de ejes de `vectorMovimiento` (coherente con el sistema de
 *   coordenadas de Three.js, donde -Z es "hacia adelante"):
 *     - `z = -1` cuando se presiona W o ArrowUp (adelante)
 *     - `z = +1` cuando se presiona S o ArrowDown (atrás)
 *     - `x = -1` cuando se presiona A o ArrowLeft (izquierda)
 *     - `x = +1` cuando se presiona D o ArrowRight (derecha)
 *   Si se presionan ambas teclas de un mismo eje simultáneamente (p.ej. W y S),
 *   se cancelan y ese eje queda en 0. El vector NO se normaliza a longitud 1 en
 *   diagonal (por diseño, cada eje es independiente en el rango [-1, 1]); es
 *   responsabilidad de `MovementSystem` normalizar la magnitud si así lo
 *   requiere su lógica de velocidad.
 * - Salto: tecla Espacio (`Space`), edge-triggered (borde de subida). Sólo
 *   reporta `true` una vez por cada pulsación, sin importar cuánto tiempo se
 *   mantenga presionada; para volver a reportar `true` la tecla debe soltarse
 *   y presionarse de nuevo.
 * - Interacción: tecla `E`, edge-triggered de la misma forma que el salto.
 *   Se usa para "usar/consultar mecanismo cercano".
 * - Cámara: movimiento del mouse (`mousemove`). Se acumula el delta
 *   (`movementX`/`movementY`) desde la última llamada a `leerEstado()` y se
 *   reporta como el delta del frame; el acumulador se resetea tras cada
 *   lectura.
 */

/** @type {Record<string, {axis: 'x'|'z', sign: 1|-1}>} */
const MAPA_MOVIMIENTO = {
  KeyW: { axis: 'z', sign: -1 },
  ArrowUp: { axis: 'z', sign: -1 },
  KeyS: { axis: 'z', sign: 1 },
  ArrowDown: { axis: 'z', sign: 1 },
  KeyA: { axis: 'x', sign: -1 },
  ArrowLeft: { axis: 'x', sign: -1 },
  KeyD: { axis: 'x', sign: 1 },
  ArrowRight: { axis: 'x', sign: 1 },
};

const TECLA_SALTAR = 'Space';
const TECLA_INTERACTUAR = 'KeyE';

/**
 * KeyboardMouseInputProvider - Implementación de `InputProvider` basada en
 * eventos DOM de teclado y mouse.
 *
 * Acumula eventos `keydown`/`keyup`/`mousemove` recibidos desde la última
 * llamada a `leerEstado()` y los traduce a un `InputState` normalizado e
 * independiente del dispositivo, tal como exige la
 * `Arquitectura_WebXR_Preparada`: ni `MovementSystem` ni `CameraSystem`
 * conocen la existencia de teclas o del mouse, solo consumen `InputState`.
 */
export class KeyboardMouseInputProvider extends InputProvider {
  /**
   * @param {EventTarget & {addEventListener: Function, removeEventListener: Function}} [target] -
   *   Elemento sobre el cual registrar los listeners DOM. Por defecto es
   *   `window`, lo más simple para un juego a pantalla completa.
   */
  constructor(target = window) {
    super();

    /** @private */
    this._target = target;

    /** @private @type {Set<string>} - códigos de tecla (`event.code`) actualmente presionados */
    this._teclasPresionadas = new Set();

    /** @private @type {boolean} - borde de subida pendiente de reportar para saltar */
    this._saltarPendiente = false;
    /** @private @type {boolean} - borde de subida pendiente de reportar para interactuar */
    this._interactuarPendiente = false;

    /** @private @type {{x: number, y: number}} - acumulador de delta de mouse del frame actual */
    this._deltaCamaraAcumulado = { x: 0, y: 0 };

    // Enlazadas una sola vez para poder removerlas de forma simétrica en `dispose()`.
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);

    this._target.addEventListener('keydown', this._onKeyDown);
    this._target.addEventListener('keyup', this._onKeyUp);
    this._target.addEventListener('mousemove', this._onMouseMove);
  }

  /**
   * @private
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  _onKeyDown(event) {
    const yaPresionada = this._teclasPresionadas.has(event.code);
    this._teclasPresionadas.add(event.code);

    // Edge-triggered: solo se marca "pendiente" en la transición de
    // no-presionada -> presionada, nunca mientras se mantiene presionada
    // (evita repetición por auto-repeat del sistema operativo).
    if (!yaPresionada) {
      if (event.code === TECLA_SALTAR) {
        this._saltarPendiente = true;
      } else if (event.code === TECLA_INTERACTUAR) {
        this._interactuarPendiente = true;
      }
    }
  }

  /**
   * @private
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  _onKeyUp(event) {
    this._teclasPresionadas.delete(event.code);
  }

  /**
   * @private
   * @param {MouseEvent} event
   * @returns {void}
   */
  _onMouseMove(event) {
    this._deltaCamaraAcumulado.x += event.movementX || 0;
    this._deltaCamaraAcumulado.y += event.movementY || 0;
  }

  /**
   * Calcula el `vectorMovimiento` actual a partir de las teclas
   * actualmente presionadas. Teclas opuestas del mismo eje se cancelan.
   * @private
   * @returns {{x: number, z: number}}
   */
  _calcularVectorMovimiento() {
    let x = 0;
    let z = 0;
    for (const codigo of this._teclasPresionadas) {
      const mapeo = MAPA_MOVIMIENTO[codigo];
      if (!mapeo) continue;
      if (mapeo.axis === 'x') x += mapeo.sign;
      else z += mapeo.sign;
    }
    // Clamp defensivo: si por alguna razón se acumulara más de +-1 en un eje
    // (no debería ocurrir con el mapa actual, pero protege ante mapas futuros
    // con más de dos teclas por eje/signo), se recorta al rango [-1, 1].
    x = Math.max(-1, Math.min(1, x));
    z = Math.max(-1, Math.min(1, z));
    return { x, z };
  }

  /**
   * Lee el estado de entrada acumulado desde la última llamada y resetea
   * los flags edge-triggered y el acumulador de delta de mouse, de forma
   * que cada llamada reporte únicamente lo ocurrido durante ese frame.
   * @returns {import('./InputProvider.js').InputState}
   */
  leerEstado() {
    const estado = {
      vectorMovimiento: this._calcularVectorMovimiento(),
      deltaCamara: { x: this._deltaCamaraAcumulado.x, y: this._deltaCamaraAcumulado.y },
      saltar: this._saltarPendiente,
      accionInteractuar: this._interactuarPendiente,
    };

    // Consumir los flags/deltas edge-triggered: tras reportarlos una vez,
    // vuelven a su estado "en reposo" hasta el próximo evento DOM.
    this._saltarPendiente = false;
    this._interactuarPendiente = false;
    this._deltaCamaraAcumulado = { x: 0, y: 0 };

    return estado;
  }

  /**
   * Remueve los listeners DOM registrados en el constructor. Debe llamarse
   * al descartar este proveedor (p.ej. en tests, o al destruir la escena)
   * para evitar fugas de memoria/listeners huérfanos.
   * @returns {void}
   */
  dispose() {
    this._target.removeEventListener('keydown', this._onKeyDown);
    this._target.removeEventListener('keyup', this._onKeyUp);
    this._target.removeEventListener('mousemove', this._onMouseMove);
  }
}
