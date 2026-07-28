import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { actualizarAspecto } from '../camera/CameraSystem.js';
import { aplicarShaderCorrupcion } from './corruptionShader.js';
import { AmbientLifeController } from './AmbientLifeController.js';
import { ZONAS } from '../world/zones.data.js';

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
 * Mapa de color por Habilidad — "Knowledge Energy System" (SPEC-05:
 * Interactive Feedback & Game Feel, sección 4). Única fuente de verdad de
 * qué color visual representa cada Habilidad en TODO efecto relacionado
 * con conocimiento (destellos de absorción, partículas de activación,
 * halo de elementos interactivos): así "conocimiento de Python" se ve/
 * siente igual en cualquier lugar donde aparezca, en vez de tener un
 * efecto distinto por concepto equivalente. Coincide con los acentos ya
 * establecidos en docs/art-direction.md sección 5.2/6 y ya usados en otras
 * piezas del proyecto (p.ej. los cristales/glifos de
 * `_crearDetallesAmbientales`).
 */
const HABILIDAD_COLORES = {
  python: 0xfbbf24,
  javascript: 0x38bdf8,
  sql: 0xa855f7,
};

/**
 * Color neutro de "conocimiento" sin Habilidad asociada, reutilizado por
 * elementos interactivos registrados sin `habilidadId` conocido. Mismo
 * tono ya usado por las Partículas Ambientales (SPEC-03).
 */
const COLOR_CONOCIMIENTO_NEUTRO = 0x9fd8e8;

/**
 * Ritmo único (rad/s) de "respiración luminosa" reutilizado por TODOS los
 * elementos interactivos registrados (SPEC-05 secciones 2 y 4: mismo
 * ritmo de animación para conceptos equivalentes, en vez de un valor
 * distinto por instancia).
 */
const RITMO_RESPIRACION_CONOCIMIENTO = 2.4;

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
    // HACKATHON AWS: Intensidades aumentadas para demo ante el jurado
    // (0.6 → 1.4 ambiental, 1.0 → 2.2 direccional) para asegurar que
    // la textura AWS y el escenario sean claramente visibles.
    const intensidadAmbiental = config.intensidadAmbiental ?? 1.4;
    const intensidadHemisferio = config.intensidadHemisferio ?? 0.45;
    const intensidadDireccional = config.intensidadDireccional ?? 2.2;
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
    //
    // HACKATHON AWS: Intensidades aumentadas significativamente para la
    // demo ante el jurado (ambientLight 0.6 → 1.4, directionalLight 1.0 → 2.2)
    // para asegurar que la textura AWS sea 100% visible sobre las plataformas
    // y el escenario sea claramente distinguible.
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
     * @private - lista de "estallidos de energía de conocimiento" activos
     * (SPEC-05 sección 1, "Ability Acquisition Feedback"): cada uno es un
     * pequeño sistema de partículas efímero (`THREE.Points`) que se
     * expande y se desvanece durante `DURACION_ESTALLIDO_S` segundos antes
     * de removerse a sí mismo de la escena. Se disparan al detectar (vía
     * `render(poseCodi, estadoCamara, progreso)`) que `progreso.habilidades()`
     * creció respecto al frame anterior — ver `_detectarNuevasHabilidades`.
     * @type {Array<{ puntos: import('three').Points, edadSegundos: number }>}
     */
    this._estallidosConocimiento = [];

    /**
     * @private - snapshot de los ids de Habilidad ya observados en
     * `progreso.habilidades()` en el frame anterior (SPEC-05 sección 1).
     * `null` hasta el primer frame en el que se recibe un `progreso` válido,
     * para no disparar un "estallido" falso interpretando el estado inicial
     * (que puede llegar con Habilidades ya otorgadas, p.ej. en un test) como
     * "recién obtenidas".
     * @type {Set<string>|null}
     */
    this._habilidadesConocidasAnteriores = null;

    /**
     * @private - lista de elementos interactivos registrados vía
     * `registrarElementoInteractivo` (SPEC-05 secciones 2 y 3): cada
     * entrada guarda solo la información visual mínima necesaria (el
     * objeto 3D, un color de acento, y el último `estado`/'resuelto'
     * observado) para animar el "pulso de brillo"/transición de
     * activación — nunca una referencia al `MecanismoAmbiental` completo
     * ni a `ProgressStore`/`AbilitySystem` (ver JSDoc del método).
     * @type {Array<{ objeto3D: import('three').Object3D, colorHex: number, estadoAnterior: string, faseActivacion: number }>}
     */
    this._elementosInteractivos = [];

    /**
     * @private - estado de "Camera Micro Feedback" (SPEC-05 sección 5):
     * un offset aditivo temporal (unidades del mundo, eje Y) aplicado
     * SOLO a la posición final de la cámara ya calculada por
     * `estadoCamara` — nunca se modifica `CameraSystem` ni su lógica de
     * órbita/colisión, este offset es una capa puramente presentacional
     * superpuesta en `render()`. Se amortigua exponencialmente hacia 0
     * cada frame, igual que `offsetLatigazoCola` de SPEC-04.
     * @type {number}
     */
    this._offsetMicroFeedbackCamara = 0;

    /**
     * @private - `true` si Codi estaba en el aire (`animState === 'jump'`)
     * en el frame anterior, usado para detectar la transición "acaba de
     * aterrizar" que dispara la micro-amortiguación de cámara (sección 5).
     * @type {boolean}
     */
    this._enElAireAnterior = false;

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
     * No interactivos, no registrados en ningún sistema de gameplay/
     * colisión. Desde SPEC-06 ya no son completamente estáticos: sus
     * mallas de cristales/glifos son animadas cada frame por
     * `this._vidaAmbiental` (ver más abajo), pero la responsabilidad de
     * CREARLAS sigue siendo de este método/`RenderEngine`.
     */
    const { grupo: detallesAmbientales, cristales, glifos } = this._crearDetallesAmbientales();
    this._detallesAmbientales = detallesAmbientales;
    this._scene.add(this._detallesAmbientales);

    /**
     * @private - HACKATHON AWS: marcadores de ruta visuales (pathmarkers)
     * ELIMINADOS COMPLETAMENTE para despejar el centro de las plataformas.
     * Los objetos amarillos/dorados que aparecían en el suelo han sido
     * removidos para dejar el camino completamente libre para Codi.
     */
    this._pathmarkers = this._crearPathmarkers(); // Ahora devuelve grupo vacío
    this._scene.add(this._pathmarkers); // Se mantiene para compatibilidad (vacío)

    /**
     * @private - HACKATHON AWS: palmeras procedurales cyberpunk distribuidas
     * en TODAS las zonas/islas del mapa para enriquecer la escenografía
     * completa. Itera sobre ZONAS de zones.data.js y posiciona 2-3 palmeras
     * en bordes/esquinas de cada plataforma. Geometrías básicas de Three.js
     * (CylinderGeometry + ConeGeometry), sin assets externos. Puramente
     * decorativas, no colisionan ni afectan gameplay.
     */
    for (const zona of ZONAS) {
      const { min, max } = zona.limites;
      const centroX = (min.x + max.x) / 2;
      const centroZ = (min.z + max.z) / 2;
      const anchoX = max.x - min.x;
      const anchoZ = max.z - min.z;
      
      // 2-3 palmeras estratégicas por zona en bordes/esquinas
      const posicionesPalmerasZona = [
        // Esquinas
        { x: min.x + 2, z: min.z + 2 },     // Esquina noroeste
        { x: max.x - 2, z: min.z + 2 },     // Esquina noreste
        { x: min.x + 2, z: max.z - 2 },     // Esquina suroeste
        { x: max.x - 2, z: max.z - 2 },     // Esquina sureste
        // Bordes laterales (norte/sur)
        { x: centroX, z: min.z + 1.5 },     // Centro borde norte
        { x: centroX, z: max.z - 1.5 },     // Centro borde sur
      ];
      
      for (const pos of posicionesPalmerasZona) {
        const palmera = this._crearPalmeraProcedural();
        palmera.position.set(pos.x, 0, pos.z);
        this._scene.add(palmera);
      }
    }

    /**
     * @private - HACKATHON AWS: letreros de señalización con neón en
     * esquinas/bordes de cada zona para marcar visualmente puntos de
     * interés y facilitar orientación del jugador. Postes verticales con
     * paneles neón (cian/naranja alternados por zona). Posicionados
     * estratégicamente en bordes traseros/esquinas para no obstruir el
     * camino central de Codi. Puramente decorativos, no colisionan ni
     * afectan gameplay.
     */
    for (let i = 0; i < ZONAS.length; i += 1) {
      const zona = ZONAS[i];
      const { min, max } = zona.limites;
      
      // Alternar color neón por zona (cian/naranja) para variedad visual
      const colorNeon = i % 2 === 0 ? 'cian' : 'naranja';
      
      // Posiciones estratégicas en esquinas traseras (borde norte)
      const posicionesLetreros = [
        { x: min.x + 1.5, z: min.z + 1 },  // Esquina noroeste trasera
        { x: max.x - 1.5, z: min.z + 1 },  // Esquina noreste trasera
      ];
      
      for (const pos of posicionesLetreros) {
        const letrero = this._crearLetreroSenal(colorNeon);
        letrero.position.set(pos.x, 0, pos.z);
        this._scene.add(letrero);
      }
    }

    /**
     * @private - PORTAL DE RESTAURACIÓN: Puerta final al final de la última isla.
     * Se activa visualmente al 100% cuando Codi obtiene las 3 habilidades (Python, JS, SQL).
     * Posicionado en línea recta al final del circuito (X=0, Z=-65).
     */
    const portalRestauracion = this._crearPortalRestauracion();
    
    // Posicionar portal en línea recta al final del circuito
    portalRestauracion.position.set(0, 0, -65);
    
    this._scene.add(portalRestauracion);
    
    // Guardar referencia al portal para controlarlo desde main.js
    this._portalRestauracion = portalRestauracion;

    /**
     * @private - OBSTÁCULOS DE SALTO: Plataformas/escalones procedurales
     * distribuidos en la línea recta del circuito para dar propósito a la
     * mecánica de salto. Cada obstáculo es una pequeña caja elevada que
     * Codi puede superar presionando Espacio mientras avanza con 'W'.
     * Estilo tecnológico/AWS con bordes neón.
     */
    const obstaculos = [
      { x: 0, y: 0, z: -10, altura: 0.6, ancho: 3, profundidad: 1.2, color: 0x38bdf8 },  // Entre spawn y libro Python
      { x: 0, y: 0, z: -28, altura: 0.7, ancho: 3.5, profundidad: 1.5, color: 0xf7df1e }, // Entre zonas 2-3
      { x: 0, y: 0, z: -50, altura: 0.8, ancho: 4, profundidad: 1.8, color: 0xFF9900 },   // Cerca del portal final
    ];

    for (const obs of obstaculos) {
      const geometriaObstaculo = new THREE.BoxGeometry(obs.ancho, obs.altura, obs.profundidad);
      const materialObstaculo = new THREE.MeshStandardMaterial({
        color: obs.color,
        emissive: obs.color,
        emissiveIntensity: 0.3,
        roughness: 0.5,
        metalness: 0.6,
      });
      
      const obstaculo = new THREE.Mesh(geometriaObstaculo, materialObstaculo);
      obstaculo.position.set(obs.x, obs.y + obs.altura / 2, obs.z);
      
      // Bordes neón opcionales (líneas de contorno)
      const geometriaBorde = new THREE.EdgesGeometry(geometriaObstaculo);
      const materialBorde = new THREE.LineBasicMaterial({ 
        color: obs.color, 
        linewidth: 2,
      });
      const borde = new THREE.LineSegments(geometriaBorde, materialBorde);
      obstaculo.add(borde);
      
      this._scene.add(obstaculo);
    }

    /**
     * @private - HACKATHON AWS: flechas direccionales entre zonas/islas
     * ELIMINADAS POR SOLICITUD DEL USUARIO: Las flechas amarillas con forma
     * de megáfono/satélite que flotaban entre islas han sido removidas para
     * despejar visualmente el espacio entre plataformas.
     * 
     * NOTA: Los libros de habilidades (Python, JS, SQL) y mecanismos siguen
     * renderizándose normalmente - solo se eliminaron las flechas guía.
     */
    // CÓDIGO COMENTADO - Flechas direccionales eliminadas:
    /*
    for (let i = 0; i < ZONAS.length - 1; i += 1) {
      const zonaActual = ZONAS[i];
      const zonaSiguiente = ZONAS[i + 1];
      
      // Posicionar flecha en borde este (salida) de zona actual
      const bordeX = zonaActual.limites.max.x - 1;
      const centroZ = (zonaActual.limites.min.z + zonaActual.limites.max.z) / 2;
      
      // Calcular dirección hacia zona siguiente (normalizada en XZ)
      const centroActualX = (zonaActual.limites.min.x + zonaActual.limites.max.x) / 2;
      const centroSiguienteX = (zonaSiguiente.limites.min.x + zonaSiguiente.limites.max.x) / 2;
      const centroSiguienteZ = (zonaSiguiente.limites.min.z + zonaSiguiente.limites.max.z) / 2;
      const dirX = centroSiguienteX - centroActualX;
      const dirZ = centroSiguienteZ - centroZ;
      const anguloY = Math.atan2(dirX, dirZ);
      
      // Crear y posicionar flecha
      const flecha = this._crearFlechaDireccional();
      flecha.position.set(bordeX, 1.5, centroZ);
      flecha.rotation.y = anguloY;
      this._scene.add(flecha);
    }
    */

    /**
     * @private - "Ambient Life Controller" (SPEC-06: Living World —
     * Ambient Life System, sección 1): coordina exclusivamente la
     * animación de los Cristales de Conocimiento y Glifos Antiguos
     * recién creados (flotación, rotación, respiración luminosa, ondas de
     * energía, y las Idle World Variations de la sección 7). Ver
     * `AmbientLifeController.js` para el detalle de desacoplamiento
     * respecto al gameplay.
     * @type {AmbientLifeController}
     */
    this._vidaAmbiental = new AmbientLifeController({ cristales, glifos });

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
   * Desde SPEC-06 (Living World — Ambient Life System), cada cristal/
   * glifo recibe su propio material CLONADO (en vez de compartir un único
   * material por categoría, como en la versión original de SPEC-03), para
   * que `AmbientLifeController` pueda animar el `emissiveIntensity` de
   * cada instancia de forma independiente. La geometría sigue siendo
   * compartida entre instancias de la misma categoría (sin costo de
   * memoria adicional relevante).
   *
   * @private
   * @returns {{ grupo: THREE.Group, cristales: THREE.Mesh[], glifos: THREE.Mesh[] }}
   */
  _crearDetallesAmbientales() {
    const grupo = new THREE.Group();
    const cristales = [];
    const glifos = [];

    // Cristales de conocimiento: prismas pequeños con bioluminiscencia
    // discreta (emissive bajo), flotando a distintas alturas. La
    // geometría se comparte entre instancias (idéntica en las tres), pero
    // el MATERIAL se clona por instancia (SPEC-06: Ambient Life System)
    // para que `AmbientLifeController` pueda variar `emissiveIntensity`
    // de cada cristal de forma independiente sin afectar a los demás.
    const geometriaCristal = new THREE.OctahedronGeometry(0.22, 0);
    const materialCristalBase = new THREE.MeshStandardMaterial({
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
      const cristal = new THREE.Mesh(geometriaCristal, materialCristalBase.clone());
      cristal.position.set(pos.x, pos.y, pos.z);
      cristal.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      grupo.add(cristal);
      cristales.push(cristal);
    }

    // Glifos antiguos: anillos delgados grabados "flotando" cerca del
    // suelo, sugiriendo símbolos de un lenguaje olvidado (sin texto
    // literal ni tipografía, para no competir con el HUD real). Mismo
    // criterio de geometría compartida + material clonado por instancia.
    const geometriaGlifo = new THREE.RingGeometry(0.3, 0.38, 6);
    const materialGlifoBase = new THREE.MeshStandardMaterial({
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
      const glifo = new THREE.Mesh(geometriaGlifo, materialGlifoBase.clone());
      glifo.rotation.x = -Math.PI / 2;
      glifo.position.set(pos.x, pos.y, pos.z);
      grupo.add(glifo);
      glifos.push(glifo);
    }

    return { grupo, cristales, glifos };
  }

  /**
   * HACKATHON AWS: Método ELIMINADO - Los pathmarkers (baldosas amarillas/
   * cian en el suelo) han sido completamente removidos para despejar el
   * centro de las plataformas y dejar el camino libre para Codi.
   * 
   * @private
   * @returns {THREE.Group} - Grupo vacío (no se renderiza nada)
   */
  _crearPathmarkers() {
    // ELIMINADO INTENCIONALMENTE: ya no se crean objetos amarillos/dorados
    // en el centro de las plataformas. El camino queda completamente despejado.
    return new THREE.Group(); // Grupo vacío para mantener compatibilidad
  }

  /**
   * HACKATHON AWS: Crea una palmera procedural cyberpunk usando geometrías
   * básicas de Three.js. Decoración escenográfica para enriquecer la isla
   * sin agregar assets externos (JPG/PNG/GLB).
   * 
   * - Tronco: CylinderGeometry con textura marrón/dorada, ligeramente
   *   inclinado para simular organicidad.
   * - Hojas: 5-6 ConeGeometry verdes cian distribuidas radialmente en la
   *   corona, orientadas hacia afuera/arriba para simular palmera.
   * 
   * Puramente decorativas: no colisionan, no afectan gameplay. Se instancian
   * en bordes/esquinas de plataformas sin obstruir el paso de Codi.
   * 
   * @private
   * @returns {THREE.Group}
   */
  _crearPalmeraProcedural() {
    const grupo = new THREE.Group();

    // TRONCO: CylinderGeometry marrón/dorado con inclinación leve
    const geometriaTronco = new THREE.CylinderGeometry(0.15, 0.18, 2.5, 8);
    const materialTronco = new THREE.MeshStandardMaterial({
      color: 0x8B7355, // Marrón/dorado
      roughness: 0.8,
      metalness: 0.1,
    });
    const tronco = new THREE.Mesh(geometriaTronco, materialTronco);
    tronco.position.y = 1.25; // Centro del cilindro a media altura
    // Inclinación aleatoria leve para variar visualmente
    tronco.rotation.z = (Math.random() - 0.5) * 0.15;
    tronco.rotation.x = (Math.random() - 0.5) * 0.15;
    grupo.add(tronco);

    // HOJAS: 5-6 ConeGeometry verde cian distribuidas radialmente
    const geometriaHoja = new THREE.ConeGeometry(0.6, 1.2, 8);
    const materialHoja = new THREE.MeshStandardMaterial({
      color: 0x1fce6b, // Verde cian cyberpunk (match con cristales de conocimiento)
      emissive: 0x1fce6b,
      emissiveIntensity: 0.2, // Ligero glow para estética cyberpunk
      roughness: 0.4,
      metalness: 0.2,
    });

    const cantidadHojas = 5 + Math.floor(Math.random() * 2); // 5 o 6 hojas
    const alturaCorona = 2.3; // Justo sobre el tronco

    for (let i = 0; i < cantidadHojas; i += 1) {
      const hoja = new THREE.Mesh(geometriaHoja, materialHoja.clone());
      
      // Distribución radial uniforme
      const angulo = (i / cantidadHojas) * Math.PI * 2;
      
      // Posición en corona
      hoja.position.y = alturaCorona;
      hoja.position.x = Math.cos(angulo) * 0.3;
      hoja.position.z = Math.sin(angulo) * 0.3;
      
      // Rotación: inclinar hacia afuera/arriba para simular hojas de palmera
      hoja.rotation.z = Math.cos(angulo) * (Math.PI / 3); // Inclinación hacia afuera
      hoja.rotation.x = Math.sin(angulo) * (Math.PI / 3);
      hoja.rotation.y = angulo; // Orientar hacia afuera radialmente
      
      grupo.add(hoja);
    }

    return grupo;
  }

  /**
   * HACKATHON AWS: Crea una flecha direccional procedural para señalizar
   * el camino entre zonas/islas. Usa geometrías básicas de Three.js
   * (ConeGeometry para punta + BoxGeometry para cuerpo) con material
   * emisivo naranja brillante (color AWS) para máxima visibilidad.
   * 
   * La flecha apunta en dirección +Z local, por lo que se debe rotar con
   * rotation.y según la dirección deseada hacia la siguiente isla.
   * 
   * Puramente decorativa: no colisiona, no afecta gameplay. Se instancia
   * flotando entre islas para guiar al jugador y al jurado.
   * 
   * @private
   * @returns {THREE.Group}
   */
  _crearFlechaDireccional() {
    const grupo = new THREE.Group();

    // Material emisivo naranja AWS para máxima visibilidad
    const materialFlecha = new THREE.MeshStandardMaterial({
      color: 0xFF9900, // Naranja AWS
      emissive: 0xFF9900,
      emissiveIntensity: 0.9, // Brillo fuerte para ser visible desde lejos
      roughness: 0.3,
      metalness: 0.4,
    });

    // PUNTA DE FLECHA: ConeGeometry apuntando en +Z
    const geometriaPunta = new THREE.ConeGeometry(0.5, 1.2, 8);
    const punta = new THREE.Mesh(geometriaPunta, materialFlecha.clone());
    punta.position.z = 0.6; // Desplazar hacia adelante
    punta.rotation.x = -Math.PI / 2; // Rotar para apuntar en +Z
    grupo.add(punta);

    // CUERPO DE FLECHA: BoxGeometry como barra horizontal
    const geometriaCuerpo = new THREE.BoxGeometry(0.3, 0.15, 0.8);
    const cuerpo = new THREE.Mesh(geometriaCuerpo, materialFlecha.clone());
    cuerpo.position.z = -0.2; // Detrás de la punta
    grupo.add(cuerpo);

    // ALETAS LATERALES: dos BoxGeometry pequeñas en forma de V invertida
    const geometriaAleta = new THREE.BoxGeometry(0.6, 0.1, 0.2);
    
    const aletaIzquierda = new THREE.Mesh(geometriaAleta, materialFlecha.clone());
    aletaIzquierda.position.set(-0.3, 0, -0.5);
    aletaIzquierda.rotation.z = Math.PI / 6; // Inclinación diagonal
    grupo.add(aletaIzquierda);
    
    const aletaDerecha = new THREE.Mesh(geometriaAleta, materialFlecha.clone());
    aletaDerecha.position.set(0.3, 0, -0.5);
    aletaDerecha.rotation.z = -Math.PI / 6; // Inclinación diagonal opuesta
    grupo.add(aletaDerecha);

    return grupo;
  }

  /**
   * HACKATHON AWS: Crea un letrero de señalización con poste vertical y
   * panel neón superior para marcar puntos de interés en las esquinas/
   * bordes de las islas. Geometrías básicas de Three.js (CylinderGeometry
   * para poste + BoxGeometry para panel) con material emisivo brillante
   * para simular neón.
   * 
   * Diseñado para estar en bordes/esquinas de las islas dejando el camino
   * central completamente despejado para Codi.
   * 
   * Puramente decorativo: no colisiona, no afecta gameplay. Sustituye el
   * indicador anterior (si existía) por señalética más clara en posición
   * estratégica.
   * 
   * @private
   * @param {'cian'|'naranja'} [colorNeon='cian'] - Color del panel neón
   * @returns {THREE.Group}
   */
  _crearLetreroSenal(colorNeon = 'cian') {
    const grupo = new THREE.Group();

    // POSTE/BASE: CylinderGeometry delgado vertical en gris metalizado oscuro
    const geometriaPoste = new THREE.CylinderGeometry(0.1, 0.1, 2.5, 8);
    const materialPoste = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a, // Gris oscuro metalizado
      roughness: 0.6,
      metalness: 0.7,
    });
    const poste = new THREE.Mesh(geometriaPoste, materialPoste);
    poste.position.y = 1.25; // Centro del cilindro a media altura
    grupo.add(poste);

    // PANEL SUPERIOR: BoxGeometry rectangular plano montado arriba del poste
    const geometriaPanel = new THREE.BoxGeometry(1.2, 0.6, 0.1);
    
    // Material neón según color especificado
    const coloresNeon = {
      cian: 0x00f3ff,
      naranja: 0xFF9900,
    };
    const colorHex = coloresNeon[colorNeon] || coloresNeon.cian;
    
    const materialPanel = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.9, // Brillo fuerte tipo neón
      roughness: 0.2,
      metalness: 0.3,
    });
    
    const panel = new THREE.Mesh(geometriaPanel, materialPanel);
    panel.position.y = 2.8; // Montado arriba del poste
    grupo.add(panel);

    return grupo;
  }

  /**
   * PORTAL DE RESTAURACIÓN: Crea un arco/marco tecnológico con un plano
   * interior emisivo que funciona como puerta final de la Biblioteca.
   * Se activa al 100% cuando Codi obtiene las 3 habilidades (Python, JS, SQL).
   * 
   * Componentes:
   * - MARCO/ARCO: Estructura de BoxGeometry en forma de portal (2 pilares + dintel)
   * - PLANO INTERIOR: BoxGeometry plano y delgado con material emisivo cian/dorado
   * - ESTADO DINÁMICO: La intensidad emisiva se controla externamente desde main.js
   * 
   * @private
   * @returns {THREE.Group} Grupo con el portal completo y userData.portalInterior
   *   para controlar la intensidad emisiva desde el loop del juego
   */
  _crearPortalRestauracion() {
    const grupo = new THREE.Group();

    // Material del marco/estructura (metal oscuro con leve brillo cian)
    const materialMarco = new THREE.MeshStandardMaterial({
      color: 0x1e293b,      // Gris azulado oscuro
      emissive: 0x06b6d4,   // Cian sutil
      emissiveIntensity: 0.2,
      roughness: 0.5,
      metalness: 0.8,
    });

    // PILAR IZQUIERDO del arco
    const geometriaPilar = new THREE.BoxGeometry(0.4, 4, 0.4);
    const pilarIzq = new THREE.Mesh(geometriaPilar, materialMarco);
    pilarIzq.position.set(-2, 2, 0);
    grupo.add(pilarIzq);

    // PILAR DERECHO del arco
    const pilarDer = new THREE.Mesh(geometriaPilar, materialMarco.clone());
    pilarDer.position.set(2, 2, 0);
    grupo.add(pilarDer);

    // DINTEL/TECHO del arco (parte superior horizontal)
    const geometriaDintel = new THREE.BoxGeometry(4.8, 0.4, 0.4);
    const dintel = new THREE.Mesh(geometriaDintel, materialMarco.clone());
    dintel.position.set(0, 4, 0);
    grupo.add(dintel);

    // PLANO INTERIOR EMISIVO (la "puerta" del portal)
    // Este plano es el que brillará con intensidad variable según el progreso
    const geometriaPortal = new THREE.BoxGeometry(3.6, 3.6, 0.1);
    const materialPortal = new THREE.MeshStandardMaterial({
      color: 0x00f3ff,          // Cian brillante
      emissive: 0x00f3ff,        // Mismo color emisivo
      emissiveIntensity: 0.3,    // Intensidad inicial baja (inactivo)
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.7,
    });

    const portalInterior = new THREE.Mesh(geometriaPortal, materialPortal);
    portalInterior.position.set(0, 2, 0);
    grupo.add(portalInterior);

    // Guardar referencia al plano interior para controlar su brillo desde fuera
    grupo.userData.portalInterior = portalInterior;
    grupo.userData.esPortalRestauracion = true;

    // ROTACIÓN: Orientar el portal DE FRENTE al camino (perpendicular al eje Z)
    // para que Codi pueda atravesarlo directamente mirando hacia -Z
    grupo.rotation.y = 0; // Sin rotación: portal mirando hacia +Z (de frente a Codi que viene desde +Z)

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
    const tamanos = new Float32Array(cantidad);
    // Fase/velocidad de ascenso individual por partícula, para que no
    // todas suban en sincronía perfecta (ver `_actualizarParticulasAmbientales`).
    const fases = new Float32Array(cantidad);
    const velocidades = new Float32Array(cantidad);
    // SPEC-06 (Ambient Dust Evolution, sección 5): fase/velocidad/amplitud
    // individuales de turbulencia lateral (drift en X/Z independiente del
    // ascenso en Y), y un factor de "profundidad" por partícula que
    // combina tamaño y opacidad para sugerir que algunas motas están más
    // cerca de la cámara que otras — sin aumentar la cantidad de
    // partículas ni el número de draw calls (sigue siendo un único
    // `THREE.Points`).
    const faseTurbulencia = new Float32Array(cantidad);
    const velocidadTurbulencia = new Float32Array(cantidad);
    const amplitudTurbulencia = new Float32Array(cantidad);
    const profundidad = new Float32Array(cantidad);

    for (let i = 0; i < cantidad; i += 1) {
      posiciones[i * 3] = (Math.random() - 0.5) * ANCHO_VOLUMEN_PARTICULAS;
      posiciones[i * 3 + 1] = Math.random() * ALTO_VOLUMEN_PARTICULAS;
      posiciones[i * 3 + 2] = (Math.random() - 0.5) * ANCHO_VOLUMEN_PARTICULAS;
      fases[i] = Math.random() * Math.PI * 2;
      // Rango de velocidad de ascenso ampliado respecto a la versión
      // original de SPEC-03 (0.15-0.30 -> 0.10-0.35) para una variación de
      // velocidad más perceptible entre partículas individuales.
      velocidades[i] = 0.1 + Math.random() * 0.25;
      faseTurbulencia[i] = Math.random() * Math.PI * 2;
      velocidadTurbulencia[i] = 0.3 + Math.random() * 0.5;
      amplitudTurbulencia[i] = 0.15 + Math.random() * 0.35;
      // 0 = más lejos (más pequeña/tenue), 1 = más cerca (más grande/visible).
      profundidad[i] = Math.random();
      tamanos[i] = 0.04 + profundidad[i] * 0.06;
    }

    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
    // Atributo de tamaño por vértice: requiere un `onBeforeCompile` o un
    // `ShaderMaterial` custom para afectar realmente el tamaño de render
    // en `PointsMaterial` estándar (que solo soporta un `size` uniforme).
    // Para mantener esta mejora simple, ligera y sin nuevas dependencias
    // (Production Readiness: no aumentar deuda técnica con un shader
    // adicional), la variación de tamaño/profundidad se aplica en su
    // lugar variando `material.size` de forma GLOBAL y sutil en cada
    // frame (ver `_actualizarParticulasAmbientales`), mientras que
    // `tamanos`/`profundidad` quedan disponibles en `userData` para una
    // futura Specification que sí justifique el costo de un
    // `ShaderMaterial` por-vértice (ver recomendación en el informe).
    geometria.setAttribute('particleSize', new THREE.BufferAttribute(tamanos, 1));

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
    puntos.userData.faseTurbulencia = faseTurbulencia;
    puntos.userData.velocidadTurbulencia = velocidadTurbulencia;
    puntos.userData.amplitudTurbulencia = amplitudTurbulencia;
    puntos.userData.profundidad = profundidad;
    puntos.userData.tamanoBaseGlobal = 0.06;
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
   * @param {{habilidades: () => Set<string>}} [progreso] - **Parámetro
   *   opcional añadido en SPEC-05 (Interactive Feedback & Game Feel),
   *   retrocompatible: el comportamiento con 2 argumentos es idéntico al
   *   de antes de esta opción.** Se acepta cualquier objeto compatible con
   *   `ProgressStore` que expone `habilidades()` (duck typing, igual que
   *   el resto de esta clase) — `RenderEngine` únicamente LEE el conjunto
   *   de ids de Habilidad ya obtenidas para detectar, comparando frame a
   *   frame, cuándo aparece una nueva y disparar el "Ability Acquisition
   *   Feedback" (destello + partículas sobre Codi, sección 1). No conoce
   *   ninguna otra API de `ProgressStore`, no la muta, y no depende de
   *   `AbilitySystem`/`MovementSystem`/ninguna regla de gameplay: es
   *   exactamente la misma frontera de responsabilidad que ya usa
   *   `poseCodi.velocity`/`animState` para el resto de animaciones
   *   presentacionales de esta clase (SPEC-04). Si se omite, esta mejora
   *   simplemente no se activa (no-op), preservando el comportamiento
   *   previo a SPEC-05.
   * @returns {void}
   */
  render(poseCodi, estadoCamara, progreso) {
    // El reloj interno y el "Camera Micro Feedback" (SPEC-05 sección 5) se
    // actualizan ANTES de posicionar la cámara (en vez de al final del
    // método, como el resto de animaciones) para que un evento detectado
    // en ESTE frame (aterrizaje, nueva Habilidad) se refleje en la
    // posición de cámara de este mismo frame, no con un frame de retraso.
    const deltaSegundos = this._avanzarRelojInterno();
    this._detectarNuevasHabilidades(progreso, poseCodi);
    this._actualizarMicroFeedbackCamara(poseCodi, deltaSegundos);

    if (estadoCamara) {
      const { posicionCamara, target } = estadoCamara;
      this._camera.position.set(
        posicionCamara.x,
        posicionCamara.y + this._offsetMicroFeedbackCamara,
        posicionCamara.z
      );
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

    this._actualizarCorrupcionesActivas(deltaSegundos);
    this._actualizarCicloCaminata(poseCodi, deltaSegundos);
    this._actualizarParticulasAmbientales(deltaSegundos);
    this._actualizarPersonalidadCodi(poseCodi, deltaSegundos);
    this._actualizarFeedbackInteractivo(deltaSegundos);
    this._actualizarEstallidosConocimiento(deltaSegundos);
    this._vidaAmbiental.actualizar(deltaSegundos, this._estaCodiQuieto(poseCodi));

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
    const {
      velocidades,
      faseTurbulencia,
      velocidadTurbulencia,
      amplitudTurbulencia,
      profundidad,
      tamanoBaseGlobal,
    } = this._particulasAmbientales.userData;

    // SPEC-06 (Ambient Dust Evolution, sección 5): reutiliza el mismo
    // reloj del Ambient Life Controller (`obtenerTiempoTotal`) en vez de
    // mantener un segundo acumulador de tiempo redundante (Consistency
    // Pass, evitar duplicación) para calcular la turbulencia lateral.
    const tiempoTotal = this._vidaAmbiental.obtenerTiempoTotal();

    for (let i = 0; i < velocidades.length; i += 1) {
      const indiceX = i * 3;
      const indiceY = i * 3 + 1;
      const indiceZ = i * 3 + 2;

      posiciones[indiceY] += velocidades[i] * deltaSegundos;

      // Turbulencia: pequeño drift lateral oscilante en X/Z, independiente
      // del ascenso vertical, para que el movimiento nunca se lea como
      // "línea recta perfecta hacia arriba" (más orgánico, sin física real).
      const desplazamientoTurbulencia =
        Math.sin(tiempoTotal * velocidadTurbulencia[i] + faseTurbulencia[i]) * amplitudTurbulencia[i] * deltaSegundos;
      posiciones[indiceX] += desplazamientoTurbulencia;
      posiciones[indiceZ] +=
        Math.cos(tiempoTotal * velocidadTurbulencia[i] + faseTurbulencia[i]) * amplitudTurbulencia[i] * deltaSegundos;

      if (posiciones[indiceY] > ALTO_VOLUMEN_PARTICULAS) {
        posiciones[indiceY] = 0;
        posiciones[indiceX] = (Math.random() - 0.5) * ANCHO_VOLUMEN_PARTICULAS;
        posiciones[indiceZ] = (Math.random() - 0.5) * ANCHO_VOLUMEN_PARTICULAS;
      }
    }

    geometria.attributes.position.needsUpdate = true;

    // Variación de "profundidad" (sección 5): el tamaño GLOBAL del
    // material oscila muy sutilmente (no por partícula individual, ver
    // JSDoc de `_crearParticulasAmbientales` sobre la limitación de
    // `PointsMaterial`), promediando el factor de profundidad de todas
    // las partículas para dar una sensación leve de "unas más cerca, otras
    // más lejos" sin requerir un shader custom adicional.
    if (profundidad && profundidad.length > 0) {
      let sumaProfundidad = 0;
      for (let i = 0; i < profundidad.length; i += 1) {
        sumaProfundidad += profundidad[i];
      }
      const profundidadPromedio = sumaProfundidad / profundidad.length;
      const oscilacionTamano = Math.sin(tiempoTotal * 0.15) * 0.01;
      this._particulasAmbientales.material.size = tamanoBaseGlobal + profundidadPromedio * 0.03 + oscilacionTamano;
    }
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
   * Determina si Codi está "quieto" para efectos puramente presentacionales
   * (SPEC-04: parpadeo/mirada ambiental/inclinación de cabeza; SPEC-06:
   * Idle World Variations del entorno): sin desplazamiento horizontal
   * relevante Y sin estar en el aire (`animState === 'jump'`) — un salto
   * no debe disparar ninguna de estas animaciones de quietud (no deben
   * leerse como reacción a saltar). Extraído como método compartido para
   * que SPEC-06 reutilice exactamente el mismo criterio ya usado por
   * SPEC-04 en vez de duplicar la lógica (Consistency Pass / Production
   * Readiness: evitar duplicación de código).
   *
   * @private
   * @param {import('../movement/MovementSystem.js').CodiPose} [poseCodi]
   * @returns {boolean}
   */
  _estaCodiQuieto(poseCodi) {
    const velocidad = poseCodi?.velocity;
    const velocidadHorizontal = velocidad
      ? Math.sqrt(velocidad.x * velocidad.x + velocidad.z * velocidad.z)
      : 0;
    const enElAire = poseCodi?.animState === 'jump';
    return velocidadHorizontal <= 1e-3 && !enElAire;
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

    const quieto = this._estaCodiQuieto(poseCodi);
    const velocidad = poseCodi?.velocity;
    const velocidadHorizontal = velocidad
      ? Math.sqrt(velocidad.x * velocidad.x + velocidad.z * velocidad.z)
      : 0;
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
   * Registra (opt-in, opcional) un objeto 3D del entorno como "elemento
   * interactivo" para que reciba el feedback visual genérico de SPEC-05
   * (secciones 2 y 3: "Interactive Object Feedback" / "Platform Activation
   * Feedback"): un pulso de brillo sutil constante mientras está
   * `'bloqueado'`, y una transición suave (destello + disipación) al pasar
   * a `'resuelto'`.
   *
   * DISEÑO DE DESACOPLAMIENTO (condición explícita del usuario): este
   * método NO recibe ni conoce un `MecanismoAmbiental` completo, un
   * `ProgressStore` ni ninguna regla de `AbilitySystem`. Solo recibe la
   * información visual mínima e inmutable necesaria para animar el
   * feedback — el objeto 3D a animar, un `colorHex` (típicamente derivado
   * de `HABILIDAD_COLORES` por quien registra, ver `main.js`) y una
   * función `leerEstado()` de solo lectura que `RenderEngine` invoca cada
   * frame para saber si debe animar la transición de activación. Esto es
   * intencional: `RenderEngine` sigue sin importar `WorldModel.js` ni
   * ningún tipo de `MecanismoAmbiental`, preservando el mismo
   * desacoplamiento que ya existe entre esta clase y el resto del
   * gameplay (ver `registrarCodi`, que tampoco conoce `CodiPose` como
   * tipo, solo como forma de datos).
   *
   * Idempotente en el sentido de que registrar el mismo `objeto3D` dos
   * veces simplemente añade una segunda entrada (no se deduplica por
   * identidad): quien orquesta (`main.js`) es responsable de registrar
   * cada elemento una sola vez, igual que ya es responsable de no llamar
   * `registrarModelo` dos veces para el mismo objeto.
   *
   * @param {import('three').Object3D} objeto3D - Objeto 3D ya presente en
   *   la escena (típicamente vía `registrarModelo`), sobre el que se
   *   animará el pulso/transición. Debe exponer `material.emissiveIntensity`
   *   (directamente o en cada elemento si `material` es un array) para que
   *   el pulso de brillo tenga efecto visible; si no lo expone, el
   *   registro es válido pero el pulso simplemente no producirá cambio
   *   visible (no lanza).
   * @param {Object} [opciones]
   * @param {number} [opciones.colorHex] - Color de acento para el
   *   destello de activación (sección 3) y el halo del pulso (sección 2).
   *   Por defecto `COLOR_CONOCIMIENTO_NEUTRO` (Knowledge Energy System,
   *   sección 4: mismo lenguaje visual para todo lo relacionado con
   *   conocimiento cuando no se especifica una Habilidad concreta).
   * @param {() => string} [opciones.leerEstado] - Función de solo lectura
   *   invocada cada frame; se espera que devuelva `'bloqueado'` o
   *   `'resuelto'` (o cualquier otro string: solo se compara por
   *   igualdad/desigualdad respecto al valor del frame anterior, sin
   *   validar contra un catálogo — `RenderEngine` no conoce
   *   `ESTADOS_MECANISMO_VALIDOS` de `WorldModel.js`). Si se omite, el
   *   elemento solo recibe el pulso constante de la sección 2, nunca la
   *   transición de activación de la sección 3.
   * @returns {void}
   */
  registrarElementoInteractivo(objeto3D, opciones = {}) {
    if (!objeto3D) return;

    const colorHex = opciones.colorHex ?? COLOR_CONOCIMIENTO_NEUTRO;
    const leerEstado = typeof opciones.leerEstado === 'function' ? opciones.leerEstado : null;

    this._elementosInteractivos.push({
      objeto3D,
      colorHex,
      leerEstado,
      estadoAnterior: leerEstado ? leerEstado() : null,
      faseActivacion: -1,
      faseRespiracion: Math.random() * Math.PI * 2, // desfase individual para que no todos "respiren" en sincronía perfecta
    });
  }

  /**
   * Anima, para cada elemento registrado vía `registrarElementoInteractivo`:
   *   - Un pulso de brillo constante y sutil ("respiración luminosa",
   *     sección 2), superpuesto sobre el `emissiveIntensity` base del
   *     material (no lo reemplaza: se guarda/restaura el valor base en el
   *     primer frame de cada elemento para no perder el valor original si
   *     este método se llama varias veces).
   *   - Si `leerEstado()` reporta un cambio de valor respecto al frame
   *     anterior, dispara una breve transición de "activación" (destello +
   *     decaimiento suave, sección 3) que se superpone al pulso constante
   *     durante ~0.6s.
   *
   * Nunca lanza si un elemento no expone `material.emissiveIntensity`
   * (defensivo: `material` podría ser un array o carecer de esa
   * propiedad en un mock/asset real futuro).
   *
   * @private
   * @param {number} deltaSegundos
   * @returns {void}
   */
  _actualizarFeedbackInteractivo(deltaSegundos) {
    if (this._elementosInteractivos.length === 0 || deltaSegundos <= 0) {
      return;
    }

    const DURACION_ACTIVACION_S = 0.6;

    for (const entrada of this._elementosInteractivos) {
      const materiales = Array.isArray(entrada.objeto3D.material)
        ? entrada.objeto3D.material
        : [entrada.objeto3D.material].filter(Boolean);
      if (materiales.length === 0) continue;

      if (entrada.emissiveIntensityBase === undefined) {
        entrada.emissiveIntensityBase = materiales[0].emissiveIntensity ?? 0.3;
      }

      // Detección de cambio de estado (transición de activación, sección 3).
      if (entrada.leerEstado) {
        const estadoActual = entrada.leerEstado();
        if (estadoActual !== entrada.estadoAnterior) {
          entrada.faseActivacion = 0;
        }
        entrada.estadoAnterior = estadoActual;
      }

      // Pulso constante ("respiración luminosa"): mismo ritmo para todo
      // elemento interactivo (Knowledge Energy System, sección 4).
      entrada.faseRespiracion += deltaSegundos * RITMO_RESPIRACION_CONOCIMIENTO;
      const pulso = (Math.sin(entrada.faseRespiracion) * 0.5 + 0.5) * 0.15; // 0..0.15, siempre sutil

      let bonusActivacion = 0;
      if (entrada.faseActivacion >= 0) {
        entrada.faseActivacion += deltaSegundos / DURACION_ACTIVACION_S;
        if (entrada.faseActivacion >= 1) {
          entrada.faseActivacion = -1;
        } else {
          // Destello que decae exponencialmente (Math.sin(π·x) también
          // funcionaría, pero un decaimiento exponencial se lee más como
          // "disipación de energía" que como un pulso simétrico).
          bonusActivacion = Math.exp(-entrada.faseActivacion * 4) * 0.6;
        }
      }

      for (const material of materiales) {
        if ('emissiveIntensity' in material) {
          material.emissiveIntensity = entrada.emissiveIntensityBase + pulso + bonusActivacion;
        }
      }
    }
  }

  /**
   * Compara `progreso.habilidades()` del frame actual contra el snapshot
   * del frame anterior para detectar Habilidades recién obtenidas y
   * disparar el "Ability Acquisition Feedback" (SPEC-05 sección 1) sobre
   * la posición actual de Codi: un estallido de partículas efímero
   * (`THREE.Points`, ~16 partículas, vida ~0.8s) del color de la Habilidad
   * (`HABILIDAD_COLORES`, Knowledge Energy System) más un pulso breve de
   * la luz de acento que ya sigue a Codi (reutilizada, no se crea una luz
   * nueva — evita duplicar componentes, ver checklist de Consistency
   * Pass).
   *
   * No-op seguro si `progreso` no se proporcionó (parámetro opcional de
   * `render()`) o si no expone `habilidades()` como función.
   *
   * @private
   * @param {{habilidades: () => Set<string>}|undefined} progreso
   * @param {import('../movement/MovementSystem.js').CodiPose} [poseCodi]
   * @returns {void}
   */
  _detectarNuevasHabilidades(progreso, poseCodi) {
    if (!progreso || typeof progreso.habilidades !== 'function') {
      return;
    }

    const habilidadesActuales = progreso.habilidades();

    if (this._habilidadesConocidasAnteriores === null) {
      // Primer frame con `progreso` disponible: establece la base sin
      // disparar estallidos por Habilidades que ya se poseían de antemano.
      this._habilidadesConocidasAnteriores = new Set(habilidadesActuales);
      return;
    }

    for (const habilidadId of habilidadesActuales) {
      if (!this._habilidadesConocidasAnteriores.has(habilidadId)) {
        const posicionOrigen = poseCodi?.position ?? { x: 0, y: 1, z: 0 };
        const colorHex = HABILIDAD_COLORES[habilidadId] ?? COLOR_CONOCIMIENTO_NEUTRO;
        this._dispararEstallidoConocimiento(posicionOrigen, colorHex);
        this._dispararPulsoLuzAcento();
      }
    }

    this._habilidadesConocidasAnteriores = new Set(habilidadesActuales);
  }

  /**
   * Crea y añade a la escena un estallido de partículas efímero centrado
   * en `posicionOrigen` (sobre Codi, elevado ligeramente para leerse como
   * "sobre su cabeza/pecho" en vez de a la altura de los pies). Se
   * registra en `this._estallidosConocimiento` para que
   * `_actualizarEstallidosConocimiento` lo expanda/desvanezca y lo remueva
   * automáticamente al cumplir `DURACION_ESTALLIDO_S`.
   *
   * @private
   * @param {{x:number,y:number,z:number}} posicionOrigen
   * @param {number} colorHex
   * @returns {void}
   */
  _dispararEstallidoConocimiento(posicionOrigen, colorHex) {
    const CANTIDAD = 16;
    const posiciones = new Float32Array(CANTIDAD * 3);
    const direcciones = new Float32Array(CANTIDAD * 3);

    for (let i = 0; i < CANTIDAD; i += 1) {
      // Direcciones radiales distribuidas en una esfera (no solo en un
      // plano), para que el estallido se lea como una "expansión de
      // energía" tridimensional alrededor de Codi.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.sin(phi) * Math.sin(theta);
      const dz = Math.cos(phi);

      posiciones[i * 3] = posicionOrigen.x;
      posiciones[i * 3 + 1] = posicionOrigen.y + 0.9;
      posiciones[i * 3 + 2] = posicionOrigen.z;

      direcciones[i * 3] = dx;
      direcciones[i * 3 + 1] = dy;
      direcciones[i * 3 + 2] = dz;
    }

    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));

    const material = new THREE.PointsMaterial({
      color: colorHex,
      size: 0.08,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const puntos = new THREE.Points(geometria, material);
    puntos.userData.direcciones = direcciones;
    puntos.userData.origen = { ...posicionOrigen };
    this._scene.add(puntos);

    this._estallidosConocimiento.push({ puntos, edadSegundos: 0 });
  }

  /**
   * Expande y desvanece cada estallido de conocimiento activo
   * (`this._estallidosConocimiento`): las partículas se alejan de su
   * `origen` a lo largo de su `direccion` individual y la opacidad decae
   * linealmente hasta 0 a lo largo de `DURACION_ESTALLIDO_S`. Al cumplirse
   * la duración, el estallido se remueve de la escena y se libera su
   * geometría/material (sin dejar recursos huérfanos acumulándose durante
   * una sesión larga).
   *
   * @private
   * @param {number} deltaSegundos
   * @returns {void}
   */
  _actualizarEstallidosConocimiento(deltaSegundos) {
    if (this._estallidosConocimiento.length === 0 || deltaSegundos <= 0) {
      return;
    }

    const DURACION_ESTALLIDO_S = 0.8;
    const VELOCIDAD_EXPANSION = 1.4;

    for (let i = this._estallidosConocimiento.length - 1; i >= 0; i -= 1) {
      const estallido = this._estallidosConocimiento[i];
      estallido.edadSegundos += deltaSegundos;

      if (estallido.edadSegundos >= DURACION_ESTALLIDO_S) {
        this._scene.remove(estallido.puntos);
        estallido.puntos.geometry.dispose();
        estallido.puntos.material.dispose();
        this._estallidosConocimiento.splice(i, 1);
        continue;
      }

      const { puntos } = estallido;
      const { direcciones, origen } = puntos.userData;
      const posiciones = puntos.geometry.attributes.position.array;
      const distanciaRecorrida = estallido.edadSegundos * VELOCIDAD_EXPANSION;

      for (let p = 0; p < direcciones.length / 3; p += 1) {
        posiciones[p * 3] = origen.x + direcciones[p * 3] * distanciaRecorrida;
        posiciones[p * 3 + 1] = origen.y + direcciones[p * 3 + 1] * distanciaRecorrida;
        posiciones[p * 3 + 2] = origen.z + direcciones[p * 3 + 2] * distanciaRecorrida;
      }
      puntos.geometry.attributes.position.needsUpdate = true;

      puntos.material.opacity = 1 - estallido.edadSegundos / DURACION_ESTALLIDO_S;
    }
  }

  /**
   * Dispara un breve pulso de intensidad sobre la luz de acento que ya
   * sigue a Codi (`this._luzAcento`, SPEC-03): reutiliza el mismo
   * componente en vez de crear una luz nueva (Consistency Pass, evitar
   * duplicación). El pulso se guarda como un multiplicador que
   * `_actualizarMicroFeedbackCamara` suma sobre la intensidad BASE de la
   * luz (`this._intensidadBaseLuzAcento`, capturada una sola vez) y decae
   * exponencialmente cada frame, de modo que `_luzAcento.intensity`
   * siempre converge de vuelta a su valor base en vez de derivar hacia
   * arriba indefinidamente.
   *
   * @private
   * @returns {void}
   */
  _dispararPulsoLuzAcento() {
    if (this._intensidadBaseLuzAcento === undefined) {
      this._intensidadBaseLuzAcento = this._luzAcento.intensity;
    }
    this._pulsoLuzAcentoRestante = (this._pulsoLuzAcentoRestante ?? 0) + this._intensidadBaseLuzAcento * 1.5;
  }

  /**
   * "Camera Micro Feedback" (SPEC-05 sección 5): calcula un pequeño offset
   * vertical temporal aplicado a la posición final de la cámara (ver
   * `render()`, donde se suma a `posicionCamara.y` sin tocar
   * `CameraSystem`). Dos disparadores, ambos derivados exclusivamente de
   * `poseCodi` (ya expuesto, sin nueva dependencia):
   *   - **Aterrizaje**: al detectar la transición `animState 'jump' ->
   *     no-'jump'`, un pequeño "hundimiento" de la cámara que se recupera
   *     rápido (simula el peso del aterrizaje sin mover a Codi).
   *   - **Obtención de Habilidad**: reutiliza el mismo offset con un
   *     impulso hacia arriba, más sutil, disparado por
   *     `_detectarNuevasHabilidades` (comparten el mismo amortiguador para
   *     no acumular dos sistemas de resorte independientes — Consistency
   *     Pass).
   *
   * Amplitud deliberadamente pequeña (máximo ~0.12 unidades) y
   * amortiguación rápida (constante de tiempo ~0.15s) para nunca producir
   * la sensación de mareo explícitamente prohibida por la sección 5.
   *
   * @private
   * @param {import('../movement/MovementSystem.js').CodiPose} [poseCodi]
   * @param {number} deltaSegundos
   * @returns {void}
   */
  _actualizarMicroFeedbackCamara(poseCodi, deltaSegundos) {
    // La detección de la transición "estaba en el aire -> ya no" se
    // actualiza SIEMPRE (incluso en el primer frame, donde deltaSegundos
    // es 0 por definición de `_avanzarRelojInterno`), para no perder el
    // estado "en el aire" del primer frame si el salto ya estaba activo
    // desde el inicio. Solo la amortiguación/aplicación de impulsos
    // depende de tener un `deltaSegundos` real.
    const enElAire = poseCodi?.animState === 'jump';
    const aterrizoEsteFrame = this._enElAireAnterior && !enElAire;
    this._enElAireAnterior = enElAire;

    if (deltaSegundos <= 0) {
      return;
    }

    if (aterrizoEsteFrame) {
      // Transición de aterrizaje: pequeño impulso hacia abajo.
      this._offsetMicroFeedbackCamara -= 0.12;
    }

    if (this._pulsoLuzAcentoRestante && this._pulsoLuzAcentoRestante > 0) {
      // Impulso de cámara al obtener una Habilidad, disparado una sola vez
      // en el frame en que aparece el pulso (no se re-dispara mientras
      // decae, para no sumar offset cada frame).
      if (!this._impulsoCamaraHabilidadAplicado) {
        this._offsetMicroFeedbackCamara += 0.05;
        this._impulsoCamaraHabilidadAplicado = true;
      }

      // La intensidad de la luz de acento converge de vuelta a su valor
      // BASE (nunca se deja acumular hacia arriba): se fija explícitamente
      // como base + remanente del pulso, que decae exponencialmente.
      this._pulsoLuzAcentoRestante *= Math.exp(-deltaSegundos * 8);
      if (this._pulsoLuzAcentoRestante < 0.01) {
        this._pulsoLuzAcentoRestante = 0;
        this._impulsoCamaraHabilidadAplicado = false;
      }
      this._luzAcento.intensity = this._intensidadBaseLuzAcento + this._pulsoLuzAcentoRestante;
    }

    // Amortiguación exponencial hacia 0, independiente del framerate
    // (misma técnica que `offsetLatigazoCola` de SPEC-04).
    this._offsetMicroFeedbackCamara *= Math.exp(-deltaSegundos * 10);
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
    this._vidaAmbiental?.dispose();
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
