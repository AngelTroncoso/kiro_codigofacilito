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
      // Confirma que es un modelo compuesto real (torso, vientre, cabeza,
      // hocico, ojos, patas, brazos, cola, crestas...) y no un único mesh.
      expect(modelo.children.length).toBeGreaterThanOrEqual(5);
    });

    it('expone userData.partesAnimables con patasTraseras, brazos y cola para el ciclo de caminata', () => {
      const loader = new AssetLoader({ gltfLoader: createGltfLoaderMock({}) });
      const modelo = loader.crearGeometriaRespaldo({ id: 'codi', categoria: 'codi' });

      const { partesAnimables } = modelo.userData;
      expect(partesAnimables).toBeDefined();
      expect(partesAnimables.patasTraseras).toHaveLength(2);
      expect(partesAnimables.brazos).toHaveLength(2);
      expect(partesAnimables.cola).toBeInstanceOf(THREE.Group);

      for (const pivotPata of partesAnimables.patasTraseras) {
        expect(pivotPata).toBeInstanceOf(THREE.Group);
        expect(modelo.children).toContain(pivotPata);
      }
      for (const pivotBrazo of partesAnimables.brazos) {
        expect(pivotBrazo).toBeInstanceOf(THREE.Group);
        expect(modelo.children).toContain(pivotBrazo);
      }
      expect(modelo.children).toContain(partesAnimables.cola);
    });

    it('el vientre amarillo (0xfbcd16) y los dientes blancos triangulares están presentes entre los hijos', () => {
      const loader = new AssetLoader({ gltfLoader: createGltfLoaderMock({}) });
      const modelo = loader.crearGeometriaRespaldo({ id: 'codi', categoria: 'codi' });

      const tieneMallaConColor = (hexColor) =>
        modelo.children.some(
          (hijo) => hijo.isMesh && hijo.material && hijo.material.color.getHex() === hexColor
        );

      expect(tieneMallaConColor(0xfbcd16)).toBe(true);

      const dientes = modelo.children.filter(
        (hijo) => hijo.isMesh && hijo.geometry.type === 'ConeGeometry' && hijo.material.color.getHex() === 0xffffff
      );
      expect(dientes.length).toBeGreaterThanOrEqual(4);
    });

    it('genera una plataforma metalizada oscura (estética cyberpunk) para categoria="entorno"', () => {
      const loader = new AssetLoader({ gltfLoader: createGltfLoaderMock({}) });
      const mesh = loader.crearGeometriaRespaldo({ id: 'entorno-x', categoria: 'entorno' });

      expect(mesh.geometry.type).toBe('BoxGeometry');
      expect(mesh.material.color.getHex()).toBe(0x1e293b);
      expect(mesh.material.roughness).toBeCloseTo(0.85);
      expect(mesh.material.metalness).toBeCloseTo(0.6);
    });

    it('genera un módulo metalizado con acento emissive cian para categoria="mecanismo"', () => {
      const loader = new AssetLoader({ gltfLoader: createGltfLoaderMock({}) });
      const mesh = loader.crearGeometriaRespaldo({ id: 'mecanismo-x', categoria: 'mecanismo' });

      expect(mesh.geometry.type).toBe('BoxGeometry');
      expect(mesh.material.color.getHex()).toBe(0x0f172a);
      expect(mesh.material.emissive.getHex()).toBe(0x06b6d4);
      expect(mesh.material.emissiveIntensity).toBeCloseTo(0.3);
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
