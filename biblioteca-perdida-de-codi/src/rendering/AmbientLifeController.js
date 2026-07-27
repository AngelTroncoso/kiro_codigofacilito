/**
 * AmbientLifeController.js - "Ambient Life Controller" (SPEC-06: Living
 * World — Ambient Life System, sección 1).
 *
 * Controlador interno, DEDICADO exclusivamente a coordinar las pequeñas
 * animaciones ambientales del entorno (Cristales de Conocimiento y Glifos
 * Antiguos ya creados por `RenderEngine._crearDetallesAmbientales`, ver
 * SPEC-03): flotación/rotación/pulso individual de cristales (sección 2),
 * respiración/ondas/intensidad variable de glifos (sección 3), un "pulso"
 * ambiental global compartido pero nunca perfectamente periódico
 * (Environmental Breathing, sección 4), un desfase espacial que hace que
 * el pulso se lea como energía recorriendo la biblioteca (Library Energy
 * Flow, sección 6), y pequeñas variaciones aleatorias cuando el jugador
 * permanece quieto (Idle World Variations, sección 7).
 *
 * DESACOPLAMIENTO (condición explícita de esta Specification, sección 1:
 * "Deberá operar de forma desacoplada del gameplay. No deberá conocer
 * reglas del juego."): el constructor solo recibe arrays de objetos 3D ya
 * construidos y posicionados por `RenderEngine` — nunca `ProgressStore`,
 * `MecanismoAmbiental`, `MovementSystem` ni ningún tipo de `WorldModel.js`.
 * El único dato de "contexto de juego" que entra a `actualizar()` es un
 * booleano `quieto` (si el jugador está inmóvil en este frame), que es
 * exactamente el mismo tipo de dato presentacional que `RenderEngine` ya
 * deriva de `poseCodi.velocity` para SPEC-04 (Character Polish) — nunca se
 * expone ni se necesita conocer el motivo/regla de por qué está quieto.
 *
 * Todas las fases/velocidades individuales se sortean UNA SOLA VEZ en el
 * constructor (nunca se re-aleatorizan por frame), para que cada elemento
 * mantenga una "personalidad" visual consistente durante toda la sesión
 * (Visual Coherence, sección 8) en vez de parpadear de forma errática.
 */

/** Velocidad angular (rad/s) de la primera onda del pulso ambiental global. */
const VELOCIDAD_PULSO_GLOBAL_1 = 0.35;

/**
 * Velocidad angular (rad/s) de la segunda onda del pulso ambiental global.
 * Deliberadamente distinta e inconmensurable con `VELOCIDAD_PULSO_GLOBAL_1`
 * (ninguna razón simple entre ambas) para que la suma de ambas ondas nunca
 * complete un ciclo perfectamente periódico dentro de una sesión de juego
 * razonable (Environmental Breathing, sección 4: "nunca perfectamente
 * periódico").
 */
const VELOCIDAD_PULSO_GLOBAL_2 = 0.2166;

/** Amplitud (unidades del mundo) de la flotación vertical de cada cristal. */
const AMPLITUD_FLOTACION_CRISTAL = 0.08;

/** Amplitud base del pulso luminoso de cada cristal (se escala individualmente, ver constructor). */
const AMPLITUD_PULSO_CRISTAL_BASE = 0.12;

/** Amplitud base del pulso luminoso ("respiración") de cada glifo. */
const AMPLITUD_PULSO_GLIFO_BASE = 0.1;

/** Amplitud de la variación de escala uniforme de cada glifo ("pequeñas ondas de energía"). */
const AMPLITUD_ONDA_GLIFO = 0.05;

/**
 * Factor que convierte la posición espacial (x+z) de un elemento en un
 * desfase de fase del pulso (Library Energy Flow, sección 6): valores
 * mayores hacen que la "ola" de energía se perciba viajar más rápido a
 * través del espacio. No introduce geometría, luces ni materiales nuevos:
 * reutiliza el mismo pulso/material `emissive` ya existente de cada
 * elemento, solo desfasado según su posición.
 */
const FACTOR_FLUJO_ENERGIA = 0.06;

/** Segundos de quietud continua requeridos antes de que puedan dispararse Idle World Variations (sección 7). */
const UMBRAL_QUIETUD_S = 4;

/** Probabilidad (por segundo) de disparar una variación sutil una vez superado el umbral de quietud. */
const PROBABILIDAD_VARIACION_POR_SEGUNDO = 0.04;

/** Tiempo mínimo (segundos) entre dos variaciones sutiles consecutivas, para que nunca se perciban como un patrón. */
const COOLDOWN_VARIACION_S = 6;

/** Duración (segundos) del breve realce de brillo de una variación sutil. */
const DURACION_VARIACION_S = 1.2;

/**
 * Sortea un valor aleatorio uniforme en `[min, max)`.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function aleatorioEntre(min, max) {
  return min + Math.random() * (max - min);
}

export class AmbientLifeController {
  /**
   * @param {Object} opciones
   * @param {import('three').Mesh[]} [opciones.cristales] - Mallas de
   *   Cristales de Conocimiento ya posicionadas en el mundo (ver
   *   `RenderEngine._crearDetallesAmbientales`). Cada una debe tener un
   *   `material` individual (no compartido entre cristales) para poder
   *   variar su `emissiveIntensity` de forma independiente.
   * @param {import('three').Mesh[]} [opciones.glifos] - Mallas de Glifos
   *   Antiguos ya posicionadas en el mundo, con la misma condición de
   *   material individual.
   */
  constructor({ cristales = [], glifos = [] } = {}) {
    /** @private */
    this._cristales = cristales;
    /** @private */
    this._glifos = glifos;
    /** @private */
    this._tiempoTotal = 0;
    /** @private - segundos de quietud continua acumulados (sección 7) */
    this._tiempoQuieto = 0;
    /** @private - segundos restantes antes de poder disparar otra variación sutil */
    this._cooldownVariacionRestante = 0;

    for (const cristal of this._cristales) {
      // Parámetros individuales sorteados una sola vez (nunca re-generados
      // por frame): posición base, fase/velocidad de flotación, velocidad
      // de rotación (con signo aleatorio, para que no todos giren en el
      // mismo sentido) y amplitud/fase de pulso propias.
      cristal.userData.vidaAmbiental = {
        baseY: cristal.position.y,
        faseFlotacion: aleatorioEntre(0, Math.PI * 2),
        velocidadFlotacion: aleatorioEntre(0.3, 0.55),
        velocidadRotacionY: aleatorioEntre(0.06, 0.16) * (Math.random() < 0.5 ? -1 : 1),
        fasePulso: aleatorioEntre(0, Math.PI * 2),
        velocidadPulso: aleatorioEntre(0.8, 1.4),
        amplitudPulso: AMPLITUD_PULSO_CRISTAL_BASE * aleatorioEntre(0.7, 1.3),
        emissiveIntensityBase: cristal.material.emissiveIntensity ?? 0.35,
        desfaseFlujo: (cristal.position.x + cristal.position.z) * FACTOR_FLUJO_ENERGIA,
        boostRestante: 0,
        boostFuerza: 0,
      };
    }

    for (const glifo of this._glifos) {
      glifo.userData.vidaAmbiental = {
        baseScale: glifo.scale.x, // uniforme (x=y=z en la creación original)
        fasePulso: aleatorioEntre(0, Math.PI * 2),
        velocidadPulso: aleatorioEntre(0.5, 0.9),
        faseOnda: aleatorioEntre(0, Math.PI * 2),
        velocidadOnda: aleatorioEntre(0.4, 0.7),
        amplitudPulso: AMPLITUD_PULSO_GLIFO_BASE * aleatorioEntre(0.7, 1.3),
        emissiveIntensityBase: glifo.material.emissiveIntensity ?? 0.25,
        desfaseFlujo: (glifo.position.x + glifo.position.z) * FACTOR_FLUJO_ENERGIA,
        boostRestante: 0,
        boostFuerza: 0,
      };
    }
  }

  /**
   * Tiempo total (segundos) acumulado desde la construcción de este
   * controlador. Expuesto para que otros sistemas puramente visuales de
   * `RenderEngine` (p.ej. la turbulencia de las Partículas Ambientales,
   * sección 5) puedan sincronizar su fase de animación con el mismo reloj,
   * en vez de mantener un segundo acumulador de tiempo duplicado
   * (Consistency Pass, sección 8: evitar duplicación).
   *
   * @returns {number}
   */
  obtenerTiempoTotal() {
    return this._tiempoTotal;
  }

  /**
   * Calcula el "pulso ambiental global" (Environmental Breathing, sección
   * 4): la suma normalizada de dos ondas seno de frecuencias distintas e
   * inconmensurables, en `[0, 1]`. Es la señal compartida que da a los
   * materiales emisivos compatibles (cristales, glifos) una sensación de
   * "respirar juntos" de forma orgánica, sin que ninguno replique
   * exactamente al otro (cada elemento la combina con su propia fase/
   * amplitud individual antes de aplicarla, ver `_actualizarCristales`/
   * `_actualizarGlifos`).
   *
   * @private
   * @returns {number}
   */
  _calcularPulsoGlobal() {
    const onda1 = Math.sin(this._tiempoTotal * VELOCIDAD_PULSO_GLOBAL_1);
    const onda2 = Math.sin(this._tiempoTotal * VELOCIDAD_PULSO_GLOBAL_2);
    return (onda1 + onda2) * 0.25 + 0.5; // combina ambas ondas ([-2,2]) y normaliza a [0,1]
  }

  /**
   * Avanza toda la vida ambiental un frame: flotación/rotación/pulso de
   * cristales, respiración/ondas de glifos, y evaluación de Idle World
   * Variations si el jugador lleva suficiente tiempo quieto.
   *
   * No-op seguro si `deltaSegundos <= 0` (primer frame de `RenderEngine`,
   * mismo criterio que el resto de animaciones de esta clase).
   *
   * @param {number} deltaSegundos
   * @param {boolean} [quieto=false] - `true` si el jugador está inmóvil en
   *   este frame; dato puramente presentacional (ver JSDoc de la clase),
   *   usado únicamente para decidir cuándo pueden dispararse las Idle
   *   World Variations de la sección 7.
   * @returns {void}
   */
  actualizar(deltaSegundos, quieto = false) {
    if (deltaSegundos <= 0) {
      return;
    }

    this._tiempoTotal += deltaSegundos;
    const pulsoGlobal = this._calcularPulsoGlobal();

    this._actualizarCristales(deltaSegundos, pulsoGlobal);
    this._actualizarGlifos(deltaSegundos, pulsoGlobal);
    this._actualizarVariacionesDeQuietud(deltaSegundos, quieto);
  }

  /**
   * Anima los Cristales de Conocimiento (sección 2): flotación vertical
   * lenta, rotación lenta individual, y un pulso luminoso que combina el
   * pulso ambiental global (sección 4, desfasado espacialmente para el
   * efecto de flujo de energía de la sección 6) con la fase/amplitud
   * propia de cada cristal — nunca dos cristales quedan perfectamente
   * sincronizados entre sí.
   *
   * @private
   * @param {number} deltaSegundos
   * @param {number} pulsoGlobal
   * @returns {void}
   */
  _actualizarCristales(deltaSegundos, pulsoGlobal) {
    for (const cristal of this._cristales) {
      const vida = cristal.userData.vidaAmbiental;

      cristal.position.y =
        vida.baseY + Math.sin(this._tiempoTotal * vida.velocidadFlotacion + vida.faseFlotacion) * AMPLITUD_FLOTACION_CRISTAL;
      cristal.rotation.y += deltaSegundos * vida.velocidadRotacionY;

      const pulsoIndividual = Math.sin(this._tiempoTotal * vida.velocidadPulso + vida.fasePulso + vida.desfaseFlujo);
      let boost = 0;
      if (vida.boostRestante > 0) {
        vida.boostRestante -= deltaSegundos;
        boost = Math.max(0, vida.boostRestante / DURACION_VARIACION_S) * vida.boostFuerza;
      }

      // El pulso global aporta solo una influencia sutil (±15% de su
      // propio rango) sobre el pulso ya dominado por la fase/amplitud
      // individual, para lograr "sincronizar de manera orgánica" sin que
      // los cristales se vean mecánicamente idénticos entre sí.
      const influenciaGlobal = (pulsoGlobal - 0.5) * 0.3;
      cristal.material.emissiveIntensity = Math.max(
        0,
        vida.emissiveIntensityBase + pulsoIndividual * vida.amplitudPulso + influenciaGlobal * vida.amplitudPulso + boost
      );
    }
  }

  /**
   * Anima los Glifos Antiguos (sección 3): respiración luminosa (pulso de
   * `emissiveIntensity`) y pequeñas ondas de energía (oscilación sutil de
   * escala uniforme), cada una con su propia fase/velocidad, más el mismo
   * desfase espacial de flujo de energía que los cristales (sección 6).
   * Los glifos nunca rotan ni flotan (a diferencia de los cristales): su
   * "vida" es discreta y cercana al suelo, para no convertirse en un foco
   * de atención permanente (requisito explícito de la sección 3).
   *
   * @private
   * @param {number} deltaSegundos
   * @param {number} pulsoGlobal
   * @returns {void}
   */
  _actualizarGlifos(deltaSegundos, pulsoGlobal) {
    for (const glifo of this._glifos) {
      const vida = glifo.userData.vidaAmbiental;

      const pulsoIndividual = Math.sin(this._tiempoTotal * vida.velocidadPulso + vida.fasePulso + vida.desfaseFlujo);
      let boost = 0;
      if (vida.boostRestante > 0) {
        vida.boostRestante -= deltaSegundos;
        boost = Math.max(0, vida.boostRestante / DURACION_VARIACION_S) * vida.boostFuerza;
      }

      const influenciaGlobal = (pulsoGlobal - 0.5) * 0.3;
      glifo.material.emissiveIntensity = Math.max(
        0,
        vida.emissiveIntensityBase + pulsoIndividual * vida.amplitudPulso + influenciaGlobal * vida.amplitudPulso + boost
      );

      const onda = Math.sin(this._tiempoTotal * vida.velocidadOnda + vida.faseOnda + vida.desfaseFlujo);
      const escala = vida.baseScale * (1 + Math.max(0, onda) * AMPLITUD_ONDA_GLIFO);
      glifo.scale.set(escala, escala, escala);
    }
  }

  /**
   * Idle World Variations (sección 7): cuando el jugador permanece quieto
   * más de `UMBRAL_QUIETUD_S` segundos, hay una probabilidad pequeña por
   * segundo (`PROBABILIDAD_VARIACION_POR_SEGUNDO`) de disparar un breve
   * realce de brillo sobre un cristal o glifo elegido al azar —
   * deliberadamente silencioso (ningún mensaje/UI, ninguna partícula
   * nueva): un simple pico de `emissiveIntensity` que decae en
   * `DURACION_VARIACION_S` segundos, indistinguible de una fluctuación
   * natural de la respiración ambiental y por tanto incapaz de leerse
   * como un evento de gameplay (requisito explícito de la sección 7).
   *
   * `_cooldownVariacionRestante` evita que se disparen variaciones muy
   * seguidas entre sí, incluso si la probabilidad aleatoria "acierta" en
   * frames consecutivos.
   *
   * @private
   * @param {number} deltaSegundos
   * @param {boolean} quieto
   * @returns {void}
   */
  _actualizarVariacionesDeQuietud(deltaSegundos, quieto) {
    if (this._cooldownVariacionRestante > 0) {
      this._cooldownVariacionRestante -= deltaSegundos;
    }

    if (!quieto) {
      this._tiempoQuieto = 0;
      return;
    }

    this._tiempoQuieto += deltaSegundos;

    if (this._tiempoQuieto < UMBRAL_QUIETUD_S || this._cooldownVariacionRestante > 0) {
      return;
    }

    if (Math.random() < PROBABILIDAD_VARIACION_POR_SEGUNDO * deltaSegundos) {
      this._dispararVariacionSutil();
      this._cooldownVariacionRestante = COOLDOWN_VARIACION_S;
    }
  }

  /**
   * Elige un cristal o glifo al azar (entre todos los registrados) y le
   * asigna un breve impulso de brillo (`boostRestante`/`boostFuerza`),
   * consumido gradualmente por `_actualizarCristales`/`_actualizarGlifos`
   * en los frames siguientes. No-op si no hay ningún elemento registrado.
   *
   * @private
   * @returns {void}
   */
  _dispararVariacionSutil() {
    const candidatos = [...this._cristales, ...this._glifos];
    if (candidatos.length === 0) {
      return;
    }

    const elegido = candidatos[Math.floor(Math.random() * candidatos.length)];
    const vida = elegido.userData.vidaAmbiental;
    vida.boostRestante = DURACION_VARIACION_S;
    vida.boostFuerza = aleatorioEntre(0.15, 0.3);
  }

  /**
   * Libera los materiales individuales (clonados por
   * `RenderEngine._crearDetallesAmbientales` para que este controlador
   * pudiera animarlos de forma independiente) de cristales y glifos. La
   * geometría de cada malla no se libera aquí porque es COMPARTIDA (todas
   * las instancias de una misma categoría reutilizan la misma
   * `THREE.BufferGeometry`, solo el material se clona por instancia); su
   * disposición sigue siendo responsabilidad de quien la creó
   * originalmente, igual que antes de esta Specification.
   *
   * @returns {void}
   */
  dispose() {
    for (const cristal of this._cristales) {
      cristal.material?.dispose();
    }
    for (const glifo of this._glifos) {
      glifo.material?.dispose();
    }
  }
}
