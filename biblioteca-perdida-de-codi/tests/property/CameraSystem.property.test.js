import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { CameraSystem, actualizarAspecto } from '../../src/camera/CameraSystem.js';

describe('CameraSystem - property tests', () => {
  // Feature: biblioteca-perdida-de-codi, Property 7: Rotación de cámara y aspect ratio
  it('Property 7: el pitch permanece en [pitchMin, pitchMax], el yaw cambia en la dirección del delta horizontal, y actualizarAspecto fija aspect=ancho/alto sin alterar el fov', () => {
    // --- Configuración explícita y autocontenida (independiente de los defaults) ---
    const config = {
      sensibilidadYaw: 0.01,
      sensibilidadPitch: 0.01,
      pitchMin: -1,
      pitchMax: 1,
      distanciaIdeal: 8,
      distanciaMinima: 1.5,
      margen: 0.3,
    };
    const cameraSystem = new CameraSystem(config);

    // Mundo sin obstáculos: raycastObstaculo siempre "no encontrado".
    const mundoSinObstaculos = {
      raycastObstaculo: () => ({ distancia: null, encontrado: false }),
    };

    const poseCodiArb = fc.record({
      position: fc.constant({ x: 0, y: 1, z: 0 }),
    });

    // deltaCamara.x generado explícitamente en tres bandas: cero, positivo con
    // magnitud mínima segura, y negativo con magnitud mínima segura. Esto evita
    // el caso borde de precisión de punto flotante donde un delta demasiado
    // pequeño, multiplicado por sensibilidadYaw y sumado a un yaw ya grande,
    // no altera el bit pattern del resultado.
    const deltaXArb = fc.oneof(
      fc.constant(0),
      fc.double({ min: 0.01, max: 500, noNaN: true }),
      fc.double({ min: -500, max: -0.01, noNaN: true })
    );

    // --- Parte A: pitch/yaw (Requirements 2.2) ---
    fc.assert(
      fc.property(
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), // yaw inicial
        fc.double({ min: config.pitchMin, max: config.pitchMax, noNaN: true }), // pitch inicial (ya en rango)
        deltaXArb,
        fc.double({ min: -500, max: 500, noNaN: true }), // deltaCamara.y
        poseCodiArb,
        fc.double({ min: 0.001, max: 1, noNaN: true }), // deltaTime
        (yawInicial, pitchInicial, deltaX, deltaY, poseCodi, deltaTime) => {
          const estadoActual = { yaw: yawInicial, pitch: pitchInicial, distanciaActual: config.distanciaIdeal };
          const inputState = { deltaCamara: { x: deltaX, y: deltaY } };

          const nuevoEstado = cameraSystem.actualizar(
            inputState,
            deltaTime,
            poseCodi,
            mundoSinObstaculos,
            estadoActual
          );

          // Invariante de clamping de pitch.
          expect(nuevoEstado.pitch).toBeGreaterThanOrEqual(config.pitchMin);
          expect(nuevoEstado.pitch).toBeLessThanOrEqual(config.pitchMax);

          // El yaw cambia en la dirección del delta horizontal.
          if (deltaX > 0) {
            expect(nuevoEstado.yaw).toBeGreaterThan(estadoActual.yaw);
          } else if (deltaX < 0) {
            expect(nuevoEstado.yaw).toBeLessThan(estadoActual.yaw);
          } else {
            // `deltaX` puede ser `-0` (generado explícitamente por `deltaXArb`
            // vía `fc.constant(0)` combinado con shrinking), que es
            // matemáticamente igual a `0` pero distinto bajo `Object.is`
            // (usado internamente por `toBe`). Se normaliza sumando `0` a
            // ambos lados (`-0 + 0 === 0`) para comparar por igualdad
            // numérica real, no por bit pattern de signo de cero.
            expect(nuevoEstado.yaw + 0).toBe(estadoActual.yaw + 0);
          }
        }
      ),
      { numRuns: 100 }
    );

    // --- Parte B: aspect ratio (Requirements 2.4) ---
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 4000, noNaN: true }), // ancho
        fc.double({ min: 1, max: 4000, noNaN: true }), // alto
        (ancho, alto) => {
          const mockCamara = { aspect: 0, fov: 50, updateProjectionMatrix: () => {} };

          actualizarAspecto(mockCamara, ancho, alto);

          expect(mockCamara.aspect).toBeCloseTo(ancho / alto, 10);
          expect(mockCamara.fov).toBe(50);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: biblioteca-perdida-de-codi, Property 10: Cámara evita obstrucción sin atravesar geometría
  it('Property 10: la distancia resuelta de la cámara respeta el obstáculo detectado (menos margen, con piso distanciaMinima) y nunca supera distanciaIdeal', () => {
    // --- Configuración explícita y autocontenida ---
    const config = {
      sensibilidadYaw: 0.01,
      sensibilidadPitch: 0.01,
      pitchMin: -1,
      pitchMax: 1,
      distanciaIdeal: 10,
      distanciaMinima: 2,
      margen: 0.5,
    };
    const cameraSystem = new CameraSystem(config);
    const epsilon = 1e-9;

    // Genera el caso de obstáculo: cercano (menor que distanciaIdeal), sin
    // obstáculo, o lejano (a distancia >= distanciaIdeal, que debe comportarse
    // igual que "sin obstáculo" según la implementación).
    const casoObstaculoArb = fc.oneof(
      fc.record({
        tipo: fc.constant('cercano'),
        distancia: fc.double({ min: 0.1, max: config.distanciaIdeal - 0.1, noNaN: true }),
      }),
      fc.record({
        tipo: fc.constant('sinObstaculo'),
      }),
      fc.record({
        tipo: fc.constant('lejano'),
        distancia: fc.double({ min: config.distanciaIdeal, max: config.distanciaIdeal + 100, noNaN: true }),
      })
    );

    fc.assert(
      fc.property(
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), // yaw inicial
        fc.double({ min: config.pitchMin, max: config.pitchMax, noNaN: true }), // pitch inicial
        fc.double({ min: -500, max: 500, noNaN: true }), // deltaCamara.x
        fc.double({ min: -500, max: 500, noNaN: true }), // deltaCamara.y
        fc.record({
          position: fc.record({
            x: fc.double({ min: -50, max: 50, noNaN: true }),
            y: fc.double({ min: -50, max: 50, noNaN: true }),
            z: fc.double({ min: -50, max: 50, noNaN: true }),
          }),
        }),
        fc.double({ min: 0.001, max: 1, noNaN: true }), // deltaTime
        casoObstaculoArb,
        (yawInicial, pitchInicial, deltaX, deltaY, poseCodi, deltaTime, casoObstaculo) => {
          const estadoActual = { yaw: yawInicial, pitch: pitchInicial, distanciaActual: config.distanciaIdeal };
          const inputState = { deltaCamara: { x: deltaX, y: deltaY } };

          let resultadoRaycast;
          if (casoObstaculo.tipo === 'sinObstaculo') {
            resultadoRaycast = { distancia: null, encontrado: false };
          } else {
            resultadoRaycast = { distancia: casoObstaculo.distancia, encontrado: true };
          }

          const mundo = {
            raycastObstaculo: () => resultadoRaycast,
          };

          const nuevoEstado = cameraSystem.actualizar(inputState, deltaTime, poseCodi, mundo, estadoActual);

          // Nunca mayor que la distancia ideal configurada, en cualquier caso.
          expect(nuevoEstado.distanciaActual).toBeLessThanOrEqual(config.distanciaIdeal + epsilon);

          if (casoObstaculo.tipo === 'cercano') {
            // distanciaActual == max(distanciaMinima, distanciaObstaculo - margen):
            // respeta el obstáculo (menos margen) salvo que el piso distanciaMinima
            // sea mayor, en cuyo caso ese piso prevalece por diseño.
            const esperado = Math.max(config.distanciaMinima, casoObstaculo.distancia - config.margen);
            expect(nuevoEstado.distanciaActual).toBeCloseTo(esperado, 9);
          } else {
            // Sin obstáculo, o el obstáculo está a distancia >= distanciaIdeal:
            // se comporta igual que "sin obstáculo".
            expect(nuevoEstado.distanciaActual).toBeCloseTo(config.distanciaIdeal, 9);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
