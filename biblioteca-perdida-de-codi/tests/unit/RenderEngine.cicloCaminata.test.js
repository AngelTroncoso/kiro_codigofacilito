import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

/**
 * RenderEngine.cicloCaminata.test.js - Cobertura del ciclo de caminata
 * (walk cycle) procedural de Codi (`RenderEngine._actualizarCicloCaminata`,
 * invocado internamente desde `render(poseCodi, estadoCamara)`).
 *
 * `THREE.WebGLRenderer` no puede construirse en jsdom (sin contexto WebGL
 * real), así que se mockea specÍficamente esa clase del módulo `three`
 * manteniendo el resto de la API real (Scene, Group, Mesh, geometrías...),
 * de forma análoga a como `AssetLoader.fallback.test.js` inyecta un
 * `gltfLoader` mock en vez de mockear todo `three`.
 */
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    WebGLRenderer: class WebGLRendererMock {
      constructor() {
        this.domElement = { style: {} };
      }
      setPixelRatio() {}
      setSize() {}
      setAnimationLoop() {}
      render() {}
      dispose() {}
    },
  };
});

// Import dinámico posterior al mock, para que RenderEngine.js reciba el
// WebGLRenderer mockeado al importar 'three' internamente.
const { RenderEngine } = await import('../../src/rendering/RenderEngine.js');
const { AssetLoader } = await import('../../src/assets/AssetLoader.js');

function createCanvasMock() {
  return { clientWidth: 800, clientHeight: 600, width: 800, height: 600 };
}

/**
 * Instancia un `RenderEngine` real (con `WebGLRenderer` mockeado, ver
 * `vi.mock('three', ...)` arriba) con un modelo procedural de Codi ya
 * registrado vía `registrarModelo`/`registrarCodi`. Compartida entre los
 * describe blocks de este archivo (ciclo de caminata y atmósfera).
 */
function crearRenderEngineConCodi() {
  const renderEngine = new RenderEngine(createCanvasMock());
  const assetLoader = new AssetLoader({ gltfLoader: { loadAsync: vi.fn() } });
  const modeloCodi = assetLoader.crearGeometriaRespaldo({ id: 'codi', categoria: 'codi' });
  renderEngine.registrarModelo(modeloCodi);
  renderEngine.registrarCodi(modeloCodi);
  return { renderEngine, modeloCodi };
}

describe('RenderEngine - ciclo de caminata procedural de Codi', () => {
  let performanceNowSpy;
  let tiempoActualMs;

  beforeEach(() => {
    tiempoActualMs = 0;
    performanceNowSpy = vi.spyOn(performance, 'now').mockImplementation(() => tiempoActualMs);
  });

  afterEach(() => {
    performanceNowSpy.mockRestore();
  });

  function avanzarTiempo(ms) {
    tiempoActualMs += ms;
  }

  it('con velocidad > 0, las patas traseras, los brazos y la cola oscilan (rotación distinta de 0) tras varios frames', () => {
    const { renderEngine, modeloCodi } = crearRenderEngineConCodi();
    const { patasTraseras, brazos, cola } = modeloCodi.userData.partesAnimables;

    const poseCaminando = {
      position: { x: 0, y: 1, z: 0 },
      rotationY: 0,
      velocity: { x: 2, y: 0, z: 0 },
      animState: 'walk',
      lastSafePosition: { x: 0, y: 1, z: 0 },
    };

    // Primer frame: inicializa el reloj interno (deltaSegundos=0), sin
    // avanzar aún la fase de la animación.
    renderEngine.render(poseCaminando, undefined);

    // Frames subsecuentes con deltaTime real: la fase debe avanzar y las
    // partes animables deben oscilar.
    for (let i = 0; i < 5; i += 1) {
      avanzarTiempo(50); // 50ms por frame
      renderEngine.render(poseCaminando, undefined);
    }

    const algunaRotacionDistintaDeCero = [
      patasTraseras[0].rotation.x,
      patasTraseras[1].rotation.x,
      brazos[0].rotation.x,
      brazos[1].rotation.x,
      cola.rotation.y,
    ].some((valor) => Math.abs(valor) > 1e-6);

    expect(algunaRotacionDistintaDeCero).toBe(true);

    // Las patas traseras oscilan en contrafase (una hacia adelante mientras
    // la otra va hacia atrás), como en una caminata real.
    expect(Math.sign(patasTraseras[0].rotation.x)).not.toBe(Math.sign(patasTraseras[1].rotation.x));
  });

  it('con velocidad == 0 (idle), las partes animables permanecen en su pose neutra (rotación 0)', () => {
    const { renderEngine, modeloCodi } = crearRenderEngineConCodi();
    const { patasTraseras, brazos, cola } = modeloCodi.userData.partesAnimables;

    const poseQuieta = {
      position: { x: 0, y: 1, z: 0 },
      rotationY: 0,
      velocity: { x: 0, y: 0, z: 0 },
      animState: 'idle',
      lastSafePosition: { x: 0, y: 1, z: 0 },
    };

    renderEngine.render(poseQuieta, undefined);
    for (let i = 0; i < 5; i += 1) {
      avanzarTiempo(50);
      renderEngine.render(poseQuieta, undefined);
    }

    expect(patasTraseras[0].rotation.x).toBe(0);
    expect(patasTraseras[1].rotation.x).toBe(0);
    expect(brazos[0].rotation.x).toBe(0);
    expect(brazos[1].rotation.x).toBe(0);
    expect(cola.rotation.y).toBe(0);
  });

  it('no lanza si no se registró ningún modelo de Codi (userData.partesAnimables ausente)', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    const poseCaminando = {
      position: { x: 0, y: 1, z: 0 },
      rotationY: 0,
      velocity: { x: 2, y: 0, z: 0 },
      animState: 'walk',
      lastSafePosition: { x: 0, y: 1, z: 0 },
    };

    expect(() => renderEngine.render(poseCaminando, undefined)).not.toThrow();
  });

  it('no lanza si se registra un modelo de Codi simple (mock) sin userData.partesAnimables', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    const modeloSimple = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    renderEngine.registrarModelo(modeloSimple);
    renderEngine.registrarCodi(modeloSimple);

    const poseCaminando = {
      position: { x: 0, y: 1, z: 0 },
      rotationY: 0,
      velocity: { x: 2, y: 0, z: 0 },
      animState: 'walk',
      lastSafePosition: { x: 0, y: 1, z: 0 },
    };

    expect(() => renderEngine.render(poseCaminando, undefined)).not.toThrow();
  });
});

describe('RenderEngine - atmósfera cyberpunk/sci-fi (fondo, niebla, iluminación)', () => {
  it('configura scene.background con el tono azul/negro profundo de servidor (0x070b19)', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    expect(renderEngine.scene.background.getHex()).toBe(0x070b19);
  });

  it('configura scene.fog como FogExp2 del mismo tono, con densidad 0.02', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    expect(renderEngine.scene.fog).toBeInstanceOf(THREE.FogExp2);
    expect(renderEngine.scene.fog.color.getHex()).toBe(0x070b19);
    expect(renderEngine.scene.fog.density).toBeCloseTo(0.02);
  });

  it('agrega una AmbientLight cian/azul fría, una DirectionalLight cian/blanca y una PointLight de acento magenta/violeta', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    const luces = renderEngine.scene.children.filter((hijo) => hijo.isLight);

    const ambiental = luces.find((luz) => luz instanceof THREE.AmbientLight);
    expect(ambiental).toBeDefined();
    expect(ambiental.color.getHex()).toBe(0x1a2b4c);

    const direccional = luces.find((luz) => luz instanceof THREE.DirectionalLight);
    expect(direccional).toBeDefined();
    expect(direccional.color.getHex()).toBe(0xe0f2fe);
    expect(direccional.castShadow).toBe(true);

    const acento = luces.find((luz) => luz instanceof THREE.PointLight);
    expect(acento).toBeDefined();
    expect(acento.color.getHex()).toBe(0xa855f7);
  });

  it('la luz de acento (PointLight) sigue la posición de Codi en cada render', () => {
    const { renderEngine, modeloCodi } = crearRenderEngineConCodi();
    const acento = renderEngine.scene.children.find((hijo) => hijo instanceof THREE.PointLight);

    const pose = {
      position: { x: 3, y: 1, z: -2 },
      rotationY: 0,
      velocity: { x: 0, y: 0, z: 0 },
      animState: 'idle',
      lastSafePosition: { x: 3, y: 1, z: -2 },
    };

    renderEngine.render(pose, undefined);

    expect(acento.position.x).toBeCloseTo(3);
    expect(acento.position.y).toBeCloseTo(3); // position.y + 2
    expect(acento.position.z).toBeCloseTo(-2);
    expect(modeloCodi.position.x).toBeCloseTo(3);
  });
});

describe('RenderEngine - SPEC-03 World Atmosphere & Rendering (iluminación, sombras, partículas, postprocesado)', () => {
  it('agrega una HemisphereLight además de AmbientLight/DirectionalLight/PointLight', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    const hemisferio = renderEngine.scene.children.find((hijo) => hijo instanceof THREE.HemisphereLight);
    expect(hemisferio).toBeDefined();
  });

  it('las intensidades de luces están parametrizadas vía config del constructor', () => {
    const renderEngine = new RenderEngine(createCanvasMock(), {
      intensidadAmbiental: 0.9,
      intensidadHemisferio: 0.7,
      intensidadDireccional: 1.5,
      intensidadAcento: 20,
    });
    const luces = renderEngine.scene.children.filter((hijo) => hijo.isLight);

    const ambiental = luces.find((luz) => luz instanceof THREE.AmbientLight);
    const hemisferio = luces.find((luz) => luz instanceof THREE.HemisphereLight);
    const direccional = luces.find((luz) => luz instanceof THREE.DirectionalLight);
    const acento = luces.find((luz) => luz instanceof THREE.PointLight);

    expect(ambiental.intensity).toBeCloseTo(0.9);
    expect(hemisferio.intensity).toBeCloseTo(0.7);
    expect(direccional.intensity).toBeCloseTo(1.5);
    expect(acento.intensity).toBeCloseTo(20);
  });

  it('con config por defecto, las intensidades conservan los valores previos (sin regresión)', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    const luces = renderEngine.scene.children.filter((hijo) => hijo.isLight);

    // HACKATHON AWS: Intensidades aumentadas para demo (0.6→1.4, 1.0→2.2)
    expect(luces.find((l) => l instanceof THREE.AmbientLight).intensity).toBeCloseTo(1.4);
    expect(luces.find((l) => l instanceof THREE.DirectionalLight).intensity).toBeCloseTo(2.2);
    expect(luces.find((l) => l instanceof THREE.PointLight).intensity).toBeCloseTo(8);
  });

  it('crea una sombra de contacto (blob shadow) bajo Codi que sigue su posición en X/Z', () => {
    const { renderEngine, modeloCodi } = crearRenderEngineConCodi();
    const sombra = renderEngine.scene.children.find(
      (hijo) => hijo.isMesh && hijo.geometry?.type === 'CircleGeometry'
    );
    expect(sombra).toBeDefined();
    expect(sombra.material.transparent).toBe(true);

    const pose = {
      position: { x: 5, y: 2, z: -1 },
      rotationY: 0,
      velocity: { x: 0, y: 0, z: 0 },
      animState: 'idle',
      lastSafePosition: { x: 5, y: 2, z: -1 },
    };
    renderEngine.render(pose, undefined);

    expect(sombra.position.x).toBeCloseTo(5);
    expect(sombra.position.z).toBeCloseTo(-1);
    expect(modeloCodi.position.x).toBeCloseTo(5);
  });

  it('crea un único THREE.Points de partículas ambientales, recentrado sobre Codi en cada render', () => {
    const { renderEngine } = crearRenderEngineConCodi();
    const particulas = renderEngine.scene.children.filter((hijo) => hijo instanceof THREE.Points);
    expect(particulas.length).toBe(1);

    const pose = {
      position: { x: -4, y: 1, z: 7 },
      rotationY: 0,
      velocity: { x: 0, y: 0, z: 0 },
      animState: 'idle',
      lastSafePosition: { x: -4, y: 1, z: 7 },
    };
    renderEngine.render(pose, undefined);

    expect(particulas[0].position.x).toBeCloseTo(-4);
    expect(particulas[0].position.z).toBeCloseTo(7);
  });

  it('las partículas ambientales respetan el presupuesto de rendimiento (<= 60 por el rango documentado)', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    const particulas = renderEngine.scene.children.find((hijo) => hijo instanceof THREE.Points);
    const cantidad = particulas.geometry.attributes.position.count;
    expect(cantidad).toBeGreaterThan(0);
    expect(cantidad).toBeLessThanOrEqual(60);
  });

  it('las partículas ambientales ascienden con el tiempo y no lanzan tras muchos frames (reciclado)', () => {
    const performanceNowSpy = vi.spyOn(performance, 'now');
    let tiempoActualMs = 0;
    performanceNowSpy.mockImplementation(() => tiempoActualMs);

    const renderEngine = new RenderEngine(createCanvasMock());
    const particulas = renderEngine.scene.children.find((hijo) => hijo instanceof THREE.Points);
    const posicionesIniciales = Array.from(particulas.geometry.attributes.position.array);

    renderEngine.render(undefined, undefined);
    for (let i = 0; i < 200; i += 1) {
      tiempoActualMs += 100;
      expect(() => renderEngine.render(undefined, undefined)).not.toThrow();
    }

    const posicionesFinales = particulas.geometry.attributes.position.array;
    const algunaCambio = Array.from(posicionesFinales).some((valor, i) => valor !== posicionesIniciales[i]);
    expect(algunaCambio).toBe(true);

    performanceNowSpy.mockRestore();
  });

  it('no lanza si usarPostprocesado=false (camino directo sin EffectComposer)', () => {
    expect(() => new RenderEngine(createCanvasMock(), { usarPostprocesado: false })).not.toThrow();
    const renderEngine = new RenderEngine(createCanvasMock(), { usarPostprocesado: false });
    const poseCaminando = {
      position: { x: 0, y: 1, z: 0 },
      rotationY: 0,
      velocity: { x: 1, y: 0, z: 0 },
      animState: 'walk',
      lastSafePosition: { x: 0, y: 1, z: 0 },
    };
    expect(() => renderEngine.render(poseCaminando, undefined)).not.toThrow();
  });

  it('con el WebGLRenderer mockeado (sin API completa de EffectComposer), la construcción no lanza y el render tampoco', () => {
    // El mock de WebGLRendererMock (ver vi.mock('three', ...) arriba) no
    // implementa getPixelRatio/getSize/getContext, por lo que
    // EffectComposer debe fallar internamente y RenderEngine debe
    // recuperarse sin propagar la excepción (comportamiento por defecto,
    // usarPostprocesado=true).
    expect(() => new RenderEngine(createCanvasMock())).not.toThrow();
    const renderEngine = new RenderEngine(createCanvasMock());
    expect(() => renderEngine.render(undefined, undefined)).not.toThrow();
  });

  it('onResize y dispose no lanzan incluso si el composer de postprocesado no se pudo construir', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    expect(() => renderEngine.onResize(1024, 768)).not.toThrow();
    expect(() => renderEngine.dispose()).not.toThrow();
  });
});

describe('RenderEngine - SPEC-03 World Atmosphere & Environmental Storytelling (sky gradient, tone mapping, detalles)', () => {
  it('agrega una cúpula de Sky Gradient procedural (ShaderMaterial, BackSide) a la escena', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    const skyGradient = renderEngine.scene.children.find(
      (hijo) => hijo.isMesh && hijo.material instanceof THREE.ShaderMaterial
    );

    expect(skyGradient).toBeDefined();
    expect(skyGradient.geometry.type).toBe('SphereGeometry');
    expect(skyGradient.material.side).toBe(THREE.BackSide);
    expect(skyGradient.material.depthWrite).toBe(false);
    expect(skyGradient.material.uniforms.uColorCenit).toBeDefined();
    expect(skyGradient.material.uniforms.uColorHorizonte).toBeDefined();
  });

  it('configura ACESFilmicToneMapping en el renderer (corrección de color/tono)', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    expect(renderEngine.renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderEngine.renderer.toneMappingExposure).toBeCloseTo(1.05);
  });

  it('agrega detalles ambientales estáticos (cristales de conocimiento y glifos) sin registrarlos como modelos de gameplay', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    const grupoDetalles = renderEngine.scene.children.find(
      (hijo) => hijo instanceof THREE.Group && hijo.children.some((c) => c.geometry?.type === 'OctahedronGeometry')
    );

    expect(grupoDetalles).toBeDefined();
    const cristales = grupoDetalles.children.filter((c) => c.geometry.type === 'OctahedronGeometry');
    const glifos = grupoDetalles.children.filter((c) => c.geometry.type === 'RingGeometry');
    expect(cristales.length).toBeGreaterThan(0);
    expect(glifos.length).toBeGreaterThan(0);

    // No deben tener userData de interacción/gameplay (son puramente
    // decorativos, no Mecanismos_Ambientales ni Libros_de_Conocimiento).
    for (const detalle of grupoDetalles.children) {
      expect(detalle.userData.esRespaldo).toBeUndefined();
      expect(detalle.userData.assetId).toBeUndefined();
    }
  });

  it('dispose() libera la geometría/material del Sky Gradient sin lanzar', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    expect(() => renderEngine.dispose()).not.toThrow();
  });
});

describe('RenderEngine - SPEC-04 Character Polish: Codi (idle, blink, eye life, tail dynamics, expressiveness)', () => {
  let performanceNowSpy;
  let tiempoActualMs;
  let randomSpy;

  beforeEach(() => {
    tiempoActualMs = 0;
    performanceNowSpy = vi.spyOn(performance, 'now').mockImplementation(() => tiempoActualMs);
  });

  afterEach(() => {
    performanceNowSpy.mockRestore();
    randomSpy?.mockRestore();
  });

  function avanzarTiempo(ms) {
    tiempoActualMs += ms;
  }

  function poseQuieta(overrides = {}) {
    return {
      position: { x: 0, y: 1, z: 0 },
      rotationY: 0,
      velocity: { x: 0, y: 0, z: 0 },
      animState: 'idle',
      lastSafePosition: { x: 0, y: 1, z: 0 },
      ...overrides,
    };
  }

  function poseCaminando(overrides = {}) {
    return {
      position: { x: 0, y: 1, z: 0 },
      rotationY: 0,
      velocity: { x: 2, y: 0, z: 0 },
      animState: 'walk',
      lastSafePosition: { x: 0, y: 1, z: 0 },
      ...overrides,
    };
  }

  it('Idle Animation: con Codi quieto, la cabeza oscila verticalmente (respiración) tras varios frames', () => {
    const { renderEngine, modeloCodi } = crearRenderEngineConCodi();
    const { cabeza } = modeloCodi.userData.partesAnimables;
    const alturaBase = cabeza.position.y;

    renderEngine.render(poseQuieta(), undefined);
    const alturasObservadas = new Set();
    for (let i = 0; i < 20; i += 1) {
      avanzarTiempo(80);
      renderEngine.render(poseQuieta(), undefined);
      alturasObservadas.add(cabeza.position.y.toFixed(5));
    }

    // La altura debe variar entre frames (no queda congelada), pero dentro
    // de un rango extremadamente sutil (sección 1: "nunca exageradas").
    expect(alturasObservadas.size).toBeGreaterThan(1);
    for (const valorTexto of alturasObservadas) {
      expect(Math.abs(Number(valorTexto) - alturaBase)).toBeLessThan(0.02);
    }
  });

  it('Idle Animation: al reanudar el movimiento, la cabeza vuelve suavemente a su altura base', () => {
    const { renderEngine, modeloCodi } = crearRenderEngineConCodi();
    const { cabeza } = modeloCodi.userData.partesAnimables;
    const alturaBase = cabeza.position.y;

    renderEngine.render(poseQuieta(), undefined);
    for (let i = 0; i < 10; i += 1) {
      avanzarTiempo(80);
      renderEngine.render(poseQuieta(), undefined);
    }

    for (let i = 0; i < 30; i += 1) {
      avanzarTiempo(80);
      renderEngine.render(poseCaminando(), undefined);
    }

    expect(cabeza.position.y).toBeCloseTo(alturaBase, 2);
  });

  it('Blink System: ambos ojos escalan en Y de forma sincronizada durante un parpadeo forzado (probabilidad de parpadeo inmediato)', () => {
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0); // fuerza tiempoHastaProximoParpadeo mínimo y sin doble parpadeo
    const { renderEngine, modeloCodi } = crearRenderEngineConCodi();
    const { ojos } = modeloCodi.userData.partesAnimables;

    renderEngine.render(poseQuieta(), undefined);
    // tiempoHastaProximoParpadeo con random()=0 es 2.5s; avanzamos justo eso.
    avanzarTiempo(2500);
    renderEngine.render(poseQuieta(), undefined);
    // Un frame más adentro del parpadeo (mitad del cierre, ~0.08s).
    avanzarTiempo(80);
    renderEngine.render(poseQuieta(), undefined);

    expect(ojos[0].scale.y).toBeLessThan(1);
    expect(ojos[0].scale.y).toBeCloseTo(ojos[1].scale.y, 5); // sincronizado entre ambos ojos
    expect(ojos[0].scale.y).toBeGreaterThan(0); // nunca colapsa a 0 exacto
  });

  it('Blink System: tras completar el ciclo de parpadeo, los ojos vuelven a escala 1 (abiertos)', () => {
    // random()=0 fuerza el primer parpadeo lo antes posible; valores >=0.25
    // en las siguientes llamadas evitan encadenar un doble parpadeo
    // indefinido (artefacto del mock, no del comportamiento real, donde
    // Math.random() varía naturalmente entre llamadas).
    let primeraLlamada = true;
    randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
      if (primeraLlamada) {
        primeraLlamada = false;
        return 0;
      }
      return 0.9;
    });
    const { renderEngine, modeloCodi } = crearRenderEngineConCodi();
    const { ojos } = modeloCodi.userData.partesAnimables;

    renderEngine.render(poseQuieta(), undefined);
    avanzarTiempo(2500);
    renderEngine.render(poseQuieta(), undefined);
    // Avanza más allá de la duración completa del parpadeo (0.16s) para
    // garantizar que termine en estado "abierto".
    for (let i = 0; i < 10; i += 1) {
      avanzarTiempo(50);
      renderEngine.render(poseQuieta(), undefined);
    }

    expect(ojos[0].scale.y).toBeCloseTo(1, 5);
    expect(ojos[1].scale.y).toBeCloseTo(1, 5);
  });

  it('Eye Life: con Codi quieto por un tiempo prolongado, la cabeza rota levemente en Y dentro de un rango mínimo', () => {
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9); // sesga offsetMiradaObjetivo hacia un extremo determinista
    const { renderEngine, modeloCodi } = crearRenderEngineConCodi();
    const { cabeza } = modeloCodi.userData.partesAnimables;

    renderEngine.render(poseQuieta(), undefined);
    for (let i = 0; i < 40; i += 1) {
      avanzarTiempo(100);
      renderEngine.render(poseQuieta(), undefined);
    }

    // Rango mínimo documentado: ±0.12 rad. No debe superarse.
    expect(Math.abs(cabeza.rotation.y)).toBeGreaterThan(0);
    expect(Math.abs(cabeza.rotation.y)).toBeLessThanOrEqual(0.13);
  });

  it('Eye Life: al reanudar el movimiento, la mirada ambiental vuelve hacia el frente (offset objetivo 0)', () => {
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const { renderEngine, modeloCodi } = crearRenderEngineConCodi();
    const { cabeza } = modeloCodi.userData.partesAnimables;

    renderEngine.render(poseQuieta(), undefined);
    for (let i = 0; i < 40; i += 1) {
      avanzarTiempo(100);
      renderEngine.render(poseQuieta(), undefined);
    }

    for (let i = 0; i < 40; i += 1) {
      avanzarTiempo(100);
      renderEngine.render(poseCaminando(), undefined);
    }

    expect(Math.abs(cabeza.rotation.y)).toBeLessThan(0.02);
  });

  it('Tail Dynamics: al iniciar movimiento desde quietud, la cola recibe un impulso de latigazo que luego se amortigua', () => {
    const { renderEngine, modeloCodi } = crearRenderEngineConCodi();
    const { cola } = modeloCodi.userData.partesAnimables;

    renderEngine.render(poseQuieta(), undefined);
    avanzarTiempo(50);
    renderEngine.render(poseQuieta(), undefined);

    const rotacionAntesDeAcelerar = cola.rotation.x;
    avanzarTiempo(50);
    renderEngine.render(poseCaminando({ velocity: { x: 3, y: 0, z: 0 } }), undefined);
    const rotacionTrasAcelerar = cola.rotation.x;

    expect(rotacionTrasAcelerar).not.toBeCloseTo(rotacionAntesDeAcelerar, 6);

    // Tras muchos frames sin más cambios de velocidad, el latigazo debe
    // amortiguarse (aproximarse a 0), no oscilar indefinidamente.
    for (let i = 0; i < 60; i += 1) {
      avanzarTiempo(50);
      renderEngine.render(poseCaminando({ velocity: { x: 3, y: 0, z: 0 } }), undefined);
    }
    expect(Math.abs(renderEngine._estadoPersonalidadCodi.offsetLatigazoCola)).toBeLessThan(0.001);
  });

  it('Tail Dynamics: no lanza ante deltaSegundos<=0 ni ante velocidades extremas', () => {
    const { renderEngine } = crearRenderEngineConCodi();
    expect(() => renderEngine.render(poseCaminando({ velocity: { x: 1000, y: 0, z: 0 } }), undefined)).not.toThrow();
  });

  it('Expressiveness: al detenerse tras caminar, la cabeza dispara una breve inclinación (rotation.z) que vuelve a 0', () => {
    const { renderEngine, modeloCodi } = crearRenderEngineConCodi();
    const { cabeza } = modeloCodi.userData.partesAnimables;

    renderEngine.render(poseCaminando(), undefined);
    for (let i = 0; i < 5; i += 1) {
      avanzarTiempo(80);
      renderEngine.render(poseCaminando(), undefined);
    }

    // Transición a quieto: debe disparar la pose de inclinación.
    avanzarTiempo(80);
    renderEngine.render(poseQuieta(), undefined);
    avanzarTiempo(150); // dentro de la ventana de 0.5s, cerca del pico
    renderEngine.render(poseQuieta(), undefined);

    expect(Math.abs(cabeza.rotation.z)).toBeGreaterThan(0);
    expect(Math.abs(cabeza.rotation.z)).toBeLessThanOrEqual(0.11);

    // Tras superar la duración completa (0.5s), debe volver a 0.
    for (let i = 0; i < 10; i += 1) {
      avanzarTiempo(80);
      renderEngine.render(poseQuieta(), undefined);
    }
    expect(cabeza.rotation.z).toBeCloseTo(0, 5);
  });

  it('no lanza si no hay modelo de Codi registrado (toda la personalidad es no-op segura)', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    expect(() => renderEngine.render(poseQuieta(), undefined)).not.toThrow();
    expect(() => renderEngine.render(poseCaminando(), undefined)).not.toThrow();
  });

  it('no modifica la geometría/proporciones base de Codi: la cadera de las patas y hombros de los brazos permanecen sin cambios tras muchos frames', () => {
    const { renderEngine, modeloCodi } = crearRenderEngineConCodi();
    const { patasTraseras, brazos } = modeloCodi.userData.partesAnimables;
    const posicionesIniciales = [
      { x: patasTraseras[0].position.x, y: patasTraseras[0].position.y, z: patasTraseras[0].position.z },
      { x: brazos[0].position.x, y: brazos[0].position.y, z: brazos[0].position.z },
    ];

    for (let i = 0; i < 30; i += 1) {
      avanzarTiempo(90);
      renderEngine.render(i % 2 === 0 ? poseCaminando() : poseQuieta(), undefined);
    }

    expect(patasTraseras[0].position.x).toBeCloseTo(posicionesIniciales[0].x);
    expect(patasTraseras[0].position.y).toBeCloseTo(posicionesIniciales[0].y);
    expect(patasTraseras[0].position.z).toBeCloseTo(posicionesIniciales[0].z);
    expect(brazos[0].position.x).toBeCloseTo(posicionesIniciales[1].x);
    expect(brazos[0].position.y).toBeCloseTo(posicionesIniciales[1].y);
    expect(brazos[0].position.z).toBeCloseTo(posicionesIniciales[1].z);
  });
});

describe('RenderEngine - SPEC-05 Interactive Feedback & Game Feel', () => {
  let performanceNowSpy;
  let tiempoActualMs;

  beforeEach(() => {
    tiempoActualMs = 0;
    performanceNowSpy = vi.spyOn(performance, 'now').mockImplementation(() => tiempoActualMs);
  });

  afterEach(() => {
    performanceNowSpy.mockRestore();
  });

  function avanzarTiempo(ms) {
    tiempoActualMs += ms;
  }

  function poseQuieta(overrides = {}) {
    return {
      position: { x: 0, y: 1, z: 0 },
      rotationY: 0,
      velocity: { x: 0, y: 0, z: 0 },
      animState: 'idle',
      lastSafePosition: { x: 0, y: 1, z: 0 },
      ...overrides,
    };
  }

  function crearProgresoMock(idsIniciales = []) {
    let ids = new Set(idsIniciales);
    return {
      habilidades: () => new Set(ids),
      _otorgar(id) {
        ids = new Set([...ids, id]);
      },
    };
  }

  describe('render() con tercer parámetro "progreso" (retrocompatibilidad)', () => {
    it('render(poseCodi, estadoCamara) sin progreso sigue funcionando exactamente igual (2 argumentos)', () => {
      const { renderEngine } = crearRenderEngineConCodi();
      expect(() => renderEngine.render(poseQuieta(), undefined)).not.toThrow();
    });

    it('render(poseCodi, estadoCamara, progreso) no lanza y no dispara nada en el primer frame (establece la base)', () => {
      const { renderEngine } = crearRenderEngineConCodi();
      const progreso = crearProgresoMock(['python']);
      expect(() => renderEngine.render(poseQuieta(), undefined, progreso)).not.toThrow();
      expect(renderEngine.scene.children.filter((h) => h instanceof THREE.Points).length).toBe(1); // solo las partículas ambientales de SPEC-03
    });
  });

  describe('Ability Acquisition Feedback (sección 1)', () => {
    it('al detectar una nueva Habilidad respecto al frame anterior, se dispara un estallido de partículas sobre Codi', () => {
      const { renderEngine } = crearRenderEngineConCodi();
      const progreso = crearProgresoMock(['python']);

      renderEngine.render(poseQuieta(), undefined, progreso); // frame base
      const cantidadPointsAntes = renderEngine.scene.children.filter((h) => h instanceof THREE.Points).length;

      progreso._otorgar('javascript');
      avanzarTiempo(16);
      renderEngine.render(poseQuieta(), undefined, progreso);

      const cantidadPointsDespues = renderEngine.scene.children.filter((h) => h instanceof THREE.Points).length;
      expect(cantidadPointsDespues).toBe(cantidadPointsAntes + 1); // +1 estallido nuevo
    });

    it('el estallido de partículas se expande y se desvanece, removiéndose de la escena tras su duración', () => {
      const { renderEngine } = crearRenderEngineConCodi();
      const progreso = crearProgresoMock([]);

      renderEngine.render(poseQuieta(), undefined, progreso);
      progreso._otorgar('sql');
      avanzarTiempo(16);
      renderEngine.render(poseQuieta(), undefined, progreso);

      const cantidadConEstallido = renderEngine.scene.children.filter((h) => h instanceof THREE.Points).length;
      expect(cantidadConEstallido).toBeGreaterThan(1);

      for (let i = 0; i < 30; i += 1) {
        avanzarTiempo(50); // 30 * 50ms = 1.5s, más que DURACION_ESTALLIDO_S (0.8s)
        renderEngine.render(poseQuieta(), undefined, progreso);
      }

      const cantidadFinal = renderEngine.scene.children.filter((h) => h instanceof THREE.Points).length;
      expect(cantidadFinal).toBe(1); // solo quedan las partículas ambientales
    });

    it('no dispara ningún estallido si el conjunto de habilidades no cambia entre frames', () => {
      const { renderEngine } = crearRenderEngineConCodi();
      const progreso = crearProgresoMock(['python']);

      renderEngine.render(poseQuieta(), undefined, progreso);
      const cantidadInicial = renderEngine.scene.children.filter((h) => h instanceof THREE.Points).length;

      for (let i = 0; i < 5; i += 1) {
        avanzarTiempo(16);
        renderEngine.render(poseQuieta(), undefined, progreso);
      }

      expect(renderEngine.scene.children.filter((h) => h instanceof THREE.Points).length).toBe(cantidadInicial);
    });
  });

  describe('registrarElementoInteractivo (secciones 2 y 3)', () => {
    function crearElementoConMaterial(emissiveIntensityInicial = 0.3) {
      const material = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        emissive: 0x06b6d4,
        emissiveIntensity: emissiveIntensityInicial,
      });
      return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    }

    it('no lanza al registrar sin opciones, y no rompe render() aunque no exponga leerEstado', () => {
      const { renderEngine } = crearRenderEngineConCodi();
      const elemento = crearElementoConMaterial();
      expect(() => renderEngine.registrarElementoInteractivo(elemento)).not.toThrow();
      expect(() => renderEngine.render(poseQuieta(), undefined)).not.toThrow();
    });

    it('aplica un pulso de brillo sutil constante sobre emissiveIntensity (respiración luminosa), sin exceder un rango sutil', () => {
      const { renderEngine } = crearRenderEngineConCodi();
      const elemento = crearElementoConMaterial(0.3);
      renderEngine.registrarElementoInteractivo(elemento, { colorHex: 0x38bdf8 });

      const valoresObservados = new Set();
      renderEngine.render(poseQuieta(), undefined);
      for (let i = 0; i < 30; i += 1) {
        avanzarTiempo(50);
        renderEngine.render(poseQuieta(), undefined);
        valoresObservados.add(elemento.material.emissiveIntensity.toFixed(4));
      }

      expect(valoresObservados.size).toBeGreaterThan(1); // varía (pulsa)
      for (const valorTexto of valoresObservados) {
        // Nunca "exagerado": el pulso base (sin transición de activación)
        // se mantiene dentro de un rango pequeño alrededor del valor base.
        expect(Number(valorTexto)).toBeGreaterThanOrEqual(0.3);
        expect(Number(valorTexto)).toBeLessThan(0.3 + 0.16);
      }
    });

    it('al cambiar leerEstado() de "bloqueado" a "resuelto", dispara un destello de activación por encima del pulso base', () => {
      const { renderEngine } = crearRenderEngineConCodi();
      const elemento = crearElementoConMaterial(0.3);
      let estadoMecanismo = 'bloqueado';
      renderEngine.registrarElementoInteractivo(elemento, {
        colorHex: 0x38bdf8,
        leerEstado: () => estadoMecanismo,
      });

      renderEngine.render(poseQuieta(), undefined);
      avanzarTiempo(50);
      renderEngine.render(poseQuieta(), undefined);
      const intensidadAntesDeResolver = elemento.material.emissiveIntensity;

      estadoMecanismo = 'resuelto';
      avanzarTiempo(50);
      renderEngine.render(poseQuieta(), undefined);
      const intensidadTrasResolver = elemento.material.emissiveIntensity;

      // El destello debe ser claramente mayor que el pulso base normal.
      expect(intensidadTrasResolver).toBeGreaterThan(intensidadAntesDeResolver + 0.1);
    });

    it('el destello de activación decae con el tiempo (transición suave, nunca instantánea) hasta converger de vuelta al rango del pulso base', () => {
      const { renderEngine } = crearRenderEngineConCodi();
      const elemento = crearElementoConMaterial(0.3);
      let estadoMecanismo = 'bloqueado';
      renderEngine.registrarElementoInteractivo(elemento, { leerEstado: () => estadoMecanismo });

      renderEngine.render(poseQuieta(), undefined);
      estadoMecanismo = 'resuelto';
      avanzarTiempo(16);
      renderEngine.render(poseQuieta(), undefined);
      const picoInicial = elemento.material.emissiveIntensity;

      // Mucho más allá de DURACION_ACTIVACION_S (0.6s): el destello ya
      // debe haberse disipado por completo, dejando solo el pulso base
      // (oscilante pero acotado a un rango sutil, sección 2).
      for (let i = 0; i < 40; i += 1) {
        avanzarTiempo(50); // 40 * 50ms = 2s
        renderEngine.render(poseQuieta(), undefined);
      }
      const valorFinal = elemento.material.emissiveIntensity;

      expect(valorFinal).toBeLessThan(picoInicial);
      // Converge de vuelta al rango del pulso base sutil (0.3 a 0.3+0.15).
      expect(valorFinal).toBeLessThanOrEqual(0.3 + 0.16);
    });

    it('no lanza si material es un array de materiales', () => {
      const { renderEngine } = crearRenderEngineConCodi();
      const mat1 = new THREE.MeshStandardMaterial({ emissiveIntensity: 0.2 });
      const mat2 = new THREE.MeshStandardMaterial({ emissiveIntensity: 0.2 });
      const elemento = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [mat1, mat2]);
      renderEngine.registrarElementoInteractivo(elemento);
      expect(() => renderEngine.render(poseQuieta(), undefined)).not.toThrow();
    });
  });

  describe('Camera Micro Feedback (sección 5)', () => {
    function estadoCamaraBase() {
      return {
        posicionCamara: { x: 0, y: 5, z: 7 },
        target: { x: 0, y: 1, z: 0 },
      };
    }

    it('al aterrizar (transición jump -> idle), la cámara recibe un pequeño offset temporal que luego se amortigua a 0', () => {
      const { renderEngine } = crearRenderEngineConCodi();

      renderEngine.render(poseQuieta({ animState: 'jump' }), estadoCamaraBase());
      avanzarTiempo(16);
      renderEngine.render(poseQuieta({ animState: 'idle' }), estadoCamaraBase());

      const yTrasAterrizar = renderEngine.camera.position.y;
      expect(yTrasAterrizar).not.toBeCloseTo(5, 3); // hay un offset aplicado

      for (let i = 0; i < 60; i += 1) {
        avanzarTiempo(50);
        renderEngine.render(poseQuieta({ animState: 'idle' }), estadoCamaraBase());
      }

      expect(renderEngine.camera.position.y).toBeCloseTo(5, 2); // vuelve a la posición base
    });

    it('el offset de micro feedback nunca excede un rango pequeño (nunca debe provocar mareo)', () => {
      const { renderEngine } = crearRenderEngineConCodi();

      renderEngine.render(poseQuieta({ animState: 'jump' }), estadoCamaraBase());
      avanzarTiempo(16);
      renderEngine.render(poseQuieta({ animState: 'idle' }), estadoCamaraBase());

      const desviacion = Math.abs(renderEngine.camera.position.y - 5);
      expect(desviacion).toBeLessThan(0.2);
    });

    it('no lanza sin estadoCamara (offset no se aplica si no hay cámara que mover)', () => {
      const { renderEngine } = crearRenderEngineConCodi();
      renderEngine.render(poseQuieta({ animState: 'jump' }), undefined);
      avanzarTiempo(16);
      expect(() => renderEngine.render(poseQuieta({ animState: 'idle' }), undefined)).not.toThrow();
    });

    it('el Micro Feedback de cámara no invoca ninguna función de CameraSystem (solo suma un offset sobre estadoCamara ya calculado)', () => {
      // Verificación de comportamiento (no de imports): confirma que la
      // posición final de la cámara es exactamente
      // `posicionCamara.y + offset`, es decir, que RenderEngine no
      // recalcula la órbita/colisión de cámara por su cuenta — solo
      // desplaza verticalmente el resultado que `CameraSystem` ya produjo.
      const { renderEngine } = crearRenderEngineConCodi();
      const estadoCamara = { posicionCamara: { x: 2, y: 5, z: 7 }, target: { x: 2, y: 1, z: 0 } };

      renderEngine.render(poseQuieta({ animState: 'jump', position: { x: 2, y: 1, z: 0 } }), estadoCamara);
      avanzarTiempo(16);
      renderEngine.render(poseQuieta({ animState: 'idle', position: { x: 2, y: 1, z: 0 } }), estadoCamara);

      expect(renderEngine.camera.position.x).toBeCloseTo(2); // x/z nunca se alteran, solo y
      expect(renderEngine.camera.position.z).toBeCloseTo(7);
    });
  });

  describe('Knowledge Energy System (sección 4) — consistencia de color por Habilidad', () => {
    it('un estallido de Ability Acquisition Feedback usa el color correspondiente a la Habilidad recién obtenida', () => {
      const { renderEngine } = crearRenderEngineConCodi();
      const progreso = crearProgresoMock([]);

      renderEngine.render(poseQuieta(), undefined, progreso);
      progreso._otorgar('python');
      avanzarTiempo(16);
      renderEngine.render(poseQuieta(), undefined, progreso);

      const estallido = renderEngine.scene.children.find(
        (h) => h instanceof THREE.Points && h.material.color.getHex() !== 0x9fd8e8
      );
      expect(estallido).toBeDefined();
      expect(estallido.material.color.getHex()).toBe(0xfbbf24); // color de Python
    });
  });
});

describe('RenderEngine - SPEC-06 Living World: Ambient Life System (integración)', () => {
  let performanceNowSpy;
  let tiempoActualMs;

  beforeEach(() => {
    tiempoActualMs = 0;
    performanceNowSpy = vi.spyOn(performance, 'now').mockImplementation(() => tiempoActualMs);
  });

  afterEach(() => {
    performanceNowSpy.mockRestore();
  });

  function avanzarTiempo(ms) {
    tiempoActualMs += ms;
  }

  it('los cristales/glifos de _crearDetallesAmbientales tienen materiales individuales (no compartidos)', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    const grupoDetalles = renderEngine.scene.children.find(
      (hijo) => hijo instanceof THREE.Group && hijo.children.some((c) => c.geometry?.type === 'OctahedronGeometry')
    );
    const cristales = grupoDetalles.children.filter((c) => c.geometry.type === 'OctahedronGeometry');

    expect(cristales[0].material).not.toBe(cristales[1].material);
    expect(cristales[0].material).not.toBe(cristales[2].material);
  });

  it('tras varios frames, la emissiveIntensity de los cristales varía (Ambient Life Controller activo)', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    const grupoDetalles = renderEngine.scene.children.find(
      (hijo) => hijo instanceof THREE.Group && hijo.children.some((c) => c.geometry?.type === 'OctahedronGeometry')
    );
    const [cristal] = grupoDetalles.children.filter((c) => c.geometry.type === 'OctahedronGeometry');
    const intensidadInicial = cristal.material.emissiveIntensity;

    renderEngine.render(undefined, undefined);
    for (let i = 0; i < 40; i += 1) {
      avanzarTiempo(50);
      renderEngine.render(undefined, undefined);
    }

    expect(cristal.material.emissiveIntensity).not.toBeCloseTo(intensidadInicial, 4);
  });

  it('Ambient Dust Evolution: las partículas ambientales presentan drift lateral (turbulencia) además del ascenso vertical', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    const particulas = renderEngine.scene.children.find((hijo) => hijo instanceof THREE.Points);
    const posicionesIniciales = Array.from(particulas.geometry.attributes.position.array);

    renderEngine.render(undefined, undefined);
    for (let i = 0; i < 30; i += 1) {
      avanzarTiempo(50);
      renderEngine.render(undefined, undefined);
    }

    const posicionesFinales = particulas.geometry.attributes.position.array;
    // Verifica cambio en X (índice 0, 3, 6...) — el drift lateral, no solo
    // el ascenso en Y ya cubierto por un test previo de SPEC-03.
    let algunCambioEnX = false;
    for (let i = 0; i < posicionesFinales.length; i += 3) {
      if (Math.abs(posicionesFinales[i] - posicionesIniciales[i]) > 1e-5) {
        algunCambioEnX = true;
        break;
      }
    }
    expect(algunCambioEnX).toBe(true);
  });

  it('el tamaño del material de partículas ambientales varía sutilmente con el tiempo (profundidad)', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    const particulas = renderEngine.scene.children.find((hijo) => hijo instanceof THREE.Points);
    const tamanoInicial = particulas.material.size;

    renderEngine.render(undefined, undefined);
    for (let i = 0; i < 100; i += 1) {
      avanzarTiempo(50);
      renderEngine.render(undefined, undefined);
    }

    // Sutil: nunca debe alejarse mucho del tamaño base original.
    expect(Math.abs(particulas.material.size - tamanoInicial)).toBeLessThan(0.06);
  });

  it('render() sigue funcionando sin lanzar cuando Codi permanece quieto por mucho tiempo (Idle World Variations no rompe nada)', () => {
    const { renderEngine } = crearRenderEngineConCodi();
    const poseQuietaLarga = {
      position: { x: 0, y: 1, z: 0 },
      rotationY: 0,
      velocity: { x: 0, y: 0, z: 0 },
      animState: 'idle',
      lastSafePosition: { x: 0, y: 1, z: 0 },
    };

    renderEngine.render(poseQuietaLarga, undefined);
    for (let i = 0; i < 200; i += 1) {
      avanzarTiempo(100); // 200 * 100ms = 20s de quietud continua
      expect(() => renderEngine.render(poseQuietaLarga, undefined)).not.toThrow();
    }
  });

  it('dispose() no lanza tras haber creado el AmbientLifeController', () => {
    const renderEngine = new RenderEngine(createCanvasMock());
    expect(() => renderEngine.dispose()).not.toThrow();
  });
});
