import * as THREE from 'three';
import { actualizarAspecto } from '../camera/CameraSystem.js';
import { aplicarShaderCorrupcion } from './corruptionShader.js';

/**
 * Detecta si el navegador actual soporta WebGL (1 o 2), sin necesidad de
 * construir un `THREE.WebGLRenderer` real ni una instancia de `RenderEngine`.
 * Pensada para invocarse ANTES de `new RenderEngine(canvas)` (por ejemplo
 * desde `main.js`, tarea 16.1) para poder mostrar un mensaje de error
 * comprensible en vez de dejar que la construcción del renderer falle o la
 * pantalla quede en blanco (Compatibilidad de navegador y WebGL 2, caso
 * límite 8 de requirements.md).
 *
 * Usa la técnica estándar de intentar obtener un contexto `webgl2`/`webgl`
 * (con el alias legado `experimental-webgl` como último recurso) de un
 * canvas temporal creado con `document.createElement('canvas')`, no adjunto
 * al DOM. Captura tanto el resultado `null` como cualquier excepción que el
 * navegador pudiera lanzar al intentarlo (algunos navegadores lanzan en vez
 * de devolver `null` cuando WebGL está deshabilitado por política), de modo
 * que sea segura de invocar incluso en entornos sin soporte real de WebGL
 * (p.ej. jsdom en pruebas), donde simplemente devuelve `false`.
 *
 * @returns {boolean} `true` si se pudo obtener un contexto WebGL 1 o 2.
 */
export function esWebGLDisponible() {
  try {
    const canvasTemporal = document.createElement('canvas');
    const contexto =
      canvasTemporal.getContext('webgl2') ||
      canvasTemporal.getContext('webgl') ||
      canvasTemporal.getContext('experimental-webgl');
    return Boolean(contexto);
  } catch (error) {
    return false;
  }
}

/**
 * RenderEngine - Motor_de_Renderizado (Requisitos funcionales 3; Compatibilidad
 * de navegador y WebGL 1, 2).
 *
 * Encapsula `THREE.Scene`, `THREE.PerspectiveCamera` y `THREE.WebGLRenderer`,
 * exponiendo únicamente los métodos que el resto del juego necesita
 * (`registrarModelo`, `aplicarCorrupcion`, `render`) más el control del bucle
 * de render (`setAnimationLoop`) y del resize del viewport.
 *
 * Decisión de diseño clave: se usa `renderer.setAnimationLoop(callback)` en
 * vez de un `requestAnimationFrame` manual, precisamente porque esta es la
 * misma API que Three.js reutiliza al entrar en una `XRSession`. Esto permite
 * que `GameLoop` (que solo espera un `renderDriver` con `setAnimationLoop`,
 * por duck typing) use una instancia de `RenderEngine` directamente como su
 * `renderDriver` sin ningún cambio, y deja la puerta abierta a WebXR en el
 * futuro sin reescribir el bucle de render (Arquitectura_WebXR_Preparada).
 */
export class RenderEngine {
  /**
   * Alias de conveniencia sobre la función independiente `esWebGLDisponible`,
   * para quien prefiera invocar la detección como `RenderEngine.soportaWebGL()`
   * en vez de importar la función suelta. Mantiene un único punto de verdad
   * en la implementación (no duplica la lógica de detección).
   *
   * @returns {boolean}
   */
  static soportaWebGL() {
    return esWebGLDisponible();
  }

  /**
   * @param {HTMLCanvasElement} canvas - Elemento `<canvas>` del DOM donde se
   *   dibujará la escena. Se acepta cualquier objeto compatible (duck typing)
   *   para facilitar el uso de mocks en entornos de prueba sin WebGL real
   *   (jsdom); la creación real de `THREE.WebGLRenderer` con dicho objeto es
   *   responsabilidad de quien instancie `RenderEngine` en ese contexto.
   * @param {Object} [config] - Constantes de configuración de la cámara.
   * @param {number} [config.fov=65] - Campo de visión vertical, en grados.
   * @param {number} [config.near=0.1] - Plano de recorte cercano.
   * @param {number} [config.far=1000] - Plano de recorte lejano.
   */
  constructor(canvas, config = {}) {
    /** @private */
    this._canvas = canvas;

    const fov = config.fov ?? 65;
    const near = config.near ?? 0.1;
    const far = config.far ?? 1000;

    // El aspect inicial se toma del tamaño actual del canvas cuando está
    // disponible; si no (p.ej. un canvas recién creado sin layout todavía),
    // se usa 16/9 como valor razonable por defecto hasta el primer resize.
    const anchoInicial = canvas.clientWidth || canvas.width || 16;
    const altoInicial = canvas.clientHeight || canvas.height || 9;

    /** @private */
    this._scene = new THREE.Scene();

    // Color de fondo azul cielo cartoon (Requisitos: estilo visual "Cartoon
    // 3D, colorido, amigable, optimista"). Además de su función estética,
    // sirve como verificación visual rápida de que el canvas está
    // renderizando: si al abrir el juego se ve una escena vacía pero con
    // este azul de fondo, WebGL/el renderer funcionan correctamente y el
    // problema está en la falta de modelos/luces, no en el pipeline de
    // render en sí.
    this._scene.background = new THREE.Color(0x87ceeb);

    // Luces básicas de la escena. SIN ESTO, `MeshStandardMaterial` (usado
    // tanto por los modelos GLB reales como por la geometría de respaldo de
    // `AssetLoader.crearGeometriaRespaldo`) se renderiza completamente
    // negro: es un material que reacciona a la iluminación física de la
    // escena (PBR) y no muestra ningún color propio sin al menos una luz
    // presente. Se combinan una luz ambiental (ilumina todo por igual, sin
    // sombras, para que nada quede completamente a oscuras) y una luz
    // direccional en ángulo alto tipo "luz de sol" (da volumen/sombreado a
    // las formas). Ambas se guardan como propiedades privadas para permitir
    // ajustes futuros (p.ej. ciclo día/noche, intensidad dinámica).
    /** @private */
    this._luzAmbiental = new THREE.AmbientLight(0xffffff, 0.8);
    this._scene.add(this._luzAmbiental);

    /**
     * @private
     * Luz direccional "de sol": se deja `castShadow = true` para no cerrar
     * la puerta a sombras dinámicas en el futuro, pero por ahora NO se
     * activa `this._renderer.shadowMap.enabled` (ver más abajo, tras crear
     * el renderer) — las sombras completas quedan fuera de alcance del MVP,
     * se mantiene la iluminación simple a propósito.
     */
    this._luzDireccional = new THREE.DirectionalLight(0xffffff, 1.0);
    this._luzDireccional.position.set(10, 20, 10);
    this._luzDireccional.castShadow = true;
    this._scene.add(this._luzDireccional);

    /** @private */
    this._camera = new THREE.PerspectiveCamera(fov, anchoInicial / altoInicial, near, far);

    // `esWebGLDisponible()`/`RenderEngine.soportaWebGL()` es la vía PROACTIVA
    // recomendada (usada por `main.js`, tarea 16.1) para verificar soporte
    // ANTES de instanciar `RenderEngine` y así poder mostrar un mensaje
    // comprensible en vez de llegar hasta aquí. Aun así, este constructor no
    // asume que dicha verificación se hizo: si la creación del
    // `WebGLRenderer` falla (p.ej. WebGL deshabilitado, contexto perdido, o
    // un canvas incompatible), se captura el error y se relanza uno más
    // descriptivo, para que quien instancie `RenderEngine` sin verificar
    // antes reciba un mensaje claro en vez de un stack trace interno de
    // Three.js (Compatibilidad de navegador y WebGL 2: comunicar la falta de
    // soporte en vez de fallar silenciosamente).
    try {
      /** @private */
      this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch (errorOriginal) {
      throw new Error(
        'RenderEngine: no se pudo crear el WebGLRenderer (¿el navegador no soporta WebGL? ' +
          'usa esWebGLDisponible()/RenderEngine.soportaWebGL() antes de instanciar RenderEngine ' +
          `para detectarlo de forma segura). Causa original: ${errorOriginal.message}`
      );
    }
    // Se limita el pixel ratio a un máximo razonable (2) en vez de usar
    // `window.devicePixelRatio` sin tope: en pantallas de alta densidad
    // (p.ej. 3x) renderizar a resolución completa penaliza notablemente el
    // rendimiento en GPU integrada sin una mejora visual proporcional
    // (Rendimiento en GPU integrada).
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._renderer.setSize(anchoInicial, altoInicial, false);

    /** @private - referencia opcional al objeto 3D de Codi, ver `registrarCodi` */
    this._modeloCodi = null;

    /**
     * @private - lista de uniforms de las corrupciones activas aplicadas vía
     * `aplicarCorrupcion`/`corruptionShader.js`, para poder incrementar
     * `uTime` de cada una en cada frame dentro de `render`.
     * @type {Array<{ uTime: {value:number}, uIntensidad: {value:number} }>}
     */
    this._corrupcionesActivas = [];

    /**
     * @private - marca de tiempo (ms, `performance.now()`) del último frame
     * renderizado, usada para calcular el `deltaTime` con el que se avanza
     * `uTime` de cada corrupción activa. `render(poseCodi, estadoCamara)` no
     * recibe un `deltaTime` externo (ver firma existente más abajo), así que
     * se mantiene este reloj interno en vez de cambiar la firma pública del
     * método, que ya usan `GameLoop`/`main.js`.
     * @type {number|null}
     */
    this._ultimoTiempoRenderMs = null;

    // Listener de resize (Arquitectura escalable a WebXR 2, Requisitos de
    // Sistema_de_Camara 2.4): se enlaza una sola vez para poder removerlo en
    // `dispose()`.
    /** @private */
    this._onWindowResize = () => this.onResize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', this._onWindowResize);
  }

  /**
   * Delega en `THREE.WebGLRenderer.setAnimationLoop`. Es el método que
   * permite que `GameLoop` trate a `RenderEngine` como su `renderDriver` sin
   * ningún adaptador adicional (mismo contrato duck-typed que `GameLoop`
   * espera: `{ setAnimationLoop(cb) }`).
   *
   * @param {((time: number, frame?: unknown) => void)|null} callback - Callback
   *   invocado en cada frame, o `null` para detener el bucle.
   * @returns {void}
   */
  setAnimationLoop(callback) {
    this._renderer.setAnimationLoop(callback);
  }

  /**
   * Añade un objeto 3D (modelo de Codi, entorno, mecanismo, etc.) a la
   * escena administrada por este `RenderEngine`.
   *
   * @param {THREE.Object3D} objeto3D
   * @returns {void}
   */
  registrarModelo(objeto3D) {
    this._scene.add(objeto3D);
  }

  /**
   * Remueve un objeto 3D previamente registrado (vía `registrarModelo`) de la
   * escena. No forma parte de la firma literal de `RenderEngine` en
   * `design.md`, pero es el complemento natural de `registrarModelo` (p.ej.
   * para descargar un Mecanismo_Ambiental o modelo intermedio ya resuelto).
   * Si el objeto no está en la escena, `THREE.Scene.remove` es un no-op
   * seguro (no lanza).
   *
   * @param {THREE.Object3D} objeto3D
   * @returns {void}
   */
  removerModelo(objeto3D) {
    this._scene.remove(objeto3D);
  }

  /**
   * Registra (opcionalmente) el objeto 3D que representa a Codi en la
   * escena, para que `render(poseCodi, estadoCamara)` pueda posicionarlo y
   * orientarlo automáticamente en cada frame a partir de `poseCodi`.
   *
   * DECISIÓN DE DISEÑO: `design.md` describe `render(poseCodi, estadoCamara)`
   * como el método que "posiciona objetos y renderiza un frame", pero no
   * exige que `RenderEngine` mantenga una referencia al modelo de Codi; ese
   * cableado podría hacerse igualmente desde `main.js` llamando directamente
   * `modeloCodi.position.set(...)` antes de invocar `render`. Se opta aquí
   * por permitir un registro explícito y opcional (`registrarCodi`) para que
   * `render` pueda cumplir literalmente "posiciona objetos" sin que quien
   * orquesta el `GameLoop` tenga que conocer el objeto 3D de Codi; si nunca
   * se llama a este método, `render` simplemente omite ese paso (no-op),
   * preservando compatibilidad con quien prefiera posicionar a Codi por su
   * cuenta.
   *
   * @param {THREE.Object3D} objeto3D - Objeto 3D de Codi, ya añadido a la
   *   escena (típicamente vía `registrarModelo`).
   * @returns {void}
   */
  registrarCodi(objeto3D) {
    this._modeloCodi = objeto3D;
  }

  /**
   * Aplica (o actualiza) el efecto visual de corrupción del Bug_Supremo sobre
   * una malla existente del entorno, delegando la implementación real del
   * efecto en `corruptionShader.js` (`aplicarShaderCorrupcion`, tarea 7.4).
   *
   * `mallaObjetivo.material` puede ser un único `THREE.Material` o un array
   * de materiales (algunas mallas GLTF con múltiples grupos de geometría
   * usan un array); en ese caso el efecto se aplica a cada material del
   * array por igual, de forma simple, sin intentar distinguir cuáles
   * "deberían" corromperse (suficiente para el MVP y para las mallas de
   * entorno usadas en el Desafio_Final, tarea 15.1).
   *
   * Los uniforms devueltos por cada llamada a `aplicarShaderCorrupcion` se
   * guardan en `this._corrupcionesActivas` para que `render()` pueda avanzar
   * `uTime` en cada frame (ver más abajo).
   *
   * @param {THREE.Mesh} mallaObjetivo - Malla del entorno sobre la que se
   *   aplicará el efecto de corrupción (nunca una malla propia del
   *   Bug_Supremo, que no tiene malla propia; Requirements 10.3).
   * @param {number} intensidad - Intensidad del efecto, típicamente en `[0, 1]`.
   * @returns {void}
   */
  aplicarCorrupcion(mallaObjetivo, intensidad) {
    if (!mallaObjetivo || !mallaObjetivo.material) {
      // eslint-disable-next-line no-console
      console.warn('RenderEngine.aplicarCorrupcion: mallaObjetivo sin material válido; no-op.');
      return;
    }

    const materiales = Array.isArray(mallaObjetivo.material)
      ? mallaObjetivo.material
      : [mallaObjetivo.material];

    for (const material of materiales) {
      const { uniforms } = aplicarShaderCorrupcion(material, intensidad);
      this._corrupcionesActivas.push(uniforms);
    }
  }

  /**
   * Posiciona la cámara según `estadoCamara` (producido por
   * `CameraSystem.actualizar`), posiciona/orienta el modelo 3D de Codi (si se
   * registró uno vía `registrarCodi`) según `poseCodi`, y renderiza un frame
   * de la escena.
   *
   * Si no se registró ningún modelo de Codi (`registrarCodi` nunca se llamó),
   * el posicionamiento de Codi se omite sin error: esto mantiene `render`
   * usable ya en esta tarea (7.1), antes de que exista un modelo 3D real de
   * Codi cargado por `AssetLoader` (tareas futuras 14.x/16.x).
   *
   * Tanto `poseCodi` como `estadoCamara` son opcionales/defensivos: si no se
   * provee `estadoCamara` (p.ej. el primerísimo frame antes de que
   * `CameraSystem` haya producido un estado, o un uso simplificado en
   * pruebas), `render` simplemente omite el reposicionamiento de la cámara y
   * renderiza con la posición/orientación de cámara ya vigente, en vez de
   * lanzar una excepción por desestructurar `undefined`.
   *
   * @param {import('../movement/MovementSystem.js').CodiPose} [poseCodi] -
   *   Pose actual de Codi (`position`, `rotationY`); usada para posicionar y
   *   orientar el modelo 3D de Codi si se registró uno.
   * @param {{posicionCamara: {x:number,y:number,z:number}, target: {x:number,y:number,z:number}}} [estadoCamara] -
   *   Estado de cámara producido por `CameraSystem.actualizar`.
   * @returns {void}
   */
  render(poseCodi, estadoCamara) {
    if (estadoCamara) {
      const { posicionCamara, target } = estadoCamara;
      this._camera.position.set(posicionCamara.x, posicionCamara.y, posicionCamara.z);
      this._camera.lookAt(target.x, target.y, target.z);
    }

    if (this._modeloCodi && poseCodi) {
      const { position, rotationY } = poseCodi;
      this._modeloCodi.position.set(position.x, position.y, position.z);
      this._modeloCodi.rotation.y = rotationY;
    }

    this._actualizarCorrupcionesActivas();

    this._renderer.render(this._scene, this._camera);
  }

  /**
   * Avanza `uTime` de cada corrupción activa (`this._corrupcionesActivas`,
   * ver `aplicarCorrupcion`) según el tiempo transcurrido desde el frame
   * anterior, usando un reloj interno basado en `performance.now()` (`render`
   * no recibe un `deltaTime` externo, ver nota en el constructor). En el
   * primer frame tras registrar alguna corrupción (o el primer frame de
   * `RenderEngine` en general) no hay un tiempo previo con el que calcular
   * un delta, así que ese frame simplemente inicializa el reloj sin avanzar
   * `uTime`, en vez de aplicar un salto arbitrario.
   *
   * @private
   * @returns {void}
   */
  _actualizarCorrupcionesActivas() {
    if (this._corrupcionesActivas.length === 0) {
      return;
    }

    const ahoraMs = performance.now();
    if (this._ultimoTiempoRenderMs === null) {
      this._ultimoTiempoRenderMs = ahoraMs;
      return;
    }

    const deltaSegundos = (ahoraMs - this._ultimoTiempoRenderMs) / 1000;
    this._ultimoTiempoRenderMs = ahoraMs;

    for (const uniforms of this._corrupcionesActivas) {
      uniforms.uTime.value += deltaSegundos;
    }
  }

  /**
   * Actualiza el tamaño del renderer y la relación de aspecto de la cámara
   * ante un cambio de dimensiones del viewport (Requirements 2.4). Se expone
   * como método público (además de usarse internamente como listener de
   * `window.resize`) para poder invocarlo manualmente en pruebas sin
   * depender de disparar un evento real de `window`.
   *
   * @param {number} ancho
   * @param {number} alto
   * @returns {void}
   */
  onResize(ancho, alto) {
    this._renderer.setSize(ancho, alto, false);
    actualizarAspecto(this._camera, ancho, alto);
  }

  /**
   * Libera los recursos del renderer y remueve el listener de `window.resize`,
   * para limpieza en pruebas o al desmontar el juego.
   *
   * @returns {void}
   */
  dispose() {
    window.removeEventListener('resize', this._onWindowResize);
    this._renderer.dispose();
  }

  /**
   * Acceso de solo lectura a la `THREE.Scene` interna, para integraciones
   * futuras (p.ej. `AssetLoader` añadiendo geometría directamente, o pruebas
   * que necesiten inspeccionar el grafo de escena) sin exponer un setter que
   * permita reemplazarla.
   *
   * @returns {THREE.Scene}
   */
  get scene() {
    return this._scene;
  }

  /**
   * Acceso de solo lectura a la `THREE.PerspectiveCamera` interna.
   *
   * @returns {THREE.PerspectiveCamera}
   */
  get camera() {
    return this._camera;
  }

  /**
   * Acceso de solo lectura al `THREE.WebGLRenderer` interno (p.ej. para que
   * `main.js`, tarea 16.1, pueda leer `renderer.domElement` o ajustar
   * opciones avanzadas no cubiertas por la API pública de `RenderEngine`).
   *
   * @returns {THREE.WebGLRenderer}
   */
  get renderer() {
    return this._renderer;
  }
}
