import {
  resolverColisionHorizontal,
  raycastSuelo,
  resolverPosicionSegura,
} from './collision.js';

/**
 * @typedef {Object} CodiPose
 * @property {{x:number, y:number, z:number}} position - Posición mundial de Codi.
 * @property {number} rotationY - Yaw (rad) usado tanto para orientar el movimiento
 *   relativo a cámara como para el "facing" visual de Codi (ver nota de diseño
 *   en `MovementSystem.actualizar`).
 * @property {{x:number, y:number, z:number}} velocity - Velocidad resultante del
 *   último frame (unidades/seg). `velocity.y !== 0` indica que Codi está en el aire.
 * @property {'idle'|'walk'|'run'|'jump'} animState - Estado de animación puro.
 * @property {{x:number, y:number, z:number}} lastSafePosition - Último punto con
 *   suelo navegable confirmado, usado como punto de recuperación (Requirements 1.4).
 */

/**
 * @typedef {Object} ZonaBloqueadaData
 * @property {{x:number, y:number, z:number}} min - Esquina mínima del AABB de la zona.
 * @property {{x:number, y:number, z:number}} max - Esquina máxima del AABB de la zona.
 * @property {boolean} bloqueada - Si es true, la zona se trata como un volumen
 *   sólido invisible para el estado actual de Habilidades del Jugador (Requirements 7.2).
 *   Quien construya el `mundo` (futura tarea 11, `AbilitySystem`) decide este flag
 *   evaluando `AbilitySystem.puedeAcceder(zona, progreso)` antes de pasarlo aquí;
 *   `MovementSystem` no conoce `AbilitySystem` ni `ProgressStore` directamente.
 */

/**
 * @typedef {Object} PlataformaMovilData
 * @property {{min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}} aabbActual -
 *   AABB actual de la plataforma en este frame (ya actualizado por quien anime la plataforma).
 * @property {{x:number, y:number, z:number}} deltaMovimientoFrame - Delta que la
 *   plataforma se desplazó durante este frame, calculado fuera de `MovementSystem`.
 */

/**
 * @typedef {Object} WorldModelMovimiento
 * @property {Array<Object>} [volumenesSolidos] - AABB/esferas sólidas cercanas
 *   (mismo formato que `collision.js`: `{type:'aabb', min, max}` o `{type:'sphere', center, radius}`).
 * @property {(x:number, z:number) => number|null} muestreaAltura - Función pura de
 *   muestreo de altura de terreno en `(x, z)`, o `null` si no hay suelo en esa columna.
 * @property {number} [distanciaMaximaCaida] - Umbral de caída considerado navegable,
 *   usado tanto para adherencia al suelo como para detectar "fuera de límites"
 *   (Requirements 1.4). Si se omite, se usa el valor por defecto de configuración.
 * @property {ZonaBloqueadaData[]} [zonasBloqueadas] - Zonas a tratar como sólidas si `bloqueada === true`.
 * @property {PlataformaMovilData[]} [plataformasMoviles] - Plataformas móviles activas.
 */

/**
 * Rota un vector horizontal `(x, z)` alrededor del eje Y por `yaw` radianes,
 * usando la misma convención de rotación en Y que Three.js (mano derecha, Y-up):
 *
 *   x' =  x·cos(yaw) + z·sin(yaw)
 *   z' = -x·sin(yaw) + z·cos(yaw)
 *
 * @param {{x:number, z:number}} vector
 * @param {number} yaw - Ángulo en radianes.
 * @returns {{x:number, z:number}}
 */
function rotarPorYaw(vector, yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    x: vector.x * cos + vector.z * sin,
    z: -vector.x * sin + vector.z * cos,
  };
}

/**
 * Magnitud euclidiana de un vector 2D `(x, z)`.
 * @param {{x:number, z:number}} vector
 * @returns {number}
 */
function magnitud2D(vector) {
  return Math.sqrt(vector.x * vector.x + vector.z * vector.z);
}

/**
 * Determina si el punto `(x, z)` está dentro del rango horizontal de un AABB,
 * y si `y` está dentro de la tolerancia respecto a la superficie superior
 * (`aabb.max.y`). Usado para decidir si Codi está "parado sobre" una plataforma.
 *
 * @param {{x:number, y:number, z:number}} posicion
 * @param {{min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}} aabb
 * @param {number} tolerancia
 * @returns {boolean}
 */
function estaSobrePlataforma(posicion, aabb, tolerancia) {
  const dentroXZ =
    posicion.x >= aabb.min.x &&
    posicion.x <= aabb.max.x &&
    posicion.z >= aabb.min.z &&
    posicion.z <= aabb.max.z;
  if (!dentroXZ) return false;

  const distanciaASuperficie = Math.abs(posicion.y - aabb.max.y);
  return distanciaASuperficie <= tolerancia;
}

/**
 * MovementSystem - Sistema_de_Movimiento (Requirements 1.1, 1.2, 1.3, 7.2,
 * Requisitos funcionales 5).
 *
 * Traduce cada frame un `InputState` abstracto (ver `InputProvider.js`) en una
 * nueva `CodiPose`, resolviendo colisión horizontal, adherencia/caída vertical,
 * gating espacial de `Zona_Bloqueada` y adherencia a plataformas móviles. Es
 * puro en el sentido de que toda la información del mundo que necesita llega
 * como datos simples en el parámetro `mundo` (ver `WorldModelMovimiento`); no
 * importa ni invoca `AbilitySystem`, `WorldModel` ni `RenderEngine` como clases
 * concretas, lo que permite testear esta clase de forma aislada (tarea 4.5/4.6)
 * antes de que esas piezas existan (tareas 8, 11, 14).
 *
 * Nota de diseño — orientación de cámara y `rotationY`: el diseño técnico
 * (`design.md`, Sistema_de_Movimiento) especifica que el desplazamiento
 * deseado se "rota según la orientación de cámara", pero la firma de
 * `actualizar()` (también definida en `design.md`) no recibe un `CameraState`
 * explícito. Por diseño, `poseActual.rotationY` hace ambas veces de yaw de
 * referencia para rotar la entrada local a espacio mundial *y* de ángulo de
 * "facing" visual de Codi: `MovementSystem` lo usa como yaw de entrada, y lo
 * actualiza al final apuntando hacia la dirección de movimiento resultante
 * (si hay movimiento horizontal; si no, se conserva el yaw anterior para que
 * Codi no gire sobre sí mismo estando quieto). El `GameLoop`/`CameraSystem`
 * (tarea 6) puede mantener este valor sincronizado con la órbita de cámara
 * si se desea un esquema de movimiento relativo a cámara más estricto; esta
 * clase no depende de esa sincronización para operar correctamente.
 */
export class MovementSystem {
  /**
   * @param {Object} [config] - Constantes de configuración del movimiento.
   * @param {number} [config.velocidadDesplazamiento=4] - Velocidad base (unid/seg)
   *   aplicada al vector de entrada. Nota: `KeyboardMouseInputProvider` NO
   *   normaliza `vectorMovimiento` en diagonal (por diseño, ver su JSDoc), por
   *   lo que moverse en diagonal (magnitud ≈1.41) resulta intencionalmente
   *   más rápido que moverse en un solo eje (magnitud 1); esto es lo que
   *   permite distinguir `walk` de `run` puramente a partir de la magnitud
   *   de velocidad resultante sin necesitar una tecla de sprint dedicada.
   * @param {number} [config.umbralVelocidadCorrer=4.6] - Umbral (unid/seg) de
   *   velocidad horizontal por encima del cual `animState` es `run` en vez de
   *   `walk`. Calibrado entre `velocidadDesplazamiento` (movimiento en un eje)
   *   y `velocidadDesplazamiento * √2` (movimiento diagonal).
   * @param {number} [config.velocidadSalto=7] - Velocidad vertical inicial (unid/seg)
   *   al iniciar un salto.
   * @param {number} [config.gravedad=-18] - Aceleración vertical (unid/seg², negativa).
   * @param {number} [config.radioColisionador=0.4] - Radio del colisionador esférico de Codi.
   * @param {number} [config.distanciaMaximaCaidaPorDefecto=10] - Umbral de caída usado
   *   si `mundo.distanciaMaximaCaida` no se especifica.
   * @param {number} [config.toleranciaPlataforma=0.2] - Tolerancia vertical (unid)
   *   para considerar que Codi está sobre la superficie de una plataforma móvil.
   */
  constructor(config = {}) {
    /** @private */
    this._velocidadDesplazamiento = config.velocidadDesplazamiento ?? 4;
    /** @private */
    this._umbralVelocidadCorrer = config.umbralVelocidadCorrer ?? 4.6;
    /** @private */
    this._velocidadSalto = config.velocidadSalto ?? 7;
    /** @private */
    this._gravedad = config.gravedad ?? -18;
    /** @private */
    this._radioColisionador = config.radioColisionador ?? 0.4;
    /** @private */
    this._distanciaMaximaCaidaPorDefecto = config.distanciaMaximaCaidaPorDefecto ?? 10;
    /** @private */
    this._toleranciaPlataforma = config.toleranciaPlataforma ?? 0.2;
  }

  /**
   * Traduce `inputState` + `deltaTime` en una nueva `CodiPose`, resolviendo
   * colisión horizontal (incluyendo `Zona_Bloqueada`), suelo/salto vertical,
   * recuperación fuera de límites y adherencia a plataformas móviles.
   *
   * Orden de resolución (ver pseudocódigo de `design.md`):
   *   1. Desplazamiento horizontal deseado, rotado por `rotationY`.
   *   2. Colisión horizontal contra `volumenesSolidos` + `zonasBloqueadas` activas
   *      (Requirements 1.5, 7.2) — deslizamiento por eje, nunca detención total.
   *   3-4. Resolución vertical: salto (proyectil) o adherencia al suelo; si no
   *      hay suelo navegable, recuperación a `lastSafePosition` (Requirements 1.4).
   *   5. `animState` puro a partir de la magnitud de velocidad horizontal
   *      resultante, o `jump` si Codi está en el aire (Requirements 1.2, 1.3).
   *   6. Adherencia a plataforma móvil activa (Requirements 5.4), evaluada
   *      sobre la posición *previa* al frame (inicio de frame).
   *
   * @param {import('../input/InputProvider.js').InputState} inputState
   * @param {number} deltaTime - Tiempo transcurrido desde el frame anterior, en segundos.
   * @param {CodiPose} poseActual
   * @param {WorldModelMovimiento} mundo
   * @returns {CodiPose} nuevaPose
   */
  actualizar(inputState, deltaTime, poseActual, mundo) {
    const volumenesSolidos = mundo.volumenesSolidos ?? [];
    const zonasBloqueadas = mundo.zonasBloqueadas ?? [];
    const plataformasMoviles = mundo.plataformasMoviles ?? [];
    const distanciaMaximaCaida = mundo.distanciaMaximaCaida ?? this._distanciaMaximaCaidaPorDefecto;

    // --- 1. Desplazamiento horizontal deseado, rotado por orientación (Requirements 1.1) ---
    const entradaLocal = { x: inputState.vectorMovimiento.x, z: inputState.vectorMovimiento.z };
    const direccionMundo = rotarPorYaw(entradaLocal, poseActual.rotationY);
    const desplazamientoDeseado = {
      x: direccionMundo.x * this._velocidadDesplazamiento * deltaTime,
      z: direccionMundo.z * this._velocidadDesplazamiento * deltaTime,
    };

    // --- 2. Colisión horizontal, incluyendo Zona_Bloqueada como sólido invisible (Requirements 1.5, 7.2) ---
    const zonasComoSolidos = zonasBloqueadas
      .filter((zona) => zona.bloqueada)
      .map((zona) => ({ type: 'aabb', min: zona.min, max: zona.max }));
    const volumenesEfectivos = [...volumenesSolidos, ...zonasComoSolidos];

    const posicionHorizontal = resolverColisionHorizontal(
      poseActual.position,
      desplazamientoDeseado,
      volumenesEfectivos,
      this._radioColisionador
    );

    // --- 3-4. Resolución vertical: salto (proyectil) o adherencia al suelo ---
    const enElAireAlInicio = poseActual.velocity.y !== 0;
    const grounded = !enElAireAlInicio;
    const iniciaSalto = grounded && inputState.saltar;

    let velocidadY;
    let posicionYCandidata;

    if (enElAireAlInicio || iniciaSalto) {
      const velocidadYPrevia = iniciaSalto ? this._velocidadSalto : poseActual.velocity.y;
      velocidadY = velocidadYPrevia + this._gravedad * deltaTime;
      posicionYCandidata = poseActual.position.y + velocidadY * deltaTime;
    } else {
      // Sin salto en curso: se conserva la altura actual como candidata; el
      // ajuste real a la altura del terreno ocurre abajo, vía `raycastSuelo`.
      velocidadY = 0;
      posicionYCandidata = poseActual.position.y;
    }

    const posicionCandidata3D = { x: posicionHorizontal.x, y: posicionYCandidata, z: posicionHorizontal.z };
    const resultadoRaycast = raycastSuelo(posicionCandidata3D, mundo.muestreaAltura, distanciaMaximaCaida);

    let posicionFinal;
    let nuevaLastSafePosition = poseActual.lastSafePosition;
    let enElAireFinal;

    if (!resultadoRaycast.encontrado) {
      // Fuera de límites navegables (Requirements 1.4): recuperar último punto seguro.
      posicionFinal = resolverPosicionSegura(posicionCandidata3D, resultadoRaycast, poseActual.lastSafePosition);
      velocidadY = 0;
      enElAireFinal = false;
      // `lastSafePosition` no cambia: seguimos confiando en el mismo punto de recuperación.
    } else if (enElAireAlInicio || iniciaSalto) {
      const aterrizando = posicionYCandidata <= resultadoRaycast.altura;
      if (aterrizando) {
        posicionFinal = { x: posicionHorizontal.x, y: resultadoRaycast.altura, z: posicionHorizontal.z };
        velocidadY = 0;
        enElAireFinal = false;
      } else {
        posicionFinal = posicionCandidata3D;
        enElAireFinal = true;
      }
      nuevaLastSafePosition = enElAireFinal ? poseActual.lastSafePosition : posicionFinal;
    } else {
      // Caminando sobre el terreno: adherirse a la altura detectada (Requirements 1.1, 1.3).
      posicionFinal = { x: posicionHorizontal.x, y: resultadoRaycast.altura, z: posicionHorizontal.z };
      velocidadY = 0;
      enElAireFinal = false;
      nuevaLastSafePosition = posicionFinal;
    }

    // --- 5. Selección pura de animState a partir de la velocidad horizontal resultante ---
    const velocidadHorizontalResultante = {
      x: deltaTime > 0 ? (posicionFinal.x - poseActual.position.x) / deltaTime : 0,
      z: deltaTime > 0 ? (posicionFinal.z - poseActual.position.z) / deltaTime : 0,
    };
    const magnitudHorizontal = magnitud2D(velocidadHorizontalResultante);

    /** @type {'idle'|'walk'|'run'|'jump'} */
    let animState;
    if (enElAireFinal) {
      animState = 'jump';
    } else if (magnitudHorizontal <= 1e-6) {
      animState = 'idle';
    } else if (magnitudHorizontal <= this._umbralVelocidadCorrer) {
      animState = 'walk';
    } else {
      animState = 'run';
    }

    // --- rotationY: apunta hacia la dirección de movimiento si hay input del jugador ---
    // IMPORTANTE: Solo actualizar rotación cuando el jugador está presionando teclas de movimiento,
    // no basarnos en velocidad resultante para evitar inversiones al aterrizar
    let nuevaRotationY = poseActual.rotationY;
    const hayInputHorizontal = Math.abs(inputState.vectorMovimiento.x) > 1e-6 || 
                               Math.abs(inputState.vectorMovimiento.z) > 1e-6;
    
    if (hayInputHorizontal && !enElAireFinal) {
      // Calcular rotación basada en el INPUT del jugador, no en la velocidad resultante
      const direccionMundo = rotarPorYaw(
        { x: inputState.vectorMovimiento.x, z: inputState.vectorMovimiento.z }, 
        poseActual.rotationY
      );
      nuevaRotationY = Math.atan2(direccionMundo.x, direccionMundo.z);
    }

    // --- 6. Adherencia a plataforma móvil activa (Requirements 5.4) ---
    // Se evalúa sobre la posición de INICIO de frame (`poseActual.position`),
    // no sobre `posicionFinal`, para determinar si Codi ya estaba sobre la
    // plataforma antes de que esta se moviera este frame.
    for (const plataforma of plataformasMoviles) {
      if (estaSobrePlataforma(poseActual.position, plataforma.aabbActual, this._toleranciaPlataforma)) {
        posicionFinal = {
          x: posicionFinal.x + plataforma.deltaMovimientoFrame.x,
          y: posicionFinal.y + plataforma.deltaMovimientoFrame.y,
          z: posicionFinal.z + plataforma.deltaMovimientoFrame.z,
        };
        if (!enElAireFinal) {
          nuevaLastSafePosition = posicionFinal;
        }
        break;
      }
    }

    return {
      position: posicionFinal,
      rotationY: nuevaRotationY,
      velocity: { x: velocidadHorizontalResultante.x, y: velocidadY, z: velocidadHorizontalResultante.z },
      animState,
      lastSafePosition: nuevaLastSafePosition,
    };
  }
}
