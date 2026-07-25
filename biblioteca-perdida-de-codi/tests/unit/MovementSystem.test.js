import { describe, it, expect } from 'vitest';
import { MovementSystem } from '../../src/movement/MovementSystem.js';

/**
 * Construye un `InputState` en reposo total (sin movimiento, sin salto, sin
 * interacción, sin delta de cámara), sobreescribible parcialmente.
 *
 * @param {Partial<import('../../src/input/InputProvider.js').InputState>} [overrides]
 */
function crearInputStateReposo(overrides = {}) {
  return {
    vectorMovimiento: { x: 0, z: 0 },
    deltaCamara: { x: 0, y: 0 },
    saltar: false,
    accionInteractuar: false,
    ...overrides,
  };
}

/**
 * Construye una `CodiPose` mínima válida, sobreescribible parcialmente.
 *
 * @param {Partial<import('../../src/movement/MovementSystem.js').CodiPose>} [overrides]
 */
function crearPose(overrides = {}) {
  const position = overrides.position ?? { x: 0, y: 0, z: 0 };
  return {
    position,
    rotationY: 0,
    velocity: { x: 0, y: 0, z: 0 },
    animState: 'idle',
    lastSafePosition: { ...position },
    ...overrides,
  };
}

/**
 * Construye un `WorldModelMovimiento` mínimo: suelo plano a una altura fija,
 * sin volúmenes sólidos, sin zonas bloqueadas y sin plataformas móviles.
 *
 * @param {number} alturaSuelo
 */
function crearMundoSueloPlano(alturaSuelo = 0) {
  return {
    volumenesSolidos: [],
    zonasBloqueadas: [],
    plataformasMoviles: [],
    muestreaAltura: () => alturaSuelo,
  };
}

describe('MovementSystem - unit tests', () => {
  // Feature: biblioteca-perdida-de-codi, Requirements 1.2
  it('dispara la animación de salto y una velocidad vertical positiva al saltar desde el suelo', () => {
    const sistema = new MovementSystem(); // constantes por defecto: velocidadSalto=7, gravedad=-18
    const alturaSuelo = 0;
    const poseActual = crearPose({ position: { x: 0, y: alturaSuelo, z: 0 } });
    const mundo = crearMundoSueloPlano(alturaSuelo);
    const inputState = crearInputStateReposo({ saltar: true });
    const deltaTime = 0.1;

    // Precondición del caso: Codi está en el suelo (no en el aire).
    expect(poseActual.velocity.y).toBe(0);

    const nuevaPose = sistema.actualizar(inputState, deltaTime, poseActual, mundo);

    expect(nuevaPose.animState).toBe('jump');
    expect(nuevaPose.velocity.y).toBeGreaterThan(0);
  });

  // Feature: biblioteca-perdida-de-codi, Requisitos funcionales 5
  // Interpretación documentada: `MovementSystem.actualizar()` no define por sí
  // mismo el punto de inicio fijo dentro de la primera Zona (esa decisión de
  // datos concretos corresponde a `zones.data.js`, tarea 14.x). Lo que SÍ es
  // responsabilidad de este sistema, y lo que sostiene la garantía de
  // "posición de inicio fija" exigida por el Requisito funcional 5, es que
  // con un `InputState` completamente en reposo el sistema NO desplaza a
  // Codi espontáneamente: la posición que el llamador establezca como punto
  // de inicio (p. ej. la de la primera Zona) permanece estable hasta que el
  // Jugador actúe. Este test verifica exactamente esa propiedad de reposo
  // estable sobre una posición de "inicio" arbitraria dentro de un suelo
  // navegable.
  it('mantiene a Codi en su posición de inicio cuando el InputState está completamente en reposo', () => {
    const sistema = new MovementSystem();
    const posicionInicioFija = { x: 5, y: 2, z: 3 };
    const poseActual = crearPose({ position: { ...posicionInicioFija } });
    const mundo = crearMundoSueloPlano(posicionInicioFija.y);
    const inputState = crearInputStateReposo();
    const deltaTime = 0.1;

    const nuevaPose = sistema.actualizar(inputState, deltaTime, poseActual, mundo);

    expect(nuevaPose.position.x).toBe(posicionInicioFija.x);
    expect(nuevaPose.position.z).toBe(posicionInicioFija.z);
    expect(nuevaPose.animState).toBe('idle');
  });

  // Feature: biblioteca-perdida-de-codi, Requirements 1.2 (cobertura adicional)
  it('selecciona animState "walk" al moverse en un solo eje con la velocidad de desplazamiento por defecto', () => {
    const sistema = new MovementSystem(); // velocidadDesplazamiento=4, umbralVelocidadCorrer=4.6 por defecto
    const alturaSuelo = 0;
    const poseActual = crearPose({ position: { x: 0, y: alturaSuelo, z: 0 } });
    const mundo = crearMundoSueloPlano(alturaSuelo);
    const inputState = crearInputStateReposo({ vectorMovimiento: { x: 1, z: 0 } });
    const deltaTime = 0.1;

    const nuevaPose = sistema.actualizar(inputState, deltaTime, poseActual, mundo);

    // Con rotationY=0 y vectorMovimiento={x:1,z:0}, el desplazamiento en un
    // solo eje produce una velocidad horizontal resultante igual a la
    // velocidad de desplazamiento por defecto (4 unid/seg), por debajo del
    // umbral de "run" (4.6), por lo que se espera 'walk'.
    expect(nuevaPose.animState).toBe('walk');
    expect(nuevaPose.velocity.x).toBeCloseTo(4, 5);
    expect(nuevaPose.velocity.y).toBe(0);
  });
});
