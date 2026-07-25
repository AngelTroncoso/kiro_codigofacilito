import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MovementSystem } from '../../src/movement/MovementSystem.js';

describe('MovementSystem - property tests', () => {
  // Feature: biblioteca-perdida-de-codi, Property 11: Adherencia a plataformas móviles
  // Validates: Requirements 5.4
  //
  // Para cualquier desplazamiento de una plataforma-movil activa, si Codi está
  // posicionado sobre su superficie al inicio del frame y no ejecuta una acción
  // de salto/salida, su posición relativa (offset) respecto a la plataforma debe
  // mantenerse constante entre frames. Es decir, la nueva posición de Codi debe
  // ser exactamente su posición anterior desplazada por el `deltaMovimientoFrame`
  // de la plataforma, para los tres ejes.
  it('Property 11: Codi se desplaza exactamente con la plataforma cuando está sobre ella y no salta ni se mueve por sí mismo', () => {
    const escenarioArb = fc.record({
      centerX: fc.double({ min: -50, max: 50, noNaN: true }),
      centerZ: fc.double({ min: -50, max: 50, noNaN: true }),
      halfWidthX: fc.double({ min: 0.5, max: 10, noNaN: true }),
      halfWidthZ: fc.double({ min: 0.5, max: 10, noNaN: true }),
      minY: fc.double({ min: -20, max: 20, noNaN: true }),
      height: fc.double({ min: 0.1, max: 5, noNaN: true }),
      offsetX: fc.double({ min: 0, max: 1, noNaN: true }),
      offsetZ: fc.double({ min: 0, max: 1, noNaN: true }),
      deltaX: fc.double({ min: -3, max: 3, noNaN: true }),
      deltaY: fc.double({ min: -3, max: 3, noNaN: true }),
      deltaZ: fc.double({ min: -3, max: 3, noNaN: true }),
      deltaTime: fc.double({ min: 0.001, max: 0.1, noNaN: true }),
      rotationY: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
    });

    fc.assert(
      fc.property(escenarioArb, (escenario) => {
        const {
          centerX,
          centerZ,
          halfWidthX,
          halfWidthZ,
          minY,
          height,
          offsetX,
          offsetZ,
          deltaX,
          deltaY,
          deltaZ,
          deltaTime,
          rotationY,
        } = escenario;

        // AABB de la plataforma móvil en este frame.
        const aabbActual = {
          min: { x: centerX - halfWidthX, y: minY, z: centerZ - halfWidthZ },
          max: { x: centerX + halfWidthX, y: minY + height, z: centerZ + halfWidthZ },
        };

        // Posición inicial de Codi: garantizada dentro del rango XZ de la
        // plataforma y exactamente sobre su superficie superior (Y = max.y),
        // de modo que `estaSobrePlataforma` sea verdadero al inicio del frame.
        const posX = aabbActual.min.x + offsetX * (aabbActual.max.x - aabbActual.min.x);
        const posZ = aabbActual.min.z + offsetZ * (aabbActual.max.z - aabbActual.min.z);
        const posY = aabbActual.max.y;

        const poseActual = {
          position: { x: posX, y: posY, z: posZ },
          rotationY,
          velocity: { x: 0, y: 0, z: 0 }, // grounded al inicio del frame (no en el aire)
          animState: 'idle',
          lastSafePosition: { x: posX, y: posY, z: posZ },
        };

        // Sin salto y sin movimiento propio del jugador: aísla el efecto de la
        // plataforma del propio desplazamiento de Codi.
        const inputState = {
          vectorMovimiento: { x: 0, z: 0 },
          saltar: false,
          interactuar: false,
        };

        const deltaMovimientoFrame = { x: deltaX, y: deltaY, z: deltaZ };

        // `muestreaAltura` devuelve consistentemente la altura de la superficie
        // de la plataforma bajo Codi, para que la adherencia al suelo (pasos 3-4)
        // no contradiga la adherencia a la plataforma (paso 6): con Codi quieto
        // horizontalmente, el terreno bajo él es siempre la superficie de la
        // plataforma en su posición inicial.
        const mundo = {
          volumenesSolidos: [],
          zonasBloqueadas: [],
          plataformasMoviles: [{ aabbActual, deltaMovimientoFrame }],
          muestreaAltura: () => posY,
        };

        const movementSystem = new MovementSystem();
        const nuevaPose = movementSystem.actualizar(inputState, deltaTime, poseActual, mundo);

        const epsilon = 1e-3;
        expect(Math.abs(nuevaPose.position.x - (posX + deltaX))).toBeLessThan(epsilon);
        expect(Math.abs(nuevaPose.position.y - (posY + deltaY))).toBeLessThan(epsilon);
        expect(Math.abs(nuevaPose.position.z - (posZ + deltaZ))).toBeLessThan(epsilon);
      }),
      { numRuns: 100 }
    );
  });
});
