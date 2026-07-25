import { describe, it, expect, vi } from 'vitest';
import { extenderPuente, iniciarRecorridoPlataforma, revelarGeometriaOculta, aplicarEfectoResolucion } from '../../src/abilities/mechanismEffects.js';
import { DEFINICIONES_MECANISMO, obtenerDefinicionMecanismo } from '../../src/abilities/mechanismDefinitions.js';
import { TIPOS_MECANISMO_VALIDOS, HABILIDADES_VALIDAS } from '../../src/world/WorldModel.js';

describe('mechanismDefinitions.js - catálogo de definiciones de mecanismo', () => {
  it('cubre exactamente los seis tipos de TIPOS_MECANISMO_VALIDOS, cada uno con una habilidad válida', () => {
    for (const tipo of TIPOS_MECANISMO_VALIDOS) {
      const definicion = obtenerDefinicionMecanismo(tipo);
      expect(definicion).toBeDefined();
      expect(definicion.tipo).toBe(tipo);
      expect(HABILIDADES_VALIDAS).toContain(definicion.habilidad);
      expect(typeof definicion.descripcionEfecto).toBe('string');
      expect(definicion.descripcionEfecto.length).toBeGreaterThan(0);
    }
  });

  it('asocia puente/solucion-automatizada a python, dispositivo/plataforma-movil a javascript, camino-oculto/fuente-informacion a sql', () => {
    expect(DEFINICIONES_MECANISMO['puente'].habilidad).toBe('python');
    expect(DEFINICIONES_MECANISMO['solucion-automatizada'].habilidad).toBe('python');
    expect(DEFINICIONES_MECANISMO['dispositivo'].habilidad).toBe('javascript');
    expect(DEFINICIONES_MECANISMO['plataforma-movil'].habilidad).toBe('javascript');
    expect(DEFINICIONES_MECANISMO['camino-oculto'].habilidad).toBe('sql');
    expect(DEFINICIONES_MECANISMO['fuente-informacion'].habilidad).toBe('sql');
  });
});

describe('mechanismEffects.js - efectos visuales de resolución (Requisito 11.4)', () => {
  it('extenderPuente escala el objeto puente a la escala completa por defecto', () => {
    const objetoPuente = { scale: { x: 0.1, y: 1, z: 1 } };
    extenderPuente(objetoPuente);
    expect(objetoPuente.scale).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('extenderPuente acepta una escala completa personalizada', () => {
    const objetoPuente = { scale: { x: 0.1, y: 1, z: 1 } };
    extenderPuente(objetoPuente, { x: 2, y: 1, z: 3 });
    expect(objetoPuente.scale).toEqual({ x: 2, y: 1, z: 3 });
  });

  it('extenderPuente no lanza si el objeto no tiene scale (no-op defensivo)', () => {
    expect(() => extenderPuente(null)).not.toThrow();
    expect(() => extenderPuente({})).not.toThrow();
  });

  it('iniciarRecorridoPlataforma marca la plataforma como activa', () => {
    const plataformaData = { activa: false };
    iniciarRecorridoPlataforma(plataformaData);
    expect(plataformaData.activa).toBe(true);
  });

  it('revelarGeometriaOculta marca visible=true y registra el modelo si se provee renderEngine', () => {
    const objetoOculto = { visible: false };
    const renderEngine = { registrarModelo: vi.fn() };

    revelarGeometriaOculta(objetoOculto, renderEngine);

    expect(objetoOculto.visible).toBe(true);
    expect(renderEngine.registrarModelo).toHaveBeenCalledWith(objetoOculto);
  });

  it('revelarGeometriaOculta funciona sin renderEngine (solo marca visible=true)', () => {
    const objetoOculto = { visible: false };
    revelarGeometriaOculta(objetoOculto);
    expect(objetoOculto.visible).toBe(true);
  });

  it('aplicarEfectoResolucion despacha al efecto correcto según descripcionEfecto', () => {
    const objetoPuente = { scale: { x: 0.1, y: 1, z: 1 } };
    aplicarEfectoResolucion('extender-puente', objetoPuente);
    expect(objetoPuente.scale).toEqual({ x: 1, y: 1, z: 1 });

    const plataformaData = { activa: false };
    aplicarEfectoResolucion('iniciar-recorrido-plataforma', plataformaData);
    expect(plataformaData.activa).toBe(true);

    const objetoOculto = { visible: false };
    aplicarEfectoResolucion('revelar-geometria-oculta', objetoOculto);
    expect(objetoOculto.visible).toBe(true);
  });

  it('aplicarEfectoResolucion no lanza ante un descripcionEfecto desconocido', () => {
    expect(() => aplicarEfectoResolucion('efecto-inexistente', {})).not.toThrow();
  });
});
