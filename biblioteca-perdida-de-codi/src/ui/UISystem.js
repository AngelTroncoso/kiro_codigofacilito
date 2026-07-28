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

    /**
     * ID del timeout del loop de música de fondo, para poder cancelarlo.
     * @type {number | null}
     * @private
     */
    this._timeoutMusicaId = null;

    /**
     * Callback para centrar la cámara detrás de Codi (llamado desde el botón HUD).
     * @type {(() => void) | null}
     * @private
     */
    this._onCentrarCamaraCallback = null;
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

      // Botón de Centrar Cámara (alineación automática)
      const btnCentrarCamara = doc.createElement('button');
      btnCentrarCamara.id = 'ui-system-btn-centrar-camara';
      btnCentrarCamara.className = 'btn-icon';
      btnCentrarCamara.textContent = '🎯';
      btnCentrarCamara.title = 'Centrar cámara detrás de Codi';
      btnCentrarCamara.style.marginTop = '8px';
      btnCentrarCamara.style.padding = '8px 12px';
      btnCentrarCamara.style.fontSize = '18px';
      btnCentrarCamara.style.cursor = 'pointer';
      btnCentrarCamara.style.background = 'rgba(15, 23, 42, 0.8)';
      btnCentrarCamara.style.border = '1px solid var(--hud-accent-cyan)';
      btnCentrarCamara.style.borderRadius = '6px';
      btnCentrarCamara.style.color = 'var(--color-text-primary)';
      btnCentrarCamara.style.transition = 'all 0.2s ease';
      btnCentrarCamara.style.pointerEvents = 'auto';
      
      btnCentrarCamara.addEventListener('click', () => {
        if (this._onCentrarCamaraCallback) {
          this._onCentrarCamaraCallback();
        }
        this.reproducirSonidoClick();
      });

      panelControles.appendChild(btnCentrarCamara);

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
   * H03: Fanfarria de Victoria - Secuencia épica triunfal estilo 8-bit.
   * Melodía ascendente celebratoria que reemplaza la música de fondo al ganar.
   * @returns {void}
   */
  reproducirFanfarriaVictoria() {
    this._inicializarAudio();
    
    if (!this._audioContext) return;

    try {
      const ahora = this._audioContext.currentTime;
      
      // Fanfarria épica triunfal: Do-Mi-Sol-Do (arpegio ascendente) + acorde final
      // Frecuencias en Hz: C5, E5, G5, C6, E6, G6 (octavas altas para efecto triunfal)
      const fanfarria = [
        { frecuencia: 523.25, duracion: 0.2, volumen: 0.25 },  // C5
        { frecuencia: 659.25, duracion: 0.2, volumen: 0.25 },  // E5
        { frecuencia: 783.99, duracion: 0.2, volumen: 0.25 },  // G5
        { frecuencia: 1046.50, duracion: 0.3, volumen: 0.28 }, // C6 (más largo)
        { frecuencia: 1318.51, duracion: 0.3, volumen: 0.28 }, // E6
        { frecuencia: 1567.98, duracion: 0.5, volumen: 0.30 }, // G6 (final épico largo)
      ];
      
      let tiempoAcumulado = 0;
      
      fanfarria.forEach(({ frecuencia, duracion, volumen }) => {
        const tiempoInicio = ahora + tiempoAcumulado;
        
        const oscilador = this._audioContext.createOscillator();
        oscilador.type = 'square'; // Onda cuadrada = chiptune clásico
        oscilador.frequency.setValueAtTime(frecuencia, tiempoInicio);
        
        const nodoGanancia = this._audioContext.createGain();
        nodoGanancia.gain.setValueAtTime(volumen, tiempoInicio);
        // Fade out en el último 20% de la nota
        nodoGanancia.gain.linearRampToValueAtTime(volumen * 0.7, tiempoInicio + duracion * 0.8);
        nodoGanancia.gain.exponentialRampToValueAtTime(0.01, tiempoInicio + duracion);
        
        oscilador.connect(nodoGanancia);
        nodoGanancia.connect(this._audioContext.destination);
        
        oscilador.start(tiempoInicio);
        oscilador.stop(tiempoInicio + duracion);
        
        tiempoAcumulado += duracion * 0.9; // Ligero solapamiento entre notas
      });

      // Acorde final triunfal (Do mayor octava alta: C6 + E6 + G6 simultáneos)
      const tiempoAcordeFinal = ahora + tiempoAcumulado;
      const duracionAcorde = 1.0;
      const acordeMayor = [1046.50, 1318.51, 1567.98]; // C6, E6, G6
      
      acordeMayor.forEach(frecuencia => {
        const oscilador = this._audioContext.createOscillator();
        oscilador.type = 'square';
        oscilador.frequency.setValueAtTime(frecuencia, tiempoAcordeFinal);
        
        const nodoGanancia = this._audioContext.createGain();
        nodoGanancia.gain.setValueAtTime(0.15, tiempoAcordeFinal);
        nodoGanancia.gain.linearRampToValueAtTime(0.15, tiempoAcordeFinal + duracionAcorde * 0.7);
        nodoGanancia.gain.exponentialRampToValueAtTime(0.01, tiempoAcordeFinal + duracionAcorde);
        
        oscilador.connect(nodoGanancia);
        nodoGanancia.connect(this._audioContext.destination);
        
        oscilador.start(tiempoAcordeFinal);
        oscilador.stop(tiempoAcordeFinal + duracionAcorde);
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[UISystem] Error reproduciendo fanfarria de victoria:', error);
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

        // Programar siguiente loop (guardar ID para poder cancelarlo)
        this._timeoutMusicaId = setTimeout(reproducirMelodia, tiempoAcumulado * 1000);
      };

      this._musicaReproduciendose = true;
      reproducirMelodia();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[UISystem] Error iniciando música de fondo:', error);
    }
  }

  /**
   * H03: Detiene la música de fondo inmediatamente.
   * Cancela el loop y limpia todos los osciladores activos.
   * @returns {void}
   */
  detenerMusicaFondo() {
    this._musicaReproduciendose = false;
    
    // Cancelar el timeout del loop
    if (this._timeoutMusicaId !== null) {
      clearTimeout(this._timeoutMusicaId);
      this._timeoutMusicaId = null;
    }
    
    // Detener osciladores activos (si los hubiera guardados)
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
   * Muestra un overlay modal de introducción estilo Portada de Videojuego Comercial
   * con arte oficial de Codi (codi-cover.jpg), storytelling, controles y botón para comenzar.
   * Layout de 2 columnas: Arte izquierda, Info derecha (responsive: stack vertical en móvil).
   * 
   * @param {HTMLElement} contenedorHTML - Elemento del DOM donde montar el modal
   * @param {() => void} onStartCallback - Callback a ejecutar cuando el usuario hace clic en "Comenzar Misión"
   * @returns {void}
   */
  mostrarTerminalInicio(contenedorHTML, onStartCallback) {
    const doc = contenedorHTML.ownerDocument ?? document;

    // Crear overlay modal de pantalla completa con backdrop blur
    const overlay = doc.createElement('div');
    overlay.id = 'terminal-inicio-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(7, 11, 25, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      padding: 20px;
      opacity: 0;
      animation: fadeInScale 0.6s ease-out forwards;
    `;

    // Inyectar animaciones CSS (solo una vez)
    if (!doc.getElementById('game-cover-animations')) {
      const style = doc.createElement('style');
      style.id = 'game-cover-animations';
      style.textContent = `
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(56, 189, 248, 0.4); }
          50% { box-shadow: 0 0 30px rgba(56, 189, 248, 0.7), 0 0 40px rgba(255, 153, 0, 0.3); }
        }
        @keyframes buttonPulse {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-2px) scale(1.02); }
        }
        @media (max-width: 768px) {
          .modal-container-two-col {
            flex-direction: column !important;
          }
          .modal-col-left {
            min-width: 100% !important;
          }
        }
      `;
      doc.head.appendChild(style);
    }

    // Contenedor principal de 2 columnas
    const container = doc.createElement('div');
    container.className = 'modal-container-two-col';
    container.style.cssText = `
      display: flex;
      flex-direction: row;
      gap: 2.5rem;
      align-items: center;
      max-width: 1200px;
      width: 95vw;
      max-height: 90vh;
      padding: 2.5rem;
      background: rgba(15, 23, 42, 0.95);
      border: 2px solid #FF9900;
      box-shadow: 0 0 30px rgba(255, 153, 0, 0.3);
      border-radius: 16px;
    `;

    // ========== COLUMNA IZQUIERDA: ARTE DE CODI ==========
    const columnaIzquierda = doc.createElement('div');
    columnaIzquierda.className = 'modal-col-left';
    columnaIzquierda.style.cssText = `
      flex: 1;
      min-width: 340px;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const imagenCodi = doc.createElement('img');
    imagenCodi.src = '/codi-cover.jpg';
    imagenCodi.alt = 'Codi y la Biblioteca Perdida';
    imagenCodi.style.cssText = `
      width: 100%;
      height: 100%;
      max-height: 580px;
      object-fit: contain;
      border-radius: 12px;
      border: 2px solid #38bdf8;
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
      animation: pulse 3s ease-in-out infinite;
    `;

    // Fallback mejorado si la imagen no carga
    imagenCodi.addEventListener('error', () => {
      columnaIzquierda.innerHTML = `
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 380px;
          padding: 40px;
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%);
          border-radius: 12px;
          border: 2px solid #38bdf8;
          box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
        ">
          <div style="
            font-size: 120px;
            line-height: 1;
            margin-bottom: 20px;
            filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.5));
          ">🐊</div>
          <div style="
            font-size: 32px;
            font-weight: 900;
            color: #38bdf8;
            text-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
            letter-spacing: 3px;
          ">CODI</div>
          <div style="
            font-size: 14px;
            color: #cbd5e1;
            margin-top: 12px;
            text-align: center;
            max-width: 250px;
          ">El guardián del conocimiento digital</div>
        </div>
      `;
    });

    columnaIzquierda.appendChild(imagenCodi);
    container.appendChild(columnaIzquierda);

    // ========== COLUMNA DERECHA: INFORMACIÓN DEL JUEGO ==========
    const columnaDerecha = doc.createElement('div');
    columnaDerecha.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      color: #e2e8f0;
      font-family: 'Segoe UI', 'Arial', sans-serif;
    `;

    // Badge AWS Cloud Terminal
    const badge = doc.createElement('div');
    badge.style.cssText = `
      display: inline-block;
      padding: 8px 16px;
      background-color: rgba(255, 153, 0, 0.2);
      border: 2px solid #FF9900;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
      color: #FF9900;
      text-transform: uppercase;
      letter-spacing: 1px;
      align-self: flex-start;
    `;
    badge.textContent = '☁️ AWS CLOUD TERMINAL v1.0';
    columnaDerecha.appendChild(badge);

    // Título
    const titulo = doc.createElement('h1');
    titulo.style.cssText = `
      font-size: 40px;
      font-weight: 900;
      color: #fbbf24;
      margin: 0;
      text-shadow: 0 0 20px rgba(251, 191, 36, 0.8);
      line-height: 1.1;
      text-transform: uppercase;
      letter-spacing: 2px;
    `;
    titulo.innerHTML = 'CODI <span style="color: #38bdf8;">Y LA</span><br>BIBLIOTECA PERDIDA';
    columnaDerecha.appendChild(titulo);

    // Lore & Misión
    const lore = doc.createElement('div');
    lore.style.cssText = `
      color: #cbd5e1;
      font-size: 15px;
      line-height: 1.7;
    `;
    lore.innerHTML = `
      <p style="margin: 0 0 12px 0;">
        La <strong style="color: #38bdf8;">fuente del conocimiento digital</strong> ha sido fragmentada. 
        Los lenguajes ancestrales se han perdido en las sombras de la <strong style="color: #c084fc;">corrupción</strong>.
      </p>
      <p style="margin: 0;">
        Encarnas a <strong style="color: #1fce6b;">Codi</strong>. Explora la isla, recupera los 
        <strong style="color: #fbbf24;">libros de habilidades</strong> (Python, JavaScript, SQL) y restaura la Biblioteca.
      </p>
    `;
    columnaDerecha.appendChild(lore);

    // Tarjeta de Controles
    const tarjetaControles = doc.createElement('div');
    tarjetaControles.style.cssText = `
      background-color: rgba(56, 189, 248, 0.1);
      border: 2px solid rgba(56, 189, 248, 0.3);
      border-radius: 12px;
      padding: 18px 22px;
    `;

    const tituloControles = doc.createElement('div');
    tituloControles.style.cssText = `
      font-size: 13px;
      font-weight: bold;
      color: #38bdf8;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
    `;
    tituloControles.textContent = '⌨️ CONTROLES';
    tarjetaControles.appendChild(tituloControles);

    const listaControles = doc.createElement('div');
    listaControles.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      font-size: 13px;
    `;

    const controles = [
      { tecla: 'WASD', accion: 'Mover' },
      { tecla: 'Espacio', accion: 'Saltar' },
      { tecla: 'Mouse', accion: 'Cámara' },
      { tecla: 'E', accion: 'Interactuar' },
    ];

    for (const { tecla, accion } of controles) {
      const item = doc.createElement('div');
      item.style.color = '#cbd5e1';
      item.innerHTML = `<strong style="color: #22d3ee;">${tecla}</strong> · ${accion}`;
      listaControles.appendChild(item);
    }

    tarjetaControles.appendChild(listaControles);
    columnaDerecha.appendChild(tarjetaControles);

    // Botón "▶ COMENZAR MISIÓN"
    const boton = doc.createElement('button');
    boton.id = 'btn-comenzar-mision';
    boton.textContent = '▶ COMENZAR MISIÓN';
    boton.style.cssText = `
      width: 100%;
      padding: 18px;
      font-size: 19px;
      font-weight: 900;
      color: #0f172a;
      background-color: #FF9900;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 2px;
      box-shadow: 0 8px 24px rgba(255, 153, 0, 0.6);
      transition: all 0.3s ease;
      animation: buttonPulse 2s ease-in-out infinite;
    `;

    // Hover effects
    boton.addEventListener('mouseenter', () => {
      boton.style.backgroundColor = '#FFB84D';
      boton.style.transform = 'translateY(-4px) scale(1.02)';
      boton.style.boxShadow = '0 12px 32px rgba(255, 153, 0, 0.8)';
      boton.style.animation = 'none';
    });

    boton.addEventListener('mouseleave', () => {
      boton.style.backgroundColor = '#FF9900';
      boton.style.transform = 'translateY(0) scale(1)';
      boton.style.boxShadow = '0 8px 24px rgba(255, 153, 0, 0.6)';
      boton.style.animation = 'buttonPulse 2s ease-in-out infinite';
    });

    boton.addEventListener('click', () => {
      // Reproducir sonido de click
      this.reproducirSonidoClick();
      
      // Iniciar música de fondo chiptune
      this.iniciarMusicaFondo();
      
      // Animación de salida suave
      overlay.style.opacity = '0';
      overlay.style.transform = 'scale(0.95)';
      overlay.style.transition = 'all 0.3s ease-out';
      
      setTimeout(() => {
        overlay.remove();
        
        // Ejecutar el callback
        if (onStartCallback) {
          onStartCallback();
        }
      }, 300);
    });

    columnaDerecha.appendChild(boton);
    container.appendChild(columnaDerecha);
    overlay.appendChild(container);
    contenedorHTML.appendChild(overlay);
  }

  /**
   * Registra el callback que se ejecutará al hacer clic en el botón "Centrar Cámara" del HUD.
   * @param {() => void} callback - Función a ejecutar para centrar la cámara detrás de Codi
   * @returns {void}
   */
  registrarCallbackCentrarCamara(callback) {
    this._onCentrarCamaraCallback = callback;
  }
}
