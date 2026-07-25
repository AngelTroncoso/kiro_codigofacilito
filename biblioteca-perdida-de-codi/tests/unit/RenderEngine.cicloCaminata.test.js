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
