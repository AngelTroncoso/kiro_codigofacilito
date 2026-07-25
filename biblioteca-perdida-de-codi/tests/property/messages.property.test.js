import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generarMensaje } from '../../src/ui/messages.js';
import { CATALOGO_HABILIDADES } from '../../src/world/catalogoHabilidades.js';

const HABILIDAD_IDS = CATALOGO_HABILIDADES.map((h) => h.id);
const nombreHabilidad = (id) => CATALOGO_HABILIDADES.find((h) => h.id === id)?.nombre ?? id;

describe('ui/messages.js - property tests', () => {
  // Feature: biblioteca-perdida-de-codi, Property 13: Generación de mensajes contextuales no vacíos y relevantes
  it('Property 13: para cualquier evento del catálogo soportado, generarMensaje produce un texto no vacío que incluye un identificador legible del elemento involucrado', () => {
    const eventoAbsorcionArb = fc.record({
      tipo: fc.constant('absorcion'),
      habilidadId: fc.constantFrom(...HABILIDAD_IDS),
    });

    const eventoDenegadoArb = fc.record({
      tipo: fc.constant('denegado'),
      habilidadRequerida: fc.constantFrom(...HABILIDAD_IDS),
    });

    const eventoResueltoArb = fc.record({
      tipo: fc.constant('resuelto'),
      mecanismoId: fc.string({ minLength: 1, maxLength: 15 }),
      mecanismoTipo: fc.constantFrom('puente', 'solucion-automatizada', 'dispositivo', 'plataforma-movil', 'camino-oculto', 'fuente-informacion'),
    });

    const eventoZonaBloqueadaArb = fc.record({
      tipo: fc.constant('zona-bloqueada'),
      zonaNombre: fc.string({ minLength: 1, maxLength: 15 }),
      habilidadesFaltantes: fc.array(fc.constantFrom(...HABILIDAD_IDS), { minLength: 1, maxLength: 3 }),
    });

    const eventoArb = fc.oneof(eventoAbsorcionArb, eventoDenegadoArb, eventoResueltoArb, eventoZonaBloqueadaArb);

    fc.assert(
      fc.property(eventoArb, (evento) => {
        const mensaje = generarMensaje(evento);

        expect(typeof mensaje).toBe('string');
        expect(mensaje.length).toBeGreaterThan(0);

        let identificadorPresente = false;
        switch (evento.tipo) {
          case 'absorcion':
            identificadorPresente = mensaje.includes(nombreHabilidad(evento.habilidadId));
            break;
          case 'denegado':
            identificadorPresente = mensaje.includes(nombreHabilidad(evento.habilidadRequerida));
            break;
          case 'resuelto':
            identificadorPresente = mensaje.includes(evento.mecanismoId);
            break;
          case 'zona-bloqueada':
            identificadorPresente = mensaje.includes(evento.zonaNombre);
            break;
          default:
            identificadorPresente = false;
        }

        expect(identificadorPresente).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 13 (fallback): para un tipo de evento no reconocido, generarMensaje produce un texto no vacío en vez de lanzar o devolver cadena vacía', () => {
    fc.assert(
      fc.property(fc.string(), (tipoDesconocido) => {
        fc.pre(!['absorcion', 'denegado', 'resuelto', 'zona-bloqueada'].includes(tipoDesconocido));
        const mensaje = generarMensaje({ tipo: tipoDesconocido });
        expect(typeof mensaje).toBe('string');
        expect(mensaje.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
