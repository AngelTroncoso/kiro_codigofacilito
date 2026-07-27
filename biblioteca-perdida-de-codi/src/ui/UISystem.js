/**
 * UISystem.js - Sistema_de_Interfaz (Requirements 8.1, 8.3, 8.4, Requisitos
 * funcionales 2, Compatibilidad de navegador y WebGL 2, Accesibilidad 1, 2).
 *
 * design.md describe `construirVista(progreso)` leyendo
 * `progreso.mensajeActivo()`, pero `ProgressStore` (implementado en la
 * tarea 2.1) NO expone ese método: el mensaje contextual con expiración es
 * inherentemente estado transitorio de interfaz, no progreso persistente
 * de la Sesion_de_Juego, así que se gestiona AQUÍ, dentro de `UISystem`,
 * como el único estado mutable propio de esta clase (a diferencia de
 * `MovementSystem`/`CameraSystem`/`AbilitySystem`, que no mantienen estado
 * de mundo propio). `construirVista` sigue siendo puro respecto al DOM: no
 * lo toca, solo deriva un objeto de props a partir de `progreso` y del
 * estado interno `_mensajeActivo`.
 *
 * DECISIÓN DE DISEÑO (tiempo explícito en vez de `Date.now()` interno):
 * tanto `mostrarMensaje` como `ocultarMensajeSiExpirado`/`construirVista`
 * aceptan el instante actual (`ahoraMs`) como parámetro opcional (por
 * defecto `Date.now()`), en vez de leer el reloj del sistema de forma
 * oculta. Esto permite escribir unit tests deterministas (tarea 12.5) sin
 * depender de `vi.useFakeTimers()`, simplemente pasando valores de tiempo
 * explícitos.
 */

const DURACION_MENSAJE_POR_DEFECTO_MS = 3500;
const DURACION_MENSAJE_ERROR_MS = 24 * 60 * 60 * 1000; // ~persistente: no se auto-oculta en una sesión normal

const OVERLAY_ROOT_ID = 'ui-system-overlay';

/**
 * Patrón "N/total" usado hoy por `main.js` para reportar progreso de carga
 * (p. ej. `"Cargando... 3/12"`, ver `AssetLoader.cargarTodos(onProgreso)`).
 * Se usa ÚNICAMENTE para decidir, de forma puramente presentacional, si se
 * añade la barra de progreso visual del Loader (docs/art-direction.md,
 * sección 14) bajo el texto del mensaje — no cambia el texto en sí ni
 * ningún contrato de `main.js`/`AssetLoader`.
 */
const PATRON_PROGRESO_CARGA = /(\d+)\s*\/\s*(\d+)/;

/**
 * Clase modificadora de `.hud-skill-badge` por Habilidad, para que cada una
 * tenga su propio acento de color (docs/art-direction.md, sección 6). Si
 * `habilidadId` no está en este catálogo (Habilidad futura no contemplada
 * en la dirección artística todavía), el badge conserva el acento verde
 * neutro por defecto ya definido en CSS.
 */
const CLASE_BADGE_POR_HABILIDAD = {
  python: 'hud-skill-badge--python',
  javascript: 'hud-skill-badge--javascript',
  sql: 'hud-skill-badge--sql',
};

export class UISystem {
  constructor() {
    /**
     * Mensaje contextual activo, o `null` si no hay ninguno vigente.
     * @type {{ texto: string, expiraEn: number, persistente?: boolean, esError?: boolean } | null}
     * @private
     */
    this._mensajeActivo = null;

    /**
     * Snapshot de los ids de Habilidad ya renderizados como badge en la
     * llamada anterior a `renderizarEnDOM`, usado ÚNICAMENTE para decidir
     * qué badge es "nuevo en este frame" y debe reproducir la animación de
     * entrada (`hud-skill-badge--enter`, docs/art-direction.md sección 21).
     * Es estado puramente de presentación (no afecta `ProgressStore` ni
     * ninguna lógica de juego).
     * @type {Set<string>}
     * @private
     */
    this._habilidadesYaAnimadas = new Set();

    /**
     * Índice de misión actual para tracking de progreso guiado.
     * @type {number}
     * @private
     */
    this._misionActualIndex = 0;

    /**
     * Misión inicial (Bienvenido a la Isla).
     * @type {string}
     * @private
     */
    this._MISION_INICIAL = 'Explora el entorno y encuentra tu primer Libro de Conocimiento.';

    /**
     * Estado de misión actual para mostrar en el HUD.
     * @type {{ titulo: string, descripcion: string } | null}
     * @private
     */
    this._misionActualDisplay = null;

    /**
     * Indica si el jugador ha ganado (Victoria).
     * @type {boolean}
     * @private
     */
    this._jugadorGano = false;

    /**
     * H03: AudioContext nativo para efectos de sonido sintetizados.
     * Se inicializa de forma lazy (tras primera interacción del usuario)
     * para cumplir con las políticas de autoplay de los navegadores.
     * @type {AudioContext | null}
     * @private
     */
    this._audioContext = null;

    /**
     * Indica si el AudioContext ya fue inicializado (tras primera interacción).
     * @type {boolean}
     * @private
     */
    this._audioInicializado = false;

    /**
     * Osciladores activos para la música de fondo chiptune.
     * Se mantiene referencia para poder detenerlos al mutear.
     * @type {Array<{oscilador: OscillatorNode, ganancia: GainNode}>}
     * @private
     */
    this._osciladoresMusicaActivos = [];

    /**
     * Indica si la música de fondo está reproduciéndose.
     * @type {boolean}
     * @private
     */
    this._musicaReproduciendose = false;

    /**
     * Indica si la música está en mute (silenciada por el usuario).
     * @type {boolean}
     * @private
     */
    this._musicaMuteada = false;
  }

  /**
   * Fija el mensaje contextual activo, sobrescribiendo inmediatamente
   * cualquier mensaje anterior (Requisito 8.3: "tras una nueva acción
   * relevante del Jugador" se cubre naturalmente porque esta llamada
   * siempre reemplaza el mensaje previo sin esperar su expiración).
   *
   * @param {string} texto - Texto no vacío a mostrar.
   * @param {number} [duracionMs] - Duración antes de expirar (por defecto ~3.5s).
   * @param {number} [ahoraMs] - Instante actual explícito (por defecto `Date.now()`).
   * @returns {void}
   */
  mostrarMensaje(texto, duracionMs = DURACION_MENSAJE_POR_DEFECTO_MS, ahoraMs = Date.now()) {
    this._mensajeActivo = {
      texto,
      expiraEn: ahoraMs + duracionMs,
    };
  }

  /**
   * Fija un mensaje de error (carga de assets fallida, WebGL no soportado
   * — Requisitos funcionales 2, Compatibilidad de navegador y WebGL 2).
   * Por defecto usa una duración muy larga (`persistente`) porque un error
   * bloqueante no debería auto-ocultarse mientras el Jugador aún no ha
   * podido reaccionar a él.
   *
   * @param {string} texto - Texto no vacío del mensaje de error.
   * @param {number} [ahoraMs] - Instante actual explícito (por defecto `Date.now()`).
   * @returns {void}
   */
  mostrarMensajeError(texto, ahoraMs = Date.now()) {
    this._mensajeActivo = {
      texto,
      expiraEn: ahoraMs + DURACION_MENSAJE_ERROR_MS,
      persistente: true,
      esError: true,
    };
  }

  /**
   * Limpia el mensaje activo si ya expiró respecto a `ahoraMs`.
   * @param {number} [ahoraMs] - Instante actual explícito (por defecto `Date.now()`).
   * @returns {void}
   */
  ocultarMensajeSiExpirado(ahoraMs = Date.now()) {
    if (this._mensajeActivo && ahoraMs >= this._mensajeActivo.expiraEn) {
      this._mensajeActivo = null;
    }
  }

  /**
   * Deriva las props a renderizar a partir del estado de progreso y del
   * mensaje activo interno; función PURA respecto al DOM (no lo toca).
   *
   * @param {import('../core/ProgressStore.js').ProgressStore} progreso
   * @param {number} [ahoraMs] - Instante actual explícito (por defecto `Date.now()`).
   * @returns {{ habilidadesObtenidas: Set<string>, mensajeActivo: { texto: string, expiraEn: number, persistente?: boolean, esError?: boolean } | null, misionActual: { titulo: string, descripcion: string } }}
   */
  construirVista(progreso, ahoraMs = Date.now()) {
    this.ocultarMensajeSiExpirado(ahoraMs);
    // Detectar si el jugador ganó (Desafío Final completado)
    this._jugadorGano = progreso.desafioCompletado();
    return {
      habilidadesObtenidas: progreso.habilidades(),
      mensajeActivo: this._mensajeActivo,
      misionActual: this._determinarMisionActual(progreso),
      jugadorGano: this._jugadorGano,
    };
  }

  /**
   * Determina la misión actual basándose en el estado de progreso.
   * Reutiliza ProgressStore para derivar la misión sin crear nuevo estado.
   * @param {import('../core/ProgressStore.js').ProgressStore} progreso
   * @returns {{ titulo: string, descripcion: string }}
   * @private
   */
  _determinarMisionActual(progreso) {
    // Si ya completó el desafío final
    if (progreso.desafioCompletado()) {
      return {
        titulo: '¡Biblioteca Restaurada!',
        descripcion: 'Has completado todos los objetivos. Explora libremente.',
      };
    }

    // Determinar misión basada en habilidades obtenidas
    const habilidades = Array.from(progreso.habilidades());
    
    if (habilidades.length === 0) {
      return {
        titulo: 'Misión Inicial',
        descripcion: 'Explora el entorno y encuentra tu primer Libro de Conocimiento.',
      };
    } else if (habilidades.length === 1) {
      return {
        titulo: `Misión: ${habilidades[0].toUpperCase()}`,
        descripcion: `Has obtenido ${habilidades[0]}. Usa esta habilidad para resolver mecanismos y avanzar.`,
      };
    } else if (habilidades.length === 2) {
      return {
        titulo: 'Misión: Desbloquear Zona Final',
        descripcion: 'Tienes dos habilidades. Busca el tercer libro para acceder a la Biblioteca Corrupta.',
      };
    } else if (habilidades.length === 3) {
      return {
        titulo: 'Misión: Restaurar Biblioteca',
        descripcion: 'Tienes las tres habilidades. Entra a la Biblioteca Corrupta y completa el Desafío Final.',
      };
    }

    // Fallback
    return {
      titulo: 'Exploración',
      descripcion: 'Sigue explorando la Isla y descubriendo nuevos secretos.',
    };
  }

  /**
   * Renderiza (crea o actualiza) un overlay HTML/CSS dentro de
   * `contenedorHTML`, superpuesto al canvas (posición fixed, nunca dentro
   * de la escena 3D). Idempotente: llamarlo varias veces actualiza el
   * mismo overlay (identificado por `#ui-system-overlay`) en vez de crear
   * elementos duplicados.
   *
   * Cubre:
   *   - Requisito 8.1: indicador permanente de habilidades obtenidas.
   *   - Requisito 8.4: estilo visual coherente con tono amigable/optimista.
   *   - Accesibilidad 1 (contraste): fondo oscuro semi-transparente con
   *     texto claro.
   *   - Accesibilidad 2 (no depender solo del color): el estado de cada
   *     habilidad y el mensaje se comunican siempre con texto legible,
   *     nunca solo con color/icono.
   *
   * @param {HTMLElement} contenedorHTML - Elemento del DOM donde montar el overlay.
   * @param {import('../core/ProgressStore.js').ProgressStore} progreso
   * @param {number} [ahoraMs] - Instante actual explícito (por defecto `Date.now()`).
   * @returns {void}
   */
  renderizarEnDOM(contenedorHTML, progreso, ahoraMs = Date.now()) {
    const vista = this.construirVista(progreso, ahoraMs);
    const doc = contenedorHTML.ownerDocument ?? document;

    let overlay = contenedorHTML.querySelector(`#${OVERLAY_ROOT_ID}`);
    if (!overlay) {
      // Estética "Cyber-Glassmorphism": el aspecto visual (fondo de
      // cristal translúcido, blur, bordes/sombras neón, tipografía) vive
      // en las clases CSS declaradas en `index.html` (`.hud-card`,
      // `.hud-title`, `.hud-skill-badge`, `.hud-key-badge`, etc.), NO en
      // estilos inline aquí. Esto mantiene esta clase enfocada en
      // estructura/contenido (los ids que el resto del sistema y los
      // tests dependen de) en vez de mezclar detalles visuales; solo se
      // usan estilos inline puntuales para el posicionamiento `fixed` de
      // cada tarjeta (que no es puramente estético) y para el
      // `display`/`borderLeft` dinámico del mensaje contextual.
      overlay = doc.createElement('div');
      overlay.id = OVERLAY_ROOT_ID;
      overlay.className = 'hud-overlay';
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '1000';

      const indicador = doc.createElement('div');
      indicador.id = 'ui-system-habilidades';
      indicador.className = 'hud-card hud-card--skills';
      indicador.style.position = 'fixed';
      indicador.style.top = '12px';
      indicador.style.left = '12px';
      overlay.appendChild(indicador);

      const mensaje = doc.createElement('div');
      mensaje.id = 'ui-system-mensaje';
      mensaje.className = 'hud-card hud-card--message';
      mensaje.style.position = 'fixed';
      mensaje.style.bottom = '24px';
      mensaje.style.left = '50%';
      mensaje.style.transform = 'translateX(-50%)';
      overlay.appendChild(mensaje);

      // Panel de misión actual: muestra la misión actual en tiempo real
      // se ubica debajo del mensaje contextual, a la izquierda
      const panelMision = doc.createElement('div');
      panelMision.id = 'ui-system-mision';
      panelMision.className = 'hud-card hud-card--skills';
      panelMision.style.position = 'fixed';
      panelMision.style.bottom = '12px';
      panelMision.style.left = '12px';
      panelMision.style.minWidth = '180px';
      overlay.appendChild(panelMision);

      // Botón para reiniciar juego (solo visible cuando se gana)
      const btnReiniciar = doc.createElement('button');
      btnReiniciar.id = 'ui-system-btn-reiniciar';
      btnReiniciar.className = 'btn';
      btnReiniciar.textContent = 'Volver a Jugar';
      btnReiniciar.style.position = 'fixed';
      btnReiniciar.style.bottom = '12px';
      btnReiniciar.style.left = '50%';
      btnReiniciar.style.transform = 'translateX(-50%)';
      btnReiniciar.style.marginTop = '16px';
      btnReiniciar.style.zIndex = '1001';
      btnReiniciar.style.display = 'none'; // Oculto por defecto
      overlay.appendChild(btnReiniciar);

      // Panel de controles: estático (no depende de `progreso` ni cambia
      // entre frames), se puebla una única vez aquí mismo, en la creación
      // inicial del overlay. Se ubica en la esquina inferior derecha para
      // no superponerse con el indicador de habilidades (arriba-izquierda)
      // ni con el mensaje contextual (abajo-centro).
      const panelControles = doc.createElement('div');
      panelControles.id = 'ui-system-controles';
      panelControles.className = 'hud-card hud-card--controls';
      panelControles.style.position = 'fixed';
      panelControles.style.bottom = '12px';
      panelControles.style.right = '12px';

      const tituloControles = doc.createElement('div');
      tituloControles.textContent = 'Controles';
      tituloControles.className = 'hud-title';
      panelControles.appendChild(tituloControles);

      const listaControles = doc.createElement('ul');
      listaControles.className = 'hud-controls-list';

      // Cada control se separa en {tecla, accion} para poder envolver la
      // tecla en un badge estilizado (`.hud-key-badge`) distinto del texto
      // de la acción, en vez de un único nodo de texto plano.
      const controles = [
        { tecla: 'W A S D / Flechas', accion: 'Mover' },
        { tecla: 'Espacio', accion: 'Saltar' },
        { tecla: 'Mouse', accion: 'Rotar cámara' },
        { tecla: 'E', accion: 'Interactuar / Absorber' },
      ];
      for (const { tecla, accion } of controles) {
        const item = doc.createElement('li');

        const badgeTecla = doc.createElement('span');
        badgeTecla.className = 'hud-key-badge';
        badgeTecla.textContent = tecla;
        item.appendChild(badgeTecla);

        const textoAccion = doc.createElement('span');
        textoAccion.className = 'hud-control-accion';
        textoAccion.textContent = `— ${accion}`;
        item.appendChild(textoAccion);

        listaControles.appendChild(item);
      }
      panelControles.appendChild(listaControles);

      // Botón de Mute/Unmute de música (discreto)
      const btnMute = doc.createElement('button');
      btnMute.id = 'ui-system-btn-mute';
      btnMute.className = 'btn-icon';
      btnMute.textContent = '🔊';
      btnMute.title = 'Silenciar música';
      btnMute.style.marginTop = '12px';
      btnMute.style.padding = '8px 12px';
      btnMute.style.fontSize = '18px';
      btnMute.style.cursor = 'pointer';
      btnMute.style.background = 'rgba(15, 23, 42, 0.8)';
      btnMute.style.border = '1px solid var(--hud-accent-cyan)';
      btnMute.style.borderRadius = '6px';
      btnMute.style.color = 'var(--color-text-primary)';
      btnMute.style.transition = 'all 0.2s ease';
      
      btnMute.addEventListener('click', () => {
        const muteado = this.toggleMusicaMute();
        btnMute.textContent = muteado ? '🔇' : '🔊';
        btnMute.title = muteado ? 'Activar música' : 'Silenciar música';
        this.reproducirSonidoClick();
      });

      panelControles.appendChild(btnMute);

      overlay.appendChild(panelControles);

      contenedorHTML.appendChild(overlay);
    }

    const indicador = overlay.querySelector('#ui-system-habilidades');
    // Se reconstruye el contenido del indicador con un título fijo y un
    // badge por habilidad obtenida (`.hud-skill-badge`), preservando el id
    // crudo de cada habilidad (p. ej. "python") como texto del badge, ya
    // que es el identificador estable que el resto del sistema (y los
    // tests) esperan poder ubicar dentro de `indicador.textContent`.
    indicador.textContent = '';
    const tituloHabilidades = overlay.ownerDocument.createElement('div');
    tituloHabilidades.className = 'hud-title';
    tituloHabilidades.textContent = 'Habilidades';
    indicador.appendChild(tituloHabilidades);

    if (vista.habilidadesObtenidas.size > 0) {
      for (const habilidadId of vista.habilidadesObtenidas) {
        const badge = overlay.ownerDocument.createElement('span');
        // Identidad visual por Habilidad (docs/art-direction.md sección 6):
        // cada Habilidad conocida obtiene su propia clase de acento de
        // color, además de la clase base compartida.
        const claseAcento = CLASE_BADGE_POR_HABILIDAD[habilidadId];
        badge.className = claseAcento ? `hud-skill-badge ${claseAcento}` : 'hud-skill-badge';
        // Animación de entrada ("pop", art-direction sección 21): solo se
        // aplica la primera vez que este id de Habilidad aparece en el
        // indicador; en renders posteriores del mismo frame/sesión ya no
        // se re-anima (evita reiniciar la animación en cada frame del
        // GameLoop, que llama renderizarEnDOM continuamente).
        if (!this._habilidadesYaAnimadas.has(habilidadId)) {
          badge.className += ' hud-skill-badge--enter';
          this._habilidadesYaAnimadas.add(habilidadId);
        }
        badge.textContent = habilidadId;
        indicador.appendChild(badge);
      }
    } else {
      const vacio = overlay.ownerDocument.createElement('span');
      vacio.className = 'hud-skill-empty';
      vacio.textContent = 'ninguna todavía';
      indicador.appendChild(vacio);
    }

    const mensaje = overlay.querySelector('#ui-system-mensaje');
    if (vista.mensajeActivo) {
      mensaje.textContent = vista.mensajeActivo.texto;
      mensaje.style.display = 'block';
      mensaje.style.borderLeft = vista.mensajeActivo.esError
        ? `4px solid var(--hud-accent-danger, #f87171)`
        : `4px solid var(--hud-accent-cyan, #38bdf8)`;
      mensaje.classList.toggle('is-error', Boolean(vista.mensajeActivo.esError));

      // Barra de progreso del Loader (docs/art-direction.md sección 14):
      // se añade/actualiza únicamente cuando el texto del mensaje sigue el
      // patrón "N/total" que ya usa `main.js` al reportar progreso de
      // carga (ver AssetLoader.cargarTodos/onProgreso) — es una lectura
      // puramente presentacional del texto ya existente, no un nuevo
      // contrato de datos.
      this._actualizarBarraProgreso(mensaje, vista.mensajeActivo.texto);
    } else {
      mensaje.textContent = '';
      mensaje.style.display = 'none';
      mensaje.classList.remove('is-error');
    }

    // Panel de misión actual
    const panelMision = overlay.querySelector('#ui-system-mision');
    if (panelMision) {
      panelMision.textContent = '';
      const tituloMision = overlay.ownerDocument.createElement('div');
      tituloMision.className = 'hud-title';
      tituloMision.textContent = 'Misión Actual';
      panelMision.appendChild(tituloMision);

      const textoMision = overlay.ownerDocument.createElement('div');
      textoMision.className = 'text-body';
      textoMision.style.fontSize = 'var(--font-size-body)';
      textoMision.style.lineHeight = 'var(--line-height-relaxed)';
      textoMision.style.color = 'var(--color-text-primary)';
      
      if (vista.misionActual) {
        const { titulo, descripcion } = vista.misionActual;
        textoMision.innerHTML = `
          <strong style="color: var(--color-accent-green); display: block; margin-bottom: var(--space-xs);">${titulo}</strong>
          ${descripcion}
        `;
      } else {
        textoMision.textContent = 'Explorando...';
      }
      
      panelMision.appendChild(textoMision);
    }

    // Panel de Victoria (solo visible cuando el jugador gana)
    const btnReiniciar = overlay.querySelector('#ui-system-btn-reiniciar');
    if (btnReiniciar) {
      if (vista.jugadorGano) {
        btnReiniciar.style.display = 'inline-flex';
      } else {
        btnReiniciar.style.display = 'none';
      }
    }

    // Modal de Victoria (solo visible cuando el jugador gana)
    if (vista.jugadorGano) {
      let modalVictoria = overlay.querySelector('.hud-overlay-victory');
      if (!modalVictoria) {
        modalVictoria = doc.createElement('div');
        modalVictoria.className = 'hud-overlay-victory hud-modal-victory';
        
        const modalContent = doc.createElement('div');
        modalContent.className = 'hud-card hud-card-victory';
        
        const titulo = doc.createElement('h2');
        titulo.className = 'hud-title hud-title-victory';
        titulo.textContent = '✨ ¡MISIÓN CUMPLIDA! ✨';
        titulo.style.fontSize = '36px';
        titulo.style.color = '#fbbf24';
        titulo.style.textShadow = '0 0 20px rgba(251, 191, 36, 0.8)';
        titulo.style.marginBottom = '16px';
        modalContent.appendChild(titulo);
        
        const subtitulo = doc.createElement('h3');
        subtitulo.className = 'hud-text-victory';
        subtitulo.textContent = '¡FELICIDADES CODI!';
        subtitulo.style.fontSize = '24px';
        subtitulo.style.color = '#1fce6b';
        subtitulo.style.marginBottom = '16px';
        modalContent.appendChild(subtitulo);
        
        const texto = doc.createElement('p');
        texto.className = 'hud-text-victory';
        texto.innerHTML = '¡<strong>NOS SALVASTE!</strong><br><br>Gracias a ti, la <span style="color: #38bdf8">Biblioteca Perdida</span> y todos los lenguajes de programación han sido restaurados.<br><br>Los sistemas vuelven a funcionar y el conocimiento fluye libremente.';
        texto.style.fontSize = '16px';
        texto.style.lineHeight = '1.8';
        texto.style.marginBottom = '24px';
        modalContent.appendChild(texto);
        
        const agradecimiento = doc.createElement('div');
        agradecimiento.style.fontSize = '14px';
        agradecimiento.style.color = '#94a3b8';
        agradecimiento.style.fontStyle = 'italic';
        agradecimiento.innerHTML = '~ Los Guardianes de la Biblioteca ~';
        modalContent.appendChild(agradecimiento);
        
        modalVictoria.appendChild(modalContent);
        overlay.appendChild(modalVictoria);
      }
    } else {
      // Remover el modal si el jugador no ha ganado
      const modalVictoria = overlay.querySelector('.hud-overlay-victory');
      if (modalVictoria) {
        modalVictoria.remove();
      }
    }
  }

  /**
   * Crea o actualiza la barra de progreso visual (`.hud-progress-bar`)
   * dentro de `mensajeEl` si `texto` contiene el patrón "N/total"
   * (`PATRON_PROGRESO_CARGA`), o la remueve si no lo contiene. Es un
   * detalle puramente visual (docs/art-direction.md, sección 14, "Diseño
   * del sistema de carga"): no lee ni depende de ningún estado de
   * `AssetLoader`/`ProgressStore`, solo del texto que `main.js` ya pasa a
   * `mostrarMensaje` sin cambios.
   *
   * @private
   * @param {HTMLElement} mensajeEl
   * @param {string} texto
   * @returns {void}
   */
  _actualizarBarraProgreso(mensajeEl, texto) {
    const coincidencia = texto.match(PATRON_PROGRESO_CARGA);
    let barra = mensajeEl.querySelector('.hud-progress-bar');

    if (!coincidencia) {
      barra?.remove();
      return;
    }

    const cargados = Number(coincidencia[1]);
    const total = Number(coincidencia[2]);
    const porcentaje = total > 0 ? Math.min(100, Math.max(0, (cargados / total) * 100)) : 0;

    if (!barra) {
      const doc = mensajeEl.ownerDocument;
      barra = doc.createElement('div');
      barra.className = 'hud-progress-bar';
      const relleno = doc.createElement('div');
      relleno.className = 'hud-progress-bar__fill';
      barra.appendChild(relleno);
      mensajeEl.appendChild(barra);
    }

    const relleno = barra.querySelector('.hud-progress-bar__fill');
    relleno.style.width = `${porcentaje}%`;
  }

  /**
   * H03: Inicializa el AudioContext de forma lazy (tras primera interacción del usuario).
   * Esto cumple con las políticas de autoplay de los navegadores modernos.
   * @private
   * @returns {void}
   */
  _inicializarAudio() {
    if (this._audioInicializado) return;

    try {
      // Soporte cross-browser: AudioContext o webkitAudioContext
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this._audioContext = new AudioContextClass();
        this._audioInicializado = true;
      }
    } catch (error) {
      // Si falla la inicialización, silenciosamente continúa sin audio
      // (no bloquea la experiencia de juego)
      // eslint-disable-next-line no-console
      console.warn('[UISystem] Audio no disponible:', error);
    }
  }

  /**
   * H03: Reproduce un sonido sintetizado con frecuencia y duración especificadas.
   * Helper genérico para crear efectos de sonido mediante Web Audio API.
   * @private
   * @param {number} frecuencia - Frecuencia en Hz
   * @param {number} duracion - Duración en segundos
   * @param {string} [tipo='sine'] - Tipo de onda: 'sine', 'square', 'sawtooth', 'triangle'
   * @param {number} [ganancia=0.15] - Volumen (0-1)
   * @returns {void}
   */
  _reproducirTono(frecuencia, duracion, tipo = 'sine', ganancia = 0.15) {
    this._inicializarAudio();
    
    if (!this._audioContext) return;

    try {
      const ahora = this._audioContext.currentTime;
      
      // Crear oscilador (genera la onda de sonido)
      const oscilador = this._audioContext.createOscillator();
      oscilador.type = tipo;
      oscilador.frequency.setValueAtTime(frecuencia, ahora);
      
      // Crear nodo de ganancia (controla el volumen)
      const nodoGanancia = this._audioContext.createGain();
      nodoGanancia.gain.setValueAtTime(ganancia, ahora);
      // Fade out suave para evitar "clicks" al terminar
      nodoGanancia.gain.exponentialRampToValueAtTime(0.01, ahora + duracion);
      
      // Conectar: oscilador -> ganancia -> salida
      oscilador.connect(nodoGanancia);
      nodoGanancia.connect(this._audioContext.destination);
      
      // Reproducir
      oscilador.start(ahora);
      oscilador.stop(ahora + duracion);
    } catch (error) {
      // Silenciosamente continúa si hay error (no bloquea gameplay)
      // eslint-disable-next-line no-console
      console.warn('[UISystem] Error reproduciendo audio:', error);
    }
  }

  /**
   * H03: Sonido al recoger libro/habilidad - Tono agudo y alegre ascendente.
   * Frecuencia ascendente rápida que transmite obtención de poder/conocimiento.
   * @returns {void}
   */
  reproducirSonidoRecoleccion() {
    this._inicializarAudio();
    
    if (!this._audioContext) return;

    try {
      const ahora = this._audioContext.currentTime;
      const duracion = 0.3;
      
      const oscilador = this._audioContext.createOscillator();
      oscilador.type = 'sine';
      // Frecuencia ascendente: 440 Hz (A4) -> 880 Hz (A5)
      oscilador.frequency.setValueAtTime(440, ahora);
      oscilador.frequency.exponentialRampToValueAtTime(880, ahora + duracion);
      
      const nodoGanancia = this._audioContext.createGain();
      nodoGanancia.gain.setValueAtTime(0.2, ahora);
      nodoGanancia.gain.exponentialRampToValueAtTime(0.01, ahora + duracion);
      
      oscilador.connect(nodoGanancia);
      nodoGanancia.connect(this._audioContext.destination);
      
      oscilador.start(ahora);
      oscilador.stop(ahora + duracion);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[UISystem] Error reproduciendo sonido de recolección:', error);
    }
  }

  /**
   * H03: Sonido de click para botones UI - Click sutil y corto.
   * Feedback táctil mínimo pero perceptible para interacciones de UI.
   * @returns {void}
   */
  reproducirSonidoClick() {
    this._reproducirTono(800, 0.05, 'square', 0.1);
  }

  /**
   * H03: Sonido de Victoria - Arpegio ascendente de 3 notas (fanfarria).
   * Celebración épica pero breve para el momento de Victoria.
   * @returns {void}
   */
  reproducirSonidoVictoria() {
    this._inicializarAudio();
    
    if (!this._audioContext) return;

    try {
      const ahora = this._audioContext.currentTime;
      // Arpegio Do-Mi-Sol en octava alta: C5-E5-G5
      const notas = [523.25, 659.25, 783.99]; // Hz
      const duracionNota = 0.25;
      const espacioEntreNotas = 0.15;
      
      notas.forEach((frecuencia, index) => {
        const tiempoInicio = ahora + (index * espacioEntreNotas);
        
        const oscilador = this._audioContext.createOscillator();
        oscilador.type = 'triangle';
        oscilador.frequency.setValueAtTime(frecuencia, tiempoInicio);
        
        const nodoGanancia = this._audioContext.createGain();
        nodoGanancia.gain.setValueAtTime(0.18, tiempoInicio);
        nodoGanancia.gain.exponentialRampToValueAtTime(0.01, tiempoInicio + duracionNota);
        
        oscilador.connect(nodoGanancia);
        nodoGanancia.connect(this._audioContext.destination);
        
        oscilador.start(tiempoInicio);
        oscilador.stop(tiempoInicio + duracionNota);
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[UISystem] Error reproduciendo sonido de victoria:', error);
    }
  }

  /**
   * H03: Sonido de Victoria - Arpegio ascendente de 3 notas (fanfarria).
   * Celebración épica pero breve para el momento de Victoria.
   * @returns {void}
   */
  reproducirSonidoVictoria() {
    this._inicializarAudio();
    
    if (!this._audioContext) return;

    try {
      const ahora = this._audioContext.currentTime;
      // Arpegio Do-Mi-Sol en octava alta: C5-E5-G5
      const notas = [523.25, 659.25, 783.99]; // Hz
      const duracionNota = 0.25;
      const espacioEntreNotas = 0.15;
      
      notas.forEach((frecuencia, index) => {
        const tiempoInicio = ahora + (index * espacioEntreNotas);
        
        const oscilador = this._audioContext.createOscillator();
        oscilador.type = 'triangle';
        oscilador.frequency.setValueAtTime(frecuencia, tiempoInicio);
        
        const nodoGanancia = this._audioContext.createGain();
        nodoGanancia.gain.setValueAtTime(0.18, tiempoInicio);
        nodoGanancia.gain.exponentialRampToValueAtTime(0.01, tiempoInicio + duracionNota);
        
        oscilador.connect(nodoGanancia);
        nodoGanancia.connect(this._audioContext.destination);
        
        oscilador.start(tiempoInicio);
        oscilador.stop(tiempoInicio + duracionNota);
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[UISystem] Error reproduciendo sonido de victoria:', error);
    }
  }

  /**
   * H03: Inicia la música de fondo chiptune en loop.
   * Secuencia melódica retro 8-bit que acompaña el gameplay.
   * @returns {void}
   */
  iniciarMusicaFondo() {
    if (this._musicaReproduciendose) return;
    
    this._inicializarAudio();
    
    if (!this._audioContext) return;

    try {
      // Melodía chiptune simple y pegadiza (8 notas cíclicas)
      // Escala: Do-Mi-Sol-Do (arpegio mayor) + variaciones
      const melodia = [
        { frecuencia: 523.25, duracion: 0.3 }, // C5
        { frecuencia: 659.25, duracion: 0.3 }, // E5
        { frecuencia: 783.99, duracion: 0.3 }, // G5
        { frecuencia: 1046.50, duracion: 0.3 }, // C6
        { frecuencia: 783.99, duracion: 0.3 }, // G5
        { frecuencia: 659.25, duracion: 0.3 }, // E5
        { frecuencia: 523.25, duracion: 0.3 }, // C5
        { frecuencia: 392.00, duracion: 0.6 }, // G4 (pausa larga)
      ];

      const reproducirMelodia = () => {
        if (!this._musicaReproduciendose || !this._audioContext) return;

        const ahora = this._audioContext.currentTime;
        let tiempoAcumulado = 0;

        melodia.forEach(({ frecuencia, duracion }) => {
          const tiempoInicio = ahora + tiempoAcumulado;
          
          const oscilador = this._audioContext.createOscillator();
          oscilador.type = 'square'; // Onda cuadrada = sonido chiptune clásico
          oscilador.frequency.setValueAtTime(frecuencia, tiempoInicio);
          
          const nodoGanancia = this._audioContext.createGain();
          const volumen = this._musicaMuteada ? 0 : 0.08; // Volumen bajo para no molestar
          nodoGanancia.gain.setValueAtTime(volumen, tiempoInicio);
          // Fade in/out suave
          nodoGanancia.gain.linearRampToValueAtTime(volumen * 0.8, tiempoInicio + duracion * 0.9);
          nodoGanancia.gain.exponentialRampToValueAtTime(0.01, tiempoInicio + duracion);
          
          oscilador.connect(nodoGanancia);
          nodoGanancia.connect(this._audioContext.destination);
          
          oscilador.start(tiempoInicio);
          oscilador.stop(tiempoInicio + duracion);
          
          tiempoAcumulado += duracion;
        });

        // Programar siguiente loop
        setTimeout(reproducirMelodia, tiempoAcumulado * 1000);
      };

      this._musicaReproduciendose = true;
      reproducirMelodia();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[UISystem] Error iniciando música de fondo:', error);
    }
  }

  /**
   * H03: Detiene la música de fondo.
   * @returns {void}
   */
  detenerMusicaFondo() {
    this._musicaReproduciendose = false;
    this._osciladoresMusicaActivos.forEach(({ oscilador }) => {
      try {
        oscilador.stop();
      } catch {
        // Ya detenido o no disponible
      }
    });
    this._osciladoresMusicaActivos = [];
  }

  /**
   * H03: Toggle mute de la música (silenciar/restaurar).
   * @returns {boolean} Nuevo estado de mute (true = silenciada)
   */
  toggleMusicaMute() {
    this._musicaMuteada = !this._musicaMuteada;
    return this._musicaMuteada;
  }

  /**
   * H03: Genera efecto de confeti en pantalla usando Canvas overlay.
   * Partículas de colores cayendo desde arriba de la pantalla.
   * @param {HTMLElement} contenedorHTML - Elemento donde crear el canvas de confeti
   * @returns {void}
   */
  mostrarConfeti(contenedorHTML) {
    const doc = contenedorHTML.ownerDocument ?? document;
    
    // Crear canvas de confeti sobre todo
    const canvas = doc.createElement('canvas');
    canvas.id = 'confeti-canvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    contenedorHTML.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Partículas de confeti
    const particulas = [];
    const colores = ['#FF9900', '#38bdf8', '#fbbf24', '#a855f7', '#1fce6b', '#f87171'];
    const numParticulas = 100;
    
    for (let i = 0; i < numParticulas; i += 1) {
      particulas.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height, // Empiezan arriba
        vx: (Math.random() - 0.5) * 2,
        vy: Math.random() * 3 + 2,
        color: colores[Math.floor(Math.random() * colores.length)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
      });
    }

    let frameCount = 0;
    const duracionConfeti = 5000; // 5 segundos
    const tiempoInicio = Date.now();

    const animar = () => {
      const tiempoTranscurrido = Date.now() - tiempoInicio;
      
      if (tiempoTranscurrido > duracionConfeti) {
        // Terminar animación y remover canvas
        canvas.remove();
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particulas.forEach(p => {
        // Actualizar posición
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        
        // Gravedad sutil
        p.vy += 0.05;
        
        // Rebotar en los bordes laterales
        if (p.x < 0 || p.x > canvas.width) {
          p.vx *= -1;
        }
        
        // Dibujar partícula (rectángulo rotado)
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size / 3);
        ctx.restore();
      });

      frameCount += 1;
      requestAnimationFrame(animar);
    };

    animar();
  }

  /**
   * Muestra un overlay modal de introducción estilo "AWS Cloud Terminal"
   * con el storytelling del juego, misión, controles y botón para comenzar.
   * Se monta en el DOM como overlay modal y se remueve al hacer clic en el botón.
   * 
   * @param {HTMLElement} contenedorHTML - Elemento del DOM donde montar el modal
   * @param {() => void} onStartCallback - Callback a ejecutar cuando el usuario hace clic en "Comenzar Misión"
   * @returns {void}
   */
  mostrarTerminalInicio(contenedorHTML, onStartCallback) {
    const doc = contenedorHTML.ownerDocument ?? document;

    // Crear overlay modal de pantalla completa
    const overlay = doc.createElement('div');
    overlay.id = 'terminal-inicio-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(7, 11, 25, 0.95)';
    overlay.style.zIndex = '10000';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.pointerEvents = 'auto';

    // Contenedor del terminal (estilo AWS Cloud Terminal)
    const terminal = doc.createElement('div');
    terminal.style.maxWidth = '700px';
    terminal.style.width = '90%';
    terminal.style.backgroundColor = 'rgba(15, 23, 42, 0.98)';
    terminal.style.border = '3px solid #FF9900';
    terminal.style.borderRadius = '12px';
    terminal.style.padding = '32px';
    terminal.style.boxShadow = '0 0 40px rgba(255, 153, 0, 0.5), 0 0 80px rgba(255, 153, 0, 0.2)';
    terminal.style.color = '#e2e8f0';
    terminal.style.fontFamily = "'Courier New', monospace";
    terminal.style.lineHeight = '1.8';

    // Header: Logo AWS + Título del terminal
    const header = doc.createElement('div');
    header.style.textAlign = 'center';
    header.style.marginBottom = '24px';
    header.style.borderBottom = '2px solid #FF9900';
    header.style.paddingBottom = '16px';

    const awsLogo = doc.createElement('div');
    awsLogo.style.fontSize = '20px';
    awsLogo.style.fontWeight = 'bold';
    awsLogo.style.color = '#FF9900';
    awsLogo.style.marginBottom = '8px';
    awsLogo.textContent = '☁️ AWS CLOUD TERMINAL';
    header.appendChild(awsLogo);

    terminal.appendChild(header);

    // TÍTULO: La Biblioteca Perdida de Codi
    const titulo = doc.createElement('h1');
    titulo.style.fontSize = '28px';
    titulo.style.fontWeight = 'bold';
    titulo.style.color = '#38bdf8';
    titulo.style.textAlign = 'center';
    titulo.style.marginBottom = '24px';
    titulo.style.textShadow = '0 0 10px rgba(56, 189, 248, 0.5)';
    titulo.textContent = 'LA BIBLIOTECA PERDIDA DE CODI';
    terminal.appendChild(titulo);

    // HISTORIA
    const seccionHistoria = doc.createElement('div');
    seccionHistoria.style.marginBottom = '20px';

    const labelHistoria = doc.createElement('div');
    labelHistoria.style.color = '#FF9900';
    labelHistoria.style.fontWeight = 'bold';
    labelHistoria.style.marginBottom = '8px';
    labelHistoria.textContent = '> HISTORIA_';
    seccionHistoria.appendChild(labelHistoria);

    const textoHistoria = doc.createElement('div');
    textoHistoria.style.color = '#cbd5e1';
    textoHistoria.style.paddingLeft = '16px';
    textoHistoria.style.fontSize = '14px';
    textoHistoria.innerHTML = 'La fuente del conocimiento digital ha sido fragmentada y los lenguajes ancestrales se han perdido en las sombras de la <span style="color: #c084fc">corrupción</span>.';
    seccionHistoria.appendChild(textoHistoria);

    terminal.appendChild(seccionHistoria);

    // MISIÓN
    const seccionMision = doc.createElement('div');
    seccionMision.style.marginBottom = '20px';

    const labelMision = doc.createElement('div');
    labelMision.style.color = '#FF9900';
    labelMision.style.fontWeight = 'bold';
    labelMision.style.marginBottom = '8px';
    labelMision.textContent = '> MISIÓN_';
    seccionMision.appendChild(labelMision);

    const textoMision = doc.createElement('div');
    textoMision.style.color = '#cbd5e1';
    textoMision.style.paddingLeft = '16px';
    textoMision.style.fontSize = '14px';
    textoMision.innerHTML = 'Encarnas a <span style="color: #1fce6b; font-weight: bold;">Codi</span>. Explora la isla, recupera los <span style="color: #38bdf8">libros de habilidades</span> (<span style="color: #fbbf24">Python</span>, <span style="color: #fbbf24">JavaScript</span>, <span style="color: #fbbf24">SQL</span>) y restaura la Biblioteca.';
    seccionMision.appendChild(textoMision);

    terminal.appendChild(seccionMision);

    // CONTROLES
    const seccionControles = doc.createElement('div');
    seccionControles.style.marginBottom = '28px';

    const labelControles = doc.createElement('div');
    labelControles.style.color = '#FF9900';
    labelControles.style.fontWeight = 'bold';
    labelControles.style.marginBottom = '8px';
    labelControles.textContent = '> CONTROLES_';
    seccionControles.appendChild(labelControles);

    const listaControles = doc.createElement('ul');
    listaControles.style.listStyle = 'none';
    listaControles.style.padding = '0';
    listaControles.style.paddingLeft = '16px';
    listaControles.style.fontSize = '14px';

    const controles = [
      { tecla: 'WASD / Flechas', accion: 'Mover' },
      { tecla: 'Espacio', accion: 'Saltar' },
      { tecla: 'Mouse', accion: 'Rotar cámara' },
      { tecla: 'E', accion: 'Absorber/Interactuar' },
    ];

    for (const { tecla, accion } of controles) {
      const item = doc.createElement('li');
      item.style.marginBottom = '6px';
      item.style.color = '#cbd5e1';
      item.innerHTML = `<span style="color: #22d3ee; font-weight: bold;">${tecla}</span> → ${accion}`;
      listaControles.appendChild(item);
    }

    seccionControles.appendChild(listaControles);
    terminal.appendChild(seccionControles);

    // BOTÓN: Comenzar Misión
    const boton = doc.createElement('button');
    boton.id = 'btn-comenzar-mision';
    boton.textContent = '▶ COMENZAR MISIÓN';
    boton.style.display = 'block';
    boton.style.width = '100%';
    boton.style.padding = '16px';
    boton.style.fontSize = '18px';
    boton.style.fontWeight = 'bold';
    boton.style.color = '#0f172a';
    boton.style.backgroundColor = '#FF9900';
    boton.style.border = 'none';
    boton.style.borderRadius = '8px';
    boton.style.cursor = 'pointer';
    boton.style.fontFamily = "'Courier New', monospace";
    boton.style.textTransform = 'uppercase';
    boton.style.letterSpacing = '1px';
    boton.style.boxShadow = '0 4px 20px rgba(255, 153, 0, 0.4)';
    boton.style.transition = 'all 0.2s ease';

    // Hover effect (inline para evitar crear CSS externo)
    boton.addEventListener('mouseenter', () => {
      boton.style.backgroundColor = '#FFB84D';
      boton.style.transform = 'translateY(-2px)';
      boton.style.boxShadow = '0 6px 30px rgba(255, 153, 0, 0.6)';
    });

    boton.addEventListener('mouseleave', () => {
      boton.style.backgroundColor = '#FF9900';
      boton.style.transform = 'translateY(0)';
      boton.style.boxShadow = '0 4px 20px rgba(255, 153, 0, 0.4)';
    });

    boton.addEventListener('click', () => {
      // Reproducir sonido de click
      this.reproducirSonidoClick();
      
      // Iniciar música de fondo chiptune
      this.iniciarMusicaFondo();
      
      // Remover el overlay del DOM
      overlay.remove();
      
      // Ejecutar el callback
      if (onStartCallback) {
        onStartCallback();
      }
    });

    terminal.appendChild(boton);
    overlay.appendChild(terminal);
    contenedorHTML.appendChild(overlay);
  }
}
