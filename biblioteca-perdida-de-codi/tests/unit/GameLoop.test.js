import { describe, it, expect, vi } from 'vitest';
import { GameLoop } from '../../src/core/GameLoop.js';

/**
 * Crea un mock simple de `renderDriver` que guarda el callback pasado a
 * `setAnimationLoop` para poder invocarlo manualmente en los tests,
 * simulando frames sin depender de un `requestAnimationFrame` real.
 */
function createRenderDriverMock() {
  return {
    _callback: undefined,
    setAnimationLoop: vi.fn(function (cb) {
      this._callback = cb;
    }),
  };
}

describe('GameLoop - unit tests', () => {
  // Feature: biblioteca-perdida-de-codi, Requisitos funcionales 3
  it('start() llama a renderDriver.setAnimationLoop con una función', () => {
    const renderDriver = createRenderDriverMock();
    const updateFn = vi.fn();
    const loop = new GameLoop(renderDriver, updateFn);

    loop.start();

    expect(renderDriver.setAnimationLoop).toHaveBeenCalledTimes(1);
    expect(typeof renderDriver.setAnimationLoop.mock.calls[0][0]).toBe('function');
  });

  it('el primer frame invoca updateFn con deltaTime = 0 y elapsedTime = 0', () => {
    const renderDriver = createRenderDriverMock();
    const updateFn = vi.fn();
    const loop = new GameLoop(renderDriver, updateFn);

    loop.start();
    renderDriver._callback(1000);

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(updateFn).toHaveBeenCalledWith(0, 0);
  });

  it('un segundo frame calcula deltaTime > 0 coherente en segundos (no milisegundos)', () => {
    const renderDriver = createRenderDriverMock();
    const updateFn = vi.fn();
    const loop = new GameLoop(renderDriver, updateFn);

    loop.start();
    renderDriver._callback(1000); // primer frame: deltaTime = 0
    renderDriver._callback(1250); // segundo frame: 250ms despues => 0.25s

    expect(updateFn).toHaveBeenCalledTimes(2);
    const [deltaTime, elapsedTime] = updateFn.mock.calls[1];
    expect(deltaTime).toBeCloseTo(0.25, 5);
    expect(deltaTime).toBeGreaterThan(0);
    expect(deltaTime).toBeLessThan(1); // coherente en segundos, no en milisegundos
    expect(elapsedTime).toBeCloseTo(0.25, 5);
  });

  it('si updateFn lanza una excepcion, el loop se detiene y se invoca onError con el error', () => {
    const renderDriver = createRenderDriverMock();
    const error = new Error('fallo simulado en el frame');
    const updateFn = vi.fn(() => {
      throw error;
    });
    const onError = vi.fn();
    const loop = new GameLoop(renderDriver, updateFn, onError);

    loop.start();

    expect(() => renderDriver._callback(1000)).not.toThrow();

    // stop() fue invocado: setAnimationLoop(null) es la segunda llamada
    // (la primera fue el start() con el callback).
    expect(renderDriver.setAnimationLoop).toHaveBeenCalledTimes(2);
    expect(renderDriver.setAnimationLoop).toHaveBeenLastCalledWith(null);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('si updateFn lanza y no se provee onError, se usa console.error como fallback sin propagar el error', () => {
    const renderDriver = createRenderDriverMock();
    const error = new Error('fallo simulado sin onError');
    const updateFn = vi.fn(() => {
      throw error;
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const loop = new GameLoop(renderDriver, updateFn);

    loop.start();

    expect(() => renderDriver._callback(1000)).not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    expect(renderDriver.setAnimationLoop).toHaveBeenLastCalledWith(null);

    consoleErrorSpy.mockRestore();
  });

  it('stop() llama a renderDriver.setAnimationLoop(null)', () => {
    const renderDriver = createRenderDriverMock();
    const updateFn = vi.fn();
    const loop = new GameLoop(renderDriver, updateFn);

    loop.start();
    loop.stop();

    expect(renderDriver.setAnimationLoop).toHaveBeenCalledTimes(2);
    expect(renderDriver.setAnimationLoop).toHaveBeenLastCalledWith(null);
  });
});
