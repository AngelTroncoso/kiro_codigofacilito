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
        titulo.textContent = '¡MISIÓN CUMPLIDA!';
        modalContent.appendChild(titulo);
        
        const texto = doc.createElement('p');
        texto.className = 'hud-text-victory';
        texto.textContent = 'La Biblioteca ha sido salvada. Codi ha restaurado todo el conocimiento perdido.';
        modalContent.appendChild(texto);
        
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
}
