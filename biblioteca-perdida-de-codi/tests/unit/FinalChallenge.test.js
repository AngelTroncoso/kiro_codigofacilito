import { describe, it, expect } from 'vitest';
import {
  FinalChallenge,
  PASOS_DESAFIO_FINAL,
  ZONA_DESAFIO_FINAL_POR_DEFECTO,
} from '../../src/challenge/FinalChallenge.js';
import { AbilitySystem } from '../../src/abilities/AbilitySystem.js';
import { ProgressStore } from '../../src/core/ProgressStore.js';

/**
 * FinalChallenge.test.js - Unit tests para el Desafio_Final contra el
 * Bug_Supremo (Requisitos 10.1, 10.2, 10.4).
 */
describe('FinalChallenge - unit tests (Requisitos 10.1, 10.2, 10.4)', () => {
  function otorgarLasTresHabilidades(progreso) {
    progreso.otorgarHabilidad('python');
    progreso.otorgarHabilidad('javascript');
    progreso.otorgarHabilidad('sql');
  }

  it('PASOS_DESAFIO_FINAL usa al menos dos Habilidades distintas (Requisito 10.2)', () => {
    const habilidadesDistintas = new Set(PASOS_DESAFIO_FINAL.map((paso) => paso.habilidadRequerida));
    expect(habilidadesDistintas.size).toBeGreaterThanOrEqual(2);
  });

  it('puedeIniciar devuelve false si falta al menos una de las 3 Habilidades', () => {
    const finalChallenge = new FinalChallenge();
    const abilitySystem = new AbilitySystem();
    const progreso = new ProgressStore();
    progreso.otorgarHabilidad('python');
    progreso.otorgarHabilidad('javascript');
    // falta 'sql'

    expect(finalChallenge.puedeIniciar(progreso, abilitySystem, ZONA_DESAFIO_FINAL_POR_DEFECTO)).toBe(false);
  });

  it('puedeIniciar devuelve true solo cuando se poseen las 3 Habilidades (Zona biblioteca-corrupta real)', () => {
    const finalChallenge = new FinalChallenge();
    const abilitySystem = new AbilitySystem();
    const progreso = new ProgressStore();
    otorgarLasTresHabilidades(progreso);

    expect(finalChallenge.puedeIniciar(progreso, abilitySystem, ZONA_DESAFIO_FINAL_POR_DEFECTO)).toBe(true);
    // También debe funcionar usando la Zona por defecto (sin pasarla explícitamente).
    expect(finalChallenge.puedeIniciar(progreso, abilitySystem)).toBe(true);
  });

  it('recorrer completo: con las 3 Habilidades, avanzar todos los pasos llega a estaCompletado === true', () => {
    const finalChallenge = new FinalChallenge();
    const progreso = new ProgressStore();
    otorgarLasTresHabilidades(progreso);

    let indice = 0;
    for (let i = 0; i < PASOS_DESAFIO_FINAL.length; i += 1) {
      const resultado = finalChallenge.avanzarPaso(indice, progreso);
      expect(resultado.avanzo).toBe(true);
      indice = resultado.siguienteIndice;
    }

    expect(finalChallenge.estaCompletado(indice)).toBe(true);
  });

  it('si falta la habilidad de un paso específico, avanzarPaso señala el faltante sin lanzar y sin avanzar el índice', () => {
    const finalChallenge = new FinalChallenge();
    const progreso = new ProgressStore();
    // Se otorgan todas menos la requerida por el primer paso, para poder
    // iniciar el desafío pero quedar bloqueado en la secuencia misma.
    const habilidadPrimerPaso = PASOS_DESAFIO_FINAL[0].habilidadRequerida;
    ['python', 'javascript', 'sql']
      .filter((h) => h !== habilidadPrimerPaso)
      .forEach((h) => progreso.otorgarHabilidad(h));

    let resultado;
    expect(() => {
      resultado = finalChallenge.avanzarPaso(0, progreso);
    }).not.toThrow();

    expect(resultado.avanzo).toBe(false);
    expect(resultado.siguienteIndice).toBe(0);
    expect(resultado.habilidadFaltante).toBe(habilidadPrimerPaso);
  });

  it('resolver marca el desafío como completado tras recorrer la secuencia completa (Requisito 10.4)', () => {
    const finalChallenge = new FinalChallenge();
    const progreso = new ProgressStore();
    otorgarLasTresHabilidades(progreso);

    let indice = 0;
    for (let i = 0; i < PASOS_DESAFIO_FINAL.length; i += 1) {
      indice = finalChallenge.avanzarPaso(indice, progreso).siguienteIndice;
    }

    const marcoCompletado = finalChallenge.resolver(indice, progreso);

    expect(marcoCompletado).toBe(true);
    expect(progreso.desafioCompletado()).toBe(true);
  });

  it('resolver NO marca el desafío como completado si la secuencia aún no se completó', () => {
    const finalChallenge = new FinalChallenge();
    const progreso = new ProgressStore();
    otorgarLasTresHabilidades(progreso);

    // Solo se avanza un paso, dejando la secuencia incompleta.
    const indiceParcial = finalChallenge.avanzarPaso(0, progreso).siguienteIndice;
    expect(finalChallenge.estaCompletado(indiceParcial)).toBe(false);

    const marcoCompletado = finalChallenge.resolver(indiceParcial, progreso);

    expect(marcoCompletado).toBe(false);
    expect(progreso.desafioCompletado()).toBe(false);
  });
});
