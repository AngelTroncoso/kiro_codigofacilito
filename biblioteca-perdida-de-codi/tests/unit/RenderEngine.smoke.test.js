import { describe, it, expect } from 'vitest';
import { esWebGLDisponible, RenderEngine } from '../../src/rendering/RenderEngine.js';

describe('RenderEngine (smoke, temporal)', () => {
  it('esWebGLDisponible no lanza en jsdom y devuelve boolean', () => {
    expect(() => esWebGLDisponible()).not.toThrow();
    expect(typeof esWebGLDisponible()).toBe('boolean');
  });

  it('RenderEngine.soportaWebGL delega en esWebGLDisponible sin lanzar', () => {
    expect(() => RenderEngine.soportaWebGL()).not.toThrow();
    expect(typeof RenderEngine.soportaWebGL()).toBe('boolean');
  });
});
