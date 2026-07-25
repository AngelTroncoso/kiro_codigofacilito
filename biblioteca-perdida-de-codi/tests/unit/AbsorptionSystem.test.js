import { describe, it, expect } from 'vitest';
import { AbsorptionSystem, RADIO_CONTACTO_POR_DEFECTO } from '../../src/absorption/AbsorptionSystem.js';
import { ProgressStore } from '../../src/core/ProgressStore.js';

/**
 * AbsorptionSystem.test.js - Unit tests para la señal de animación/efecto
 * visual de absorción (Requisito 3.2).
 *
 * Interpretación de diseño (ver JSDoc de `AbsorptionSystem.revisarContacto`):
 * el diseño técnico especifica que `AbsorptionSystem.revisarContacto` es
 * síncrono y puro, y NO existe en el diseño actual un `AnimationSystem` ni
 * un método `RenderEngine.reproducirAnimacion`. Por lo tanto, el Requisito
 * 3.2 ("reproducir una animación o efecto visual de absorción antes de
 * devolver el control total al Jugador") se satisface de forma indirecta:
 * el valor de retorno de `revisarContacto` (`{ habilidadOtorgada,
 * libroRemovidoId }`) es la SEÑAL que permite a quien orquesta el
 * `GameLoop` (`main.js`, tareas 16.x) reproducir la animación ANTES de
 * continuar el frame con normalidad. `AbsorptionSystem` en sí mismo no
 * bloquea nada ni reproduce animaciones: solo garantiza que, cuando y solo
 * cuando ocurre una absorción real, el resultado contiene toda la
 * información necesaria para disparar esa señal de forma inequívoca.
 *
 * Estos tests verifican esa señal, no una animación real (que no existe en
 * este sistema).
 */
describe('AbsorptionSystem - unit tests (señal de animación de absorción, Requisito 3.2)', () => {
  const zonaId = 'zona-1';

  function crearPose(position) {
    return {
      position,
      rotationY: 0,
      velocity: { x: 0, y: 0, z: 0 },
      animState: 'idle',
      lastSafePosition: position,
    };
  }

  it('cuando se otorga una habilidad, el resultado contiene habilidadOtorgada y libroRemovidoId no nulos (señal suficiente para disparar la animación)', () => {
    const absorptionSystem = new AbsorptionSystem();
    const progreso = new ProgressStore();
    const poseCodi = crearPose({ x: 0, y: 0, z: 0 });
    const libro = {
      id: 'libro-python',
      habilidadId: 'python',
      zonaId,
      posicion: { x: 0.1, y: 0, z: 0 }, // dentro del radio de contacto
      absorbido: false,
    };

    const resultado = absorptionSystem.revisarContacto(poseCodi, [libro], progreso);

    expect(resultado.habilidadOtorgada).toBe('python');
    expect(resultado.libroRemovidoId).toBe('libro-python');
    // La habilidad efectivamente fue otorgada: la señal es coherente con el estado real.
    expect(progreso.tieneHabilidad('python')).toBe(true);
  });

  it('cuando NO hay contacto (libro fuera de rango), ambos campos son null: no hay señal de animación', () => {
    const absorptionSystem = new AbsorptionSystem();
    const progreso = new ProgressStore();
    const poseCodi = crearPose({ x: 0, y: 0, z: 0 });
    const libro = {
      id: 'libro-lejano',
      habilidadId: 'javascript',
      zonaId,
      posicion: { x: 100, y: 0, z: 0 }, // muy lejos, fuera del radio de contacto
      absorbido: false,
    };

    const resultado = absorptionSystem.revisarContacto(poseCodi, [libro], progreso);

    expect(resultado.habilidadOtorgada).toBeNull();
    expect(resultado.libroRemovidoId).toBeNull();
    expect(progreso.tieneHabilidad('javascript')).toBe(false);
  });

  it('cuando el libro ya fue absorbido previamente, ambos campos son null: no hay señal de animación (idempotencia 3.5)', () => {
    const absorptionSystem = new AbsorptionSystem();
    const progreso = new ProgressStore();
    progreso.otorgarHabilidad('sql');
    const poseCodi = crearPose({ x: 5, y: 1, z: -3 });
    const libro = {
      id: 'libro-sql',
      habilidadId: 'sql',
      zonaId,
      posicion: { x: 5, y: 1, z: -3 }, // exactamente en contacto
      absorbido: true, // ya absorbido en un frame anterior
    };

    const resultado = absorptionSystem.revisarContacto(poseCodi, [libro], progreso);

    expect(resultado.habilidadOtorgada).toBeNull();
    expect(resultado.libroRemovidoId).toBeNull();
  });

  it('el radio de contacto por defecto es un valor positivo razonable, consistente con el usado por la implementación', () => {
    expect(RADIO_CONTACTO_POR_DEFECTO).toBeGreaterThan(0);
  });
});
