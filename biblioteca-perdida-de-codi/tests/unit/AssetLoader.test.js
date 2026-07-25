import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AssetLoader } from '../../src/assets/AssetLoader.js';

/**
 * Crea un mock de `gltfLoader` cuyo `loadAsync` resuelve o rechaza de forma
 * determinista según un mapa `url -> resultado`, donde `resultado` puede ser:
 * - `{ scene: <objeto3D-mock> }` para simular éxito, o
 * - `{ error: <Error> }` para simular fallo (rechaza la promesa con ese error).
 *
 * No depende de red ni de assets reales.
 */
function createGltfLoaderMock(resultsByUrl) {
  return {
    loadAsync: vi.fn((url) => {
      const result = resultsByUrl[url];
      if (!result) {
        return Promise.reject(new Error(`URL no configurada en el mock: ${url}`));
      }
      if (result.error) {
        return Promise.reject(result.error);
      }
      return Promise.resolve({ scene: result.scene });
    }),
  };
}

/** Crea un objeto3D mock mínimo compatible con `normalizarEscalaYEjes`. */
function createObjeto3DMock() {
  return {
    scale: { setScalar: vi.fn() },
    rotation: { x: 0, y: 0, z: 0 },
  };
}

describe('AssetLoader - unit tests', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // Feature: biblioteca-perdida-de-codi, Requisitos funcionales 2
  it('cargarTodos: el fallo de un asset no crítico no aborta la carga de los demás', async () => {
    const escenaA = createObjeto3DMock();
    const escenaC = createObjeto3DMock();
    const errorB = new Error('archivo corrupto');

    const gltfLoader = createGltfLoaderMock({
      '/models/a.glb': { scene: escenaA },
      '/models/b.glb': { error: errorB },
      '/models/c.glb': { scene: escenaC },
    });
    const loader = new AssetLoader({ gltfLoader });

    const manifiesto = [
      { id: 'a', url: '/models/a.glb' },
      { id: 'b', url: '/models/b.glb' },
      { id: 'c', url: '/models/c.glb' },
    ];

    const resultado = await loader.cargarTodos(manifiesto);

    expect(resultado.modelos.size).toBe(2);
    expect(resultado.modelos.get('a')).toBe(escenaA);
    expect(resultado.modelos.get('c')).toBe(escenaC);
    expect(resultado.modelos.has('b')).toBe(false);

    expect(resultado.errores).toHaveLength(1);
    expect(resultado.errores[0].id).toBe('b');
    expect(resultado.errores[0].error).toBe(errorB);

    expect(resultado.fallaCritica).toBe(false);
  });

  it('cargarTodos: el fallo del asset crítico (Codi) produce fallaCritica=true sin descartar los éxitos ya obtenidos', async () => {
    const escenaEntorno = createObjeto3DMock();
    const errorCodi = new Error('modelo de Codi no encontrado');

    const gltfLoader = createGltfLoaderMock({
      '/models/codi.glb': { error: errorCodi },
      '/models/entorno.glb': { scene: escenaEntorno },
    });
    const loader = new AssetLoader({ gltfLoader });

    const manifiesto = [
      { id: 'codi', url: '/models/codi.glb', critico: true },
      { id: 'entorno', url: '/models/entorno.glb' },
    ];

    const resultado = await loader.cargarTodos(manifiesto);

    expect(resultado.fallaCritica).toBe(true);

    // El asset no crítico exitoso sigue presente pese al fallo crítico.
    expect(resultado.modelos.size).toBe(1);
    expect(resultado.modelos.get('entorno')).toBe(escenaEntorno);
    expect(resultado.modelos.has('codi')).toBe(false);

    expect(resultado.errores).toHaveLength(1);
    expect(resultado.errores[0].id).toBe('codi');
    expect(resultado.errores[0].error).toBe(errorCodi);
  });

  it('cargarTodos nunca rechaza aunque todos los assets fallen', async () => {
    const error1 = new Error('fallo 1');
    const error2 = new Error('fallo 2');

    const gltfLoader = createGltfLoaderMock({
      '/models/x.glb': { error: error1 },
      '/models/y.glb': { error: error2 },
    });
    const loader = new AssetLoader({ gltfLoader });

    const manifiesto = [
      { id: 'x', url: '/models/x.glb' },
      { id: 'y', url: '/models/y.glb' },
    ];

    await expect(loader.cargarTodos(manifiesto)).resolves.toEqual(
      expect.objectContaining({
        errores: [
          { id: 'x', error: error1 },
          { id: 'y', error: error2 },
        ],
        fallaCritica: false,
      })
    );
  });

  it('cargarUno nunca relanza/rechaza la promesa aunque el loader interno rechace', async () => {
    const error = new Error('fallo simulado en loadAsync');
    const gltfLoader = createGltfLoaderMock({
      '/models/z.glb': { error },
    });
    const loader = new AssetLoader({ gltfLoader });

    const entry = { id: 'z', url: '/models/z.glb' };

    await expect(loader.cargarUno(entry)).resolves.toEqual({
      id: 'z',
      exito: false,
      objeto3D: null,
      error,
    });
  });

  it('onProgreso se invoca una vez por asset resuelto, con cargados/total/ultimoId correctos', async () => {
    const escenaA = createObjeto3DMock();
    const escenaB = createObjeto3DMock();
    const errorC = new Error('fallo c');

    const gltfLoader = createGltfLoaderMock({
      '/models/a.glb': { scene: escenaA },
      '/models/b.glb': { scene: escenaB },
      '/models/c.glb': { error: errorC },
    });
    const loader = new AssetLoader({ gltfLoader });

    const manifiesto = [
      { id: 'a', url: '/models/a.glb' },
      { id: 'b', url: '/models/b.glb' },
      { id: 'c', url: '/models/c.glb' },
    ];

    const onProgreso = vi.fn();
    await loader.cargarTodos(manifiesto, onProgreso);

    expect(onProgreso).toHaveBeenCalledTimes(3);

    // El total es constante y cargados crece de 1 a 3, en el orden del manifiesto.
    const llamadas = onProgreso.mock.calls.map(([progreso]) => progreso);
    expect(llamadas.map((p) => p.total)).toEqual([3, 3, 3]);
    expect(llamadas.map((p) => p.cargados)).toEqual([1, 2, 3]);
    expect(llamadas.map((p) => p.ultimoId)).toEqual(['a', 'b', 'c']);
  });

  it('normalizarEscalaYEjes aplica la escala y la corrección de rotación declaradas en la entrada del manifiesto', () => {
    const gltfLoader = createGltfLoaderMock({});
    const loader = new AssetLoader({ gltfLoader });

    const objeto3D = {
      scale: { setScalar: vi.fn() },
      rotation: { x: 0.1, y: 0.2, z: 0.3 },
    };
    const entry = {
      id: 'entorno',
      url: '/models/entorno.glb',
      escala: 2.5,
      rotacionCorreccion: { x: 1, y: 2, z: 3 },
    };

    const retorno = loader.normalizarEscalaYEjes(objeto3D, entry);

    expect(objeto3D.scale.setScalar).toHaveBeenCalledTimes(1);
    expect(objeto3D.scale.setScalar).toHaveBeenCalledWith(2.5);

    expect(objeto3D.rotation.x).toBeCloseTo(1.1);
    expect(objeto3D.rotation.y).toBeCloseTo(2.2);
    expect(objeto3D.rotation.z).toBeCloseTo(3.3);

    expect(retorno).toBe(objeto3D);
  });

  it('normalizarEscalaYEjes usa escala=1 y no aplica corrección de rotación cuando la entrada no los define', () => {
    const gltfLoader = createGltfLoaderMock({});
    const loader = new AssetLoader({ gltfLoader });

    const objeto3D = {
      scale: { setScalar: vi.fn() },
      rotation: { x: 0.5, y: 0.5, z: 0.5 },
    };
    const entry = { id: 'sin-normalizacion', url: '/models/simple.glb' };

    loader.normalizarEscalaYEjes(objeto3D, entry);

    expect(objeto3D.scale.setScalar).toHaveBeenCalledWith(1);
    expect(objeto3D.rotation).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
  });
});
