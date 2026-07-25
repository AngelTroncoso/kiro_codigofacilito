import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { iniciarJuego } from '../../src/main.js';
import { MANIFIESTO_ASSETS } from '../../src/world/assetManifest.js';
import { AssetLoader } from '../../src/assets/AssetLoader.js';

/**
 * mainIntegration.test.js - Test de integración de `AssetLoader` a través
 * del flujo real de `main.js` (tarea 16.3).
 *
 * A diferencia de `AssetLoader.test.js` (que testea `AssetLoader` de forma
 * aislada), este test simula específicamente los pasos 3-4 de
 * `iniciarJuego()` (cargar el manifiesto real de `MANIFIESTO_ASSETS`,
 * verificar `fallaCritica`, registrar los modelos exitosos en
 * `RenderEngine`) con un asset del manifiesto forzado a fallar, y confirma
 * que el flujo de `main.js` continúa con normalidad: los demás assets se
 * registran igual, y se muestra el mensaje de error esperado (bloqueante
 * solo si el asset fallido es crítico).
 *
 * Se inyecta un `gltfLoader` mock (vía el constructor de `AssetLoader`) que
 * resuelve todos los assets del manifiesto real excepto uno, forzado a
 * fallar por url alterada, para no depender de red ni de archivos GLB
 * reales.
 */

/**
 * Objeto3D mínimo compatible con `AssetLoader.normalizarEscalaYEjes` y con
 * el uso que hace `main.js` de `position.set(...)`/`clone()` (duck typing
 * simple, igual que `RenderEngine.registrarModelo`/`registrarCodi`).
 */
function createObjeto3DMock() {
  const objeto = {
    scale: { setScalar: vi.fn() },
    rotation: { x: 0, y: 0, z: 0 },
    position: {
      x: 0,
      y: 0,
      z: 0,
      set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
  };
  objeto.clone = () => createObjeto3DMock();
  return objeto;
}

/**
 * Mock de RenderEngine que registra localmente los modelos añadidos, sin
 * requerir WebGL real (jsdom no lo soporta). Cumple el contrato mínimo
 * (`setAnimationLoop`, `registrarModelo`, `registrarCodi`, `render`) que
 * `iniciarJuego()` necesita del `RenderEngineClase` inyectado.
 */
function createRenderEngineMockClase() {
  return class RenderEngineMock {
    constructor() {
      this.modelosRegistrados = new Map();
      this.codiRegistrado = null;
      this.renderLlamado = false;
    }
    setAnimationLoop(cb) {
      this._cb = cb;
    }
    registrarModelo(objeto3D) {
      this.modelosRegistrados.set(objeto3D, true);
    }
    registrarCodi(objeto3D) {
      this.codiRegistrado = objeto3D;
    }
    render() {
      this.renderLlamado = true;
    }
  };
}

describe('main.js - integración de AssetLoader (tarea 16.3)', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // Feature: biblioteca-perdida-de-codi, Requisitos funcionales 2
  it('un asset no crítico inválido en el manifiesto no aborta la carga de los demás, y el flujo de main.js continúa registrando los modelos exitosos', async () => {
    // Se usa una copia del manifiesto real con un id alterado ('mecanismo-puente'
    // pasa a apuntar a una url inválida) para forzar el fallo de un asset NO
    // crítico sin tocar el asset crítico ('codi').
    const manifiestoConFallo = MANIFIESTO_ASSETS.map((entry) =>
      entry.id === 'mecanismo-puente' ? { ...entry, url: '/assets/models/mecanismos/INVALIDO.glb' } : entry
    );
    expect(manifiestoConFallo.some((e) => e.id === 'mecanismo-puente')).toBe(true);

    const resultsByUrl = {};
    for (const entry of manifiestoConFallo) {
      if (entry.id === 'mecanismo-puente') continue; // se deja sin configurar -> loadAsync rechaza
      resultsByUrl[entry.url] = createObjeto3DMock();
    }

    const gltfLoader = {
      loadAsync: vi.fn((url) => {
        if (resultsByUrl[url]) {
          return Promise.resolve({ scene: resultsByUrl[url] });
        }
        return Promise.reject(new Error(`Asset inválido/no encontrado: ${url}`));
      }),
    };

    const RenderEngineMockClase = createRenderEngineMockClase();

    const doc = document.implementation.createHTMLDocument('test');
    const canvas = doc.createElement('canvas');
    canvas.id = 'app-canvas';
    doc.body.appendChild(canvas);

    const resultado = await iniciarJuego({
      document: doc,
      contenedorOverlay: doc.body,
      esWebGLDisponibleFn: () => true,
      RenderEngineClase: RenderEngineMockClase,
      AssetLoaderClase: class extends AssetLoader {
        constructor() {
          super({ gltfLoader });
        }
      },
      manifiestoAssets: manifiestoConFallo,
    });

    // El flujo continuó con normalidad: no hubo falla crítica (el único
    // asset marcado 'critico: true' es 'codi', que sí cargó con éxito).
    expect(resultado.motivo).toBe('iniciado');
    expect(resultado.renderEngine).toBeInstanceOf(RenderEngineMockClase);

    // Codi se registró específicamente vía registrarCodi.
    expect(resultado.renderEngine.codiRegistrado).not.toBeNull();

    // Los demás assets exitosos también se registraron como modelos.
    expect(resultado.renderEngine.modelosRegistrados.size).toBeGreaterThan(0);

    // El error del asset fallido se registró en consola sin abortar la carga
    // de los demás (mismo comportamiento ya cubierto por AssetLoader.test.js,
    // aquí verificado a través del flujo real de main.js).
    expect(consoleErrorSpy).toHaveBeenCalled();
    const seLogueoElAssetFallido = consoleErrorSpy.mock.calls.some((args) =>
      args.some((arg) => typeof arg === 'string' && arg.includes('mecanismo-puente'))
    );
    expect(seLogueoElAssetFallido).toBe(true);
  });

  it('el fallo del asset crítico (codi) produce fallaCritica y main.js muestra un mensaje de error bloqueante sin arrancar el GameLoop', async () => {
    const resultsByUrl = {};
    for (const entry of MANIFIESTO_ASSETS) {
      if (entry.id === 'codi') continue; // se deja sin configurar -> loadAsync rechaza
      resultsByUrl[entry.url] = createObjeto3DMock();
    }

    const gltfLoader = {
      loadAsync: vi.fn((url) => {
        if (resultsByUrl[url]) {
          return Promise.resolve({ scene: resultsByUrl[url] });
        }
        return Promise.reject(new Error(`Falla simulada de asset crítico: ${url}`));
      }),
    };

    const RenderEngineMockClase = createRenderEngineMockClase();

    const doc = document.implementation.createHTMLDocument('test');
    const canvas = doc.createElement('canvas');
    canvas.id = 'app-canvas';
    doc.body.appendChild(canvas);

    const gameLoopStartSpy = vi.fn();
    class GameLoopMock {
      constructor() {}
      start() {
        gameLoopStartSpy();
      }
    }

    const resultado = await iniciarJuego({
      document: doc,
      contenedorOverlay: doc.body,
      esWebGLDisponibleFn: () => true,
      RenderEngineClase: RenderEngineMockClase,
      AssetLoaderClase: class extends AssetLoader {
        constructor() {
          super({ gltfLoader });
        }
      },
      GameLoopClase: GameLoopMock,
    });

    expect(resultado.motivo).toBe('falla-critica-assets');
    expect(gameLoopStartSpy).not.toHaveBeenCalled();

    // Se muestra el mensaje de error esperado, montado en el overlay del DOM.
    const overlay = doc.body.querySelector('#ui-system-overlay');
    expect(overlay).not.toBeNull();
    const mensaje = overlay.querySelector('#ui-system-mensaje');
    expect(mensaje.textContent.length).toBeGreaterThan(0);
    expect(mensaje.style.display).toBe('block');
  });
});
