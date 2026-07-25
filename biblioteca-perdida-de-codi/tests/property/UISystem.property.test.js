import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { UISystem } from '../../src/ui/UISystem.js';
import { ProgressStore } from '../../src/core/ProgressStore.js';

const HABILIDAD_IDS = ['python', 'javascript', 'sql'];

describe('UISystem - property tests', () => {
  // Feature: biblioteca-perdida-de-codi, Property 12: Consistencia del indicador de habilidades
  it('Property 12: para cualquier EstadoProgreso, construirVista reporta exactamente el conjunto habilidadesObtenidas (sin omisiones ni elementos adicionales)', () => {
    const subconjuntoArb = fc.subarray(HABILIDAD_IDS);

    fc.assert(
      fc.property(subconjuntoArb, (habilidadesOtorgadas) => {
        const progreso = new ProgressStore();
        habilidadesOtorgadas.forEach((id) => progreso.otorgarHabilidad(id));

        const uiSystem = new UISystem();
        const vista = uiSystem.construirVista(progreso);

        expect(vista.habilidadesObtenidas.size).toBe(habilidadesOtorgadas.length);
        for (const id of habilidadesOtorgadas) {
          expect(vista.habilidadesObtenidas.has(id)).toBe(true);
        }
        for (const id of vista.habilidadesObtenidas) {
          expect(habilidadesOtorgadas.includes(id)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});
