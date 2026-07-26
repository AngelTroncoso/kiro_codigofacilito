import { describe, it, expect } from 'vitest';
import { UISystem } from '../../src/ui/UISystem.js';
import { ProgressStore } from '../../src/core/ProgressStore.js';

/**
 * Nota de diseño: `UISystem` acepta el instante actual (`ahoraMs`) como
 * parámetro explícito en vez de leer `Date.now()` internamente. Esto
 * permite escribir estos tests de forma determinista sin `vi.useFakeTimers()`,
 * simplemente avanzando un contador de tiempo simulado a mano.
 */
describe('UISystem - unit tests', () => {
  it('tras mostrarMensaje, construirVista muestra mensajeActivo con ese texto antes de expirar', () => {
    const uiSystem = new UISystem();
    const progreso = new ProgressStore();
    const t0 = 1000;

    uiSystem.mostrarMensaje('¡Has encontrado algo interesante!', 1000, t0);

    const vista = uiSystem.construirVista(progreso, t0 + 500); // antes de expirar (t0 + 1000)

    expect(vista.mensajeActivo).not.toBeNull();
    expect(vista.mensajeActivo.texto).toBe('¡Has encontrado algo interesante!');
  });

  it('tras avanzar el tiempo simulado más allá de la expiración, el mensaje ya no aparece', () => {
    const uiSystem = new UISystem();
    const progreso = new ProgressStore();
    const t0 = 1000;

    uiSystem.mostrarMensaje('Mensaje breve', 1000, t0);

    const vista = uiSystem.construirVista(progreso, t0 + 1500); // después de expirar (t0 + 1000)

    expect(vista.mensajeActivo).toBeNull();
  });

  it('llamar mostrarMensaje de nuevo antes de expirar sobrescribe inmediatamente el mensaje anterior (Requisito 8.3)', () => {
    const uiSystem = new UISystem();
    const progreso = new ProgressStore();
    const t0 = 1000;

    uiSystem.mostrarMensaje('Primer mensaje', 5000, t0);
    uiSystem.mostrarMensaje('Segundo mensaje (nueva acción relevante)', 5000, t0 + 100);

    const vista = uiSystem.construirVista(progreso, t0 + 200);

    expect(vista.mensajeActivo.texto).toBe('Segundo mensaje (nueva acción relevante)');
  });

  it('renderizarEnDOM no lanza excepción y produce un overlay con al menos un elemento visible con texto', () => {
    const uiSystem = new UISystem();
    const progreso = new ProgressStore();
    progreso.otorgarHabilidad('python');

    const t0 = 1000;
    uiSystem.mostrarMensaje('¡Has absorbido Python!', 3000, t0);

    const contenedor = document.createElement('div');

    expect(() => uiSystem.renderizarEnDOM(contenedor, progreso, t0 + 100)).not.toThrow();

    const overlay = contenedor.querySelector('#ui-system-overlay');
    expect(overlay).not.toBeNull();

    const indicador = overlay.querySelector('#ui-system-habilidades');
    expect(indicador.textContent).toContain('python');

    const mensaje = overlay.querySelector('#ui-system-mensaje');
    expect(mensaje.textContent).toBe('¡Has absorbido Python!');
    expect(mensaje.style.display).toBe('block');
  });

  it('renderizarEnDOM es idempotente: llamarlo varias veces no crea overlays duplicados', () => {
    const uiSystem = new UISystem();
    const progreso = new ProgressStore();
    const contenedor = document.createElement('div');

    uiSystem.renderizarEnDOM(contenedor, progreso, 1000);
    uiSystem.renderizarEnDOM(contenedor, progreso, 1100);
    uiSystem.renderizarEnDOM(contenedor, progreso, 1200);

    const overlays = contenedor.querySelectorAll('#ui-system-overlay');
    expect(overlays.length).toBe(1);

    const panelesControles = contenedor.querySelectorAll('#ui-system-controles');
    expect(panelesControles.length).toBe(1);
  });

  it('renderizarEnDOM crea un panel de controles con la lista de controles esperada', () => {
    const uiSystem = new UISystem();
    const progreso = new ProgressStore();
    const contenedor = document.createElement('div');

    uiSystem.renderizarEnDOM(contenedor, progreso, 1000);

    const panelControles = contenedor.querySelector('#ui-system-controles');
    expect(panelControles).not.toBeNull();
    expect(panelControles.textContent).toContain('Controles');
    expect(panelControles.textContent).toContain('Mover');
    expect(panelControles.textContent).toContain('Saltar');
    expect(panelControles.textContent).toContain('Rotar cámara');
    expect(panelControles.textContent).toContain('Interactuar');
  });

  it('renderizarEnDOM aplica las clases del estilo Cyber-Glassmorphism a las tarjetas HUD (Panel de Habilidades, Mensaje, Controles)', () => {
    const uiSystem = new UISystem();
    const progreso = new ProgressStore();
    progreso.otorgarHabilidad('python');
    const contenedor = document.createElement('div');

    uiSystem.mostrarMensaje('Mensaje de prueba', 3000, 1000);
    uiSystem.renderizarEnDOM(contenedor, progreso, 1000);

    const indicador = contenedor.querySelector('#ui-system-habilidades');
    const mensaje = contenedor.querySelector('#ui-system-mensaje');
    const panelControles = contenedor.querySelector('#ui-system-controles');

    // Las tres tarjetas HUD comparten la clase base .hud-card (fondo de
    // cristal + blur + borde + sombra, definidos en index.html).
    expect(indicador.classList.contains('hud-card')).toBe(true);
    expect(mensaje.classList.contains('hud-card')).toBe(true);
    expect(panelControles.classList.contains('hud-card')).toBe(true);

    // El indicador de habilidades usa un badge dedicado (verde Codi) por
    // cada habilidad obtenida, conservando el id crudo como texto.
    const badgeHabilidad = indicador.querySelector('.hud-skill-badge');
    expect(badgeHabilidad).not.toBeNull();
    expect(badgeHabilidad.textContent).toBe('python');

    // El panel de controles resalta cada tecla dentro de un badge propio
    // (`.hud-key-badge`), separado del texto de la acción.
    const badgesTeclas = panelControles.querySelectorAll('.hud-key-badge');
    expect(badgesTeclas.length).toBe(4);
    expect(Array.from(badgesTeclas).map((b) => b.textContent)).toEqual([
      'W A S D / Flechas',
      'Espacio',
      'Mouse',
      'E',
    ]);

    // Los títulos de las tarjetas usan el acento cian neón (.hud-title).
    expect(indicador.querySelector('.hud-title')).not.toBeNull();
    expect(panelControles.querySelector('.hud-title')).not.toBeNull();
  });

  it('cuando no hay habilidades obtenidas, el indicador muestra el estado vacío ("ninguna todavía") sin badges', () => {
    const uiSystem = new UISystem();
    const progreso = new ProgressStore();
    const contenedor = document.createElement('div');

    uiSystem.renderizarEnDOM(contenedor, progreso, 1000);

    const indicador = contenedor.querySelector('#ui-system-habilidades');
    expect(indicador.textContent).toContain('ninguna todavía');
    expect(indicador.querySelector('.hud-skill-badge')).toBeNull();
    expect(indicador.querySelector('.hud-skill-empty')).not.toBeNull();
  });

  describe('Visual Foundation (SPEC-02): identidad por Habilidad, animación de entrada y barra de progreso', () => {
    it('cada badge de Habilidad conocida recibe su clase de acento (python/javascript/sql) además de la clase base', () => {
      const uiSystem = new UISystem();
      const progreso = new ProgressStore();
      progreso.otorgarHabilidad('python');
      progreso.otorgarHabilidad('javascript');
      progreso.otorgarHabilidad('sql');
      const contenedor = document.createElement('div');

      uiSystem.renderizarEnDOM(contenedor, progreso, 1000);

      const indicador = contenedor.querySelector('#ui-system-habilidades');
      const badgePython = Array.from(indicador.querySelectorAll('.hud-skill-badge')).find(
        (b) => b.textContent === 'python'
      );
      const badgeJs = Array.from(indicador.querySelectorAll('.hud-skill-badge')).find(
        (b) => b.textContent === 'javascript'
      );
      const badgeSql = Array.from(indicador.querySelectorAll('.hud-skill-badge')).find(
        (b) => b.textContent === 'sql'
      );

      expect(badgePython.classList.contains('hud-skill-badge--python')).toBe(true);
      expect(badgeJs.classList.contains('hud-skill-badge--javascript')).toBe(true);
      expect(badgeSql.classList.contains('hud-skill-badge--sql')).toBe(true);
    });

    it('un badge nuevo recibe la clase de animación de entrada solo en el frame en que aparece, no en renders posteriores', () => {
      const uiSystem = new UISystem();
      const progreso = new ProgressStore();
      const contenedor = document.createElement('div');

      progreso.otorgarHabilidad('python');
      uiSystem.renderizarEnDOM(contenedor, progreso, 1000);
      let badge = contenedor.querySelector('#ui-system-habilidades .hud-skill-badge');
      expect(badge.classList.contains('hud-skill-badge--enter')).toBe(true);

      // Segundo render del mismo frame lógico (el GameLoop llama
      // renderizarEnDOM continuamente): el mismo badge ya no debe volver a
      // marcarse como "recién aparecido".
      uiSystem.renderizarEnDOM(contenedor, progreso, 1100);
      badge = contenedor.querySelector('#ui-system-habilidades .hud-skill-badge');
      expect(badge.classList.contains('hud-skill-badge--enter')).toBe(false);
    });

    it('un mensaje de error recibe la clase is-error; un mensaje normal no la recibe', () => {
      const uiSystem = new UISystem();
      const progreso = new ProgressStore();
      const contenedor = document.createElement('div');

      uiSystem.mostrarMensajeError('Algo salió mal', 1000);
      uiSystem.renderizarEnDOM(contenedor, progreso, 1000);
      expect(contenedor.querySelector('#ui-system-mensaje').classList.contains('is-error')).toBe(true);

      uiSystem.mostrarMensaje('Todo bien', 3000, 2000);
      uiSystem.renderizarEnDOM(contenedor, progreso, 2000);
      expect(contenedor.querySelector('#ui-system-mensaje').classList.contains('is-error')).toBe(false);
    });

    it('un mensaje con patrón "N/total" (progreso de carga) agrega una barra de progreso con el ancho correspondiente', () => {
      const uiSystem = new UISystem();
      const progreso = new ProgressStore();
      const contenedor = document.createElement('div');

      uiSystem.mostrarMensaje('Cargando... 3/12', 60000, 1000);
      uiSystem.renderizarEnDOM(contenedor, progreso, 1000);

      const mensaje = contenedor.querySelector('#ui-system-mensaje');
      // El texto visible no cambia (mismo contrato que main.js ya usa).
      expect(mensaje.textContent).toContain('Cargando... 3/12');

      const barra = mensaje.querySelector('.hud-progress-bar');
      expect(barra).not.toBeNull();
      const relleno = barra.querySelector('.hud-progress-bar__fill');
      expect(relleno.style.width).toBe('25%');
    });

    it('un mensaje sin patrón "N/total" no tiene barra de progreso', () => {
      const uiSystem = new UISystem();
      const progreso = new ProgressStore();
      const contenedor = document.createElement('div');

      uiSystem.mostrarMensaje('¡Has absorbido Python!', 3000, 1000);
      uiSystem.renderizarEnDOM(contenedor, progreso, 1000);

      const mensaje = contenedor.querySelector('#ui-system-mensaje');
      expect(mensaje.querySelector('.hud-progress-bar')).toBeNull();
    });

    it('la barra de progreso se remueve al pasar de un mensaje de carga a uno sin progreso', () => {
      const uiSystem = new UISystem();
      const progreso = new ProgressStore();
      const contenedor = document.createElement('div');

      uiSystem.mostrarMensaje('Cargando... 1/4', 60000, 1000);
      uiSystem.renderizarEnDOM(contenedor, progreso, 1000);
      expect(contenedor.querySelector('#ui-system-mensaje .hud-progress-bar')).not.toBeNull();

      uiSystem.mostrarMensaje('¡Listo!', 3000, 2000);
      uiSystem.renderizarEnDOM(contenedor, progreso, 2000);
      expect(contenedor.querySelector('#ui-system-mensaje .hud-progress-bar')).toBeNull();
    });
  });
});
