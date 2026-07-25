import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { AssetLoader } from '../../src/assets/AssetLoader.js';

/**
 * AssetLoader.fallback.test.js - Cobertura del fallback opt-in de
 * geometría primitiva (`usarRespaldoSiFalla`), que evita que el juego
 * aborte cuando un asset GLB real no existe o falla al cargar (ver
 * `AssetLoader.crearGeometriaRespaldo`).
 *
 * DECISIÓN DE DISEÑO verificada aquí: cuando `usarRespaldoSiFalla` es
 * `true`, un asset fallido con respaldo termina en `modelos` (con una
 * malla de respaldo) y en `assetsConRespaldo`, pero NO en `errores`
 * (`errores` queda reservado para fallos sin `objeto3D` resultante).
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

function createObjeto3DMock() {
  return {
    scale: { setScalar: vi.fn() },
    rotation: { x: 0, y: 0, z: 0 },
  };
}

describe('AssetLoader - respaldo de geometría primitiva (usarRespaldoSiFalla)', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('con usarRespaldoSiFalla=false (default), el comportamiento ante fallo es idéntico al previo', async () => {
    const errorB = new Error('archivo corrupto');
    const gltfLoader = createGltfLoaderMock({
      '/models/b.glb': { error: errorB },
    });
    const loader = new AssetLoader({ gltfLoader });

    const entry = { id: 'b', url: '/models/b.glb' };
    const resultado = await loader.cargarUno(entry);

    expect(resultado).toEqual({ id: 'b', exito: false, objeto3D: null, error: errorB });

    const resultadoTodos = await loader.cargarTodos([entry]);
    expect(resultadoTodos.modelos.has('b')).toBe(false);
    expect(resultadoTodos.errores).toEqual([{ id: 'b', error: errorB }]);
    expect(resultadoTodos.assetsConRespaldo).toEqual([]);
    expect(resultadoTodos.fallaCritica).toBe(false);
  });

  it('con usarRespaldoSiFalla=true, un asset fallido termina en modelos (con un THREE.Mesh de respaldo) y en assetsConRespaldo, no en errores', async () => {
    const errorB = new Error('archivo no encontrado');
    const gltfLoader = createGltfLoaderMock({
      '/models/b.glb': { error: errorB },
    });
    const loader = new AssetLoader({ gltfLoader, usarRespaldoSiFalla: true });

    const entry = { id: 'b', url: '/models/b.glb', categoria: 'mecanismo' };
    const resultado = await loader.cargarUno(entry);

    expect(resultado.exito).toBe(true);
    expect(resultado.usoRespaldo).toBe(true);
    expect(resultado.error).toBe(errorB);
    // categoria='mecanismo' -> sigue siendo un THREE.Mesh (solo 'codi' usa un Group compuesto).
    expect(resultado.objeto3D).toBeInstanceOf(THREE.Mesh);
    expect(resultado.objeto3D.userData.esRespaldo).toBe(true);
    expect(resultado.objeto3D.userData.assetId).toBe('b');

    const resultadoTodos = await loader.cargarTodos([entry]);
    expect(resultadoTodos.modelos.has('b')).toBe(true);
    expect(resultadoTodos.modelos.get('b')).toBeInstanceOf(THREE.Mesh);
    expect(resultadoTodos.errores).toEqual([]);
    expect(resultadoTodos.assetsConRespaldo).toEqual([{ id: 'b', error: errorB }]);
    expect(resultadoTodos.fallaCritica).toBe(false);

    // El fallo original queda registrado en consola para diagnóstico.
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('con usarRespaldoSiFalla=true, el fallo del asset crítico (codi) NO produce fallaCritica gracias al respaldo', async () => {
    const errorCodi = new Error('modelo de Codi no encontrado');
    const gltfLoader = createGltfLoaderMock({
      '/models/codi.glb': { error: errorCodi },
    });
    const loader = new AssetLoader({ gltfLoader, usarRespaldoSiFalla: true });

    const manifiesto = [{ id: 'codi', url: '/models/codi.glb', critico: true, categoria: 'codi' }];
    const resultado = await loader.cargarTodos(manifiesto);

    expect(resultado.fallaCritica).toBe(false);
    expect(resultado.modelos.has('codi')).toBe(true);
    // El modelo de respaldo de 'codi' es un THREE.Group compuesto (torso,
    // panza, cabeza, hocico, ojos, cola...), no un único THREE.Mesh.
    expect(resultado.modelos.get('codi')).toBeInstanceOf(THREE.Group);
    expect(resultado.errores).toEqual([]);
    expect(resultado.assetsConRespaldo).toEqual([{ id: 'codi', error: errorCodi }]);
  });

  it('con usarRespaldoSiFalla=true, un asset exitoso no genera entrada en assetsConRespaldo', async () => {
    const escena = createObjeto3DMock();
    const gltfLoader = createGltfLoaderMock({
      '/models/a.glb': { scene: escena },
    });
    const loader = new AssetLoader({ gltfLoader, usarRespaldoSiFalla: true });

    const resultado = await loader.cargarTodos([{ id: 'a', url: '/models/a.glb' }]);

    expect(resultado.modelos.get('a')).toBe(escena);
    expect(resultado.assetsConRespaldo).toEqual([]);
    expect(resultado.errores).toEqual([]);
  });

  describe('crearGeometriaRespaldo', () => {
    it('genera un modelo procedural compuesto (THREE.Group) para categoria="codi"', () => {
      const loader = new AssetLoader({ gltfLoader: createGltfLoaderMock({}) });
      const modelo = loader.crearGeometriaRespaldo({ id: 'codi', categoria: 'codi' });

      expect(modelo).toBeInstanceOf(THREE.Group);
      expect(modelo.userData.esRespaldo).toBe(true);
      expect(modelo.userData.assetId).toBe('codi');
      // Confirma que es un modelo compuesto real (torso, panza, cabeza,
      // hocico, ojos, cola, crestas...) y no un único mesh.
      expect(modelo.children.length).toBeGreaterThanOrEqual(5);
    });

    it('genera una caja grande marrón para categoria="entorno"', () => {
      const loader = new AssetLoader({ gltfLoader: createGltfLoaderMock({}) });
      const mesh = loader.crearGeometriaRespaldo({ id: 'entorno-x', categoria: 'entorno' });

      expect(mesh.geometry.type).toBe('BoxGeometry');
      expect(mesh.material.color.getHex()).toBe(0x8d6e63);
    });

    it('genera una caja mediana azul/gris para categoria="mecanismo"', () => {
      const loader = new AssetLoader({ gltfLoader: createGltfLoaderMock({}) });
      const mesh = loader.crearGeometriaRespaldo({ id: 'mecanismo-x', categoria: 'mecanismo' });

      expect(mesh.geometry.type).toBe('BoxGeometry');
      expect(mesh.material.color.getHex()).toBe(0x5c8aab);
    });

    it('genera una caja pequeña dorada para categoria="libro"', () => {
      const loader = new AssetLoader({ gltfLoader: createGltfLoaderMock({}) });
      const mesh = loader.crearGeometriaRespaldo({ id: 'libro-x', categoria: 'libro' });

      expect(mesh.geometry.type).toBe('BoxGeometry');
      expect(mesh.material.color.getHex()).toBe(0xf4c430);
    });

    it('genera un cubo gris genérico cuando no se define categoria', () => {
      const loader = new AssetLoader({ gltfLoader: createGltfLoaderMock({}) });
      const mesh = loader.crearGeometriaRespaldo({ id: 'sin-categoria' });

      expect(mesh.geometry.type).toBe('BoxGeometry');
      expect(mesh.material.color.getHex()).toBe(0x999999);
    });
  });
});
