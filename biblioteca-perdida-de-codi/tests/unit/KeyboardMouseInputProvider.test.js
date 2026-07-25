import { describe, it, expect, afterEach } from 'vitest';
import { KeyboardMouseInputProvider } from '../../src/input/KeyboardMouseInputProvider.js';

/**
 * Despacha un evento de teclado sobre `window` con el `code` indicado.
 * @param {'keydown'|'keyup'} tipo
 * @param {string} code
 */
function dispatchKey(tipo, code) {
  window.dispatchEvent(new KeyboardEvent(tipo, { code }));
}

/**
 * Despacha un `mousemove` sobre `window` con el delta indicado. jsdom no
 * soporta `movementX`/`movementY` en el constructor de `MouseEvent`, así
 * que se crea el evento sin ellos y se definen manualmente como propiedades
 * antes de despacharlo.
 * @param {number} movementX
 * @param {number} movementY
 */
function dispatchMouseMove(movementX, movementY) {
  const evento = new MouseEvent('mousemove', {});
  Object.defineProperty(evento, 'movementX', { value: movementX, configurable: true });
  Object.defineProperty(evento, 'movementY', { value: movementY, configurable: true });
  window.dispatchEvent(evento);
}

describe('KeyboardMouseInputProvider - unit tests', () => {
  /** @type {KeyboardMouseInputProvider} */
  let provider;

  afterEach(() => {
    provider?.dispose();
  });

  // Feature: biblioteca-perdida-de-codi, Requirements 1.2
  it('al presionar W, vectorMovimiento.z es -1 y vectorMovimiento.x es 0', () => {
    provider = new KeyboardMouseInputProvider();

    dispatchKey('keydown', 'KeyW');
    const estado = provider.leerEstado();

    expect(estado.vectorMovimiento.z).toBe(-1);
    expect(estado.vectorMovimiento.x).toBe(0);
  });

  it('al presionar A y D simultáneamente, vectorMovimiento.x es 0 (se cancelan)', () => {
    provider = new KeyboardMouseInputProvider();

    dispatchKey('keydown', 'KeyA');
    dispatchKey('keydown', 'KeyD');
    const estado = provider.leerEstado();

    expect(estado.vectorMovimiento.x).toBe(0);
  });

  it('saltar es edge-triggered: true en la primera lectura, false en la segunda sin soltar la tecla', () => {
    provider = new KeyboardMouseInputProvider();

    dispatchKey('keydown', 'Space');
    const primeraLectura = provider.leerEstado();
    expect(primeraLectura.saltar).toBe(true);

    // La tecla sigue presionada (no hubo keyup), pero no debe repetirse.
    const segundaLectura = provider.leerEstado();
    expect(segundaLectura.saltar).toBe(false);
  });

  it('saltar vuelve a true tras soltar y volver a presionar Espacio', () => {
    provider = new KeyboardMouseInputProvider();

    dispatchKey('keydown', 'Space');
    provider.leerEstado(); // consume el primer borde de subida

    dispatchKey('keyup', 'Space');
    dispatchKey('keydown', 'Space');
    const estado = provider.leerEstado();

    expect(estado.saltar).toBe(true);
  });

  it('accionInteractuar es edge-triggered para la tecla E, igual que saltar', () => {
    provider = new KeyboardMouseInputProvider();

    dispatchKey('keydown', 'KeyE');
    const primeraLectura = provider.leerEstado();
    expect(primeraLectura.accionInteractuar).toBe(true);

    const segundaLectura = provider.leerEstado();
    expect(segundaLectura.accionInteractuar).toBe(false);

    dispatchKey('keyup', 'KeyE');
    dispatchKey('keydown', 'KeyE');
    const terceraLectura = provider.leerEstado();
    expect(terceraLectura.accionInteractuar).toBe(true);
  });

  it('deltaCamara refleja el delta del mousemove y se resetea tras cada lectura', () => {
    provider = new KeyboardMouseInputProvider();

    dispatchMouseMove(12, -5);
    const estadoConMovimiento = provider.leerEstado();
    expect(estadoConMovimiento.deltaCamara).toEqual({ x: 12, y: -5 });

    const estadoSinNuevoMovimiento = provider.leerEstado();
    expect(estadoSinNuevoMovimiento.deltaCamara).toEqual({ x: 0, y: 0 });
  });

  it('dispose() remueve los listeners: los eventos DOM posteriores ya no afectan el estado', () => {
    provider = new KeyboardMouseInputProvider();

    dispatchKey('keydown', 'KeyW');
    const estadoAntesDeDispose = provider.leerEstado();
    expect(estadoAntesDeDispose.vectorMovimiento.z).toBe(-1);

    provider.dispose();

    dispatchKey('keydown', 'KeyD');
    const estadoDespuesDeDispose = provider.leerEstado();

    // Sin el listener de keydown, KeyD nunca se agrega a las teclas
    // presionadas (x sigue en 0, no refleja la nueva tecla), y KeyW sigue
    // "presionada" internamente (nunca hubo un keyup), por lo que z
    // mantiene su valor anterior.
    expect(estadoDespuesDeDispose.vectorMovimiento.x).toBe(0);
    expect(estadoDespuesDeDispose.vectorMovimiento.z).toBe(-1);
  });
});
