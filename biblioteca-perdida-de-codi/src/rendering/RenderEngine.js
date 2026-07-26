import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
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
 * Ancho (unidades del mundo, en X y Z) del volumen dentro del cual se
 * distribuyen las Partículas Ambientales alrededor de Codi (SPEC-03,
 * docs/art-direction.md sección 15 "Motas ambientales"). El volumen se
 * recentra sobre la posición XZ de Codi en cada frame (ver
 * `_actualizarParticulasAmbientales`), por lo que este ancho solo necesita
 * cubrir cómodamente el campo de visión típico, no el mundo completo.
 */
const ANCHO_VOLUMEN_PARTICULAS = 18;

/**
 * Altura (unidades del mundo, en Y, relativa a `y=0` del volumen) hasta la
 * que puede ascender una Partícula Ambiental antes de reciclarse de vuelta
 * a la base (ciclo infinito sin crecer memoria).
 */
const ALTO_VOLUMEN_PARTICULAS = 5;

/**
 * Vertex/fragment shader mínimo del "Sky Gradient" procedural (SPEC-03:
 * World Atmosphere & Environmental Storytelling, sección 3 "Sky Gradient").
 * Colorea una cúpula (`SphereGeometry`, `BackSide`) mezclando linealmente
 * un color de cenit (arriba) y uno de horizonte (abajo) según la altura
 * normalizada del vértice, sin ninguna textura/imagen de skybox — un único
 * material `ShaderMaterial` sin iluminación (no reacciona a las luces de
 * la escena, igual que un `MeshBasicMaterial`), de costo de render mínimo.
 * No participa de la niebla de la escena (`fog: false` en el material).
 */
const SKY_GRADIENT_VERTEX_SHADER = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SKY_GRADIENT_FRAGMENT_SHADER = `
  uniform vec3 uColorCenit;
  uniform vec3 uColorHorizonte;
  uniform float uAltura;
  varying vec3 vWorldPosition;
  void main() {
    float alturaNormalizada = clamp((vWorldPosition.y / uAltura) * 0.5 + 0.5, 0.0, 1.0);
    // smoothstep en vez de mezcla lineal pura: transición más suave y
    // agradable entre horizonte y cenit ("transición suave entre horizonte
    // y cielo", requerimiento explícito de la Specification).
    float t = smoothstep(0.0, 1.0, alturaNormalizada);
    gl_FragColor = vec4(mix(uColorHorizonte, uColorCenit, t), 1.0);
  }
`;

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
   * @param {Object} [config] - Constantes de configuración de la cámara y
   *   de la atmósfera visual (SPEC-03: World Atmosphere & Rendering).
   * @param {number} [config.fov=65] - Campo de visión vertical, en grados.
   * @param {number} [config.near=0.1] - Plano de recorte cercano.
   * @param {number} [config.far=1000] - Plano de recorte lejano.
   * @param {number} [config.intensidadAmbiental=0.6] - Intensidad de la
   *   `AmbientLight` (docs/art-direction.md sección 16). Parametrizada para
   *   poder ajustarse sin tocar código (p.ej. desde un futuro selector de
   *   perfil gráfico, sección 20 del documento de dirección artística).
   * @param {number} [config.intensidadHemisferio=0.45] - Intensidad de la
   *   `HemisphereLight` (cielo/suelo), que aporta un degradado de color
   *   ambiental más rico que una `AmbientLight` plana sin costo adicional
   *   de sombras.
   * @param {number} [config.intensidadDireccional=1.0] - Intensidad de la
   *   `DirectionalLight` principal ("luz de bóveda").
   * @param {number} [config.intensidadAcento=8] - Intensidad de la
   *   `PointLight` de acento que sigue a Codi.
   * @param {boolean} [config.usarPostprocesado=true] - Si `true`, intenta
   *   construir la cadena de postprocesado (`EffectComposer` +
   *   `RenderPass` + `UnrealBloomPass` sutil + `OutputPass` para
   *   tonemapping/corrección de color — docs/art-direction.md sección 19).
   *   Se envuelve en `try/catch`: si `EffectComposer` no puede construirse
   *   sobre el `renderer` provisto (p.ej. un mock de `WebGLRenderer` en
   *   tests que no implementa `getRenderTarget`/`getContext`), el
   *   constructor de `RenderEngine` NO debe romperse — simplemente se
   *   continúa renderizando directamente con `renderer.render(...)` (ver
   *   `render()`), exactamente igual que antes de esta opción.
   */
  constructor(canvas, config = {}) {
    /** @private */
    this._canvas = canvas;

    const fov = config.fov ?? 65;
    const near = config.near ?? 0.1;
    const far = config.far ?? 1000;
    const intensidadAmbiental = config.intensidadAmbiental ?? 0.6;
    const intensidadHemisferio = config.intensidadHemisferio ?? 0.45;
    const intensidadDireccional = config.intensidadDireccional ?? 1.0;
    const intensidadAcento = config.intensidadAcento ?? 8;
    const usarPostprocesado = config.usarPostprocesado ?? true;

    // El aspect inicial se toma del tamaño actual del canvas cuando está
    // disponible; si no (p.ej. un canvas recién creado sin layout todavía),
    // se usa 16/9 como valor razonable por defecto hasta el primer resize.
    const anchoInicial = canvas.clientWidth || canvas.width || 16;
    const altoInicial = canvas.clientHeight || canvas.height || 9;

    /** @private */
    this._scene = new THREE.Scene();

    // Color de fondo azul/negro profundo tipo "servidor/espacio"
    // (estética cyberpunk/sci-fi de la Biblioteca del Código). Además de
    // su función estética, sirve como verificación visual rápida de que
    // el canvas está renderizando: si al abrir el juego se ve una escena
    // vacía pero con este tono de fondo, WebGL/el renderer funcionan
    // correctamente y el problema está en la falta de modelos/luces, no en
    // el pipeline de render en sí.
    const colorFondo = 0x070b19;
    this._scene.background = new THREE.Color(colorFondo);

    // Niebla exponencial sutil, del mismo tono que el fondo, para dar
    // sensación de profundidad a las plataformas distantes (se desvanecen
    // hacia el fondo en vez de recortarse abruptamente).
    this._scene.fog = new THREE.FogExp2(colorFondo, 0.02);

    // "Sky Gradient" procedural (SPEC-03, sección 3): elimina la sensación
    // de fondo plano sin usar una skybox pesada (sin textura/imagen). Una
    // cúpula grande (`BackSide`, se ve desde dentro) con un shader mínimo
    // que degrada del tono profundo del cenit al tono de horizonte de la
    // paleta ya establecida (`--world-fog`/`--world-bg-deep` de
    // docs/art-direction.md sección 5.1). No participa en colisiones ni en
    // ningún sistema de gameplay: es puramente decorativa, se añade
    // directamente a `_scene` (no vía `registrarModelo`, para no alterar
    // el conteo de modelos registrados por `main.js`).
    this._skyGradient = this._crearSkyGradient(colorFondo);
    this._scene.add(this._skyGradient);

    // Luces básicas de la escena. SIN ESTO, `MeshStandardMaterial` (usado
    // tanto por los modelos GLB reales como por la geometría de respaldo de
    // `AssetLoader.crearGeometriaRespaldo`) se renderiza completamente
    // negro: es un material que reacciona a la iluminación física de la
    // escena (PBR) y no muestra ningún color propio sin al menos una luz
    // presente. Se combinan una luz ambiental fría cian/azul (ilumina todo
    // por igual, sin sombras, con el tono general "tech" del ambiente), una
    // luz de hemisferio cielo/suelo (aporta un degradado de color ambiental
    // más rico, docs/art-direction.md sección 16, sin costo de sombras
    // adicional), una luz direccional principal cian/blanca tipo "luz de
    // sol sintética" (da volumen/sombreado a las formas) y una luz puntual
    // de acento magenta/violeta neón (vibra visualmente el entorno,
    // siguiendo a Codi en cada frame). Todas las intensidades están
    // parametrizadas vía `config` (ver JSDoc del constructor) y se guardan
    // como propiedades privadas para permitir ajustes futuros (p.ej. ciclo
    // día/noche, perfil gráfico dinámico).
    /** @private */
    this._luzAmbiental = new THREE.AmbientLight(0x1a2b4c, intensidadAmbiental);
    this._scene.add(this._luzAmbiental);

    /**
     * @private
     * Luz de hemisferio: color de "cielo" cian-violeta (coherente con el
     * fondo/niebla) y color de "suelo" cálido ámbar tenue (evoca la luz
     * rebotada de las vetas de conocimiento del suelo, docs/art-direction.md
     * secciones 1 y 16). No requiere sombras ni geometría adicional.
     */
    this._luzHemisferio = new THREE.HemisphereLight(0x16233a, 0x2b2438, intensidadHemisferio);
    this._scene.add(this._luzHemisferio);

    /**
     * @private
     * Luz direccional principal cian/blanca: se deja `castShadow = true`
     * para no cerrar la puerta a un shadow map dinámico real en el futuro,
     * pero por ahora NO se activa `this._renderer.shadowMap.enabled` — la
     * sensación de "anclaje al suelo" se resuelve con la sombra de
     * contacto plana (`_sombraContacto`, ver constructor), que da la
     * mejora perceptible documentada en docs/art-direction.md sección 18
     * a un costo de render mucho menor que sombras dinámicas completas
     * (apropiado para GPU integrada).
     */
    this._luzDireccional = new THREE.DirectionalLight(0xe0f2fe, intensidadDireccional);
    this._luzDireccional.position.set(10, 20, 10);
    this._luzDireccional.castShadow = true;
    this._scene.add(this._luzDireccional);

    /**
     * @private
     * Luz puntual de acento magenta/violeta neón, pensada para seguir a
     * Codi (ver `render`, donde se reposiciona en cada frame junto al
     * modelo de Codi si hay uno registrado) y crear un ambiente "tech"
     * vibrante alrededor del jugador. Si no hay modelo de Codi registrado
     * todavía, permanece en el origen de la escena como acento central.
     */
    this._luzAcento = new THREE.PointLight(0xa855f7, intensidadAcento, 12, 2);
    this._luzAcento.position.set(0, 3, 0);
    this._scene.add(this._luzAcento);

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

    // Tone mapping y corrección de color suave (SPEC-03 sección 8,
    // docs/art-direction.md sección 19): `ACESFilmicToneMapping` da un
    // rango dinámico más agradable/cinematográfico que el mapeo lineal
    // por defecto, sin ser un efecto agresivo. `OutputPass` (ver
    // `_crearComposerPostprocesado`) lee estos valores del renderer para
    // aplicarlos correctamente incluso cuando el postprocesado está
    // activo. Envuelto en `try/catch` por la misma razón que
    // `shadowMap`/otros ajustes del renderer: un mock simplificado en
    // tests podría no exponer estas propiedades como mutables.
    try {
      this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this._renderer.toneMappingExposure = 1.05;
    } catch {
      // Defensivo: no debe romper la construcción en entornos de prueba.
    }

    /** @private - referencia opcional al objeto 3D de Codi, ver `registrarCodi` */
    this._modeloCodi = null;

    /**
     * @private - "sombra de contacto" (blob shadow) bajo Codi: un disco
     * plano semi-transparente que se reposiciona bajo `_modeloCodi` en
     * cada frame (ver `render`), dando sensación de anclaje al suelo sin
     * el costo de un shadow map dinámico sobre toda la escena
     * (docs/art-direction.md sección 18: "Sombras" — alternativa ligera
     * recomendada como la implementación principal, con `shadowMap`
     * dinámico documentado como mejora opcional futura fuera de alcance
     * de esta Specification). Se crea siempre (no depende de
     * `registrarCodi`) para que ya esté presente en la escena desde el
     * primer frame; si nunca hay un modelo de Codi registrado, simplemente
     * permanece en el origen sin efecto visible perceptible.
     */
    this._sombraContacto = this._crearSombraContacto();
    this._scene.add(this._sombraContacto);

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
     * tanto `uTime` de cada corrupción activa como la fase del ciclo de
     * caminata de Codi (ver `_avanzarRelojInterno`). `render(poseCodi,
     * estadoCamara)` no recibe un `deltaTime` externo (ver firma existente
     * más abajo), así que se mantiene este reloj interno en vez de cambiar
     * la firma pública del método, que ya usan `GameLoop`/`main.js`.
     * @type {number|null}
     */
    this._ultimoTiempoRenderMs = null;

    /**
     * @private - fase acumulada (radianes) del ciclo de caminata de Codi.
     * Solo avanza mientras Codi se desplaza (ver `_actualizarCicloCaminata`);
     * al detenerse, la fase se congela en su último valor en vez de
     * reiniciarse, para que el siguiente ciclo continúe suavemente desde
     * ahí en vez de "saltar" a la pose neutra y de vuelta.
     * @type {number}
     */
    this._faseCicloCaminata = 0;

    /**
     * @private - estado interno de "Character Polish: Codi" (SPEC-04),
     * puramente presentacional (nunca leído ni escrito por
     * `MovementSystem`/`AbilitySystem`/ningún sistema de gameplay).
     * Agrupado en un único objeto para no ensuciar el resto de
     * propiedades privadas de la clase con ~8 campos sueltos. Ver
     * `_actualizarPersonalidadCodi` y sus sub-métodos (`_actualizarIdle`,
     * `_actualizarParpadeo`, `_actualizarMiradaAmbiental`,
     * `_actualizarDinamicaCola`, `_actualizarExpresividad`).
     */
    this._estadoPersonalidadCodi = {
      /** Fase (radianes) del balanceo de respiración en idle (sección 1). */
      faseRespiracion: 0,
      /** Segundos restantes hasta el próximo parpadeo (sección 2). */
      tiempoHastaProximoParpadeo: this._generarIntervaloParpadeo(),
      /** Fase 0..1 del parpadeo en curso, o -1 si no hay parpadeo activo. */
      faseParpadeo: -1,
      /** `true` mientras el parpadeo en curso es un "doble parpadeo" (sección 2). */
      parpadeoDobleEnCurso: false,
      /** `true` si, tras cerrar los ojos, falta un segundo cierre corto (doble parpadeo). */
      pendienteSegundoParpadeo: false,
      /** Segundos acumulados de quietud continua (velocidad ≈ 0), usados por Eye Life (sección 3). */
      tiempoQuieto: 0,
      /** Offset angular actual (radianes, eje Y) de la mirada ambiental de la cabeza (sección 3). */
      offsetMiradaActual: 0,
      /** Offset angular objetivo hacia el que `offsetMiradaActual` se interpola suavemente. */
      offsetMiradaObjetivo: 0,
      /** Segundos restantes antes de elegir un nuevo `offsetMiradaObjetivo`. */
      tiempoHastaProximaMirada: 2 + Math.random() * 2,
      /** Velocidad horizontal del frame anterior, usada por Tail Dynamics (sección 4) para estimar aceleración/desaceleración. */
      velocidadHorizontalAnterior: 0,
      /** Offset de "latigazo" de cola por inercia (sección 4), amortiguado hacia 0 cada frame. */
      offsetLatigazoCola: 0,
      /** `true` si Codi estaba en movimiento en el frame anterior (para detectar la transición "se detiene" — sección 8, inclinación de cabeza al detenerse). */
      caminandoAnterior: false,
      /** Fase 0..1 de la pose de "inclinación al detenerse" en curso, o -1 si no hay ninguna activa. */
      faseInclinacionDetencion: -1,
    };

    /**
     * @private - sistema de Partículas Ambientales ("motas de conocimiento",
     * docs/art-direction.md sección 15): un único `THREE.Points` liviano
     * (una sola geometría/draw call) que orbita alrededor de Codi, dando
     * sensación de "aire vivo" sin interferir con gameplay (no tienen
     * colisión ni se registran en ningún sistema de física/movimiento).
     */
    this._particulasAmbientales = this._crearParticulasAmbientales();
    this._scene.add(this._particulasAmbientales);

    /**
     * @private - detalles ambientales estáticos de "Environmental
     * Storytelling" (SPEC-03 sección 7): ver `_crearDetallesAmbientales`.
     * No animados, no interactivos, no registrados en ningún sistema de
     * gameplay/colisión.
     */
    this._detallesAmbientales = this._crearDetallesAmbientales();
    this._scene.add(this._detallesAmbientales);

    /**
     * @private - cadena de postprocesado opcional (docs/art-direction.md
     * sección 19): Bloom muy sutil sobre elementos `emissive` + corrección
     * de tono/color vía `OutputPass`. `null` si `usarPostprocesado` es
     * `false` o si la construcción falla (ver JSDoc del constructor); en
     * ambos casos `render()` usa `renderer.render(...)` directamente como
     * respaldo, preservando el comportamiento exacto previo a esta opción.
     * @type {EffectComposer|null}
     */
    this._composer = usarPostprocesado
      ? this._crearComposerPostprocesado(anchoInicial, altoInicial)
      : null;

    // Listener de resize (Arquitectura escalable a WebXR 2, Requisitos de
    // Sistema_de_Camara 2.4): se enlaza una sola vez para poder removerlo en
    // `dispose()`.
    /** @private */
    this._onWindowResize = () => this.onResize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', this._onWindowResize);
  }

  /**
   * Construye la cúpula de "Sky Gradient" procedural (ver
   * `SKY_GRADIENT_VERTEX_SHADER`/`SKY_GRADIENT_FRAGMENT_SHADER` arriba).
   * Usa `THREE.BackSide` para que el color se vea desde dentro de la
   * esfera (la cámara siempre está dentro de la cúpula) y
   * `depthWrite: false` para que nunca oculte geometría real de la escena
   * por errores de profundidad. El radio (300) es mayor que `far` típico
   * de otras escenas pero se mantiene bien por debajo del `far` de la
   * cámara (1000 por defecto) para no recortarse.
   *
   * @private
   * @param {number} colorFondoHex - Color de cenit (arriba), reutilizado
   *   como ancla de continuidad con `scene.background`/niebla.
   * @returns {THREE.Mesh}
   */
  _crearSkyGradient(colorFondoHex) {
    const geometria = new THREE.SphereGeometry(300, 24, 16);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColorCenit: { value: new THREE.Color(colorFondoHex) },
        // Horizonte: variante más clara/violeta del cenit, coherente con
        // `--world-stone-light` de docs/art-direction.md sección 5.1 —
        // sugiere la luz tenue de la bóveda de la biblioteca en el
        // horizonte, sin romper la paleta general.
        uColorHorizonte: { value: new THREE.Color(0x2b2438) },
        uAltura: { value: 120 },
      },
      vertexShader: SKY_GRADIENT_VERTEX_SHADER,
      fragmentShader: SKY_GRADIENT_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    return new THREE.Mesh(geometria, material);
  }

  /**
   * Construye un pequeño conjunto de detalles ambientales estáticos
   * ("Environmental Storytelling", SPEC-03 sección 7): geometría simple y
   * económica que sugiere historia sin texto ni nuevas mecánicas —
   * fragmentos de cristal de conocimiento flotando (bioluminiscencia
   * discreta) y glifos antiguos grabados en el aire cerca del punto de
   * inicio. Ninguno de estos objetos se registra en ningún sistema de
   * colisión/gameplay ni afecta `WorldModel`/`zones.data.js`: son mallas
   * puramente decorativas añadidas directamente a `_scene`.
   *
   * Se ubican relativos al origen del mundo (cerca de la Zona de
   * `claro-de-llegada`, aproximadamente `x∈[-10,10], z∈[-10,10]` según
   * `zones.data.js`) para que sean visibles desde el primer segundo de
   * juego, cumpliendo "el jugador debe sentir, desde el primer segundo,
   * que ha entrado en una biblioteca ancestral" — sin importar
   * `zones.data.js` directamente (se usan coordenadas fijas razonables en
   * vez de una dependencia cruzada con el módulo de datos del mundo).
   *
   * @private
   * @returns {THREE.Group}
   */
  _crearDetallesAmbientales() {
    const grupo = new THREE.Group();

    // Cristales de conocimiento: prismas pequeños con bioluminiscencia
    // discreta (emissive bajo), flotando a distintas alturas.
    const materialCristal = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.75,
    });
    const posicionesCristales = [
      { x: -6, y: 1.6, z: -4 },
      { x: 7, y: 2.1, z: 3 },
      { x: -3, y: 1.3, z: 6 },
    ];
    for (const pos of posicionesCristales) {
      const cristal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), materialCristal);
      cristal.position.set(pos.x, pos.y, pos.z);
      cristal.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      grupo.add(cristal);
    }

    // Glifos antiguos: anillos delgados grabados "flotando" cerca del
    // suelo, sugiriendo símbolos de un lenguaje olvidado (sin texto
    // literal ni tipografía, para no competir con el HUD real).
    const materialGlifo = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.25,
      roughness: 0.6,
      metalness: 0.2,
    });
    const posicionesGlifos = [
      { x: -5, y: 0.05, z: 2 },
      { x: 4, y: 0.05, z: -5 },
    ];
    for (const pos of posicionesGlifos) {
      const glifo = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 6), materialGlifo);
      glifo.rotation.x = -Math.PI / 2;
      glifo.position.set(pos.x, pos.y, pos.z);
      grupo.add(glifo);
    }

    return grupo;
  }

  /**
   * Construye la sombra de contacto ("blob shadow") bajo Codi: un disco
   * plano semi-transparente y oscuro (`MeshBasicMaterial`, sin
   * iluminación, costo de render mínimo) orientado hacia arriba.
   *
   * @private
   * @returns {THREE.Mesh}
   */
  _crearSombraContacto() {
    const geometria = new THREE.CircleGeometry(0.5, 20);
    const material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const sombra = new THREE.Mesh(geometria, material);
    sombra.rotation.x = -Math.PI / 2;
    sombra.position.set(0, 0.01, 0); // ligeramente sobre y=0 para evitar z-fighting con el suelo
    return sombra;
  }

  /**
   * Construye el sistema de Partículas Ambientales: un único `THREE.Points`
   * con `PARTICULAS_AMBIENTALES_CANTIDAD` partículas distribuidas en un
   * volumen alrededor del origen (recentrado sobre Codi en cada frame, ver
   * `_actualizarParticulasAmbientales`). Usa un color cian/ámbar mezclado
   * (promedio de los acentos de conocimiento/tecnología) para que se lea
   * como "motas de conocimiento" neutrales, no ligadas a una sola
   * Habilidad (docs/art-direction.md sección 15).
   *
   * Presupuesto de rendimiento: ~40 partículas, dentro del rango
   * "30–60 por Zona visible" documentado, y muy por debajo del máximo de
   * ~100 simultáneas — un único `BufferGeometry`/`Points`, sin coste de
   * draw calls adicional por partícula.
   *
   * @private
   * @returns {THREE.Points}
   */
  _crearParticulasAmbientales() {
    const cantidad = 40;
    const posiciones = new Float32Array(cantidad * 3);
    // Fase/velocidad de ascenso individual por partícula, para que no
    // todas suban en sincronía perfecta (ver `_actualizarParticulasAmbientales`).
    const fases = new Float32Array(cantidad);
    const velocidades = new Float32Array(cantidad);

    for (let i = 0; i < cantidad; i += 1) {
      posiciones[i * 3] = (Math.random() - 0.5) * ANCHO_VOLUMEN_PARTICULAS;
      posiciones[i * 3 + 1] = Math.random() * ALTO_VOLUMEN_PARTICULAS;
      posiciones[i * 3 + 2] = (Math.random() - 0.5) * ANCHO_VOLUMEN_PARTICULAS;
      fases[i] = Math.random() * Math.PI * 2;
      velocidades[i] = 0.15 + Math.random() * 0.15;
    }

    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));

    const material = new THREE.PointsMaterial({
      color: 0x9fd8e8, // mezcla neutra cian/ámbar, ver JSDoc de este método
      size: 0.06,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const puntos = new THREE.Points(geometria, material);
    puntos.userData.fases = fases;
    puntos.userData.velocidades = velocidades;
    return puntos;
  }

  /**
   * Construye la cadena de postprocesado (`EffectComposer` + `RenderPass` +
   * `UnrealBloomPass` sutil + `OutputPass`). Envuelta en `try/catch`: si
   * `this._renderer` no soporta la API que `EffectComposer` necesita
   * (p.ej. un mock simplificado usado en tests, que no implementa
   * `getRenderTarget`/`getContext`/`state.buffers`), se captura el error y
   * se devuelve `null`, dejando que `render()` recurra al camino directo
   * (`renderer.render(...)`) sin ningún efecto de postprocesado — nunca se
   * relanza la excepción, ya que el postprocesado es una mejora puramente
   * visual y opcional (docs/art-direction.md sección 19), no una
   * dependencia dura de `RenderEngine`.
   *
   * @private
   * @param {number} ancho
   * @param {number} alto
   * @returns {EffectComposer|null}
   */
  _crearComposerPostprocesado(ancho, alto) {
    try {
      const composer = new EffectComposer(this._renderer);
      composer.addPass(new RenderPass(this._scene, this._camera));

      // Bloom muy sutil: umbral alto (solo brilla lo realmente emissive,
      // no toda la escena) e intensidad baja (refuerzo discreto del motivo
      // "brillo = interactivo", no un efecto vistoso).
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(ancho, alto),
        /* strength */ 0.35,
        /* radius */ 0.4,
        /* threshold */ 0.82
      );
      composer.addPass(bloomPass);

      // Corrección de color/tono: `OutputPass` aplica el tone mapping y el
      // espacio de color de salida configurados en el renderer, necesario
      // para que el resultado tras el bloom no se vea "lavado".
      composer.addPass(new OutputPass());

      return composer;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        'RenderEngine: no se pudo inicializar el postprocesado (bloom/tonemapping); se continúa sin él.',
        error
      );
      return null;
    }
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

    if (poseCodi) {
      // La luz de acento neón sigue a Codi para crear un halo "tech"
      // vibrante alrededor del jugador en todo momento.
      const { position } = poseCodi;
      this._luzAcento.position.set(position.x, position.y + 2, position.z);

      // Sombra de contacto: se ancla justo bajo los pies de Codi (altura
      // y=0.01 fija respecto al suelo, no respecto a poseCodi.position.y,
      // ya que la posición Y de Codi representa el centro del modelo, no
      // el suelo) — docs/art-direction.md sección 18.
      this._sombraContacto.position.set(position.x, 0.01, position.z);

      // Las Partículas Ambientales orbitan alrededor de Codi (recentradas
      // en XZ sobre su posición) para que siempre haya "aire vivo" visible
      // cerca del jugador, sin necesidad de cubrir toda la Isla a la vez.
      this._particulasAmbientales.position.set(position.x, 0, position.z);
    }

    const deltaSegundos = this._avanzarRelojInterno();
    this._actualizarCorrupcionesActivas(deltaSegundos);
    this._actualizarCicloCaminata(poseCodi, deltaSegundos);
    this._actualizarParticulasAmbientales(deltaSegundos);
    this._actualizarPersonalidadCodi(poseCodi, deltaSegundos);

    if (this._composer) {
      this._composer.render(deltaSegundos);
    } else {
      this._renderer.render(this._scene, this._camera);
    }
  }

  /**
   * Anima el ascenso lento de cada Partícula Ambiental (ver
   * `_crearParticulasAmbientales`): cada partícula sube a su propia
   * velocidad y, al superar `ALTO_VOLUMEN_PARTICULAS`, se recicla de
   * vuelta a la base (`y=0`) con un pequeño drift lateral aleatorio nuevo,
   * dando la ilusión de un flujo continuo sin necesidad de crear/destruir
   * partículas (costo de render constante).
   *
   * Puramente decorativa: no lee ni escribe ningún estado de gameplay.
   *
   * @private
   * @param {number} deltaSegundos
   * @returns {void}
   */
  _actualizarParticulasAmbientales(deltaSegundos) {
    if (deltaSegundos <= 0) {
      return;
    }

    const geometria = this._particulasAmbientales.geometry;
    const posiciones = geometria.attributes.position.array;
    const { velocidades } = this._particulasAmbientales.userData;

    for (let i = 0; i < velocidades.length; i += 1) {
      const indiceY = i * 3 + 1;
      posiciones[indiceY] += velocidades[i] * deltaSegundos;

      if (posiciones[indiceY] > ALTO_VOLUMEN_PARTICULAS) {
        posiciones[indiceY] = 0;
        posiciones[i * 3] = (Math.random() - 0.5) * ANCHO_VOLUMEN_PARTICULAS;
        posiciones[i * 3 + 2] = (Math.random() - 0.5) * ANCHO_VOLUMEN_PARTICULAS;
      }
    }

    geometria.attributes.position.needsUpdate = true;
  }

  /**
   * Avanza el reloj interno basado en `performance.now()` y devuelve el
   * `deltaTime` en segundos transcurrido desde el frame anterior. `render`
   * no recibe un `deltaTime` externo (ver nota en el constructor), así que
   * este reloj es la única fuente de tiempo disponible para animaciones
   * internas (corrupción del Bug_Supremo, ciclo de caminata de Codi). En el
   * primer frame no hay un tiempo previo con el que calcular un delta, así
   * que ese frame simplemente inicializa el reloj y devuelve `0`, en vez de
   * aplicar un salto arbitrario.
   *
   * @private
   * @returns {number} `deltaSegundos`, o `0` en el primer frame.
   */
  _avanzarRelojInterno() {
    const ahoraMs = performance.now();
    if (this._ultimoTiempoRenderMs === null) {
      this._ultimoTiempoRenderMs = ahoraMs;
      return 0;
    }

    const deltaSegundos = (ahoraMs - this._ultimoTiempoRenderMs) / 1000;
    this._ultimoTiempoRenderMs = ahoraMs;
    return deltaSegundos;
  }

  /**
   * Avanza `uTime` de cada corrupción activa (`this._corrupcionesActivas`,
   * ver `aplicarCorrupcion`) según `deltaSegundos`.
   *
   * @private
   * @param {number} deltaSegundos
   * @returns {void}
   */
  _actualizarCorrupcionesActivas(deltaSegundos) {
    if (this._corrupcionesActivas.length === 0 || deltaSegundos <= 0) {
      return;
    }

    for (const uniforms of this._corrupcionesActivas) {
      uniforms.uTime.value += deltaSegundos;
    }
  }

  /**
   * Anima el ciclo de caminata (walk cycle) del modelo procedural de Codi
   * (ver `AssetLoader._crearModeloCodiProcedural`): oscila levemente las
   * patas traseras, los brazos y la cola cuando la velocidad horizontal de
   * Codi es mayor a cero, y los deja en su pose neutra (rotación 0) cuando
   * Codi está quieto o en el aire.
   *
   * No-op seguro si no se registró un modelo de Codi (`registrarCodi`) o si
   * el modelo registrado no expone `userData.partesAnimables` (p.ej. un
   * modelo GLB real futuro sin esa convención, o un mock simple en tests):
   * el ciclo de caminata es una mejora puramente visual sobre el respaldo
   * procedural, no una dependencia dura de `render`.
   *
   * @private
   * @param {import('../movement/MovementSystem.js').CodiPose} [poseCodi]
   * @param {number} deltaSegundos
   * @returns {void}
   */
  _actualizarCicloCaminata(poseCodi, deltaSegundos) {
    const partesAnimables = this._modeloCodi?.userData?.partesAnimables;
    if (!partesAnimables) {
      return;
    }

    const { patasTraseras = [], brazos = [], cola } = partesAnimables;

    const velocidad = poseCodi?.velocity;
    const velocidadHorizontal = velocidad
      ? Math.sqrt(velocidad.x * velocidad.x + velocidad.z * velocidad.z)
      : 0;
    const caminando = velocidadHorizontal > 1e-3 && deltaSegundos > 0;

    if (caminando) {
      // Frecuencia de oscilación proporcional a la velocidad (caminatas más
      // rápidas mueven las extremidades más rápido), con un mínimo razonable
      // para que el ciclo sea visible incluso a velocidades bajas.
      const frecuencia = Math.max(4, velocidadHorizontal * 2.2);
      this._faseCicloCaminata += deltaSegundos * frecuencia;
    }
    // Si Codi no está caminando, la fase se congela en su último valor (no
    // se reinicia a 0), para que el próximo ciclo continúe suavemente.

    const amplitudPatas = 0.35;
    const amplitudBrazos = 0.25;
    const amplitudCola = 0.2;

    const oscilacion = caminando ? Math.sin(this._faseCicloCaminata) : 0;
    const oscilacionOpuesta = caminando ? Math.sin(this._faseCicloCaminata + Math.PI) : 0;

    if (patasTraseras[0]) patasTraseras[0].rotation.x = oscilacion * amplitudPatas;
    if (patasTraseras[1]) patasTraseras[1].rotation.x = oscilacionOpuesta * amplitudPatas;

    if (brazos[0]) brazos[0].rotation.x = oscilacionOpuesta * amplitudBrazos;
    if (brazos[1]) brazos[1].rotation.x = oscilacion * amplitudBrazos;

    if (cola) {
      cola.rotation.y = (caminando ? Math.sin(this._faseCicloCaminata * 0.5) : 0) * amplitudCola;
    }
  }

  /**
   * Genera un intervalo pseudoaleatorio (segundos) hasta el próximo
   * parpadeo (SPEC-04, "Blink System"): entre 2.5s y 6s, rango típico de
   * parpadeo humano/animal relajado, evitando tanto un parpadeo mecánico
   * de intervalo fijo como uno tan frecuente que resulte nervioso.
   *
   * @private
   * @returns {number}
   */
  _generarIntervaloParpadeo() {
    return 2.5 + Math.random() * 3.5;
  }

  /**
   * Orquesta toda la "personalidad" puramente visual de Codi añadida por
   * SPEC-04 (Character Polish): respiración/balanceo en idle, parpadeo,
   * micro-movimientos de mirada, dinámica de cola por inercia, y la pose
   * de inclinación de cabeza al detenerse. Ninguna de estas sub-rutinas
   * lee ni modifica `CodiPose`, `ProgressStore` ni ningún estado de
   * gameplay: solo leen `poseCodi.velocity`/`animState` (ya expuestos hoy)
   * para decidir cómo animar, y escriben exclusivamente en las
   * transformaciones locales de las partes animables del modelo
   * procedural (`userData.partesAnimables`).
   *
   * No-op seguro si no hay modelo de Codi registrado o si el modelo no
   * expone `userData.partesAnimables` (mismo criterio que
   * `_actualizarCicloCaminata`): toda esta capa es una mejora visual
   * opcional sobre el respaldo procedural, nunca una dependencia dura.
   *
   * @private
   * @param {import('../movement/MovementSystem.js').CodiPose} [poseCodi]
   * @param {number} deltaSegundos
   * @returns {void}
   */
  _actualizarPersonalidadCodi(poseCodi, deltaSegundos) {
    const partesAnimables = this._modeloCodi?.userData?.partesAnimables;
    if (!partesAnimables || deltaSegundos <= 0) {
      return;
    }

    const velocidad = poseCodi?.velocity;
    const velocidadHorizontal = velocidad
      ? Math.sqrt(velocidad.x * velocidad.x + velocidad.z * velocidad.z)
      : 0;
    // "Quieto" para efectos de personalidad = sin desplazamiento horizontal
    // Y sin estar en el aire (animState 'jump'); un salto no debe disparar
    // parpadeo/mirada ambiental/inclinación de cabeza (Principio de Game
    // Feel: estas animaciones nunca deben leerse como reacción a saltar).
    const enElAire = poseCodi?.animState === 'jump';
    const quieto = velocidadHorizontal <= 1e-3 && !enElAire;

    const estado = this._estadoPersonalidadCodi;

    this._actualizarRespiracionIdle(partesAnimables, estado, quieto, deltaSegundos);
    this._actualizarParpadeo(partesAnimables, estado, deltaSegundos);
    this._actualizarMiradaAmbiental(partesAnimables, estado, quieto, deltaSegundos);
    this._actualizarDinamicaCola(partesAnimables, estado, velocidadHorizontal, deltaSegundos);
    this._actualizarInclinacionAlDetenerse(partesAnimables, estado, quieto, deltaSegundos);
  }

  /**
   * "Idle Animation" (SPEC-04 sección 1): cuando Codi está quieto, el
   * torso/cabeza oscila verticalmente de forma extremadamente sutil
   * (amplitud ~1cm) simulando respiración, en vez de quedar completamente
   * inmóvil. Se aplica sobre `this._modeloCodi.position.y` como un offset
   * relativo (no sobre `cabeza` directamente, para no interferir con la
   * `rotation.y` de mirada ambiental que sí vive en `cabeza` — ver
   * `_actualizarMiradaAmbiental`), y se resetea a 0 en cuanto Codi vuelve a
   * moverse para no interferir con la posición real de `render()`.
   *
   * @private
   * @param {Object} partesAnimables
   * @param {Object} estado - `this._estadoPersonalidadCodi`.
   * @param {boolean} quieto
   * @param {number} deltaSegundos
   * @returns {void}
   */
  _actualizarRespiracionIdle(partesAnimables, estado, quieto, deltaSegundos) {
    const { cabeza } = partesAnimables;
    if (!cabeza) return;

    if (quieto) {
      estado.faseRespiracion += deltaSegundos * 1.6; // ~ciclo cada ~4s, ritmo de respiración calmada
      // Amplitud extremadamente sutil (0.012 unidades ≈ 1.2cm): perceptible
      // de cerca, nunca "exagerada" (requisito explícito de la sección 1).
      cabeza.position.y = 1.02 + Math.sin(estado.faseRespiracion) * 0.012;
    } else {
      // Vuelve suavemente a la altura base de la cabeza en vez de saltar
      // abruptamente, para no generar un "pop" visible al reanudar el
      // movimiento.
      cabeza.position.y += (1.02 - cabeza.position.y) * Math.min(1, deltaSegundos * 8);
    }
  }

  /**
   * "Blink System" (SPEC-04 sección 2): escala verticalmente ambos ojos en
   * sincronía (nunca de forma independiente) para simular el cierre/
   * apertura del párpado, sin geometría de párpado dedicada — más barato
   * en draw calls y suficiente a la distancia de cámara típica del juego.
   *
   * Ciclo de un parpadeo: 0 → 1 en `DURACION_PARPADEO_S/2` (cierre) y
   * 1 → 0 en la mitad restante (apertura), usando `Math.sin` para una
   * curva de velocidad no-lineal (más natural que una interpolación
   * lineal). Con probabilidad `PROBABILIDAD_DOBLE_PARPADEO`, al completar
   * un parpadeo se encadena un segundo parpadeo corto poco después
   * ("doble parpadeo ocasional", requisito explícito).
   *
   * @private
   * @param {Object} partesAnimables
   * @param {Object} estado
   * @param {number} deltaSegundos
   * @returns {void}
   */
  _actualizarParpadeo(partesAnimables, estado, deltaSegundos) {
    const { ojos = [] } = partesAnimables;
    if (ojos.length === 0) return;

    const DURACION_PARPADEO_S = 0.16;
    const PROBABILIDAD_DOBLE_PARPADEO = 0.25;
    const PAUSA_ENTRE_PARPADEOS_DOBLES_S = 0.12;

    if (estado.faseParpadeo < 0) {
      // Sin parpadeo activo: cuenta regresiva hasta el próximo.
      estado.tiempoHastaProximoParpadeo -= deltaSegundos;
      if (estado.tiempoHastaProximoParpadeo <= 0) {
        estado.faseParpadeo = 0;
        estado.parpadeoDobleEnCurso = false;
      }
    } else {
      estado.faseParpadeo += deltaSegundos / DURACION_PARPADEO_S;

      if (estado.faseParpadeo >= 1) {
        // Parpadeo completo: aplana la escala a 1 (ojo abierto) y decide
        // si encadenar un segundo parpadeo corto o programar el próximo.
        for (const ojo of ojos) {
          ojo.scale.y = 1;
        }
        estado.faseParpadeo = -1;

        if (!estado.parpadeoDobleEnCurso && Math.random() < PROBABILIDAD_DOBLE_PARPADEO) {
          estado.pendienteSegundoParpadeo = true;
          estado.tiempoHastaProximoParpadeo = PAUSA_ENTRE_PARPADEOS_DOBLES_S;
        } else if (estado.pendienteSegundoParpadeo) {
          estado.pendienteSegundoParpadeo = false;
          estado.tiempoHastaProximoParpadeo = this._generarIntervaloParpadeo();
        } else {
          estado.tiempoHastaProximoParpadeo = this._generarIntervaloParpadeo();
        }

        if (estado.pendienteSegundoParpadeo) {
          // Se re-lee en el próximo frame: al llegar tiempoHastaProximoParpadeo
          // <= 0, faseParpadeo vuelve a 0 con parpadeoDobleEnCurso=true para
          // no encadenar un tercer/cuarto parpadeo indefinidamente.
          estado.parpadeoDobleEnCurso = true;
        }
      } else {
        // Curva de cierre/apertura suave: sin(π·fase) va de 0 a 1 y de
        // vuelta a 0 conforme fase recorre [0,1], perfecto para
        // escala.y = 1 - amplitud en el punto medio (ojo cerrado).
        const cierre = Math.sin(Math.PI * estado.faseParpadeo);
        for (const ojo of ojos) {
          ojo.scale.y = 1 - cierre * 0.92; // nunca llega a 0 exacto (evita un mesh "colapsado" con normales degeneradas)
        }
      }
    }
  }

  /**
   * "Eye Life" (SPEC-04 sección 3): cuando Codi está quieto, la cabeza gira
   * levemente (eje Y, rango pequeño) hacia un nuevo objetivo cada pocos
   * segundos y vuelve al frente — nunca "buscando objetivos" (sin lógica
   * de detección de mecanismos/libros cercanos, es puramente decorativo y
   * aleatorio) y con un rango angular mínimo (`±0.12` rad ≈ ±7°) para que
   * se lea como "mirar de reojo el entorno", no como un giro de cabeza
   * completo. Comparte la rotación Y de `cabeza` con el resto del modelo
   * (que no rota la cabeza por ningún otro motivo hoy), así que no hay
   * conflicto de escritura entre sub-rutinas.
   *
   * @private
   * @param {Object} partesAnimables
   * @param {Object} estado
   * @param {boolean} quieto
   * @param {number} deltaSegundos
   * @returns {void}
   */
  _actualizarMiradaAmbiental(partesAnimables, estado, quieto, deltaSegundos) {
    const { cabeza } = partesAnimables;
    if (!cabeza) return;

    if (!quieto) {
      // Al reanudar el movimiento, vuelve al frente sin esperar el
      // temporizador (la orientación de movimiento la gobierna
      // `render()`/`rotationY` del propio Codi, no esta sub-rutina).
      estado.offsetMiradaObjetivo = 0;
      estado.tiempoQuieto = 0;
    } else {
      estado.tiempoQuieto += deltaSegundos;
      estado.tiempoHastaProximaMirada -= deltaSegundos;
      // Solo empieza a "mirar alrededor" tras un breve instante quieto
      // (0.6s), para no disparar un giro de cabeza inmediatamente al
      // frenar en seco.
      if (estado.tiempoHastaProximaMirada <= 0 && estado.tiempoQuieto > 0.6) {
        estado.offsetMiradaObjetivo = (Math.random() - 0.5) * 0.24; // ±0.12 rad
        estado.tiempoHastaProximaMirada = 2 + Math.random() * 2.5;
      }
    }

    // Interpolación suave (nunca instantánea) hacia el objetivo actual,
    // tanto para alejarse del frente como para volver a él.
    estado.offsetMiradaActual +=
      (estado.offsetMiradaObjetivo - estado.offsetMiradaActual) * Math.min(1, deltaSegundos * 2.5);
    cabeza.rotation.y = estado.offsetMiradaActual;
  }

  /**
   * "Tail Dynamics" (SPEC-04 sección 4): sin simulación física (ni
   * cuerpos rígidos ni resortes reales), la cola recibe un pequeño offset
   * de "latigazo" proporcional a la aceleración/desaceleración horizontal
   * de Codi entre este frame y el anterior, que se amortigua
   * exponencialmente hacia 0 cada frame (`offsetLatigazoCola *= factor`).
   * El resultado se SUMA a la rotación ya calculada por
   * `_actualizarCicloCaminata` (que sigue gobernando la oscilación base
   * mientras camina), en vez de sobrescribirla, para que ambos efectos
   * convivan: al empezar a caminar la cola "acompaña" con un latigazo
   * hacia atrás; al detenerse, sigue oscilando un poco antes de
   * amortiguarse del todo ("amortiguar el movimiento", requisito
   * explícito de la sección 4).
   *
   * @private
   * @param {Object} partesAnimables
   * @param {Object} estado
   * @param {number} velocidadHorizontal
   * @param {number} deltaSegundos
   * @returns {void}
   */
  _actualizarDinamicaCola(partesAnimables, estado, velocidadHorizontal, deltaSegundos) {
    const { cola } = partesAnimables;
    if (!cola) return;

    const aceleracion = deltaSegundos > 0
      ? (velocidadHorizontal - estado.velocidadHorizontalAnterior) / deltaSegundos
      : 0;
    estado.velocidadHorizontalAnterior = velocidadHorizontal;

    // Impulso proporcional a la aceleración, acotado para que nunca
    // produzca un latigazo exagerado ante cambios de velocidad bruscos.
    const impulso = THREE.MathUtils.clamp(-aceleracion * 0.03, -0.12, 0.12);
    estado.offsetLatigazoCola += impulso;

    // Amortiguación exponencial hacia 0 (independiente de deltaSegundos
    // real gracias al exponente, evita que el "resorte" tarde más/menos
    // según el framerate).
    const factorAmortiguacion = Math.exp(-deltaSegundos * 6);
    estado.offsetLatigazoCola *= factorAmortiguacion;

    cola.rotation.x += estado.offsetLatigazoCola;
  }

  /**
   * "Expressiveness" — inclinación de cabeza al detenerse (SPEC-04
   * sección 8): al detectar la transición de "caminando" a "quieto", se
   * dispara una breve pose de inclinación lateral de cabeza (~0.5s, curva
   * de ida y vuelta) que sugiere curiosidad/atención — sin exagerar
   * (rango angular pequeño, ~0.1 rad ≈ 6°) y sin interferir con la mirada
   * ambiental (se aplica sobre `rotation.z`, mientras que la mirada
   * ambiental usa `rotation.y`).
   *
   * @private
   * @param {Object} partesAnimables
   * @param {Object} estado
   * @param {boolean} quieto
   * @param {number} deltaSegundos
   * @returns {void}
   */
  _actualizarInclinacionAlDetenerse(partesAnimables, estado, quieto, deltaSegundos) {
    const { cabeza } = partesAnimables;
    if (!cabeza) return;

    const DURACION_S = 0.5;

    // Disparo: transición de "en movimiento" -> "quieto" detectada en este
    // frame (estado.caminandoAnterior refleja el estado del frame previo).
    const empiezaAEstarQuieto = quieto && estado.caminandoAnterior;
    if (empiezaAEstarQuieto && estado.faseInclinacionDetencion < 0) {
      estado.faseInclinacionDetencion = 0;
    }
    estado.caminandoAnterior = !quieto;

    if (estado.faseInclinacionDetencion >= 0) {
      estado.faseInclinacionDetencion += deltaSegundos / DURACION_S;
      if (estado.faseInclinacionDetencion >= 1) {
        cabeza.rotation.z = 0;
        estado.faseInclinacionDetencion = -1;
      } else {
        // Curva ida-y-vuelta suave (0 -> pico -> 0) vía seno, con un ligero
        // sesgo hacia un solo lado (siempre el mismo, para consistencia de
        // personaje en vez de alternar aleatoriamente cada vez).
        cabeza.rotation.z = Math.sin(Math.PI * estado.faseInclinacionDetencion) * 0.1;
      }
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
    this._composer?.setSize(ancho, alto);
  }

  /**
   * Libera los recursos del renderer y remueve el listener de `window.resize`,
   * para limpieza en pruebas o al desmontar el juego.
   *
   * @returns {void}
   */
  dispose() {
    window.removeEventListener('resize', this._onWindowResize);
    this._composer?.dispose();
    this._skyGradient?.geometry.dispose();
    this._skyGradient?.material.dispose();
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
