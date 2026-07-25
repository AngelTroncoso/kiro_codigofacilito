import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  colisionaConAlguno,
  resolverColisionHorizontal,
  resolverPosicionSegura,
} from '../../src/movement/collision.js';

describe('collision.js - property tests', () => {
  // Feature: biblioteca-perdida-de-codi, Property 5: Colisión impide atravesar geometría sólida
  it('Property 5: la posición resuelta por resolverColisionHorizontal nunca queda dentro de un volumen sólido, para cualquier conjunto de volúmenes y cualquier desplazamiento deseado', () => {
    const RADIO_COLISIONADOR = 0.5;
    const POSICION_INICIAL = { x: 0, y: 5, z: 0 };

    const aabbArb = fc
      .record({
        minX: fc.integer({ min: -10, max: 10 }),
        minY: fc.integer({ min: -10, max: 10 }),
        minZ: fc.integer({ min: -10, max: 10 }),
        sizeX: fc.integer({ min: 1, max: 5 }),
        sizeY: fc.integer({ min: 1, max: 5 }),
        sizeZ: fc.integer({ min: 1, max: 5 }),
      })
      .map(({ minX, minY, minZ, sizeX, sizeY, sizeZ }) => ({
        type: 'aabb',
        min: { x: minX, y: minY, z: minZ },
        max: { x: minX + sizeX, y: minY + sizeY, z: minZ + sizeZ },
      }));

    const sphereArb = fc
      .record({
        x: fc.integer({ min: -10, max: 10 }),
        y: fc.integer({ min: -10, max: 10 }),
        z: fc.integer({ min: -10, max: 10 }),
        radius: fc.integer({ min: 1, max: 3 }),
      })
      .map(({ x, y, z, radius }) => ({
        type: 'sphere',
        center: { x, y, z },
        radius,
      }));

    const volumenArb = fc.oneof(aabbArb, sphereArb);
    const volumenesArb = fc.array(volumenArb, { maxLength: 8 });

    const desplazamientoArb = fc.record({
      x: fc.integer({ min: -5, max: 5 }),
      z: fc.integer({ min: -5, max: 5 }),
    });

    fc.assert(
      fc.property(volumenesArb, desplazamientoArb, (volumenes, desplazamiento) => {
        // Solo consideramos casos donde la posición inicial no está ya
        // incrustada en un volumen sólido (precondición asumida por la función).
        fc.pre(!colisionaConAlguno(POSICION_INICIAL, RADIO_COLISIONADOR, volumenes));

        const resultado = resolverColisionHorizontal(
          POSICION_INICIAL,
          desplazamiento,
          volumenes,
          RADIO_COLISIONADOR
        );

        expect(colisionaConAlguno(resultado, RADIO_COLISIONADOR, volumenes)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: biblioteca-perdida-de-codi, Property 6: Reposicionamiento seguro fuera de límites
  it('Property 6: cuando no se encuentra suelo navegable, la posición resultante es exactamente el último punto seguro registrado', () => {
    const posicionArb = fc.record({
      x: fc.integer({ min: -20, max: 20 }),
      y: fc.integer({ min: -20, max: 20 }),
      z: fc.integer({ min: -20, max: 20 }),
    });

    const eventoArb = fc.record({
      posicionCandidata: posicionArb,
      encontrado: fc.boolean(),
      altura: fc.integer({ min: -20, max: 20 }),
    });

    fc.assert(
      fc.property(
        posicionArb,
        fc.array(eventoArb, { minLength: 0, maxLength: 30 }),
        (posicionInicial, eventos) => {
          let ultimaPosicionSegura = posicionInicial;

          for (const evento of eventos) {
            const resultadoRaycast = evento.encontrado
              ? { altura: evento.altura, encontrado: true }
              : { altura: null, encontrado: false };

            const posicionAntesDelPaso = ultimaPosicionSegura;

            const resultado = resolverPosicionSegura(
              evento.posicionCandidata,
              resultadoRaycast,
              ultimaPosicionSegura
            );

            if (evento.encontrado) {
              expect(resultado.y).toBe(evento.altura);
              expect(resultado.x).toBe(evento.posicionCandidata.x);
              expect(resultado.z).toBe(evento.posicionCandidata.z);
              ultimaPosicionSegura = resultado;
            } else {
              // Fuera de límites: el resultado debe ser exactamente el último
              // punto seguro registrado ANTES de este paso (no se actualiza).
              expect(resultado).toEqual(posicionAntesDelPaso);
              // ultimaPosicionSegura permanece sin cambios.
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
