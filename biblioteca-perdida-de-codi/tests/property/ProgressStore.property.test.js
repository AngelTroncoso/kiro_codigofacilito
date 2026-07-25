import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ProgressStore } from '../../src/core/ProgressStore.js';

describe('ProgressStore - property tests', () => {
  // Feature: biblioteca-perdida-de-codi, Property 9: Estado inicial de una nueva sesión
  it('Property 9: cualquier instancia nueva de ProgressStore tiene habilidadesObtenidas y mecanismosResueltos vacíos, y desafioFinalCompletado en false', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
        // n es irrelevante para el resultado: generamos n instancias nuevas
        // y verificamos el invariante de estado inicial en cada una.
        for (let i = 0; i < n; i++) {
          const store = new ProgressStore();
          expect(store.habilidades().size).toBe(0);
          expect(store.mecanismosResueltos().size).toBe(0);
          expect(store.desafioCompletado()).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  // Feature: biblioteca-perdida-de-codi, Property 8: Monotonía del progreso durante la sesión
  it('Property 8: los conjuntos habilidadesObtenidas y mecanismosResueltos solo pueden crecer o permanecer iguales ante cualquier secuencia de eventos válidos', () => {
    const eventoArb = fc.oneof(
      fc.record({
        tipo: fc.constant('habilidad'),
        id: fc.constantFrom('python', 'javascript', 'sql'),
      }),
      fc.record({
        tipo: fc.constant('mecanismo'),
        id: fc.string({ minLength: 1, maxLength: 10 }),
      })
    );

    fc.assert(
      fc.property(fc.array(eventoArb, { minLength: 0, maxLength: 50 }), (eventos) => {
        const store = new ProgressStore();
        let prevHabilidades = store.habilidades();
        let prevMecanismos = store.mecanismosResueltos();

        for (const evento of eventos) {
          if (evento.tipo === 'habilidad') {
            store.otorgarHabilidad(evento.id);
          } else {
            store.marcarMecanismoResuelto(evento.id);
          }

          const nuevasHabilidades = store.habilidades();
          const nuevosMecanismos = store.mecanismosResueltos();

          // Monotonía: todo elemento presente antes del evento sigue presente después.
          for (const h of prevHabilidades) {
            expect(nuevasHabilidades.has(h)).toBe(true);
          }
          for (const m of prevMecanismos) {
            expect(nuevosMecanismos.has(m)).toBe(true);
          }

          prevHabilidades = nuevasHabilidades;
          prevMecanismos = nuevosMecanismos;
        }
      }),
      { numRuns: 100 }
    );
  });

  // Feature: biblioteca-perdida-de-codi, Property 15: Consistencia de lectura del ProgressStore
  it('Property 15: dos lectores distintos que consultan el store inmediatamente después de cada mutación observan exactamente los mismos valores', () => {
    const mutacionArb = fc.oneof(
      fc.record({
        tipo: fc.constant('habilidad'),
        id: fc.constantFrom('python', 'javascript', 'sql'),
      }),
      fc.record({
        tipo: fc.constant('mecanismo'),
        id: fc.string({ minLength: 1, maxLength: 10 }),
      }),
      fc.record({
        tipo: fc.constant('desafio'),
      })
    );

    const leer = (store) => ({
      habilidades: store.habilidades(),
      mecanismosResueltos: store.mecanismosResueltos(),
      desafioCompletado: store.desafioCompletado(),
      tienePython: store.tieneHabilidad('python'),
      tieneJavascript: store.tieneHabilidad('javascript'),
      tieneSql: store.tieneHabilidad('sql'),
    });

    fc.assert(
      fc.property(fc.array(mutacionArb, { minLength: 0, maxLength: 50 }), (mutaciones) => {
        const store = new ProgressStore();

        for (const mutacion of mutaciones) {
          if (mutacion.tipo === 'habilidad') {
            store.otorgarHabilidad(mutacion.id);
          } else if (mutacion.tipo === 'mecanismo') {
            store.marcarMecanismoResuelto(mutacion.id);
          } else {
            store.marcarDesafioCompletado();
          }

          // Dos "lectores" independientes consultan la misma instancia en el mismo instante.
          const lector1 = leer(store);
          const lector2 = leer(store);

          expect(lector1.habilidades).toEqual(lector2.habilidades);
          expect(lector1.mecanismosResueltos).toEqual(lector2.mecanismosResueltos);
          expect(lector1.desafioCompletado).toBe(lector2.desafioCompletado);
          expect(lector1.tienePython).toBe(lector2.tienePython);
          expect(lector1.tieneJavascript).toBe(lector2.tieneJavascript);
          expect(lector1.tieneSql).toBe(lector2.tieneSql);
        }
      }),
      { numRuns: 100 }
    );
  });
});
