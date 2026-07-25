import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  test: {
    // Todavía no hay tests (se agregan en tareas posteriores);
    // esto evita que `vitest run` falle por ausencia de archivos de test.
    passWithNoTests: true,
    // `jsdom` provee un `window`/`document` simulado, necesario para testear
    // proveedores de entrada basados en eventos DOM (p.ej.
    // `KeyboardMouseInputProvider`) sin un navegador real.
    environment: 'jsdom',
  },
});
