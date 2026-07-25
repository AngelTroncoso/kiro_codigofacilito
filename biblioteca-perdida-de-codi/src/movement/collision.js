/**
 * collision.js - Funciones puras de colisión para el Sistema_de_Movimiento.
 *
 * Todas las funciones de este módulo son puras: no mutan sus argumentos, no
 * dependen de una escena de Three.js ni de ningún estado global, y su salida
 * depende únicamente de sus entradas. Trabajan con representaciones de datos
 * simples (objetos `{x, y, z}` para vectores) para poder testearse con
 * property-based testing sin necesidad de instanciar clases de Three.js.
 *
 * Formas de volumen sólido soportadas:
 *   - AABB:   { type: 'aabb',   min: {x,y,z}, max: {x,y,z} }
 *   - Esfera: { type: 'sphere', center: {x,y,z}, radius: number }
 *
 * Estas funciones respaldan directamente:
 *   - Property 5 (Requirements 1.5): la posición resuelta por
 *     `resolverColisionHorizontal` nunca debe quedar dentro de un volumen
 *     sólido del mundo, para cualquier conjunto de volúmenes y cualquier
 *     desplazamiento deseado.
 *   - Property 6 (Requirements 1.4): cuando `raycastSuelo` no encuentra
 *     suelo navegable, `resolverPosicionSegura` debe devolver el último
 *     punto seguro registrado en lugar de la posición candidata.
 */

/**
 * Determina si un punto está contenido dentro de (o sobre el borde de) un
 * volumen AABB.
 *
 * @param {{x:number, y:number, z:number}} punto
 * @param {{min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}} aabb
 * @returns {boolean} true si el punto está dentro del AABB (bordes inclusive)
 */
export function puntoIntersectaAABB(punto, aabb) {
  return (
    punto.x >= aabb.min.x &&
    punto.x <= aabb.max.x &&
    punto.y >= aabb.min.y &&
    punto.y <= aabb.max.y &&
    punto.z >= aabb.min.z &&
    punto.z <= aabb.max.z
  );
}

/**
 * Determina si una esfera (p. ej. el colisionador de Codi) intersecta un
 * volumen AABB, usando la técnica del punto más cercano del AABB al centro
 * de la esfera.
 *
 * @param {{x:number, y:number, z:number}} centro - Centro de la esfera.
 * @param {number} radio - Radio de la esfera.
 * @param {{min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}} aabb
 * @returns {boolean} true si la esfera intersecta (o toca) el AABB
 */
export function esferaIntersectaAABB(centro, radio, aabb) {
  const puntoCercanoX = clamp(centro.x, aabb.min.x, aabb.max.x);
  const puntoCercanoY = clamp(centro.y, aabb.min.y, aabb.max.y);
  const puntoCercanoZ = clamp(centro.z, aabb.min.z, aabb.max.z);

  const dx = centro.x - puntoCercanoX;
  const dy = centro.y - puntoCercanoY;
  const dz = centro.z - puntoCercanoZ;

  const distanciaCuadrada = dx * dx + dy * dy + dz * dz;
  return distanciaCuadrada <= radio * radio;
}

/**
 * Determina si dos esferas intersectan (o se tocan).
 *
 * @param {{x:number, y:number, z:number}} centroA
 * @param {number} radioA
 * @param {{x:number, y:number, z:number}} centroB
 * @param {number} radioB
 * @returns {boolean} true si las esferas intersectan
 */
export function intersectaEsferas(centroA, radioA, centroB, radioB) {
  const dx = centroA.x - centroB.x;
  const dy = centroA.y - centroB.y;
  const dz = centroA.z - centroB.z;
  const distanciaCuadrada = dx * dx + dy * dy + dz * dz;
  const radioSuma = radioA + radioB;
  return distanciaCuadrada <= radioSuma * radioSuma;
}

/**
 * Determina si una esfera colisionadora, ubicada en `centro` con `radio`,
 * intersecta alguno de los `volumenesSolidos` dados (AABB y/o esferas).
 *
 * @param {{x:number, y:number, z:number}} centro
 * @param {number} radio
 * @param {Array<Object>} volumenesSolidos - Lista de AABB/esferas sólidas.
 * @returns {boolean} true si hay colisión con al menos un volumen
 */
export function colisionaConAlguno(centro, radio, volumenesSolidos) {
  for (const volumen of volumenesSolidos) {
    if (volumen.type === 'aabb') {
      if (esferaIntersectaAABB(centro, radio, volumen)) {
        return true;
      }
    } else if (volumen.type === 'sphere') {
      if (intersectaEsferas(centro, radio, volumen.center, volumen.radius)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resuelve el desplazamiento horizontal (plano XZ) de Codi contra un
 * conjunto de volúmenes sólidos, aplicando deslizamiento por eje: si el
 * movimiento en un eje provocaría una colisión, ese eje se recorta a cero
 * (no se descarta el movimiento en el eje libre), permitiendo que Codi se
 * deslice a lo largo de la superficie en vez de detenerse por completo.
 *
 * Precondición asumida: `posicionActual` no intersecta ya ninguno de los
 * `volumenesSolidos` (si Codi ya estuviera incrustado, esta función no lo
 * "empuja" fuera; solo impide que un desplazamiento nuevo lo introduzca en
 * un volumen sólido).
 *
 * **Validates: Property 5 (Requirements 1.5)** - la posición devuelta nunca
 * queda dentro de un volumen sólido, para cualquier conjunto de volúmenes y
 * cualquier desplazamiento deseado, dado que cada eje se prueba y se
 * recorta independientemente antes de aceptarse.
 *
 * @param {{x:number, y:number, z:number}} posicionActual
 * @param {{x:number, z:number}} desplazamientoDeseado - Delta horizontal deseado (plano XZ).
 * @param {Array<Object>} volumenesSolidos - Lista de AABB/esferas sólidas del mundo.
 * @param {number} radioColisionador - Radio del colisionador esférico de Codi.
 * @returns {{x:number, y:number, z:number}} Nueva posición resultante (misma altura Y de entrada).
 */
export function resolverColisionHorizontal(
  posicionActual,
  desplazamientoDeseado,
  volumenesSolidos,
  radioColisionador
) {
  let nuevaX = posicionActual.x;
  let nuevaZ = posicionActual.z;

  // Eje X: probar el movimiento deseado en X manteniendo Z actual.
  const candidatoX = { x: posicionActual.x + desplazamientoDeseado.x, y: posicionActual.y, z: posicionActual.z };
  if (!colisionaConAlguno(candidatoX, radioColisionador, volumenesSolidos)) {
    nuevaX = candidatoX.x;
  }

  // Eje Z: probar el movimiento deseado en Z, ya con la X resuelta (permite
  // deslizamiento: si X quedó bloqueada, Z todavía puede avanzar y viceversa).
  const candidatoZ = { x: nuevaX, y: posicionActual.y, z: posicionActual.z + desplazamientoDeseado.z };
  if (!colisionaConAlguno(candidatoZ, radioColisionador, volumenesSolidos)) {
    nuevaZ = candidatoZ.z;
  }

  return { x: nuevaX, y: posicionActual.y, z: nuevaZ };
}

/**
 * Simula un raycast vertical hacia abajo desde `posicion` para determinar la
 * altura del suelo navegable bajo Codi. La lógica de muestreo del terreno se
 * delega en `muestreaAltura` (una función pura `(x, z) => number|null`) para
 * mantener este módulo independiente de cualquier escena real de Three.js;
 * en producción, `muestreaAltura` puede envolver un `THREE.Raycaster` real
 * contra la geometría del entorno.
 *
 * Si no existe suelo bajo la posición dentro de `distanciaMaxima`, o el
 * muestreo no reporta ningún suelo en esa columna, se considera que la
 * posición está fuera de los límites navegables (`encontrado: false`).
 *
 * @param {{x:number, y:number, z:number}} posicion - Posición candidata desde donde lanzar el rayo hacia abajo.
 * @param {(x:number, z:number) => number|null} muestreaAltura - Función que devuelve la altura del suelo en (x,z), o null si no hay suelo.
 * @param {number} distanciaMaxima - Distancia máxima de caída considerada válida (umbral de "fuera de límites").
 * @returns {{altura: number|null, encontrado: boolean}} Altura de suelo detectada y si fue encontrada dentro del umbral.
 */
export function raycastSuelo(posicion, muestreaAltura, distanciaMaxima) {
  const alturaSuelo = muestreaAltura(posicion.x, posicion.z);

  if (alturaSuelo === null || alturaSuelo === undefined) {
    return { altura: null, encontrado: false };
  }

  const distanciaAlSuelo = posicion.y - alturaSuelo;

  // Suelo válido solo si está por debajo (o al nivel) de la posición actual
  // y dentro de la distancia máxima de caída considerada navegable.
  if (distanciaAlSuelo < 0 || distanciaAlSuelo > distanciaMaxima) {
    return { altura: null, encontrado: false };
  }

  return { altura: alturaSuelo, encontrado: true };
}

/**
 * Resuelve la posición final de Codi a partir del resultado de
 * `raycastSuelo`: si se encontró suelo navegable, devuelve la posición
 * candidata con la altura ajustada al suelo detectado; si no se encontró
 * suelo (posición fuera de límites navegables), devuelve el último punto
 * seguro registrado en su lugar.
 *
 * **Validates: Property 6 (Requirements 1.4)** - para cualquier secuencia de
 * posiciones con puntos seguros intercalados con posiciones fuera de
 * límites, cuando se detecta una posición fuera de límites (`sueloEncontrado
 * === false`), la posición resultante es exactamente `ultimaPosicionSegura`.
 *
 * @param {{x:number, y:number, z:number}} posicionCandidata - Posición horizontal ya resuelta contra colisión, antes de fijar Y al suelo.
 * @param {{altura: number|null, encontrado: boolean}} resultadoRaycast - Resultado de `raycastSuelo` para `posicionCandidata`.
 * @param {{x:number, y:number, z:number}} ultimaPosicionSegura - Último punto con suelo navegable confirmado.
 * @returns {{x:number, y:number, z:number}} Posición final resuelta.
 */
export function resolverPosicionSegura(posicionCandidata, resultadoRaycast, ultimaPosicionSegura) {
  if (!resultadoRaycast.encontrado) {
    return { x: ultimaPosicionSegura.x, y: ultimaPosicionSegura.y, z: ultimaPosicionSegura.z };
  }

  return { x: posicionCandidata.x, y: resultadoRaycast.altura, z: posicionCandidata.z };
}

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
