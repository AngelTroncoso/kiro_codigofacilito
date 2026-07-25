import { describe, it, expect } from 'vitest';
import { MANIFIESTO_ASSETS } from '../../src/world/assetManifest.js';
import { ZONAS } from '../../src/world/zones.data.js';

describe('assetManifest', () => {
  it('MANIFIESTO_ASSETS es un array no vacío', () => {
    expect(Array.isArray(MANIFIESTO_ASSETS)).toBe(true);
    expect(MANIFIESTO_ASSETS.length).toBeGreaterThan(0);
  });

  it('cada entrada tiene id y url de tipo string no vacío', () => {
    MANIFIESTO_ASSETS.forEach((entry) => {
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
      expect(typeof entry.url).toBe('string');
      expect(entry.url.length).toBeGreaterThan(0);
    });
  });

  it('hay exactamente un asset con critico: true, y es el de id "codi"', () => {
    const criticos = MANIFIESTO_ASSETS.filter((entry) => entry.critico === true);
    expect(criticos).toHaveLength(1);
    expect(criticos[0].id).toBe('codi');
  });

  it('no hay ids duplicados en el manifiesto', () => {
    const ids = MANIFIESTO_ASSETS.map((entry) => entry.id);
    const idsUnicos = new Set(ids);
    expect(idsUnicos.size).toBe(ids.length);
  });

  it('hay un asset de entorno por cada Zona real de ZONAS', () => {
    const idsManifiesto = new Set(MANIFIESTO_ASSETS.map((entry) => entry.id));
    ZONAS.forEach((zona) => {
      expect(idsManifiesto.has(`entorno-${zona.id}`)).toBe(true);
    });
  });
});
