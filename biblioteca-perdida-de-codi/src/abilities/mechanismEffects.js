/**
 * mechanismEffects.js - Efectos visuales de resolución de un
 * `MecanismoAmbiental`, uno por cada `descripcionEfecto` declarado en
 * `mechanismDefinitions.js` (Requirements 4.2, 5.2, 6.2).
 *
 * Requisito 11.4: "THE Sistema_de_Habilidades SHALL representar cada
 * efecto de Habilidad como una acción creativa o constructiva, nunca como
 * una acción agresiva o destructiva". En consecuencia, cada función de
 * este módulo:
 *   - construye, extiende, activa o revela algo (nunca destruye, daña ni
 *     ataca);
 *   - es invocable con objetos 3D simples/mocks (no depende de que exista
 *     un `THREE.Object3D` real ni un `RenderEngine` real, para poder
 *     testearse sin WebGL) — solo asume el "contrato" mínimo documentado en
 *     el JSDoc de cada función;
 *   - NO conoce `AbilitySystem` ni `ProgressStore`: se invoca DESPUÉS de
 *     que `AbilitySystem.interactuar` devuelve `{ resultado: 'resuelto' }`,
 *     típicamente desde quien orquesta el `GameLoop` (`main.js`, tareas
 *     16.x), pasando el objeto 3D concreto asociado al mecanismo resuelto.
 *
 * La integración con modelos 3D/animaciones reales (curvas de animación,
 * modelos GLTF concretos) queda para tareas de contenido futuras (14.x);
 * aquí se define únicamente el contrato y una implementación mínima
 * razonable (escalado/posicionamiento/visibilidad/flags de estado simples).
 */

/**
 * Objeto 3D mínimo esperado por `extenderPuente`/`iniciarRecorridoPlataforma`/
 * `revelarGeometriaOculta`: cualquier objeto que tenga (según el efecto)
 * `scale`/`position`/`visible` mutables, en el mismo espíritu que
 * `THREE.Object3D` pero sin requerir Three.js real (duck typing, igual que
 * `RenderEngine.registrarModelo`).
 *
 * @typedef {Object} Objeto3DSimple
 * @property {{x:number, y:number, z:number}} [scale]
 * @property {{x:number, y:number, z:number}} [position]
 * @property {boolean} [visible]
 */

/**
 * Efecto "extender puente" (tipos `puente`/`solucion-automatizada`):
 * acción CONSTRUCTIVA — Codi termina de construir/extender un puente hasta
 * su longitud completa, permitiendo cruzar.
 *
 * Sin un sistema de animación con curvas todavía disponible, se implementa
 * como el escalado inmediato del objeto puente a su estado "extendido"
 * (`escalaCompleta`, por defecto `{x:1, y:1, z:1}`, asumiendo que el objeto
 * parte de una escala reducida en el eje de extensión mientras está
 * bloqueado). Integraciones futuras (tarea 14.x) pueden reemplazar este
 * escalado inmediato por una animación interpolada sin cambiar el contrato
 * de esta función.
 *
 * @param {Objeto3DSimple} objetoPuente - Objeto 3D del puente, con `scale` mutable.
 * @param {{x:number, y:number, z:number}} [escalaCompleta] - Escala objetivo
 *   que representa el puente totalmente extendido.
 * @returns {void}
 */
export function extenderPuente(objetoPuente, escalaCompleta = { x: 1, y: 1, z: 1 }) {
  if (!objetoPuente || !objetoPuente.scale) return;
  objetoPuente.scale.x = escalaCompleta.x;
  objetoPuente.scale.y = escalaCompleta.y;
  objetoPuente.scale.z = escalaCompleta.z;
}

/**
 * Efecto "iniciar recorrido de plataforma" (tipos `dispositivo`/
 * `plataforma-movil`): acción CONSTRUCTIVA — Codi activa/programa una
 * plataforma para que comience su recorrido útil.
 *
 * `MovementSystem` ya soporta `plataformasMoviles` con
 * `deltaMovimientoFrame` (ver `mundo.plataformasMoviles` en
 * `MovementSystem.actualizar`); esta función se limita a marcar el estado
 * "activo" en el objeto de datos de la plataforma (`plataformaData.activa
 * = true`), que es la señal que quien orquesta el `GameLoop` puede leer
 * para empezar a incluir esa plataforma en `mundo.plataformasMoviles` (o
 * para empezar a avanzar su trayectoria) en frames subsecuentes. La
 * integración completa con un sistema de animación de trayectoria de
 * plataformas queda para tareas de contenido futuras (14.x).
 *
 * @param {{ activa?: boolean }} plataformaData - Datos de la plataforma
 *   (mutados in-place: se pone `activa = true`).
 * @returns {void}
 */
export function iniciarRecorridoPlataforma(plataformaData) {
  if (!plataformaData) return;
  plataformaData.activa = true;
}

/**
 * Efecto "revelar geometría oculta" (tipos `camino-oculto`/
 * `fuente-informacion`): acción CONSTRUCTIVA — Codi descubre/revela un
 * camino o fuente de información que ya existía pero estaba oculto (nunca
 * se crea nada agresivo, solo se hace visible lo que estaba escondido).
 *
 * Si se provee `renderEngine` (con `registrarModelo`, ver
 * `RenderEngine.registrarModelo`), se registra `objetoOculto` en la escena;
 * en cualquier caso, se marca `objetoOculto.visible = true` para cubrir
 * también el caso de un objeto ya registrado en la escena pero oculto vía
 * el flag `visible` (p. ej. `THREE.Object3D.visible = false`).
 *
 * @param {Objeto3DSimple} objetoOculto - Objeto 3D a revelar.
 * @param {{ registrarModelo?: (objeto3D: Objeto3DSimple) => void }} [renderEngine] -
 *   Referencia opcional a un `RenderEngine` (o mock compatible por duck
 *   typing) usado para añadir `objetoOculto` a la escena si aún no forma
 *   parte de ella.
 * @returns {void}
 */
export function revelarGeometriaOculta(objetoOculto, renderEngine) {
  if (!objetoOculto) return;
  if (renderEngine && typeof renderEngine.registrarModelo === 'function') {
    renderEngine.registrarModelo(objetoOculto);
  }
  objetoOculto.visible = true;
}

/**
 * Despacha el efecto visual correspondiente a `descripcionEfecto` (ver
 * `mechanismDefinitions.js`) sobre `objetoDestino`, usando `renderEngine`
 * cuando corresponda (solo lo usa `revelar-geometria-oculta`/
 * `revelar-fuente-informacion`). Punto de entrada único y conveniente para
 * quien orquesta el `GameLoop`, en vez de tener que elegir manualmente cuál
 * de las tres funciones anteriores invocar.
 *
 * @param {string} descripcionEfecto - Uno de los `descripcionEfecto` de
 *   `DEFINICIONES_MECANISMO` (`'extender-puente'`, `'ejecutar-solucion-automatizada'`,
 *   `'activar-dispositivo'`, `'iniciar-recorrido-plataforma'`,
 *   `'revelar-geometria-oculta'`, `'revelar-fuente-informacion'`).
 * @param {Objeto3DSimple|{activa?: boolean}} objetoDestino - Objeto 3D o
 *   datos de plataforma sobre los que aplicar el efecto.
 * @param {{ registrarModelo?: (objeto3D: Objeto3DSimple) => void }} [renderEngine]
 * @returns {void}
 */
export function aplicarEfectoResolucion(descripcionEfecto, objetoDestino, renderEngine) {
  switch (descripcionEfecto) {
    case 'extender-puente':
    case 'ejecutar-solucion-automatizada':
      extenderPuente(objetoDestino);
      break;
    case 'activar-dispositivo':
    case 'iniciar-recorrido-plataforma':
      iniciarRecorridoPlataforma(objetoDestino);
      break;
    case 'revelar-geometria-oculta':
    case 'revelar-fuente-informacion':
      revelarGeometriaOculta(objetoDestino, renderEngine);
      break;
    default:
      // eslint-disable-next-line no-console
      console.warn(`mechanismEffects.js: descripcionEfecto "${descripcionEfecto}" desconocido; no-op.`);
  }
}
