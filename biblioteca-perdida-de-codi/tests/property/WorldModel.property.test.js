import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  HABILIDADES_VALIDAS,
  TIPOS_MECANISMO_VALIDOS,
  ESTADOS_MECANISMO_VALIDOS,
  validarMecanismoAmbiental,
} from '../../src/world/WorldModel.js';

describe('WorldModel - property tests', () => {
  // Feature: biblioteca-perdida-de-codi, Property 14: Validación de esquema de Mecanismo_Ambiental
  // Validates: Requisitos funcionales 6
  //
  // Para cualquier definición de MecanismoAmbiental cargada desde los datos del
  // mundo, debe tener exactamente un habilidadRequerida perteneciente al
  // catálogo fijo de Habilidad (python | javascript | sql); definiciones con
  // cero o más de una habilidad asociada deben ser rechazadas por el validador
  // de esquema al cargar el mundo.
  it('Property 14: habilidadRequerida es aceptada si y solo si es exactamente una Habilidad del catálogo fijo', () => {
    // Mecanismo base con todos los campos correctos EXCEPTO habilidadRequerida.
    const mecanismoBaseArb = fc.record({
      id: fc.string({ minLength: 1 }),
      tipo: fc.constantFrom(...TIPOS_MECANISMO_VALIDOS),
      zonaId: fc.string({ minLength: 1 }),
      estado: fc.constantFrom(...ESTADOS_MECANISMO_VALIDOS),
      posicion: fc.record({
        x: fc.double({ min: -1000, max: 1000, noNaN: true }),
        y: fc.double({ min: -1000, max: 1000, noNaN: true }),
        z: fc.double({ min: -1000, max: 1000, noNaN: true }),
      }),
    });

    // Caso válido: exactamente una Habilidad del catálogo fijo.
    const habilidadValidaArb = fc
      .constantFrom(...HABILIDADES_VALIDAS)
      .map((valor) => ({ esValido: true, valor }));

    // Caso inválido: "cero" (undefined/null/array vacío), "más de una"
    // (array con 2+ elementos), un array de longitud 1 (sigue sin ser
    // "exactamente una Habilidad", es un array), un string fuera del
    // catálogo, o un valor de otro tipo (número/objeto).
    const habilidadInvalidaArb = fc
      .oneof(
        fc.constant(undefined),
        fc.constant(null),
        fc.array(fc.constantFrom(...HABILIDADES_VALIDAS), { minLength: 0, maxLength: 4 }),
        fc.string().filter((s) => !HABILIDADES_VALIDAS.includes(s)),
        fc.integer(),
        fc.object()
      )
      .map((valor) => ({ esValido: false, valor }));

    const habilidadGeneradaArb = fc.oneof(habilidadValidaArb, habilidadInvalidaArb);

    fc.assert(
      fc.property(mecanismoBaseArb, habilidadGeneradaArb, (base, generado) => {
        const mecanismo = { ...base, habilidadRequerida: generado.valor };
        const resultado = validarMecanismoAmbiental(mecanismo);

        if (generado.esValido) {
          expect(resultado.valido).toBe(true);
          expect(resultado.errores.length).toBe(0);
        } else {
          expect(resultado.valido).toBe(false);
          expect(resultado.errores.some((e) => e.includes('habilidadRequerida'))).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});
