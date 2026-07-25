/**
 * AbilitySystem.js - Sistema_de_Habilidades (Requirements 4, 5, 6, 7, 10).
 *
 * Responsable del "gating" (permitir una interacción/acceso solo si el
 * Jugador posee la(s) Habilidad(es) requerida(s)) y de la máquina de
 * estados de dos valores (`bloqueado` → `resuelto`) de todo
 * `MecanismoAmbiental`.
 *
 * DECISIÓN DE DISEÑO CLAVE (unificación de gating): tanto el gating de un
 * `MecanismoAmbiental` individual (una única `habilidadRequerida`, ver
 * Requirements 4.1/4.3 Python, 5.1/5.3 JavaScript, 6.1/6.3 SQL) como el
 * gating de una `Zona` (un conjunto `habilidadesRequeridas` de tamaño 0, 1
 * o 3 — este último caso es exactamente la Zona del Desafío_Final,
 * Requisito 10.1) son, en el fondo, el MISMO problema: "¿el conjunto de
 * habilidades requerido R está contenido en el conjunto de habilidades
 * poseídas P?". `puedeInteractuar` es simplemente el caso particular de
 * `puedeAcceder` donde `R` tiene tamaño 1 (`{mecanismo.habilidadRequerida}`).
 * design.md describe esto como "el mismo patrón, parametrizado por el
 * tamaño del conjunto requerido"; aquí se mantienen como dos métodos
 * separados (en vez de que uno delegue trivialmente en el otro envolviendo
 * la habilidad única en un array) para conservar la firma exacta
 * especificada en design.md y evitar asignar arrays innecesarios en el
 * camino más caliente (`puedeInteractuar`, invocado potencialmente cada
 * frame para detectar mecanismos cercanos).
 *
 * Sigue el mismo patrón de diseño que `MovementSystem`/`CameraSystem`/
 * `AbsorptionSystem`: no mantiene estado interno propio relativo al mundo
 * (mecanismo, zona, progreso entran siempre por parámetro); el único
 * estado que esta clase sí conserva son las funciones de generación de
 * mensaje inyectables (ver constructor), que son configuración, no estado
 * mutable de partida.
 */

/**
 * Genera un mensaje de carencia (fallback) cuando `interactuar` deniega una
 * interacción por falta de la habilidad requerida.
 *
 * PLACEHOLDER RAZONABLE: la generación "rica" de mensajes contextuales
 * (tono optimista y curioso) pertenece conceptualmente a `ui/messages.js`
 * (tarea 12.1, todavía no implementada en el momento de escribir este
 * módulo). Para no crear una dependencia circular entre `abilities/` y
 * `ui/` ni bloquear esta tarea en una pieza que no existe aún, se define
 * aquí un fallback simple e inline. `ui/messages.js`, en una integración
 * posterior, podría inyectar un generador más rico vía el parámetro
 * `config.generarMensajeCarencia` del constructor de `AbilitySystem`, sin
 * romper esta API pública.
 *
 * @param {string} habilidadRequerida - Id de la habilidad faltante (p. ej. "python").
 * @returns {string} Mensaje no vacío que incluye el nombre de la habilidad requerida.
 */
function mensajeCarenciaPorDefecto(habilidadRequerida) {
  return `Necesitas el conocimiento de ${habilidadRequerida} para esto.`;
}

/**
 * Genera un mensaje de éxito (fallback) cuando `interactuar` resuelve un
 * `MecanismoAmbiental` por primera vez.
 *
 * PLACEHOLDER RAZONABLE: ver nota de `mensajeCarenciaPorDefecto` sobre la
 * relación con `ui/messages.js` (tarea 12.1) y el mecanismo de inyección
 * vía `config.generarMensajeExito`.
 *
 * @param {import('../world/WorldModel.js').MecanismoAmbiental} mecanismo
 * @returns {string} Mensaje no vacío que incluye el id o tipo del mecanismo.
 */
function mensajeExitoPorDefecto(mecanismo) {
  return `¡"${mecanismo.tipo ?? mecanismo.id}" resuelto! (${mecanismo.id})`;
}

/**
 * AbilitySystem - Sistema_de_Habilidades (Requirements 4, 5, 6, 7, 10).
 */
export class AbilitySystem {
  /**
   * @param {Object} [config] - Configuración opcional de generación de mensajes.
   * @param {(habilidadRequerida: string) => string} [config.generarMensajeCarencia] -
   *   Generador de mensaje de carencia inyectable (por defecto,
   *   `mensajeCarenciaPorDefecto`). Punto de extensión pensado para que
   *   `ui/messages.js` (tarea 12.1) pueda inyectar mensajes más ricos sin
   *   cambiar la API pública de `AbilitySystem`.
   * @param {(mecanismo: import('../world/WorldModel.js').MecanismoAmbiental) => string} [config.generarMensajeExito] -
   *   Generador de mensaje de éxito inyectable (por defecto,
   *   `mensajeExitoPorDefecto`). Mismo propósito que `generarMensajeCarencia`.
   */
  constructor(config = {}) {
    /** @private */
    this._generarMensajeCarencia = config.generarMensajeCarencia ?? mensajeCarenciaPorDefecto;
    /** @private */
    this._generarMensajeExito = config.generarMensajeExito ?? mensajeExitoPorDefecto;
  }

  /**
   * Determina si el Jugador puede interactuar con `mecanismo`: posee
   * exactamente la `habilidadRequerida` de dicho mecanismo (Requirements
   * 4.1/4.3, 5.1/5.3, 6.1/6.3).
   *
   * @param {import('../world/WorldModel.js').MecanismoAmbiental} mecanismo
   * @param {import('../core/ProgressStore.js').ProgressStore} progreso
   * @returns {boolean}
   */
  puedeInteractuar(mecanismo, progreso) {
    return progreso.tieneHabilidad(mecanismo.habilidadRequerida);
  }

  /**
   * Determina si el Jugador puede acceder a `zona`: posee TODAS las
   * habilidades de `zona.habilidadesRequeridas` (Requirements 7.1/7.2; y
   * 10.1 cuando `zona` es la Zona del Desafío_Final con 3 habilidades
   * requeridas). Si `habilidadesRequeridas` está vacío, siempre devuelve
   * `true` (zona inicial sin gating).
   *
   * @param {import('../world/WorldModel.js').Zona} zona
   * @param {import('../core/ProgressStore.js').ProgressStore} progreso
   * @returns {boolean}
   */
  puedeAcceder(zona, progreso) {
    return zona.habilidadesRequeridas.every((h) => progreso.tieneHabilidad(h));
  }

  /**
   * Intenta resolver `mecanismo`, aplicando el gating de `puedeInteractuar`
   * y, de superarlo, la máquina de estados de dos valores compartida por
   * todos los tipos de `MecanismoAmbiental` (Requirements 4.2, 6.2/5.2,
   * 4.4/6.4/5.4 — idempotencia).
   *
   * Todos los tipos de mecanismo (puente, solucion-automatizada,
   * dispositivo, plataforma-movil, camino-oculto, fuente-informacion)
   * comparten esta MISMA lógica de gating y transición de estado; lo único
   * que cambia entre tipos es el efecto visual/de escena disparado al
   * resolverse (ver `mechanismDefinitions.js` / `mechanismEffects.js`,
   * tarea 11.5), nunca la lógica aquí implementada.
   *
   * Tres resultados posibles:
   *   - `{ resultado: 'denegado', mensaje }` — el Jugador no posee la
   *     habilidad requerida; `mecanismo.estado` NO se modifica.
   *   - `{ resultado: 'sin-cambio' }` — el mecanismo ya estaba `resuelto`;
   *     no se muta nada (idempotencia, Requirements 4.4/6.4, y también
   *     cubre 5.4 en el sentido de que reactivar una plataforma-movil ya
   *     resuelta no reinicia su estado).
   *   - `{ resultado: 'resuelto', mensaje }` — transición real de
   *     `bloqueado` a `resuelto`; se registra `mecanismo.id` en
   *     `progreso.mecanismosResueltos` vía `marcarMecanismoResuelto`.
   *
   * @param {import('../world/WorldModel.js').MecanismoAmbiental} mecanismo -
   *   Mutado in-place (`estado`) cuando el resultado es `'resuelto'`.
   * @param {import('../core/ProgressStore.js').ProgressStore} progreso
   * @returns {{ resultado: 'denegado'|'sin-cambio'|'resuelto', mensaje?: string }}
   */
  interactuar(mecanismo, progreso) {
    if (!this.puedeInteractuar(mecanismo, progreso)) {
      return { resultado: 'denegado', mensaje: this._generarMensajeCarencia(mecanismo.habilidadRequerida) };
    }
    if (mecanismo.estado === 'resuelto') {
      return { resultado: 'sin-cambio' }; // idempotencia: 4.4/6.4/5.4
    }
    mecanismo.estado = 'resuelto';
    progreso.marcarMecanismoResuelto(mecanismo.id);
    return { resultado: 'resuelto', mensaje: this._generarMensajeExito(mecanismo) };
  }
}
