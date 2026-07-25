import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { AbilitySystem } from '../../src/abilities/AbilitySystem.js';
import { ProgressStore } from '../../src/core/ProgressStore.js';

const HABILIDADES = ['python', 'javascript', 'sql'];

/**
 * Construye un `ProgressStore` real con exactamente el subconjunto de
 * habilidades `otorgadas` concedidas.
 *
 * @param {string[]} otorgadas
 * @returns {ProgressStore}
 */
function crearProgresoCon(otorgadas) {
  const progreso = new ProgressStore();
  for (const h of otorgadas) {
    progreso.otorgarHabilidad(h);
  }
  return progreso;
}

/**
 * `R ⊆ P` para conjuntos representados como arrays (sin duplicados
 * asumidos, ya que ambos provienen de `fc.subarray`/`fc.constantFrom`).
 *
 * @param {string[]} requerido
 * @param {string[]} poseido
 * @returns {boolean}
 */
function esSubconjunto(requerido, poseido) {
  return requerido.every((h) => poseido.includes(h));
}

describe('AbilitySystem - property tests', () => {
  // Feature: biblioteca-perdida-de-codi, Property 3: Gating por conjunto de habilidades requeridas
  // Validates: Requirements 4.1, 4.3, 5.1, 5.3, 6.1, 6.3, 7.1, 7.2, 10.1
  it('Property 3: puedeInteractuar/puedeAcceder devuelven exactamente R ⊆ P', () => {
    const abilitySystem = new AbilitySystem();

    // --- Parte A: puedeInteractuar (R de tamaño 1, un MecanismoAmbiental) ---
    const escenarioMecanismoArb = fc.record({
      habilidadRequerida: fc.constantFrom(...HABILIDADES),
      poseidas: fc.subarray(HABILIDADES),
      estado: fc.constantFrom('bloqueado', 'resuelto'),
      id: fc.string({ minLength: 1, maxLength: 10 }),
      tipo: fc.constantFrom(
        'puente',
        'solucion-automatizada',
        'dispositivo',
        'plataforma-movil',
        'camino-oculto',
        'fuente-informacion'
      ),
    });

    fc.assert(
      fc.property(escenarioMecanismoArb, (escenario) => {
        const { habilidadRequerida, poseidas, estado, id, tipo } = escenario;

        const progreso = crearProgresoCon(poseidas);
        const mecanismo = {
          id,
          tipo,
          habilidadRequerida,
          zonaId: 'zona-test',
          estado,
          posicion: { x: 0, y: 0, z: 0 },
        };

        const resultado = abilitySystem.puedeInteractuar(mecanismo, progreso);
        const esperado = esSubconjunto([habilidadRequerida], poseidas);

        expect(resultado).toBe(esperado);
      }),
      { numRuns: 100 }
    );

    // --- Parte B: puedeAcceder (R de tamaño arbitrario 0-3, incluyendo el
    // caso de 3 habilidades del Desafío Final, Requisito 10.1) ---
    const escenarioZonaArb = fc.record({
      // fc.subarray sobre HABILIDADES cubre naturalmente tamaños 0, 1, 2 y 3.
      requeridas: fc.subarray(HABILIDADES),
      poseidas: fc.subarray(HABILIDADES),
      id: fc.string({ minLength: 1, maxLength: 10 }),
    });

    fc.assert(
      fc.property(escenarioZonaArb, (escenario) => {
        const { requeridas, poseidas, id } = escenario;

        const progreso = crearProgresoCon(poseidas);
        const zona = {
          id,
          nombre: 'Zona de prueba',
          habilidadesRequeridas: requeridas,
          mecanismoIds: [],
          limites: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
        };

        const resultado = abilitySystem.puedeAcceder(zona, progreso);
        const esperado = esSubconjunto(requeridas, poseidas);

        expect(resultado).toBe(esperado);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: biblioteca-perdida-de-codi, Property 4: Activación exitosa resuelve el mecanismo y es idempotente
  // Validates: Requirements 4.2, 4.4, 5.2, 6.2
  it('Property 4: interactuar resuelve un mecanismo bloqueado con la habilidad, es idempotente una vez resuelto, y deniega sin la habilidad sin cambiar el estado', () => {
    const escenarioArb = fc.record({
      habilidadRequerida: fc.constantFrom(...HABILIDADES),
      poseidas: fc.subarray(HABILIDADES),
      id: fc.string({ minLength: 1, maxLength: 10 }),
      tipo: fc.constantFrom(
        'puente',
        'solucion-automatizada',
        'dispositivo',
        'plataforma-movil',
        'camino-oculto',
        'fuente-informacion'
      ),
      intentosRepetidos: fc.integer({ min: 1, max: 4 }),
    });

    fc.assert(
      fc.property(escenarioArb, (escenario) => {
        const { habilidadRequerida, poseidas, id, tipo, intentosRepetidos } = escenario;

        const abilitySystem = new AbilitySystem();
        const progreso = crearProgresoCon(poseidas);
        const mecanismo = {
          id,
          tipo,
          habilidadRequerida,
          zonaId: 'zona-test',
          estado: 'bloqueado',
          posicion: { x: 0, y: 0, z: 0 },
        };

        const tieneHabilidad = poseidas.includes(habilidadRequerida);

        const primerResultado = abilitySystem.interactuar(mecanismo, progreso);

        if (!tieneHabilidad) {
          // --- Caso "denegado": sin la habilidad, el estado no cambia. ---
          expect(primerResultado.resultado).toBe('denegado');
          expect(typeof primerResultado.mensaje).toBe('string');
          expect(primerResultado.mensaje.length).toBeGreaterThan(0);
          expect(mecanismo.estado).toBe('bloqueado');
          expect(progreso.tieneMecanismoResuelto(id)).toBe(false);

          // Repetir la denegación varias veces tampoco cambia nada.
          for (let i = 0; i < intentosRepetidos; i++) {
            const resultadoRepetido = abilitySystem.interactuar(mecanismo, progreso);
            expect(resultadoRepetido.resultado).toBe('denegado');
            expect(mecanismo.estado).toBe('bloqueado');
          }
          expect(progreso.tieneMecanismoResuelto(id)).toBe(false);
          return;
        }

        // --- Caso "resuelto": con la habilidad, bloqueado -> resuelto. ---
        expect(primerResultado.resultado).toBe('resuelto');
        expect(mecanismo.estado).toBe('resuelto');
        expect(progreso.tieneMecanismoResuelto(id)).toBe(true);
        expect(progreso.mecanismosResueltos().size).toBe(1);

        // --- Idempotencia: activarlo de nuevo (con la habilidad) no cambia
        // el estado ni duplica el registro. ---
        for (let i = 0; i < intentosRepetidos; i++) {
          const resultadoRepetido = abilitySystem.interactuar(mecanismo, progreso);
          expect(resultadoRepetido.resultado).toBe('sin-cambio');
          expect(mecanismo.estado).toBe('resuelto');
          expect(progreso.tieneMecanismoResuelto(id)).toBe(true);
          expect(progreso.mecanismosResueltos().size).toBe(1);
        }

        // --- Idempotencia también sin la habilidad (removida artificialmente
        // no es posible vía ProgressStore real ya que no hay "revocar", pero
        // el propio hecho de que ya esté resuelto hace que puedeInteractuar
        // sea irrelevante: interactuar corta en el chequeo de estado
        // 'resuelto' solo si pasa el gating. Verificamos aquí el caso
        // "con la habilidad" ya cubierto arriba; el caso "sin la habilidad"
        // sobre un mecanismo ya resuelto no es alcanzable sin revocar
        // habilidades, que ProgressStore no soporta por diseño (monotonía,
        // Property 8), por lo que queda fuera del espacio de estados
        // válidos y no se prueba aquí.
      }),
      { numRuns: 100 }
    );
  });
});
