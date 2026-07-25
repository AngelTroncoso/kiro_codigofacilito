import { describe, it, expect, vi } from 'vitest';
import { iniciarJuego } from '../../src/main.js';
import { MANIFIESTO_ASSETS } from '../../src/world/assetManifest.js';
import { MECANISMOS, LIBROS } from '../../src/world/zones.data.js';

/**
 * mainSmoke.test.js - Test de integración "smoke" de arranque de la
 * aplicación (tarea 16.4).
 *
 * Verifica que, en un entorno donde WebGL está disponible (simulado) y
 * todos los assets del manifiesto cargan con éxito (simulado), la
 * inicialización completa de `iniciarJuego()` -incluyendo el primer
 * `render()` del `GameLoop`- no lanza ninguna excepción.
 *
 * NOTA IMPORTANTE sobre los mocks usados en este test: el entorno de test
 * usa jsdom, que NO implementa WebGL real. Por lo tanto, es válido y
 * esperado en este test en particular:
 *   - inyectar `esWebGLDisponibleFn: () => true` para simular que el
 *     navegador SÍ soporta WebGL (sin depender de que jsdom lo soporte
 *     realmente), y
 *   - inyectar una clase `RenderEngineClase` mock (que no construye un
 *     `THREE.WebGLRenderer` real) en vez de la `RenderEngine` real, ya que
 *     esta última fallaría al construirse sobre un canvas de jsdom sin
 *     contexto WebGL.
 * Esto es una excepción deliberada a la práctica general de no mockear en
 * pruebas de integración: aquí el objetivo es verificar el CABLEADO de
 * `iniciarJuego()` (que todos los sistemas se instancian, conectan y
 * ejecutan un frame sin excepciones), no verificar el comportamiento real
 * de WebGL, que ya se cubre en otras pruebas (p. ej.
 * `RenderEngine.smoke.test.js`) y requeriría un navegador real o una
 * librería de WebGL headless fuera del alcance de este MVP.
 */

/**
 * Objeto3D mínimo compatible con `AssetLoader.normalizarEscalaYEjes` y con
 * el uso que hace `main.js` de `position.set(...)`/`clone()` (posicionamiento
 * de mallas de entorno/mecanismos/libros, ver tarea de corrección de fondo
 * negro/cámara inicial).
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
 * Mock de `RenderEngine` que implementa el contrato mínimo que
 * `iniciarJuego()`/`GameLoop` necesitan (`setAnimationLoop`,
 * `registrarModelo`, `registrarCodi`, `render`), sin requerir WebGL real.
 */
function createRenderEngineMockClase() {
  return class RenderEngineMock {
    constructor(canvas) {
      this.canvas = canvas;
      this.modelosRegistrados = [];
      this.codiRegistrado = null;
      this.renderLlamadas = 0;
      this._cb = null;
    }
    setAnimationLoop(cb) {
      this._cb = cb;
    }
    registrarModelo(objeto3D) {
      this.modelosRegistrados.push(objeto3D);
    }
    registrarCodi(objeto3D) {
      this.codiRegistrado = objeto3D;
    }
    render(poseCodi, estadoCamara) {
      this.renderLlamadas += 1;
      // Verificación mínima de que se le pasan datos con la forma esperada,
      // igual que haría el RenderEngine real al desestructurar sus args.
      if (poseCodi) {
        const { x, y, z } = poseCodi.position;
        if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
          throw new Error('poseCodi.position inválida');
        }
      }
      if (estadoCamara) {
        const { posicionCamara, target } = estadoCamara;
        if (!posicionCamara || !target) {
          throw new Error('estadoCamara inválido');
        }
      }
    }
  };
}

/** Mock de `AssetLoader` cuyo `cargarTodos` resuelve con éxito TODOS los assets del manifiesto, sin red ni archivos reales. */
function createAssetLoaderMockClase() {
  return class AssetLoaderMock {
    async cargarTodos(manifiesto, onProgreso) {
      const modelos = new Map();
      let cargados = 0;
      for (const entry of manifiesto) {
        modelos.set(entry.id, createObjeto3DMock());
        cargados += 1;
        onProgreso?.({ cargados, total: manifiesto.length, ultimoId: entry.id });
      }
      return { modelos, errores: [], fallaCritica: false };
    }
  };
}

describe('main.js - smoke test de arranque (tarea 16.4)', () => {
  // Feature: biblioteca-perdida-de-codi, Requisitos funcionales 3, Compatibilidad de navegador y WebGL 1
  it('arranca sin excepciones: detecta WebGL disponible, carga todos los assets, conecta todos los sistemas y renderiza el primer frame', async () => {
    const doc = document.implementation.createHTMLDocument('smoke-test');
    const canvas = doc.createElement('canvas');
    canvas.id = 'app-canvas';
    doc.body.appendChild(canvas);

    const RenderEngineMockClase = createRenderEngineMockClase();
    const AssetLoaderMockClase = createAssetLoaderMockClase();

    let resultado;
    await expect(
      (async () => {
        resultado = await iniciarJuego({
          document: doc,
          contenedorOverlay: doc.body,
          esWebGLDisponibleFn: () => true, // WebGL "disponible" simulado (ver nota de mocks arriba)
          RenderEngineClase: RenderEngineMockClase,
          AssetLoaderClase: AssetLoaderMockClase,
          manifiestoAssets: MANIFIESTO_ASSETS,
        });
      })()
    ).resolves.not.toThrow();

    expect(resultado.motivo).toBe('iniciado');
    expect(resultado.renderEngine).toBeInstanceOf(RenderEngineMockClase);
    expect(resultado.gameLoop).toBeDefined();

    // El modelo de Codi se registró específicamente vía registrarCodi.
    expect(resultado.renderEngine.codiRegistrado).not.toBeNull();

    // Todos los assets del manifiesto (incluyendo Codi) se registraron como
    // modelos, más un clon adicional por cada Mecanismo/Libro real
    // posicionado individualmente (ver main.js, posicionamiento de
    // instancias reales a partir del asset reutilizable por tipo/genérico).
    expect(resultado.renderEngine.modelosRegistrados.length).toBe(
      MANIFIESTO_ASSETS.length + MECANISMOS.length + LIBROS.length
    );

    // Simula el primer frame del GameLoop real (invocando el callback que
    // RenderEngine.setAnimationLoop habría recibido), verificando que
    // updateFn -> render() se ejecuta sin lanzar.
    expect(() => resultado.renderEngine._cb(1000)).not.toThrow();
    expect(resultado.renderEngine.renderLlamadas).toBe(1);

    // El overlay de UISystem se montó y actualizó en el DOM sin excepciones.
    const overlay = doc.body.querySelector('#ui-system-overlay');
    expect(overlay).not.toBeNull();
  });
});
