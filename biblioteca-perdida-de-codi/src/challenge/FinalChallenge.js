import { ZONAS } from '../world/zones.data.js';

/**
 * FinalChallenge.js - Desafio_Final contra el Bug_Supremo (Requisito 10).
 *
 * Este módulo NO introduce ningún concepto de combate, daño ni condición de
 * derrota: el Bug_Supremo se representa exclusivamente mediante el efecto
 * visual de `corruptionShader.js` aplicado sobre geometría del entorno ya
 * existente (Requisito 10.3), y la "resolución" del desafío es una secuencia
 * de pasos de diagnóstico/corrección que requieren Habilidades ya obtenidas
 * (Requisito 10.5). Igual que `AbilitySystem`/`AbsorptionSystem`, este módulo
 * es una colección de funciones/métodos puros y deliberadamente sin estado
 * interno propio del mundo: el progreso (`ProgressStore`) y el índice del
 * paso actual siempre entran por parámetro y se devuelven, nunca se guardan
 * aquí, para mantener el mismo patrón de diseño ya usado en el resto del
 * proyecto (testeable, sin estado oculto).
 */

/**
 * @typedef {import('../core/ProgressStore.js').ProgressStore} ProgressStore
 * @typedef {import('../abilities/AbilitySystem.js').AbilitySystem} AbilitySystem
 * @typedef {import('../world/WorldModel.js').Zona} Zona
 * @typedef {import('../world/WorldModel.js').HabilidadId} HabilidadId
 */

/**
 * Id de la Zona del Desafio_Final en `zones.data.js`. Se expone como
 * constante para no repetir el literal en varios lugares (aquí y en los
 * tests) y para que, si el id cambiara alguna vez, solo haya un punto de
 * actualización.
 *
 * @type {string}
 */
export const ZONA_DESAFIO_FINAL_ID = 'biblioteca-corrupta';

/**
 * Zona del Desafio_Final por defecto, resuelta desde `ZONAS` de
 * `zones.data.js` (la que declara `habilidadesRequeridas: ['python',
 * 'javascript', 'sql']`). Se resuelve una sola vez al cargar el módulo
 * porque `ZONAS` es un dato declarativo estático que no cambia en tiempo de
 * ejecución.
 *
 * @type {Zona | undefined}
 */
export const ZONA_DESAFIO_FINAL_POR_DEFECTO = ZONAS.find((zona) => zona.id === ZONA_DESAFIO_FINAL_ID);

/**
 * Secuencia declarativa de pasos de resolución del Desafio_Final. Cada paso
 * está asociado a exactamente una Habilidad concreta, y usa siempre lenguaje
 * de diagnóstico/reparación de conocimiento (nunca de combate), en línea con
 * el Requisito 10.5 ("comunicarse al Jugador como un problema a resolver
 * mediante conocimiento combinado, no como un combate").
 *
 * Usa al menos dos Habilidades DISTINTAS entre sus pasos ('sql' y 'python'),
 * lo cual junto con el gating de `puedeIniciar` (que ya exige las 3
 * Habilidades para siquiera empezar) satisface el Requisito 10.2 ("requerir
 * el uso de al menos dos de las tres Habilidades obtenidas para
 * completarse").
 *
 * @type {Array<{ id: string, habilidadRequerida: HabilidadId, descripcion: string }>}
 */
export const PASOS_DESAFIO_FINAL = [
  {
    id: 'diagnosticar-origen-corrupcion',
    habilidadRequerida: 'sql',
    descripcion: 'Consulta los registros antiguos de la Biblioteca para diagnosticar el origen de la corrupción.',
  },
  {
    id: 'corregir-corrupcion',
    habilidadRequerida: 'python',
    descripcion: 'Escribe una solución automatizada que corrija la corrupción detectada y restaure el conocimiento afectado.',
  },
  {
    id: 'restaurar-estabilidad-entorno',
    habilidadRequerida: 'javascript',
    descripcion: 'Activa los mecanismos de la Biblioteca para restaurar la estabilidad del entorno depurado.',
  },
];

/**
 * FinalChallenge - orquesta el gating de inicio, la aplicación del efecto
 * visual de corrupción sobre el entorno y el avance/resolución de la
 * secuencia de pasos del Desafio_Final.
 */
export class FinalChallenge {
  /**
   * Determina si el Jugador puede iniciar el Desafio_Final: reutiliza
   * `abilitySystem.puedeAcceder(zonaFinal, progreso)`, que ya exige poseer
   * TODAS las `habilidadesRequeridas` de la zona (Requisito 10.1: las 3
   * Habilidades del MVP, dado que `zonaFinal.habilidadesRequeridas` tiene
   * las 3 en `zones.data.js`).
   *
   * @param {ProgressStore} progreso
   * @param {AbilitySystem} abilitySystem
   * @param {Zona} [zonaFinal] - Zona del Desafio_Final; por defecto
   *   `ZONA_DESAFIO_FINAL_POR_DEFECTO` (la Zona `'biblioteca-corrupta'` real
   *   de `zones.data.js`). Inyectable para facilitar tests con Zonas de
   *   prueba distintas.
   * @returns {boolean}
   */
  puedeIniciar(progreso, abilitySystem, zonaFinal = ZONA_DESAFIO_FINAL_POR_DEFECTO) {
    return abilitySystem.puedeAcceder(zonaFinal, progreso);
  }

  /**
   * Aplica el efecto visual de corrupción del Bug_Supremo sobre cada malla
   * del entorno de la Zona final. Nunca crea ni aplica el efecto sobre un
   * modelo/malla propia del Bug_Supremo (que no existe, Requisito 10.3):
   * `mallasEntorno` debe contener únicamente geometría del entorno ya
   * cargada (p. ej. por `AssetLoader`).
   *
   * Si se provee un `RenderEngine` real (objeto con método
   * `aplicarCorrupcion(malla, intensidad)`), se delega en él por cada malla
   * (mismo camino que usa el resto del juego para aplicar corrupción,
   * `RenderEngine.aplicarCorrupcion`). Si en cambio se provee una función,
   * se asume que es directamente `aplicarShaderCorrupcion` de
   * `corruptionShader.js` (o una función equivalente) y se invoca con
   * `(malla.material, intensidad)`.
   *
   * @param {Array<{ material?: unknown }>} mallasEntorno - Mallas/objetos 3D
   *   del entorno de la Zona final (nunca una malla propia del Bug_Supremo).
   * @param {{ aplicarCorrupcion: (malla: unknown, intensidad: number) => void } | ((material: unknown, intensidad?: number) => unknown)} renderEngineOAplicador -
   *   Instancia de `RenderEngine` (usa su método `aplicarCorrupcion`) o
   *   directamente la función `aplicarShaderCorrupcion` de
   *   `corruptionShader.js`.
   * @param {number} [intensidad=1] - Intensidad del efecto, en `[0, 1]`.
   * @returns {void}
   */
  aplicarCorrupcionEntorno(mallasEntorno, renderEngineOAplicador, intensidad = 1) {
    const esRenderEngine = typeof renderEngineOAplicador?.aplicarCorrupcion === 'function';

    for (const malla of mallasEntorno) {
      if (esRenderEngine) {
        renderEngineOAplicador.aplicarCorrupcion(malla, intensidad);
      } else if (typeof renderEngineOAplicador === 'function') {
        renderEngineOAplicador(malla.material, intensidad);
      }
    }
  }

  /**
   * Intenta avanzar desde el paso `pasoActualIndice` de `PASOS_DESAFIO_FINAL`
   * hacia el siguiente, función pura (no muta `progreso` ni ningún estado
   * externo). El Jugador solo puede avanzar un paso si posee la Habilidad
   * requerida de ESE paso (`progreso.tieneHabilidad(...)`); si no la posee,
   * se señala el faltante sin lanzar excepción y sin avanzar el índice.
   *
   * @param {number} pasoActualIndice - Índice actual dentro de
   *   `PASOS_DESAFIO_FINAL` (0-based).
   * @param {ProgressStore} progreso
   * @returns {{ avanzo: boolean, siguienteIndice: number, habilidadFaltante: HabilidadId|null }}
   *   `avanzo` indica si el paso se completó; `siguienteIndice` es el índice
   *   resultante (igual al actual si `avanzo` es `false`, o `pasoActualIndice
   *   + 1` si es `true`); `habilidadFaltante` es la Habilidad que falta
   *   cuando `avanzo` es `false` por falta de gating, o `null` en cualquier
   *   otro caso (incluyendo cuando `pasoActualIndice` ya está fuera de
   *   rango, es decir la secuencia ya está completada).
   */
  avanzarPaso(pasoActualIndice, progreso) {
    const paso = PASOS_DESAFIO_FINAL[pasoActualIndice];

    if (!paso) {
      // Índice fuera de rango: la secuencia ya está completada, no hay nada
      // que avanzar.
      return { avanzo: false, siguienteIndice: pasoActualIndice, habilidadFaltante: null };
    }

    if (!progreso.tieneHabilidad(paso.habilidadRequerida)) {
      return { avanzo: false, siguienteIndice: pasoActualIndice, habilidadFaltante: paso.habilidadRequerida };
    }

    return { avanzo: true, siguienteIndice: pasoActualIndice + 1, habilidadFaltante: null };
  }

  /**
   * Determina si `pasoActualIndice` representa el final de la secuencia
   * (todos los pasos de `PASOS_DESAFIO_FINAL` fueron completados).
   *
   * @param {number} pasoActualIndice
   * @returns {boolean}
   */
  estaCompletado(pasoActualIndice) {
    return pasoActualIndice >= PASOS_DESAFIO_FINAL.length;
  }

  /**
   * Resuelve el Desafio_Final: si y solo si `estaCompletado(pasoActualIndice)`
   * es `true` (se recorrió toda la secuencia de `PASOS_DESAFIO_FINAL` vía
   * `avanzarPaso`), marca el Desafio_Final como completado en `progreso`
   * (Requisito 10.4). Si la secuencia todavía no se completó, no muta
   * `progreso` en absoluto (no marca el desafío como completado
   * prematuramente).
   *
   * @param {number} pasoActualIndice - Índice actual dentro de
   *   `PASOS_DESAFIO_FINAL`, típicamente el `siguienteIndice` devuelto por la
   *   última llamada exitosa a `avanzarPaso`.
   * @param {ProgressStore} progreso
   * @returns {boolean} `true` si el Desafio_Final quedó marcado como
   *   completado en esta llamada (o ya lo estaba), `false` si la secuencia
   *   aún no se había completado.
   */
  resolver(pasoActualIndice, progreso) {
    if (!this.estaCompletado(pasoActualIndice)) {
      return false;
    }

    progreso.marcarDesafioCompletado();
    return true;
  }
}
