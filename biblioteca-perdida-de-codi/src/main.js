/**
 * main.js - Punto de entrada de la aplicación (tarea 16.1, Integración
 * final).
 *
 * Orquesta el arranque completo de la Sesion_de_Juego:
 *   1. Detecta soporte WebGL ANTES de crear cualquier `RenderEngine` real
 *      (Compatibilidad de navegador y WebGL 2). Si no hay soporte, muestra
 *      un mensaje de error en el DOM y no continúa.
 *   2. Si hay soporte, instancia `RenderEngine` sobre el `<canvas
 *      id="app-canvas">` del DOM.
 *   3. Carga el manifiesto de assets vía `AssetLoader`, mostrando progreso;
 *      si hay una falla crítica (típicamente el modelo de Codi), muestra un
 *      error bloqueante y no arranca el `GameLoop` (Requisitos funcionales 2).
 *   4. Registra los modelos cargados en el `RenderEngine` (y a Codi
 *      específicamente vía `registrarCodi`).
 *   5. Instancia todos los sistemas de gameplay (`ProgressStore`,
 *      `KeyboardMouseInputProvider`, `MovementSystem`, `CameraSystem`,
 *      `AbsorptionSystem`, `AbilitySystem`, `UISystem`, `FinalChallenge`).
 *   6. Construye el estado mutable de la sesión (pose inicial de Codi en la
 *      primera Zona, estado de cámara inicial, progreso del Desafío Final,
 *      copias mutables de los Libros/Mecanismos declarativos de
 *      `zones.data.js`).
 *   7. Define `updateFn(deltaTime, elapsedTime)` orquestando movimiento,
 *      cámara, absorción, habilidades, Desafío Final y renderizado.
 *   8. Arranca el `GameLoop`.
 *
 * DECISIÓN DE DISEÑO (testabilidad): toda esta lógica vive en la función
 * exportada `iniciarJuego(dependencias)`, que recibe por inyección el
 * `document`, las clases de cada sistema y los datos del mundo (todos con
 * valores por defecto tomados del navegador/módulos reales). Esto permite
 * testear el flujo de integración completo (tareas 16.3/16.4) sin depender
 * de un navegador real ni de WebGL real, inyectando mocks. El bloque final
 * del archivo simplemente invoca `iniciarJuego()` sin argumentos con los
 * valores reales del navegador al cargar el módulo.
 *
 * SIMPLIFICACIONES DEL MVP (documentadas explícitamente, ver `construirMundoMovimiento`
 * y `construirMundoCamara` más abajo):
 *   - `muestreaAltura` devuelve una altura de suelo plana (no hay terreno
 *     real todavía cargado/generado en esta tarea de integración).
 *   - `raycastObstaculo` de la cámara siempre reporta "sin obstáculo" (no
 *     hay todavía un `THREE.Raycaster` real conectado a la geometría del
 *     entorno cargado).
 *   - `volumenesSolidos` y `plataformasMoviles` están vacíos: la colisión
 *     contra geometría concreta del entorno y la animación de trayectoria
 *     de plataformas móviles son contenido/integración de tareas futuras,
 *     no de esta tarea de cableado general.
 * Ninguna de estas simplificaciones impide que todos los sistemas queden
 * conectados de forma coherente y que el juego arranque y renderice sin
 * excepciones no controladas.
 */

import { RenderEngine, esWebGLDisponible } from './rendering/RenderEngine.js';
import { AssetLoader } from './assets/AssetLoader.js';
import { MANIFIESTO_ASSETS } from './world/assetManifest.js';
import { ZONAS, MECANISMOS, LIBROS } from './world/zones.data.js';
import { ProgressStore } from './core/ProgressStore.js';
import { GameLoop } from './core/GameLoop.js';
import { KeyboardMouseInputProvider } from './input/KeyboardMouseInputProvider.js';
import { MovementSystem } from './movement/MovementSystem.js';
import { CameraSystem } from './camera/CameraSystem.js';
import { AbsorptionSystem } from './absorption/AbsorptionSystem.js';
import { AbilitySystem } from './abilities/AbilitySystem.js';
import { UISystem } from './ui/UISystem.js';
import { generarMensaje, generarMensajeCarenciaAdapter, generarMensajeExitoAdapter } from './ui/messages.js';
import { FinalChallenge, ZONA_DESAFIO_FINAL_ID } from './challenge/FinalChallenge.js';

/**
 * Color de acento por Habilidad, usado ÚNICAMENTE para pasarlo como
 * `colorHex` a `renderEngine.registrarElementoInteractivo` (SPEC-05:
 * Interactive Feedback & Game Feel). Es una copia deliberadamente local a
 * `main.js` del mismo mapa que `RenderEngine.js` ya usa internamente para
 * el "Ability Acquisition Feedback": mantenerlos como dos constantes
 * independientes (en vez de que `RenderEngine` exporte la suya) preserva
 * el desacoplamiento — `main.js` (que sí conoce `HabilidadId` como
 * concepto de gameplay) decide qué color le corresponde a cada
 * Mecanismo_Ambiental según su `habilidadRequerida`, y `RenderEngine` solo
 * recibe un número hexadecimal ya resuelto, sin necesitar importar ni
 * entender `WorldModel.js`/`catalogoHabilidades.js`.
 */
const COLOR_POR_HABILIDAD_FEEDBACK = {
  python: 0xfbbf24,
  javascript: 0x38bdf8,
  sql: 0xa855f7,
};

/** Radio (unidades del mundo) dentro del cual se considera que Codi puede interactuar con un Mecanismo_Ambiental cercano. */
const RADIO_INTERACCION_MECANISMO = 2.5;

/**
 * Altura de suelo plana usada por `muestreaAltura` (simplificación del MVP,
 * ver JSDoc de archivo). No hay terreno real todavía: se asume un plano
 * navegable a esta altura en toda la Isla.
 */
const ALTURA_SUELO_PLANO_MVP = 1;

/**
 * Determina si un punto `{x,y,z}` está dentro (bordes inclusive) de un AABB
 * `{min, max}`. Usada para el gating espacial de la Zona del Desafío Final.
 *
 * @param {{x:number,y:number,z:number}} punto
 * @param {{min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}} aabb
 * @returns {boolean}
 */
function puntoDentroDeZona(punto, aabb) {
  return (
    punto.x >= aabb.min.x && punto.x <= aabb.max.x &&
    punto.z >= aabb.min.z && punto.z <= aabb.max.z
  );
}

/**
 * Calcula la posición de inicio fija de Codi dentro de la primera Zona de
 * la Isla (Requisitos funcionales 5), como un punto cercano a un borde de
 * la Zona (evitando el centro exacto, donde suele estar el Libro de esa
 * Zona, para no absorberlo instantáneamente en el primer frame).
 *
 * @param {import('./world/WorldModel.js').Zona} primeraZona
 * @returns {{x:number, y:number, z:number}}
 */
function calcularPosicionInicioCodi(primeraZona) {
  const { min, max } = primeraZona.limites;
  return {
    x: (min.x + max.x) / 2,
    y: ALTURA_SUELO_PLANO_MVP,
    z: min.z + 2,
  };
}

/**
 * Construye la `CodiPose` inicial de la Sesion_de_Juego.
 *
 * @param {import('./world/WorldModel.js').Zona} primeraZona
 * @returns {import('./movement/MovementSystem.js').CodiPose}
 */
function construirCodiPoseInicial(primeraZona) {
  const posicionInicial = calcularPosicionInicioCodi(primeraZona);
  return {
    position: posicionInicial,
    rotationY: 0,
    velocity: { x: 0, y: 0, z: 0 },
    animState: 'idle',
    lastSafePosition: { ...posicionInicial },
  };
}

/**
 * Construye el objeto `mundo` esperado por `MovementSystem.actualizar` para
 * el frame actual, derivando `zonasBloqueadas` dinámicamente a partir de
 * `zonas` y del gating de `abilitySystem.puedeAcceder` (Requisitos 7.2).
 *
 * SIMPLIFICACIÓN DEL MVP: `volumenesSolidos` y `plataformasMoviles` están
 * vacíos (sin terreno/geometría de colisión real ni animación de
 * plataformas todavía integrados en esta tarea), y `muestreaAltura`
 * devuelve una altura de suelo plana razonable en toda la Isla.
 *
 * @param {import('./world/WorldModel.js').Zona[]} zonas
 * @param {AbilitySystem} abilitySystem
 * @param {ProgressStore} progreso
 * @returns {import('./movement/MovementSystem.js').WorldModelMovimiento}
 */
function construirMundoMovimiento(zonas, abilitySystem, progreso) {
  const zonasBloqueadas = zonas.map((zona) => ({
    min: zona.limites.min,
    max: zona.limites.max,
    bloqueada: !abilitySystem.puedeAcceder(zona, progreso),
  }));

  return {
    volumenesSolidos: [],
    zonasBloqueadas,
    plataformasMoviles: [],
    muestreaAltura: () => ALTURA_SUELO_PLANO_MVP,
  };
}

/**
 * Construye el objeto `mundo` esperado por `CameraSystem.actualizar` para el
 * frame actual.
 *
 * SIMPLIFICACIÓN DEL MVP: `raycastObstaculo` siempre reporta "sin
 * obstáculo" (no hay todavía un `THREE.Raycaster` real conectado a la
 * geometría del entorno cargado por `AssetLoader`); la cámara, por lo
 * tanto, siempre usa `distanciaIdeal` en esta tarea de integración.
 *
 * @returns {import('./camera/CameraSystem.js').WorldModelCamara}
 */
function construirMundoCamara() {
  return {
    raycastObstaculo: () => ({ distancia: null, encontrado: false }),
  };
}

/**
 * Arranca la Sesion_de_Juego completa: detección de WebGL, carga de
 * assets, instanciación de todos los sistemas de gameplay y arranque del
 * `GameLoop`.
 *
 * @param {Object} [dependencias] - Dependencias inyectables, todas con
 *   valores por defecto tomados del navegador/módulos reales. Pensado para
 *   permitir tests de integración (tareas 16.3/16.4) sin un navegador ni
 *   WebGL reales.
 * @param {Document} [dependencias.document] - Documento del DOM. Por
 *   defecto, `document` global.
 * @param {string} [dependencias.canvasId='app-canvas'] - Id del elemento
 *   `<canvas>` donde se instanciará `RenderEngine`.
 * @param {HTMLElement} [dependencias.contenedorOverlay] - Contenedor donde
 *   `UISystem.renderizarEnDOM` monta el overlay de interfaz. Por defecto,
 *   `document.body` (necesario en el escenario de WebGL no soportado, en
 *   el que nunca se llega a tener un `RenderEngine`, ver tarea 16.2).
 * @param {() => boolean} [dependencias.esWebGLDisponibleFn] - Detección de
 *   soporte WebGL. Por defecto, `esWebGLDisponible` de `RenderEngine.js`.
 * @param {typeof RenderEngine} [dependencias.RenderEngineClase]
 * @param {typeof AssetLoader} [dependencias.AssetLoaderClase]
 * @param {import('./assets/AssetLoader.js').AssetManifestEntry[]} [dependencias.manifiestoAssets]
 * @param {typeof ProgressStore} [dependencias.ProgressStoreClase]
 * @param {typeof KeyboardMouseInputProvider} [dependencias.InputProviderClase]
 * @param {typeof MovementSystem} [dependencias.MovementSystemClase]
 * @param {typeof CameraSystem} [dependencias.CameraSystemClase]
 * @param {typeof AbsorptionSystem} [dependencias.AbsorptionSystemClase]
 * @param {typeof AbilitySystem} [dependencias.AbilitySystemClase]
 * @param {typeof UISystem} [dependencias.UISystemClase]
 * @param {typeof FinalChallenge} [dependencias.FinalChallengeClase]
 * @param {typeof GameLoop} [dependencias.GameLoopClase]
 * @param {import('./world/WorldModel.js').Zona[]} [dependencias.zonas]
 * @param {import('./world/WorldModel.js').MecanismoAmbiental[]} [dependencias.mecanismos]
 * @param {import('./world/WorldModel.js').LibroConocimiento[]} [dependencias.libros]
 * @returns {Promise<{
 *   motivo: 'webgl-no-soportado'|'falla-critica-assets'|'iniciado'|'error-inesperado',
 *   uiSystem?: UISystem,
 *   progreso?: ProgressStore,
 *   renderEngine?: RenderEngine,
 *   gameLoop?: GameLoop,
 * }>} Un descriptor del resultado del arranque, útil para pruebas de
 *   integración y para depuración; el juego real en el navegador no
 *   necesita inspeccionar este valor de retorno.
 */
export async function iniciarJuego(dependencias = {}) {
  const doc = dependencias.document ?? document;
  const canvasId = dependencias.canvasId ?? 'app-canvas';
  const contenedorOverlay = dependencias.contenedorOverlay ?? doc.body;
  const esWebGLDisponibleFn = dependencias.esWebGLDisponibleFn ?? esWebGLDisponible;
  const RenderEngineClase = dependencias.RenderEngineClase ?? RenderEngine;
  const AssetLoaderClase = dependencias.AssetLoaderClase ?? AssetLoader;
  const manifiestoAssets = dependencias.manifiestoAssets ?? MANIFIESTO_ASSETS;
  const ProgressStoreClase = dependencias.ProgressStoreClase ?? ProgressStore;
  const InputProviderClase = dependencias.InputProviderClase ?? KeyboardMouseInputProvider;
  const MovementSystemClase = dependencias.MovementSystemClase ?? MovementSystem;
  const CameraSystemClase = dependencias.CameraSystemClase ?? CameraSystem;
  const AbsorptionSystemClase = dependencias.AbsorptionSystemClase ?? AbsorptionSystem;
  const AbilitySystemClase = dependencias.AbilitySystemClase ?? AbilitySystem;
  const UISystemClase = dependencias.UISystemClase ?? UISystem;
  const FinalChallengeClase = dependencias.FinalChallengeClase ?? FinalChallenge;
  const GameLoopClase = dependencias.GameLoopClase ?? GameLoop;
  const zonas = dependencias.zonas ?? ZONAS;
  const mecanismosDeclarativos = dependencias.mecanismos ?? MECANISMOS;
  const librosDeclarativos = dependencias.libros ?? LIBROS;

  // Se instancia un UISystem "provisional" desde el inicio: cualquier rama
  // de error (WebGL no soportado, falla crítica de assets, excepción
  // inesperada durante la inicialización) necesita poder mostrar un
  // mensaje sin depender de que el resto de la inicialización haya
  // avanzado.
  const uiSystem = new UISystemClase();

  try {
    // --- 1. Detección de soporte WebGL, ANTES de crear ningún RenderEngine real ---
    // (Compatibilidad de navegador y WebGL 2)
    if (!esWebGLDisponibleFn()) {
      uiSystem.mostrarMensajeError(
        'Tu navegador no soporta WebGL, que es necesario para jugar "Codi y la Biblioteca Perdida del Código". ' +
          'Por favor, usa una versión reciente de Chrome, Firefox o Edge.'
      );
      uiSystem.renderizarEnDOM(contenedorOverlay, new ProgressStoreClase(), Date.now());
      return { motivo: 'webgl-no-soportado', uiSystem };
    }

    // --- 2. Instanciar RenderEngine sobre el <canvas id="app-canvas"> real ---
    const canvas = doc.getElementById(canvasId);
    const renderEngine = new RenderEngineClase(canvas);

    // --- 3. Cargar el manifiesto de assets, mostrando progreso ---
    const progreso = new ProgressStoreClase();
    // `usarRespaldoSiFalla: true` asegura que, en la ejecución real del
    // navegador, un asset GLB faltante/corrupto (incluyendo el asset crítico
    // 'codi') nunca aborte el arranque del juego: se sustituye por una
    // geometría primitiva de respaldo (ver AssetLoader.crearGeometriaRespaldo).
    // Clases de AssetLoader inyectadas en tests (mocks/subclases) que no
    // usen esta opción simplemente la ignoran sin efecto.
    const assetLoader = new AssetLoaderClase({ usarRespaldoSiFalla: true });

    uiSystem.mostrarMensaje('Cargando la Isla...', 60000, Date.now());
    uiSystem.renderizarEnDOM(contenedorOverlay, progreso, Date.now());

    const resultadoCarga = await assetLoader.cargarTodos(manifiestoAssets, ({ cargados, total }) => {
      uiSystem.mostrarMensaje(`Cargando... ${cargados}/${total}`, 60000, Date.now());
      uiSystem.renderizarEnDOM(contenedorOverlay, progreso, Date.now());
    });

    if (resultadoCarga.fallaCritica) {
      uiSystem.mostrarMensajeError(
        'No se pudo cargar un recurso esencial del juego (por ejemplo, el modelo de Codi). ' +
          'Por favor, recarga la página; si el problema persiste, revisa tu conexión.'
      );
      uiSystem.renderizarEnDOM(contenedorOverlay, progreso, Date.now());
      return { motivo: 'falla-critica-assets', uiSystem, progreso, renderEngine };
    }

    // Aviso no bloqueante: algunos assets no tenían su GLB real disponible y
    // se sustituyeron por geometría de respaldo (ver AssetLoader). No debe
    // interferir con el resto del flujo de arranque.
    if (resultadoCarga.assetsConRespaldo?.length > 0) {
      uiSystem.mostrarMensaje(
        'Algunos elementos usan geometría temporal mientras se preparan los modelos finales.',
        undefined,
        Date.now()
      );
    }

    // --- 4. Registrar los modelos cargados exitosamente en el RenderEngine ---
    // Las mallas de categoría 'entorno' (una por Zona, ver assetManifest.js)
    // no vienen posicionadas por `AssetLoader.crearGeometriaRespaldo` (solo
    // crea la geometría, siempre centrada en el origen). Sin este ajuste,
    // las N mallas de suelo de las N Zonas quedarían todas superpuestas en
    // `(0,0,0)`, dejando el resto de la Isla visualmente vacía. Se posiciona
    // cada una en el centro XZ de su Zona, a la altura base (`min.y`) del
    // AABB de esa Zona (el suelo debe apoyarse en la base, no flotar en el
    // centro vertical de la Zona).
    for (const [id, modelo] of resultadoCarga.modelos) {
      if (id.startsWith('entorno-')) {
        const zonaId = id.replace('entorno-', '');
        const zonaCorrespondiente = zonas.find((zona) => zona.id === zonaId);
        if (zonaCorrespondiente) {
          const { min, max } = zonaCorrespondiente.limites;
          modelo.position.set((min.x + max.x) / 2, min.y, (min.z + max.z) / 2);
        }
      }

      renderEngine.registrarModelo(modelo);
      if (id === 'codi') {
        renderEngine.registrarCodi(modelo);
      }
    }

    // --- 5. Instanciar todos los sistemas de gameplay ---
    const inputProvider = new InputProviderClase();
    const movementSystem = new MovementSystemClase();
    const cameraSystem = new CameraSystemClase();
    const absorptionSystem = new AbsorptionSystemClase();
    const abilitySystem = new AbilitySystemClase({
      generarMensajeCarencia: generarMensajeCarenciaAdapter,
      generarMensajeExito: generarMensajeExitoAdapter,
    });
    const finalChallenge = new FinalChallengeClase();

    // --- 6. Estado mutable de la Sesion_de_Juego ---
    const primeraZona = zonas[0];
    const zonaFinal = zonas.find((zona) => zona.id === ZONA_DESAFIO_FINAL_ID) ?? zonas[zonas.length - 1];

    const codiPoseInicial = construirCodiPoseInicial(primeraZona);
    const distanciaCamaraInicial = 7;

    const estado = {
      codiPose: codiPoseInicial,
      // Además de {yaw, pitch, distanciaActual}, se incluyen de entrada
      // `posicionCamara`/`target` calculados a partir de la pose inicial de
      // Codi (en vez de dejarlos `undefined` hasta el primer
      // `cameraSystem.actualizar`), para que exista siempre una vista
      // inicial coherente apuntando a Codi, incluso si algo consultara
      // `cameraState` antes del primer frame. Se usa la convención de -Z
      // como "adelante" (ver KeyboardMouseInputProvider.js), por lo que la
      // cámara se desplaza detrás de Codi en +Z (y hacia arriba en Y).
      cameraState: {
        yaw: 0,
        pitch: 0,
        distanciaActual: distanciaCamaraInicial,
        posicionCamara: {
          x: codiPoseInicial.position.x,
          y: codiPoseInicial.position.y + 3,
          z: codiPoseInicial.position.z + distanciaCamaraInicial,
        },
        target: { ...codiPoseInicial.position },
      },
      pasoFinalIndice: 0,
      // Copias mutables: nunca se mutan MECANISMOS/LIBROS de zones.data.js directamente.
      librosActivos: librosDeclarativos.map((libro) => ({ ...libro })),
      mecanismosActivos: mecanismosDeclarativos.map((mecanismo) => ({ ...mecanismo })),
      // Bandera de pausa del juego (para mostrar pantalla de Victoria)
      juegoPausado: false,
    };

    // Posicionamiento visual de instancias reales de Mecanismos y Libros:
    // el manifiesto solo carga un asset reutilizable POR TIPO (mecanismos) o
    // un único modelo genérico (libro), no uno por instancia (ver
    // assetManifest.js). Para esta integración del MVP es válido y
    // suficiente clonar la malla cargada de cada tipo/modelo y posicionar
    // cada clon en la posición real de su instancia, en vez de mover el
    // único mesh compartido a una sola posición. La referencia del clon se
    // guarda en el propio objeto de estado (`_objeto3D`) para uso futuro
    // (p.ej. animar/ocultar al resolverse un Mecanismo o absorberse un
    // Libro), sin implementar esa animación todavía.
    for (const mecanismo of estado.mecanismosActivos) {
      const modeloBase = resultadoCarga.modelos.get(`mecanismo-${mecanismo.tipo}`);
      if (modeloBase) {
        const clon = modeloBase.clone();
        clon.position.set(mecanismo.posicion.x, mecanismo.posicion.y, mecanismo.posicion.z);
        renderEngine.registrarModelo(clon);
        mecanismo._objeto3D = clon;

        // Feedback visual (SPEC-05): registra el clon como "elemento
        // interactivo" para que reciba el pulso de brillo sutil constante
        // (sección 2) y la transición de activación al resolverse
        // (sección 3). `renderEngine.registrarElementoInteractivo` NO
        // recibe `mecanismo` completo ni `progreso`/`abilitySystem` — solo
        // el objeto 3D, un color derivado de su Habilidad, y una función
        // de solo lectura que expone `mecanismo.estado` en el momento en
        // que `RenderEngine` la invoque cada frame (mantiene a
        // `RenderEngine` sin conocer `MecanismoAmbiental` como tipo).
        // Se invoca con `?.` porque es un método opcional/nuevo (SPEC-05):
        // cualquier `RenderEngineClase` inyectada (p.ej. mocks de tests
        // preexistentes) que no lo implemente sigue funcionando sin cambios.
        renderEngine.registrarElementoInteractivo?.(clon, {
          colorHex: COLOR_POR_HABILIDAD_FEEDBACK[mecanismo.habilidadRequerida],
          leerEstado: () => mecanismo.estado,
        });
      }
    }

    for (const libro of estado.librosActivos) {
      const modeloBase = resultadoCarga.modelos.get('libro-conocimiento');
      if (modeloBase) {
        const clon = modeloBase.clone();
        clon.position.set(libro.posicion.x, libro.posicion.y, libro.posicion.z);
        renderEngine.registrarModelo(clon);
        libro._objeto3D = clon;
      }
    }

    /**
     * Actualización de un frame del juego: orquesta entrada, movimiento,
     * cámara, absorción, habilidades, Desafío Final e interfaz, y
     * finalmente renderiza. Pasada como `updateFn` a `GameLoop`.
     *
     * @param {number} deltaTime
     * @param {number} _elapsedTime
     * @returns {void}
     */
    function updateFn(deltaTime, _elapsedTime) {
      // --- Pausa del juego cuando se muestra pantalla de Victoria ---
      if (estado.juegoPausado) {
        // Actualizar solo la interfaz para mantener el modal visible
        uiSystem.renderizarEnDOM(contenedorOverlay, progreso, Date.now());
        return;
      }

      const inputState = inputProvider.leerEstado();

      // --- Movimiento ---
      const mundoMovimiento = construirMundoMovimiento(zonas, abilitySystem, progreso);
      // Aplicar multiplicador de velocidad del Demo Mode (K/R/M atajos)
      const deltaTimeAjustado = deltaTime * velocidadMultiplicador;
      estado.codiPose = movementSystem.actualizar(inputState, deltaTimeAjustado, estado.codiPose, mundoMovimiento);

      // --- Cámara ---
      const mundoCamara = construirMundoCamara();
      estado.cameraState = cameraSystem.actualizar(
        inputState,
        deltaTime,
        estado.codiPose,
        mundoCamara,
        estado.cameraState
      );

      // --- Absorción de conocimiento ---
      const resultadoAbsorcion = absorptionSystem.revisarContacto(estado.codiPose, estado.librosActivos, progreso);
      if (resultadoAbsorcion.habilidadOtorgada) {
        uiSystem.mostrarMensaje(
          generarMensaje({ tipo: 'absorcion', habilidadId: resultadoAbsorcion.habilidadOtorgada }),
          undefined,
          Date.now()
        );
        // H03: Reproducir sonido de recolección al obtener habilidad
        uiSystem.reproducirSonidoRecoleccion();
      }

      // --- Interacción: Mecanismos cercanos o avance del Desafío Final ---
      if (inputState.accionInteractuar) {
        const enZonaFinal = puntoDentroDeZona(estado.codiPose.position, zonaFinal.limites);

        if (enZonaFinal && finalChallenge.puedeIniciar(progreso, abilitySystem)) {
          if (!finalChallenge.estaCompletado(estado.pasoFinalIndice)) {
            const resultadoPaso = finalChallenge.avanzarPaso(estado.pasoFinalIndice, progreso);
            estado.pasoFinalIndice = resultadoPaso.siguienteIndice;

            if (resultadoPaso.avanzo) {
              if (finalChallenge.estaCompletado(estado.pasoFinalIndice)) {
                finalChallenge.resolver(estado.pasoFinalIndice, progreso);
                uiSystem.mostrarMensaje(
                  '¡Has restaurado la Biblioteca Perdida del Código! El Bug Supremo se disuelve ante el conocimiento combinado de Codi.',
                  undefined,
                  Date.now()
                );
              } else {
                uiSystem.mostrarMensaje('¡Un paso más resuelto en el Desafío Final!', undefined, Date.now());
              }
            } else if (resultadoPaso.habilidadFaltante) {
              uiSystem.mostrarMensaje(
                generarMensaje({ tipo: 'denegado', habilidadRequerida: resultadoPaso.habilidadFaltante }),
                undefined,
                Date.now()
              );
            }
          }
        } else {
          const mecanismoCercano = estado.mecanismosActivos.find((mecanismo) => {
            const dx = mecanismo.posicion.x - estado.codiPose.position.x;
            const dy = mecanismo.posicion.y - estado.codiPose.position.y;
            const dz = mecanismo.posicion.z - estado.codiPose.position.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz) <= RADIO_INTERACCION_MECANISMO;
          });

          if (mecanismoCercano) {
            const resultadoInteraccion = abilitySystem.interactuar(mecanismoCercano, progreso);
            if (resultadoInteraccion.mensaje) {
              uiSystem.mostrarMensaje(resultadoInteraccion.mensaje, undefined, Date.now());
              // H03: Reproducir sonido de click al interactuar con mecanismo
              if (resultadoInteraccion.mecanismoResuelto) {
                uiSystem.reproducirSonidoClick();
              }
            }
          }
        }
      }

      // --- Renderizado del frame ---
      // Tercer argumento opcional añadido en SPEC-05 (Interactive
      // Feedback & Game Feel): permite que RenderEngine detecte
      // internamente cuándo `progreso.habilidades()` creció respecto al
      // frame anterior, para disparar el "Ability Acquisition Feedback"
      // (destello + partículas sobre Codi). No cambia ninguna otra
      // llamada existente ni ningún comportamiento de `progreso` en sí.
      renderEngine.render(estado.codiPose, estado.cameraState, progreso);

      // --- Interfaz: mantener el overlay HTML/CSS actualizado ---
      uiSystem.renderizarEnDOM(contenedorOverlay, progreso, Date.now());

      // --- Detectar Victoria (Desafío Final completado) ---
      if (progreso.desafioCompletado() && !estado.juegoPausado) {
        estado.juegoPausado = true;
        // H03: Reproducir sonido de Victoria
        uiSystem.reproducirSonidoVictoria();
      }
    }

    // --- 8. GameLoop, con manejo de errores de nivel de frame ---
    const gameLoop = new GameLoopClase(renderEngine, updateFn, (error) => {
      // eslint-disable-next-line no-console
      console.error('[main.js] Error no controlado durante un frame del juego:', error);
      uiSystem.mostrarMensajeError(
        'Algo salió mal durante el juego. Por favor, recarga la página para continuar explorando.'
      );
      uiSystem.renderizarEnDOM(contenedorOverlay, progreso, Date.now());
    });

    // --- 9. Arrancar el bucle de juego ---
    gameLoop.start();

    // --- Event listener para botón de reinicio (solo si se mostró Victoria) ---
    const btnReiniciar = contenedorOverlay.querySelector('#ui-system-btn-reiniciar');
    if (btnReiniciar) {
      btnReiniciar.addEventListener('click', () => {
        // H03: Reproducir sonido de click
        uiSystem.reproducirSonidoClick();
        
        // Reiniciar progreso
        progreso.reset();
        
        // Restaurar estado del juego
        estado.juegoPausado = false;
        estado.pasoFinalIndice = 0;
        
        // Restaurar mecanismos a su estado original
        estado.mecanismosActivos.forEach((mecanismo, index) => {
          mecanismo.estado = mecanismosDeclarativos[index].estado;
        });
        
        // Restaurar libros a su estado original (no absorbidos)
        estado.librosActivos.forEach((libro, index) => {
          libro.absorbido = librosDeclarativos[index].absorbido;
        });
        
        // Ocultar modal de Victoria
        uiSystem.renderizarEnDOM(contenedorOverlay, progreso, Date.now());
        
        // Mostrar mensaje de reinicio
        uiSystem.mostrarMensaje('¡Juego reiniciado! Explora la Isla de nuevo.', 4000, Date.now());
      });
    }

    // --- H06: Jury Demo Mode (Dev Keys para presentación en vivo) ---
    // Atajos de teclado para facilitar la presentación del juego ante el jurado
    // eslint-disable-next-line no-console
    console.log('[Demo Mode] Atajos activos: K=Victoria instantánea | R=Reiniciar | M=Toggle velocidad x2');
    
    let velocidadMultiplicador = 1.0;
    
    doc.addEventListener('keydown', (event) => {
      // Ignorar si hay un input/textarea activo (evita conflictos con formularios)
      const elementoActivo = doc.activeElement;
      if (elementoActivo && (elementoActivo.tagName === 'INPUT' || elementoActivo.tagName === 'TEXTAREA')) {
        return;
      }
      
      // K: Forzar Victoria instantánea (completa todos los fragmentos)
      if (event.code === 'KeyK' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        
        // Completar todas las habilidades
        ['python', 'javascript', 'sql'].forEach(habilidadId => {
          if (!progreso.tieneHabilidad(habilidadId)) {
            progreso.otorgarHabilidad(habilidadId);
          }
        });
        
        // Completar todos los mecanismos
        estado.mecanismosActivos.forEach(mecanismo => {
          if (mecanismo.estado === 'resuelto' && !progreso.tieneMecanismoResuelto(mecanismo.id)) {
            progreso.marcarMecanismoResuelto(mecanismo.id);
          }
        });
        
        // Completar desafío final
        if (!progreso.desafioCompletado()) {
          progreso.marcarDesafioCompletado();
        }
        
        // eslint-disable-next-line no-console
        console.log('[Demo Mode] Victoria forzada - Progreso al 100%');
      }
      
      // R: Reiniciar demo instantáneamente
      if (event.code === 'KeyR' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        
        // Reiniciar progreso
        progreso.reset();
        
        // Restaurar estado del juego
        estado.juegoPausado = false;
        estado.pasoFinalIndice = 0;
        velocidadMultiplicador = 1.0;
        
        // Restaurar mecanismos a su estado original
        estado.mecanismosActivos.forEach((mecanismo, index) => {
          mecanismo.estado = mecanismosDeclarativos[index].estado;
        });
        
        // Restaurar libros a su estado original (no absorbidos)
        estado.librosActivos.forEach((libro, index) => {
          libro.absorbido = librosDeclarativos[index].absorbido;
        });
        
        // Reiniciar posición de Codi
        const posicionInicial = calcularPosicionInicioCodi(primeraZona);
        estado.codiPose = {
          position: posicionInicial,
          rotationY: 0,
          velocity: { x: 0, y: 0, z: 0 },
          animState: 'idle',
          lastSafePosition: { ...posicionInicial },
        };
        
        uiSystem.mostrarMensaje('⚡ Demo reiniciada', 2000, Date.now());
        // eslint-disable-next-line no-console
        console.log('[Demo Mode] Demo reiniciada completamente');
      }
      
      // M: Toggle velocidad de movimiento x2 (para navegar rápido el mapa)
      if (event.code === 'KeyM' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        
        velocidadMultiplicador = velocidadMultiplicador === 1.0 ? 2.0 : 1.0;
        const mensaje = velocidadMultiplicador === 2.0 ? '⚡ Velocidad x2 activada' : '⚡ Velocidad normal';
        uiSystem.mostrarMensaje(mensaje, 2000, Date.now());
        // eslint-disable-next-line no-console
        console.log(`[Demo Mode] Velocidad: x${velocidadMultiplicador}`);
      }
    });

    return { motivo: 'iniciado', uiSystem, progreso, renderEngine, gameLoop };
  } catch (error) {
    // Manejo de errores async/inesperados durante la inicialización misma
    // (no solo durante el loop ya arrancado) — Requisitos funcionales 3.
    // eslint-disable-next-line no-console
    console.error('[main.js] Error inesperado durante la inicialización del juego:', error);
    uiSystem.mostrarMensajeError(
      'No se pudo iniciar el juego debido a un error inesperado. Por favor, recarga la página.'
    );
    try {
      uiSystem.renderizarEnDOM(contenedorOverlay, new ProgressStoreClase(), Date.now());
    } catch {
      // Si ni siquiera se puede renderizar el mensaje de error (DOM
      // completamente indisponible), no hay nada más que hacer aquí; el
      // error ya fue registrado en consola.
    }
    return { motivo: 'error-inesperado', uiSystem };
  }
}

// Arranque automático del juego al cargar el módulo en el navegador.
// La función `iniciarJuego` se invoca sin argumentos, usando todos los
// valores por defecto (document global, canvas "app-canvas", etc.).
iniciarJuego().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[main.js] Error fatal durante arranque del juego:', error);
});

// También exportar como default para compatibilidad con tests y futuros menús
export default iniciarJuego;
