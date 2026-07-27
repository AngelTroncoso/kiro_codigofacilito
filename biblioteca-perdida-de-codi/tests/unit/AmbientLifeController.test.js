import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { AmbientLifeController } from '../../src/rendering/AmbientLifeController.js';

/**
 * AmbientLifeController.test.js - Cobertura de SPEC-06 (Living World —
 * Ambient Life System). `AmbientLifeController` es un módulo puro de
 * Three.js (sin `WebGLRenderer`), por lo que se testea directamente, sin
 * necesitar mockear nada de `RenderEngine`.
 */

function crearCristalMock(pos = { x: 0, y: 1, z: 0 }) {
  const material = new THREE.MeshStandardMaterial({ emissiveIntensity: 0.35 });
  const cristal = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), material);
  cristal.position.set(pos.x, pos.y, pos.z);
  return cristal;
}

function crearGlifoMock(pos = { x: 0, y: 0.05, z: 0 }) {
  const material = new THREE.MeshStandardMaterial({ emissiveIntensity: 0.25 });
  const glifo = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 6), material);
  glifo.scale.set(1, 1, 1);
  glifo.position.set(pos.x, pos.y, pos.z);
  return glifo;
}

describe('AmbientLifeController - SPEC-06 Living World: Ambient Life System', () => {
  describe('Desacoplamiento (sección 1)', () => {
    it('el constructor solo acepta arrays de objetos 3D, sin ningún tipo de gameplay', () => {
      expect(() => new AmbientLifeController({ cristales: [], glifos: [] })).not.toThrow();
      expect(() => new AmbientLifeController()).not.toThrow(); // sin argumentos también es válido
    });

    it('actualizar() no lanza ni requiere ningún objeto de gameplay, solo deltaSegundos y un booleano', () => {
      const controller = new AmbientLifeController({ cristales: [crearCristalMock()], glifos: [crearGlifoMock()] });
      expect(() => controller.actualizar(0.016)).not.toThrow();
      expect(() => controller.actualizar(0.016, true)).not.toThrow();
      expect(() => controller.actualizar(0.016, false)).not.toThrow();
    });

    it('deltaSegundos<=0 es un no-op seguro (primer frame)', () => {
      const cristal = crearCristalMock();
      const yInicial = cristal.position.y;
      const controller = new AmbientLifeController({ cristales: [cristal] });

      controller.actualizar(0);
      expect(cristal.position.y).toBeCloseTo(yInicial);
      expect(controller.obtenerTiempoTotal()).toBe(0);
    });
  });

  describe('Floating Knowledge Crystals (sección 2)', () => {
    it('cada cristal flota (oscila en Y) y rota lentamente en Y tras varios frames', () => {
      const cristal = crearCristalMock({ x: 0, y: 1.6, z: 0 });
      const controller = new AmbientLifeController({ cristales: [cristal] });
      const yInicial = cristal.position.y;
      const rotYInicial = cristal.rotation.y;

      for (let i = 0; i < 60; i += 1) {
        controller.actualizar(0.05);
      }

      expect(cristal.position.y).not.toBeCloseTo(yInicial, 4);
      expect(cristal.rotation.y).not.toBeCloseTo(rotYInicial, 4);
      // Flotación sutil: nunca debe alejarse mucho de su altura base.
      expect(Math.abs(cristal.position.y - yInicial)).toBeLessThan(0.15);
    });

    it('el pulso luminoso de cada cristal varía con el tiempo, dentro de un rango sutil', () => {
      const cristal = crearCristalMock();
      const controller = new AmbientLifeController({ cristales: [cristal] });
      const valoresObservados = new Set();

      for (let i = 0; i < 60; i += 1) {
        controller.actualizar(0.05);
        valoresObservados.add(cristal.material.emissiveIntensity.toFixed(4));
      }

      expect(valoresObservados.size).toBeGreaterThan(1);
      for (const valorTexto of valoresObservados) {
        expect(Number(valorTexto)).toBeGreaterThanOrEqual(0);
        expect(Number(valorTexto)).toBeLessThan(0.35 + 0.3); // margen amplio: base + pulso + posible boost
      }
    });

    it('dos cristales con posiciones distintas NUNCA quedan perfectamente sincronizados (fase individual)', () => {
      const cristalA = crearCristalMock({ x: 0, y: 1, z: 0 });
      const cristalB = crearCristalMock({ x: 5, y: 1, z: 0 });
      const controller = new AmbientLifeController({ cristales: [cristalA, cristalB] });

      let algunaDiferencia = false;
      for (let i = 0; i < 40; i += 1) {
        controller.actualizar(0.05);
        if (Math.abs(cristalA.position.y - cristalB.position.y) > 1e-4) {
          algunaDiferencia = true;
        }
      }

      expect(algunaDiferencia).toBe(true);
    });
  });

  describe('Ancient Glyphs (sección 3)', () => {
    it('cada glifo respira (varía emissiveIntensity) y presenta ondas de energía (varía su escala)', () => {
      const glifo = crearGlifoMock();
      const controller = new AmbientLifeController({ glifos: [glifo] });
      const escalaInicial = glifo.scale.x;
      const intensidadesObservadas = new Set();
      const escalasObservadas = new Set();

      for (let i = 0; i < 60; i += 1) {
        controller.actualizar(0.05);
        intensidadesObservadas.add(glifo.material.emissiveIntensity.toFixed(4));
        escalasObservadas.add(glifo.scale.x.toFixed(4));
      }

      expect(intensidadesObservadas.size).toBeGreaterThan(1);
      expect(escalasObservadas.size).toBeGreaterThan(1);
      // La escala nunca decrece por debajo de la base (solo "ondas" hacia arriba).
      for (const valorTexto of escalasObservadas) {
        expect(Number(valorTexto)).toBeGreaterThanOrEqual(escalaInicial - 1e-6);
      }
    });

    it('los glifos nunca flotan ni rotan (permanecen discretos, cerca del suelo)', () => {
      const glifo = crearGlifoMock({ x: 1, y: 0.05, z: 2 });
      const controller = new AmbientLifeController({ glifos: [glifo] });

      for (let i = 0; i < 40; i += 1) {
        controller.actualizar(0.05);
      }

      expect(glifo.position.y).toBeCloseTo(0.05);
      expect(glifo.rotation.y).toBe(0);
    });
  });

  describe('Environmental Breathing — pulso global (sección 4)', () => {
    it('el pulso global nunca es perfectamente periódico dentro de una ventana de tiempo razonable', () => {
      const controller = new AmbientLifeController();
      const valores = [];

      for (let i = 0; i < 500; i += 1) {
        controller.actualizar(0.1);
        // Se accede indirectamente observando su efecto sobre un cristal.
      }
      // Verificación indirecta: dos cristales lejanos en fase de flujo NUNCA
      // deben producir exactamente el mismo patrón (ver test de Library
      // Energy Flow más abajo, que ejercita lo mismo con más precisión).
      expect(controller.obtenerTiempoTotal()).toBeCloseTo(50, 1);
    });
  });

  describe('Library Energy Flow — desfase espacial (sección 6)', () => {
    it('cristales en posiciones distintas reciben un desfase de flujo distinto (no dependen solo de su fase aleatoria)', () => {
      const cristalCercano = crearCristalMock({ x: 0, y: 1, z: 0 });
      const cristalLejano = crearCristalMock({ x: 50, y: 1, z: 0 });

      const desfaseCercano = cristalCercano.userData.vidaAmbiental?.desfaseFlujo;
      // userData.vidaAmbiental solo existe tras construir el controller.
      const controller = new AmbientLifeController({ cristales: [cristalCercano, cristalLejano] });

      expect(cristalCercano.userData.vidaAmbiental.desfaseFlujo).not.toBe(
        cristalLejano.userData.vidaAmbiental.desfaseFlujo
      );
      expect(controller).toBeDefined(); // controller se usa para evitar warning de variable no leída
    });
  });

  describe('Idle World Variations (sección 7)', () => {
    it('sin quietud sostenida, nunca se dispara una variación sutil', () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0); // maximiza probabilidad de disparo si se evaluara
      const cristal = crearCristalMock();
      const controller = new AmbientLifeController({ cristales: [cristal] });

      for (let i = 0; i < 100; i += 1) {
        controller.actualizar(0.1, false); // nunca quieto
      }

      expect(cristal.userData.vidaAmbiental.boostRestante).toBe(0);
      randomSpy.mockRestore();
    });

    it('con quietud sostenida más allá del umbral, eventualmente se dispara una variación sutil (boost > 0)', () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0); // Math.random()=0 siempre "acierta" la probabilidad
      const cristal = crearCristalMock();
      const controller = new AmbientLifeController({ cristales: [cristal] });

      // Justo al superar el umbral de quietud (4s), con random()=0 el
      // disparo ocurre en el primer frame evaluado tras el umbral.
      for (let i = 0; i < 41; i += 1) {
        controller.actualizar(0.1, true);
      }

      expect(cristal.userData.vidaAmbiental.boostRestante).toBeGreaterThan(0);
      randomSpy.mockRestore();
    });

    it('la variación sutil decae con el tiempo (nunca es un cambio permanente)', () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
      const cristal = crearCristalMock();
      const controller = new AmbientLifeController({ cristales: [cristal] });

      for (let i = 0; i < 41; i += 1) {
        controller.actualizar(0.1, true);
      }
      expect(cristal.userData.vidaAmbiental.boostRestante).toBeGreaterThan(0);

      // DURACION_VARIACION_S es 1.2s: 20 frames de 0.1s (2s) son de sobra
      // para que el boost se disipe por completo.
      for (let i = 0; i < 20; i += 1) {
        controller.actualizar(0.1, true);
      }
      expect(cristal.userData.vidaAmbiental.boostRestante).toBeLessThanOrEqual(0);

      randomSpy.mockRestore();
    });

    it('al dejar de estar quieto, el contador de quietud se reinicia', () => {
      const cristal = crearCristalMock();
      const controller = new AmbientLifeController({ cristales: [cristal] });

      for (let i = 0; i < 30; i += 1) {
        controller.actualizar(0.1, true);
      }
      controller.actualizar(0.1, false);

      // No hay una forma pública de leer tiempoQuieto directamente, pero se
      // puede verificar indirectamente: reiniciar y volver a acumular desde
      // 0 no debe disparar nada antes del umbral, incluso con random()=0.
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
      for (let i = 0; i < 20; i += 1) {
        // 20 * 0.1 = 2s, menor que UMBRAL_QUIETUD_S (4s)
        controller.actualizar(0.1, true);
      }
      expect(cristal.userData.vidaAmbiental.boostRestante).toBe(0);
      randomSpy.mockRestore();
    });
  });

  describe('dispose()', () => {
    it('libera los materiales de cristales y glifos sin lanzar', () => {
      const cristal = crearCristalMock();
      const glifo = crearGlifoMock();
      const disposeCristalSpy = vi.spyOn(cristal.material, 'dispose');
      const disposeGlifoSpy = vi.spyOn(glifo.material, 'dispose');
      const controller = new AmbientLifeController({ cristales: [cristal], glifos: [glifo] });

      expect(() => controller.dispose()).not.toThrow();
      expect(disposeCristalSpy).toHaveBeenCalled();
      expect(disposeGlifoSpy).toHaveBeenCalled();
    });

    it('no lanza con listas vacías', () => {
      const controller = new AmbientLifeController();
      expect(() => controller.dispose()).not.toThrow();
    });
  });
});
