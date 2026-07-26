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
   * @returns {{ habilidadesObtenidas: Set<string>, mensajeActivo: { texto: string, expiraEn: number, persistente?: boolean, esError?: boolean } | null }}
   */
  construirVista(progreso, ahoraMs = Date.now()) {
    this.ocultarMensajeSiExpirado(ahoraMs);
    return {
      habilidadesObtenidas: progreso.habilidades(),
      mensajeActivo: this._mensajeActivo,
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
}
