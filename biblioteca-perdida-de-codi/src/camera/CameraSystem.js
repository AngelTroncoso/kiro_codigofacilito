/**
 * @typedef {Object} CameraState
 * @property {number} yaw - Ángulo horizontal (rad) de la órbita de cámara alrededor de Codi.
 * @property {number} pitch - Ángulo vertical (rad) de la órbita, recortado a `[pitchMin, pitchMax]`.
 * @property {number} distanciaActual - Distancia (unidades) resuelta entre Codi y la cámara,
 *   luego de aplicar la corrección anti-obstrucción (Requirements 2.3); nunca mayor que
 *   `distanciaIdeal`.
 */

/**
 * @typedef {Object} WorldModelCamara
 * @property {(origen:{x:number,y:number,z:number}, direccion:{x:number,y:number,z:number}, distanciaMaxima:number) => {distancia:number|null, encontrado:boolean}} [raycastObstaculo] -
 *   Función pura de raycast contra la geometría sólida del entorno, en el mismo espíritu que
 *   `mundo.muestreaAltura` de `MovementSystem`: mantiene este módulo independiente de una
 *   escena real de Three.js. En producción puede envolver un `THREE.Raycaster` real. Si se
 *   omite, se asume que no hay obstrucción (`encontrado: false`).
 */

/**
 * Restringe `valor` al rango cerrado `[min, max]`.
 *
 * @param {number} valor
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(valor, min, max) {
  return Math.min(Math.max(valor, min), max);
}

/**
 * Rota un vector horizontal `(x, z)` alrededor del eje Y por `yaw` radianes,
 * usando la misma convención que `MovementSystem` (`rotarPorYaw`), consistente
 * con la rotación en Y de Three.js (mano derecha, Y-up):
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
 * Calcula el vector unitario `(x, y, z)` de un desplazamiento en coordenadas
 * esféricas Y-up: `pitch` inclina hacia arriba/abajo, `yaw` rota horizontalmente
 * usando `rotarPorYaw` sobre el componente horizontal de longitud `cos(pitch)`.
 *
 * A `yaw = 0, pitch = 0` el offset apunta a `(0, 0, 1)` (mismo eje base que
 * `MovementSystem.rotarPorYaw`), lo que mantiene ambos sistemas coherentes si
 * en el futuro se decide sincronizar el yaw de cámara con `poseCodi.rotationY`.
 *
 * @param {number} yaw - Ángulo horizontal en radianes.
 * @param {number} pitch - Ángulo vertical en radianes.
 * @returns {{x:number, y:number, z:number}} Vector unitario de dirección.
 */
function direccionEsferica(yaw, pitch) {
  const distanciaHorizontal = Math.cos(pitch);
  const horizontal = rotarPorYaw({ x: 0, z: distanciaHorizontal }, yaw);
  return { x: horizontal.x, y: Math.sin(pitch), z: horizontal.z };
}

/**
 * Calcula la posición 3D de la cámara a partir de un punto objetivo (`target`,
 * normalmente `poseCodi.position`), un yaw/pitch de órbita y una distancia.
 *
 * @param {{x:number, y:number, z:number}} target
 * @param {number} yaw
 * @param {number} pitch
 * @param {number} distancia
 * @returns {{x:number, y:number, z:number}}
 */
function calcularPosicionOrbital(target, yaw, pitch, distancia) {
  const direccion = direccionEsferica(yaw, pitch);
  return {
    x: target.x + direccion.x * distancia,
    y: target.y + direccion.y * distancia,
    z: target.z + direccion.z * distancia,
  };
}

/**
 * Magnitud euclidiana de un vector 3D `(x, y, z)`.
 * @param {{x:number, y:number, z:number}} vector
 * @returns {number}
 */
function magnitud3D(vector) {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
}

/**
 * Calcula la relación de aspecto `ancho/alto` de forma pura, sin tocar ningún
 * objeto de Three.js. Se mantiene separada de `actualizarAspecto` (que sí muta
 * una `THREE.PerspectiveCamera` real) para que el cálculo en sí sea testeable
 * con property-based testing sin instanciar Three.js (tarea 6.2, Property 7).
 *
 * Decisión de diseño: en vez de abstraer la cámara real detrás de otra
 * interfaz (como se hizo con `muestreaAltura`/`raycastObstaculo`), se optó por
 * operar directamente sobre una `THREE.PerspectiveCamera` en `actualizarAspecto`,
 * ya que Three.js es una dependencia del proyecto y `camera.updateProjectionMatrix()`
 * no tiene una alternativa pura razonable de simular; `calcularAspecto` aísla la
 * única parte de la lógica que sí es pura y digna de testear exhaustivamente.
 *
 * @param {number} ancho - Ancho del viewport en píxeles (o cualquier unidad consistente con `alto`).
 * @param {number} alto - Alto del viewport, en la misma unidad que `ancho`.
 * @returns {number} Relación de aspecto `ancho/alto`.
 */
export function calcularAspecto(ancho, alto) {
  return ancho / alto;
}

/**
 * Actualiza el `aspect` de una `THREE.PerspectiveCamera` real a partir de las
 * nuevas dimensiones de viewport (Requirements 2.4), sin modificar el FOV
 * vertical (`camera.fov`) configurado. Envoltura fina alrededor de la función
 * pura `calcularAspecto`: toda la lógica de cálculo vive ahí; aquí solo se
 * aplica la mutación necesaria para que Three.js recalcule su matriz de
 * proyección.
 *
 * @param {{aspect:number, updateProjectionMatrix:() => void}} camaraThreeJS - Instancia de `THREE.PerspectiveCamera` (o compatible).
 * @param {number} ancho
 * @param {number} alto
 * @returns {void}
 */
export function actualizarAspecto(camaraThreeJS, ancho, alto) {
  camaraThreeJS.aspect = calcularAspecto(ancho, alto);
  camaraThreeJS.updateProjectionMatrix();
}

/**
 * CameraSystem - Sistema_de_Camara (Requirements 2.1, 2.2, 2.3, 2.4).
 *
 * Traduce cada frame un `InputState` abstracto y la `CodiPose` actual en un
 * nuevo `CameraState` (yaw/pitch/distanciaActual), resolviendo el clamp de
 * pitch, la órbita alrededor de Codi y la corrección anti-obstrucción vía
 * raycast. Sigue el mismo criterio de diseño que `MovementSystem`: no
 * conserva estado interno entre llamadas — todo el estado relevante
 * (`estadoActual`) entra y sale explícitamente por parámetros/retorno de
 * `actualizar()`, lo que permite testear esta clase con fast-check (tareas
 * 6.2/6.3) sin necesidad de mockear una instancia con estado oculto, y sin
 * depender de una escena real de Three.js (la geometría del `mundo` se
 * consulta a través de `mundo.raycastObstaculo`, análogo a
 * `mundo.muestreaAltura` en `MovementSystem`).
 */
export class CameraSystem {
  /**
   * @param {Object} [config] - Constantes de configuración de la cámara.
   * @param {number} [config.sensibilidadYaw=0.0025] - Factor aplicado a `deltaCamara.x`
   *   para acumular yaw (rad por unidad de `deltaCamara.x`). Positivo por diseño para
   *   que el yaw cambie en la misma dirección que el delta horizontal de entrada.
   * @param {number} [config.sensibilidadPitch=0.0025] - Factor aplicado a `deltaCamara.y`
   *   para acumular pitch, antes del clamp.
   * @param {number} [config.pitchMin=-Math.PI/3] - Límite inferior de pitch (rad),
   *   evita que la cámara se voltee mirando desde muy abajo.
   * @param {number} [config.pitchMax=Math.PI/3] - Límite superior de pitch (rad),
   *   evita que la cámara se voltee mirando desde muy arriba.
   * @param {number} [config.distanciaIdeal=7] - Distancia orbital deseada (unidades)
   *   entre Codi y la cámara cuando no hay obstrucción (Requirements 2.1, 2.2).
   * @param {number} [config.distanciaMinima=1.5] - Piso mínimo de `distanciaActual`,
   *   evita que la corrección anti-obstrucción deje la cámara a una distancia
   *   negativa o absurdamente cercana a Codi.
   * @param {number} [config.margen=0.3] - Margen restado a la distancia de intersección
   *   detectada, para que la cámara quede claramente delante del obstáculo en vez de
   *   pegada a su superficie (Requirements 2.3).
   */
  constructor(config = {}) {
    /** @private */
    this._sensibilidadYaw = config.sensibilidadYaw ?? 0.0025;
    /** @private */
    this._sensibilidadPitch = config.sensibilidadPitch ?? 0.0025;
    /** @private */
    this._pitchMin = config.pitchMin ?? -Math.PI / 3;
    /** @private */
    this._pitchMax = config.pitchMax ?? Math.PI / 3;
    /** @private */
    this._distanciaIdeal = config.distanciaIdeal ?? 7;
    /** @private */
    this._distanciaMinima = config.distanciaMinima ?? 1.5;
    /** @private */
    this._margen = config.margen ?? 0.3;
  }

  /**
   * Traduce `inputState` + `deltaTime` en un nuevo `CameraState`, resolviendo:
   *   1. Acumulación de yaw y clamp de pitch a partir de `deltaCamara` (Requirements 2.2).
   *   2. Posición ideal de cámara en órbita alrededor de `poseCodi.position` a `distanciaIdeal`
   *      (Requirements 2.1, 2.2).
   *   3. Raycast anti-obstrucción desde `poseCodi.position` hacia esa posición ideal: si
   *      `mundo.raycastObstaculo` reporta geometría más cerca que `distanciaIdeal`, se acerca
   *      la cámara a `max(distanciaMinima, distanciaObstaculo - margen)` (Requirements 2.3).
   *
   * `deltaTime` se recibe por consistencia con `MovementSystem.actualizar` (misma firma de
   * diseño en `design.md`) y para permitir a futuro suavizado dependiente del tiempo, pero
   * la lógica actual no lo necesita: el clamp/órbita/raycast son independientes del framerate.
   *
   * @param {import('../input/InputProvider.js').InputState} inputState
   * @param {number} deltaTime - Tiempo transcurrido desde el frame anterior, en segundos.
   * @param {import('../movement/MovementSystem.js').CodiPose} poseCodi
   * @param {WorldModelCamara} mundo
   * @param {CameraState} estadoActual
   * @returns {CameraState & {posicionCamara: {x:number,y:number,z:number}, target: {x:number,y:number,z:number}}} nuevoEstado,
   *   incluyendo la posición 3D calculada de la cámara y el punto al que debe mirar
   *   (`target = poseCodi.position`), para facilitar la integración futura con `RenderEngine`.
   */
  actualizar(inputState, deltaTime, poseCodi, mundo, estadoActual) {
    // --- 1. Acumulación de yaw y clamp de pitch (Requirements 2.2) ---
    const nuevoYaw = estadoActual.yaw + inputState.deltaCamara.x * this._sensibilidadYaw;
    const nuevoPitch = clamp(
      estadoActual.pitch + inputState.deltaCamara.y * this._sensibilidadPitch,
      this._pitchMin,
      this._pitchMax
    );

    // --- 2. Posición ideal de cámara en órbita alrededor de Codi (Requirements 2.1, 2.2) ---
    const target = poseCodi.position;
    const posicionIdeal = calcularPosicionOrbital(target, nuevoYaw, nuevoPitch, this._distanciaIdeal);

    // --- 3. Raycast anti-obstrucción entre Codi y la posición ideal (Requirements 2.3) ---
    const haciaCamara = {
      x: posicionIdeal.x - target.x,
      y: posicionIdeal.y - target.y,
      z: posicionIdeal.z - target.z,
    };
    const distanciaHaciaCamara = magnitud3D(haciaCamara);
    const direccionHaciaCamara =
      distanciaHaciaCamara > 1e-9
        ? { x: haciaCamara.x / distanciaHaciaCamara, y: haciaCamara.y / distanciaHaciaCamara, z: haciaCamara.z / distanciaHaciaCamara }
        : direccionEsferica(nuevoYaw, nuevoPitch);

    const raycastObstaculo = mundo.raycastObstaculo ?? (() => ({ distancia: null, encontrado: false }));
    const resultadoRaycast = raycastObstaculo(target, direccionHaciaCamara, this._distanciaIdeal);

    let nuevaDistanciaActual;
    if (resultadoRaycast.encontrado && resultadoRaycast.distancia < this._distanciaIdeal) {
      nuevaDistanciaActual = Math.max(this._distanciaMinima, resultadoRaycast.distancia - this._margen);
    } else {
      nuevaDistanciaActual = this._distanciaIdeal;
    }

    // --- 4. Posición final de cámara a partir de yaw/pitch/distanciaActual resueltos ---
    const posicionCamara = calcularPosicionOrbital(target, nuevoYaw, nuevoPitch, nuevaDistanciaActual);

    return {
      yaw: nuevoYaw,
      pitch: nuevoPitch,
      distanciaActual: nuevaDistanciaActual,
      posicionCamara,
      target: { x: target.x, y: target.y, z: target.z },
    };
  }
}
