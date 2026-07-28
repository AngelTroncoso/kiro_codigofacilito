/**
 * ProgressStore - Única fuente de verdad del progreso de la Sesion_de_Juego.
 *
 * Mantiene en memoria las habilidades obtenidas, los mecanismos ambientales
 * resueltos y si el Desafío Final fue completado. Es leído directamente
 * (por referencia, sin copias) por `UISystem`, `AbilitySystem` y
 * `MovementSystem`, lo que garantiza consistencia de estado expuesto a los
 * demás subsistemas (Requisitos funcionales 4).
 *
 * Se reinicia por completo (nueva instancia) únicamente al arrancar una
 * nueva Sesion_de_Juego (recarga de página), nunca durante la sesión misma
 * (Requisito 9.3).
 */
export class ProgressStore {
  constructor() {
    /** @type {Set<string>} */
    this._habilidades = new Set();
    /** @type {Set<string>} */
    this._mecanismosResueltos = new Set();
    /** @type {boolean} */
    this._desafioCompletado = false;
    /** 
     * @type {'codi' | 'kiro'} 
     * SPEC-CHAR01: Personaje seleccionado por el jugador en la Portada. 
     * Fuente de verdad para renderizado 3D. Default: 'codi'.
     */
    this._personajeSeleccionado = 'codi';
    /** @type {Array<(store: ProgressStore) => void>} */
    this._listeners = [];
  }

  /**
   * SPEC-CHAR01: Retorna el personaje seleccionado actualmente por el jugador.
   * @returns {'codi' | 'kiro'}
   */
  personajeSeleccionado() {
    return this._personajeSeleccionado;
  }

  /**
   * SPEC-CHAR01: Actualiza el personaje seleccionado y notifica a los suscriptores.
   * Solo acepta valores válidos: 'codi' o 'kiro'. Cualquier otro valor se ignora.
   * @param {'codi' | 'kiro'} id - Identificador del personaje seleccionado.
   * @returns {void}
   */
  seleccionarPersonaje(id) {
    if (id === 'codi' || id === 'kiro') {
      this._personajeSeleccionado = id;
      this._notificar();
    }
  }

  /**
   * Indica si la habilidad con el id dado ya fue obtenida.
   * @param {string} id - Identificador de la habilidad (p. ej. "python").
   * @returns {boolean}
   */
  tieneHabilidad(id) {
    return this._habilidades.has(id);
  }

  /**
   * Devuelve un snapshot inmutable de las habilidades obtenidas.
   * Modificar el Set devuelto no afecta el estado interno del store.
   * @returns {Set<string>}
   */
  habilidades() {
    return new Set(this._habilidades);
  }

  /**
   * Indica si el mecanismo ambiental con el id dado ya fue resuelto.
   * @param {string} id - Identificador del mecanismo.
   * @returns {boolean}
   */
  tieneMecanismoResuelto(id) {
    return this._mecanismosResueltos.has(id);
  }

  /**
   * Devuelve un snapshot inmutable de los mecanismos resueltos.
   * Modificar el Set devuelto no afecta el estado interno del store.
   * @returns {Set<string>}
   */
  mecanismosResueltos() {
    return new Set(this._mecanismosResueltos);
  }

  /**
   * Indica si el Desafío Final fue completado. Exposición de solo lectura
   * de `_desafioCompletado`.
   * @returns {boolean}
   */
  desafioCompletado() {
    return this._desafioCompletado;
  }

  /**
   * Otorga una habilidad al jugador y notifica a los suscriptores.
   * @param {string} id - Identificador de la habilidad otorgada.
   * @returns {void}
   */
  otorgarHabilidad(id) {
    this._habilidades.add(id);
    this._notificar();
  }

  /**
   * Marca un mecanismo ambiental como resuelto y notifica a los suscriptores.
   * @param {string} id - Identificador del mecanismo resuelto.
   * @returns {void}
   */
  marcarMecanismoResuelto(id) {
    this._mecanismosResueltos.add(id);
    this._notificar();
  }

  /**
   * Marca el Desafío Final como completado y notifica a los suscriptores.
   * @returns {void}
   */
  marcarDesafioCompletado() {
    this._desafioCompletado = true;
    this._notificar();
  }

  /**
   * Reinicia todo el progreso del juego. Se usa para "Volver a Jugar"
   * sin recargar la página.
   * @returns {void}
   */
  reset() {
    this._habilidades.clear();
    this._mecanismosResueltos.clear();
    this._desafioCompletado = false;
    this._notificar();
  }

  /**
   * Suscribe una función que será invocada con el store cada vez que
   * ocurra una mutación de estado.
   * @param {(store: ProgressStore) => void} fn - Callback de suscripción.
   * @returns {void}
   */
  suscribir(fn) {
    this._listeners.push(fn);
  }

  /**
   * Notifica a todos los suscriptores del estado actual del store.
   * @private
   * @returns {void}
   */
  _notificar() {
    this._listeners.forEach((fn) => fn(this));
  }
}
