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

export class UISystem {
  constructor() {
    /**
     * Mensaje contextual activo, o `null` si no hay ninguno vigente.
     * @type {{ texto: string, expiraEn: number, persistente?: boolean, esError?: boolean } | null}
     * @private
     */
    this._mensajeActivo = null;
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
      overlay = doc.createElement('div');
      overlay.id = OVERLAY_ROOT_ID;
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '1000';
      overlay.style.fontFamily = 'sans-serif';

      const indicador = doc.createElement('div');
      indicador.id = 'ui-system-habilidades';
      indicador.style.position = 'fixed';
      indicador.style.top = '12px';
      indicador.style.left = '12px';
      indicador.style.padding = '8px 12px';
      indicador.style.borderRadius = '8px';
      indicador.style.background = 'rgba(20, 20, 30, 0.75)';
      indicador.style.color = '#f5f5f5';
      overlay.appendChild(indicador);

      const mensaje = doc.createElement('div');
      mensaje.id = 'ui-system-mensaje';
      mensaje.style.position = 'fixed';
      mensaje.style.bottom = '24px';
      mensaje.style.left = '50%';
      mensaje.style.transform = 'translateX(-50%)';
      mensaje.style.padding = '10px 16px';
      mensaje.style.borderRadius = '8px';
      mensaje.style.background = 'rgba(20, 20, 30, 0.85)';
      mensaje.style.color = '#f5f5f5';
      overlay.appendChild(mensaje);

      // Panel de controles: estático (no depende de `progreso` ni cambia
      // entre frames), se puebla una única vez aquí mismo, en la creación
      // inicial del overlay. Se ubica en la esquina inferior derecha para
      // no superponerse con el indicador de habilidades (arriba-izquierda)
      // ni con el mensaje contextual (abajo-centro).
      const panelControles = doc.createElement('div');
      panelControles.id = 'ui-system-controles';
      panelControles.style.position = 'fixed';
      panelControles.style.bottom = '12px';
      panelControles.style.right = '12px';
      panelControles.style.padding = '8px 12px';
      panelControles.style.borderRadius = '8px';
      panelControles.style.background = 'rgba(20, 20, 30, 0.75)';
      panelControles.style.color = '#f5f5f5';
      panelControles.style.fontSize = '13px';
      panelControles.style.lineHeight = '1.5';

      const tituloControles = doc.createElement('div');
      tituloControles.textContent = 'Controles';
      tituloControles.style.fontWeight = 'bold';
      tituloControles.style.marginBottom = '4px';
      panelControles.appendChild(tituloControles);

      const listaControles = doc.createElement('ul');
      listaControles.style.margin = '0';
      listaControles.style.padding = '0';
      listaControles.style.listStyle = 'none';

      const controles = [
        'W A S D / Flechas — Mover',
        'Espacio — Saltar',
        'Mouse — Rotar cámara',
        'E — Interactuar / Absorber',
      ];
      for (const textoControl of controles) {
        const item = doc.createElement('li');
        item.textContent = textoControl;
        listaControles.appendChild(item);
      }
      panelControles.appendChild(listaControles);

      overlay.appendChild(panelControles);

      contenedorHTML.appendChild(overlay);
    }

    const indicador = overlay.querySelector('#ui-system-habilidades');
    const habilidadesTexto = vista.habilidadesObtenidas.size > 0
      ? `Habilidades: ${Array.from(vista.habilidadesObtenidas).join(', ')}`
      : 'Habilidades: ninguna todavía';
    indicador.textContent = habilidadesTexto;

    const mensaje = overlay.querySelector('#ui-system-mensaje');
    if (vista.mensajeActivo) {
      mensaje.textContent = vista.mensajeActivo.texto;
      mensaje.style.display = 'block';
      mensaje.style.borderLeft = vista.mensajeActivo.esError ? '4px solid #e07a5f' : '4px solid #81b29a';
    } else {
      mensaje.textContent = '';
      mensaje.style.display = 'none';
    }
  }
}
