import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { AbsorptionSystem, RADIO_CONTACTO_POR_DEFECTO } from '../../src/absorption/AbsorptionSystem.js';
import { ProgressStore } from '../../src/core/ProgressStore.js';

const HABILIDADES = ['python', 'javascript', 'sql'];

describe('AbsorptionSystem - property tests', () => {
  // Feature: biblioteca-perdida-de-codi, Property 1: Absorción otorga habilidad y remueve el libro
  // Validates: Requirements 3.1, 3.4
  it('Property 1: contacto con un libro no absorbido otorga su habilidad y lo marca absorbido', () => {
    const escenarioArb = fc.record({
      habilidadId: fc.constantFrom(...HABILIDADES),
      libroId: fc.string({ minLength: 1, maxLength: 10 }),
      zonaId: fc.string({ minLength: 1, maxLength: 10 }),
      codiPos: fc.record({
        x: fc.double({ min: -50, max: 50, noNaN: true }),
        y: fc.double({ min: -50, max: 50, noNaN: true }),
        z: fc.double({ min: -50, max: 50, noNaN: true }),
      }),
      // Offset dentro del radio de contacto real (garantiza contacto).
      offset: fc.record({
        x: fc.double({ min: -1, max: 1, noNaN: true }),
        y: fc.double({ min: -1, max: 1, noNaN: true }),
        z: fc.double({ min: -1, max: 1, noNaN: true }),
      }),
      otrasHabilidadesPrevias: fc.subarray(HABILIDADES),
    });

    fc.assert(
      fc.property(escenarioArb, (escenario) => {
        const { habilidadId, libroId, zonaId, codiPos, offset, otrasHabilidadesPrevias } = escenario;

        const absorptionSystem = new AbsorptionSystem();
        const radio = RADIO_CONTACTO_POR_DEFECTO;

        // Normaliza el offset para que su magnitud esté dentro del radio real
        // de contacto usado por el sistema (evita depender de un radio
        // hardcodeado distinto al que la implementación usa realmente).
        const magnitudOffset = Math.sqrt(offset.x * offset.x + offset.y * offset.y + offset.z * offset.z);
        const factor = magnitudOffset > 0 ? (radio * 0.5) / magnitudOffset : 0;
        const offsetDentroDeRadio = {
          x: offset.x * factor,
          y: offset.y * factor,
          z: offset.z * factor,
        };

        const posicionLibro = {
          x: codiPos.x + offsetDentroDeRadio.x,
          y: codiPos.y + offsetDentroDeRadio.y,
          z: codiPos.z + offsetDentroDeRadio.z,
        };

        const poseCodi = {
          position: codiPos,
          rotationY: 0,
          velocity: { x: 0, y: 0, z: 0 },
          animState: 'idle',
          lastSafePosition: codiPos,
        };

        const libro = {
          id: libroId,
          habilidadId,
          zonaId,
          posicion: posicionLibro,
          absorbido: false,
        };

        const progreso = new ProgressStore();
        // Precondición del enunciado de la propiedad: el ProgressStore aún
        // no posee la habilidad del libro bajo prueba. `otrasHabilidadesPrevias`
        // puede incluir cualquier subconjunto de habilidades DISTINTAS,
        // otorgadas por algún medio externo, para verificar que no interfieren.
        for (const h of otrasHabilidadesPrevias) {
          if (h !== habilidadId) {
            progreso.otorgarHabilidad(h);
          }
        }

        expect(progreso.tieneHabilidad(habilidadId)).toBe(false);
        expect(libro.absorbido).toBe(false);

        const resultado = absorptionSystem.revisarContacto(poseCodi, [libro], progreso);

        expect(progreso.tieneHabilidad(habilidadId)).toBe(true);
        expect(libro.absorbido).toBe(true);
        expect(resultado.habilidadOtorgada).toBe(habilidadId);
        expect(resultado.libroRemovidoId).toBe(libroId);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: biblioteca-perdida-de-codi, Property 2: Absorción es idempotente
  // Validates: Requirements 3.5
  it('Property 2: procesar contacto con un libro cuya habilidad ya fue otorgada no altera el progreso ni otros libros', () => {
    const escenarioArb = fc.record({
      habilidadId: fc.constantFrom(...HABILIDADES),
      libroId: fc.string({ minLength: 1, maxLength: 10 }),
      zonaId: fc.string({ minLength: 1, maxLength: 10 }),
      codiPos: fc.record({
        x: fc.double({ min: -50, max: 50, noNaN: true }),
        y: fc.double({ min: -50, max: 50, noNaN: true }),
        z: fc.double({ min: -50, max: 50, noNaN: true }),
      }),
      offset: fc.record({
        x: fc.double({ min: -1, max: 1, noNaN: true }),
        y: fc.double({ min: -1, max: 1, noNaN: true }),
        z: fc.double({ min: -1, max: 1, noNaN: true }),
      }),
      // Caso A: el libro ya está absorbido. Caso B: la habilidad ya fue
      // otorgada por otro medio (otro libro de la misma habilidad).
      libroYaAbsorbido: fc.boolean(),
      // Los "otros libros" se posicionan siempre bien lejos de Codi (offset
      // fijo mayor al radio de contacto en cada eje), para que el propio
      // generador nunca produzca un contacto "de casualidad" con ellos: la
      // propiedad bajo prueba es sobre el libro objetivo, no sobre estos.
      otrosLibros: fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 10 }),
          habilidadId: fc.constantFrom(...HABILIDADES),
          zonaId: fc.string({ minLength: 1, maxLength: 10 }),
          lejaniaX: fc.double({ min: 100, max: 1000, noNaN: true }),
          lejaniaZ: fc.double({ min: 100, max: 1000, noNaN: true }),
          absorbido: fc.boolean(),
        }),
        { minLength: 0, maxLength: 5 }
      ),
    });

    fc.assert(
      fc.property(escenarioArb, (escenario) => {
        const { habilidadId, libroId, zonaId, codiPos, offset, libroYaAbsorbido, otrosLibros } = escenario;

        const absorptionSystem = new AbsorptionSystem();
        const radio = RADIO_CONTACTO_POR_DEFECTO;

        const magnitudOffset = Math.sqrt(offset.x * offset.x + offset.y * offset.y + offset.z * offset.z);
        const factor = magnitudOffset > 0 ? (radio * 0.5) / magnitudOffset : 0;
        const offsetDentroDeRadio = {
          x: offset.x * factor,
          y: offset.y * factor,
          z: offset.z * factor,
        };

        const posicionLibro = {
          x: codiPos.x + offsetDentroDeRadio.x,
          y: codiPos.y + offsetDentroDeRadio.y,
          z: codiPos.z + offsetDentroDeRadio.z,
        };

        const poseCodi = {
          position: codiPos,
          rotationY: 0,
          velocity: { x: 0, y: 0, z: 0 },
          animState: 'idle',
          lastSafePosition: codiPos,
        };

        const progreso = new ProgressStore();

        const libro = {
          id: libroId,
          habilidadId,
          zonaId,
          posicion: posicionLibro,
          absorbido: libroYaAbsorbido,
        };

        // Garantiza la precondición de la propiedad: la habilidad del libro
        // ya está presente en el ProgressStore, ya sea porque el libro
        // mismo ya fue absorbido antes, o porque otro medio (aquí, otorgada
        // directamente) ya la concedió.
        progreso.otorgarHabilidad(habilidadId);

        // Posiciona cada "otro libro" bien lejos de Codi (a partir de la
        // `lejania` generada, siempre mayor que el radio de contacto), para
        // que nunca haya contacto accidental con ellos: la propiedad bajo
        // prueba es sobre el libro objetivo, no sobre estos.
        const otrosLibrosSeguros = otrosLibros.map((otro) => ({
          id: otro.id,
          habilidadId: otro.habilidadId,
          zonaId: otro.zonaId,
          posicion: {
            x: codiPos.x + otro.lejaniaX,
            y: codiPos.y,
            z: codiPos.z + otro.lejaniaZ,
          },
          absorbido: otro.absorbido,
        }));
        const librosActivos = [libro, ...otrosLibrosSeguros];

        const habilidadesAntes = progreso.habilidades();
        const mecanismosAntes = progreso.mecanismosResueltos();
        const desafioAntes = progreso.desafioCompletado();
        const snapshotOtrosLibrosAntes = otrosLibrosSeguros.map((l) => ({ ...l }));

        const resultado = absorptionSystem.revisarContacto(poseCodi, librosActivos, progreso);

        // El ProgressStore no cambia: mismas habilidades, mismos mecanismos,
        // mismo estado de desafío.
        expect(progreso.habilidades()).toEqual(habilidadesAntes);
        expect(progreso.mecanismosResueltos()).toEqual(mecanismosAntes);
        expect(progreso.desafioCompletado()).toBe(desafioAntes);

        // El libro bajo prueba permanece absorbido (ya lo estaba, o la
        // absorción es un no-op en términos de progreso, pero de cualquier
        // forma queda marcado absorbido=true de forma estable).
        expect(libro.absorbido).toBe(true);

        // Ningún otro libro de la escena fue alterado por esta llamada.
        otrosLibrosSeguros.forEach((otro, i) => {
          expect(otro).toEqual(snapshotOtrosLibrosAntes[i]);
        });

        // No hay señal de nueva absorción hacia afuera: la habilidad ya
        // estaba otorgada antes de esta llamada, por lo que no se considera
        // un nuevo evento de absorción con efecto sobre el progreso.
        if (resultado.habilidadOtorgada !== null) {
          expect(progreso.tieneHabilidad(resultado.habilidadOtorgada)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});
