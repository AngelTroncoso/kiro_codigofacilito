import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * @typedef {Object} AssetManifestEntry
 * @property {string} id - Identificador único del asset dentro del manifiesto
 *   (por ejemplo `"codi"`, `"entorno-biblioteca"`). Se usa como clave en el
 *   `Map` de modelos cargados con éxito y para reportar errores/progreso.
 * @property {string} url - Ruta o URL desde la que `GLTFLoader` debe cargar
 *   el archivo GLB/GLTF.
 * @property {number} [escala] - Factor uniforme aplicado a `scale` para
 *   normalizar diferencias de escala entre fuentes heterogéneas
 *   (Mixamo/Sketchfab/Poly Pizza). Por defecto `1` (sin cambios).
 * @property {{x:number, y:number, z:number}} [rotacionCorreccion] - Corrección
 *   de rotación (radianes, sumada a la rotación existente del objeto)
 *   aplicada para normalizar diferencias de convención de ejes "up" entre
 *   fuentes. Si no se define, no se aplica ninguna corrección.
 * @property {boolean} [critico] - Marca este asset como bloqueante: si su
 *   carga falla, `cargarTodos` reporta `fallaCritica: true` (ver tabla de
 *   Error Handling en design.md — el modelo de Codi es el caso típico, ya
 *   que sin él no hay juego jugable). Los assets no críticos que fallan
 *   solo se reportan en `errores`, sin abortar la carga general. Por
 *   defecto `false`.
 * @property {'codi'|'entorno'|'mecanismo'|'libro'} [categoria] - Categoría
 *   del asset, usada ÚNICAMENTE para elegir qué geometría de respaldo
 *   (placeholder) generar con `crearGeometriaRespaldo` si el archivo GLB
 *   real falla al cargar (ver `usarRespaldoSiFalla`). Si se omite, se usa
 *   un cubo genérico como respaldo. No afecta la carga real del GLB.
 */

/**
 * @typedef {Object} ResultadoCargaAsset
 * @property {string} id - Identificador del asset (igual al de la entrada del manifiesto).
 * @property {boolean} exito - `true` si la carga y normalización se completaron sin error,
 *   O si `usarRespaldoSiFalla` está activo y se generó una geometría de respaldo (ver
 *   `usoRespaldo`) en lugar del GLB real.
 * @property {import('three').Object3D|null} objeto3D - La escena (`gltf.scene`) ya
 *   normalizada vía `normalizarEscalaYEjes`, el `THREE.Mesh` de respaldo (también
 *   normalizado) si `usoRespaldo` es `true`, o `null` si la carga falló y no hay respaldo.
 * @property {Error|null} error - El error capturado si la carga original falló (presente
 *   incluso cuando `usoRespaldo` es `true`, para no perder el diagnóstico de qué asset
 *   real falta), o `null` en éxito real.
 * @property {boolean} [usoRespaldo] - `true` si `objeto3D` es una geometría de respaldo
 *   generada por `crearGeometriaRespaldo` en vez del asset GLB real (porque este falló al
 *   cargar y `usarRespaldoSiFalla` estaba activo). Ausente/`false` en cualquier otro caso.
 */

/**
 * @typedef {Object} ProgresoCarga
 * @property {number} cargados - Cantidad de entradas del manifiesto ya resueltas
 *   (exitosas o fallidas) hasta el momento de este callback.
 * @property {number} total - Cantidad total de entradas en el manifiesto.
 * @property {string} ultimoId - `id` de la entrada que se acaba de resolver.
 */

/**
 * @typedef {Object} ResultadosCargaTodos
 * @property {Map<string, import('three').Object3D>} modelos - Assets cargados y
 *   normalizados exitosamente, indexados por `id`.
 * @property {Array<{id: string, error: Error}>} errores - Entradas cuya carga
 *   del GLB real falló SIN recuperación posible (es decir, `usarRespaldoSiFalla`
 *   estaba desactivado, o estaba activado pero de todos modos no se pudo obtener
 *   un `objeto3D` — caso defensivo que en la práctica no debería ocurrir, ver
 *   `cargarUno`). Con el comportamiento por defecto (`usarRespaldoSiFalla: false`)
 *   este array se comporta exactamente igual que antes de introducir el respaldo.
 * @property {boolean} fallaCritica - `true` si al menos un asset con
 *   `critico: true` está presente en `errores` (ver tabla de Error Handling
 *   en design.md: el fallo del modelo de Codi es bloqueante). Señala a quien
 *   invoque `cargarTodos` que debe mostrarse una pantalla de error
 *   bloqueante (responsabilidad de `UISystem`, fuera del alcance de esta
 *   clase). Con `usarRespaldoSiFalla: true`, un asset crítico que falla pero
 *   obtiene una geometría de respaldo YA NO cuenta como fallo aquí (tiene un
 *   `objeto3D` válido), por lo que `fallaCritica` permanece `false` en ese caso.
 * @property {Array<{id: string, error: Error}>} assetsConRespaldo - Entradas cuyo
 *   GLB real falló pero que terminaron con un `objeto3D` gracias a la geometría de
 *   respaldo (`usoRespaldo: true` en `cargarUno`). Estas SÍ están presentes en
 *   `modelos` (con la malla de respaldo), pero se listan aquí también para que
 *   quien invoque `cargarTodos` (p.ej. `main.js`/`UISystem`) pueda informar de forma
 *   no bloqueante "N assets usan geometría temporal". DECISIÓN DE DISEÑO: estas
 *   entradas NO se agregan a `errores` (que queda reservado para fallos sin
 *   `objeto3D` resultante) — así `errores.length === 0` sigue siendo un indicador
 *   fiable de "no falta ningún objeto3D por mostrar". Siempre es un array vacío
 *   cuando `usarRespaldoSiFalla` es `false` (comportamiento por defecto sin cambios).
 */

/**
 * AssetLoader - Sistema_de_Carga_de_Assets (Requisitos funcionales 1, 2).
 *
 * Envuelve `THREE.GLTFLoader` (+ `THREE.DRACOLoader` opcional) para cargar
 * el manifiesto de assets GLB/GLTF de la Isla, aplicando
 * `normalizarEscalaYEjes` a cada asset para compensar la heterogeneidad de
 * fuentes de terceros (Mixamo/Sketchfab/Poly Pizza) y aislando el fallo de
 * un asset individual para que no aborte la carga de los demás (ver tabla
 * de Error Handling en design.md).
 *
 * Decisión de diseño: DRACO es opcional y **desactivado por defecto**
 * (`usarDraco: false`). Configurar correctamente `DRACOLoader` requiere
 * servir un decodificador adicional (WASM/JS) desde una ruta propia o un
 * CDN, lo cual es un asset/dependencia extra que puede no estar disponible
 * en el MVP de la hackatón. Activarlo (`usarDraco: true`) solo tiene efecto
 * si los modelos GLB realmente usan compresión Draco; si no la usan, no
 * activarlo no tiene ningún costo. Además, la inicialización de
 * `DRACOLoader` se envuelve en `try/catch`: si por cualquier motivo no
 * puede inicializarse (entorno sin soporte, ruta de decodificador
 * inválida, etc.), el constructor de `AssetLoader` no debe romperse —
 * simplemente se continúa sin `DRACOLoader` configurado.
 *
 * Los loaders reales (`GLTFLoader`/`DRACOLoader`) se instancian internamente
 * por defecto, pero pueden inyectarse por constructor (`{ gltfLoader,
 * dracoLoader }`) para poder testear esta clase con mocks controlados
 * (p.ej. un `gltfLoader.loadAsync` que resuelve/rechaza de forma
 * determinista) sin depender de red ni de assets reales.
 */
export class AssetLoader {
  /**
   * @param {Object} [opciones]
   * @param {boolean} [opciones.usarDraco] - Si `true`, intenta inicializar
   *   un `DRACOLoader` real y asociarlo al `GLTFLoader` interno vía
   *   `setDRACOLoader`. Por defecto `false` (ver justificación de diseño en
   *   el JSDoc de la clase). Ignorado si se inyecta `dracoLoader`
   *   explícitamente.
   * @param {string} [opciones.rutaDecodificadorDraco] - Ruta al directorio
   *   de decodificadores de Draco, usada solo cuando `usarDraco` es `true`
   *   y no se inyectó un `dracoLoader`. Por defecto usa el CDN público de
   *   Draco.
   * @param {{ loadAsync?: (url: string) => Promise<{scene: import('three').Object3D}>, setDRACOLoader?: (d: unknown) => void }} [opciones.gltfLoader] -
   *   Instancia de `GLTFLoader` (o mock compatible) a usar en vez de crear
   *   una nueva internamente. Útil para inyectar un mock en tests.
   * @param {unknown} [opciones.dracoLoader] - Instancia de `DRACOLoader` (o
   *   mock compatible) a asociar al `gltfLoader` vía `setDRACOLoader`. Si se
   *   provee, tiene prioridad sobre `usarDraco`.
   * @param {boolean} [opciones.usarRespaldoSiFalla] - Si `true`, cuando la
   *   carga del GLB real de una entrada falla, `cargarUno` genera una
   *   geometría primitiva de respaldo (ver `crearGeometriaRespaldo`) en vez
   *   de reportar la entrada como fallida sin `objeto3D`. Esto asegura que
   *   el juego nunca aborte por assets faltantes/corruptos, ni siquiera para
   *   el asset crítico. **Opt-in, por defecto `false`**: preserva
   *   exactamente el comportamiento previo a esta opción (usado por los
   *   tests existentes y por cualquier código que no la active
   *   explícitamente). Se activa explícitamente en la instancia real usada
   *   por `main.js`.
   */
  constructor({
    usarDraco = false,
    rutaDecodificadorDraco = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/',
    gltfLoader,
    dracoLoader,
    usarRespaldoSiFalla = false,
  } = {}) {
    /** @private */
    this._gltfLoader = gltfLoader ?? new GLTFLoader();

    /** @private */
    this._usarRespaldoSiFalla = usarRespaldoSiFalla;

    /** @private */
    this._dracoLoader = null;

    if (dracoLoader) {
      try {
        this._dracoLoader = dracoLoader;
        this._gltfLoader.setDRACOLoader?.(this._dracoLoader);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[AssetLoader] No se pudo asociar el DRACOLoader inyectado, se continúa sin él:', error);
        this._dracoLoader = null;
      }
    } else if (usarDraco) {
      // Tolerante a fallos: si DRACOLoader no puede inicializarse por
      // cualquier motivo, el constructor de AssetLoader no debe romperse.
      try {
        this._dracoLoader = new DRACOLoader();
        this._dracoLoader.setDecoderPath(rutaDecodificadorDraco);
        this._gltfLoader.setDRACOLoader(this._dracoLoader);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[AssetLoader] No se pudo inicializar DRACOLoader, se continúa sin compresión Draco:', error);
        this._dracoLoader = null;
      }
    }
  }

  /**
   * Aplica la normalización de escala y ejes declarada en `entry` sobre
   * `objeto3D`, mutándolo en el lugar. Es el punto de adaptación explícito
   * para assets de terceros (Mixamo/Sketchfab/Poly Pizza): `entry.escala` y
   * `entry.rotacionCorreccion` se determinan una vez, manualmente, al
   * integrar cada asset — esta función no intenta detectar ni corregir
   * heterogeneidad de forma automática ("sin magia en tiempo de ejecución").
   *
   * Opera sobre cualquier objeto con propiedades `scale`/`rotation`
   * compatibles con la API de Three.js (incluyendo mocks simples en tests),
   * sin depender de una escena real.
   *
   * @param {{scale: {setScalar: (s:number)=>void}, rotation: {x:number,y:number,z:number}}} objeto3D -
   *   Objeto a normalizar (típicamente `gltf.scene`).
   * @param {AssetManifestEntry} entry - Entrada del manifiesto con los parámetros de normalización.
   * @returns {typeof objeto3D} El mismo `objeto3D` recibido, por conveniencia (encadenable).
   */
  normalizarEscalaYEjes(objeto3D, entry) {
    objeto3D.scale.setScalar(entry.escala ?? 1);

    if (entry.rotacionCorreccion) {
      objeto3D.rotation.x += entry.rotacionCorreccion.x ?? 0;
      objeto3D.rotation.y += entry.rotacionCorreccion.y ?? 0;
      objeto3D.rotation.z += entry.rotacionCorreccion.z ?? 0;
    }

    return objeto3D;
  }

  /**
   * Genera un `THREE.Mesh` primitivo simple para usar como geometría de
   * respaldo (placeholder visual) cuando el GLB real de una entrada del
   * manifiesto no existe o falla al cargar (ver `usarRespaldoSiFalla`).
   *
   * La geometría/color elegidos dependen de `entry.categoria` (si se omite,
   * se usa un cubo genérico gris):
   *   - `'codi'`: modelo procedural compuesto (`THREE.Group`) que aproxima
   *     la silueta reconocible de la mascota — ver `_crearModeloCodiProcedural`.
   *   - `'entorno'`: caja grande y plana, marrón/tierra — plataforma de
   *     suelo básica.
   *   - `'mecanismo'`: caja mediana, azul/gris.
   *   - `'libro'`: caja pequeña, dorado/amarillo.
   *   - default/`'generico'`: cubo 1x1x1 gris.
   *
   * El resultado (sea `THREE.Mesh` o, para `'codi'`, `THREE.Group`) lleva
   * `userData.esRespaldo = true` y `userData.assetId = entry.id`, para poder
   * identificarlo visualmente o en depuración (p.ej. saber qué reemplazar
   * cuando lleguen los assets reales). Ambos tipos de objeto exponen
   * `position`/`rotation`/`scale` compatibles con la API de `THREE.Object3D`,
   * por lo que el resto del sistema (`RenderEngine.registrarCodi`/`render`,
   * `normalizarEscalaYEjes`) no necesita distinguir entre ambos casos.
   *
   * @param {AssetManifestEntry} entry
   * @returns {import('three').Mesh|import('three').Group}
   */
  crearGeometriaRespaldo(entry) {
    const categoria = entry.categoria ?? 'generico';

    if (categoria === 'codi') {
      const modelo = this._crearModeloCodiProcedural();
      modelo.userData.esRespaldo = true;
      modelo.userData.assetId = entry.id;
      return modelo;
    }

    let geometria;
    let color;

    switch (categoria) {
      case 'entorno':
        geometria = new THREE.BoxGeometry(10, 0.5, 10);
        color = 0x8d6e63;
        break;
      case 'mecanismo':
        geometria = new THREE.BoxGeometry(1.5, 1, 1.5);
        color = 0x5c8aab;
        break;
      case 'libro':
        geometria = new THREE.BoxGeometry(0.4, 0.5, 0.3);
        color = 0xf4c430;
        break;
      default:
        geometria = new THREE.BoxGeometry(1, 1, 1);
        color = 0x999999;
        break;
    }

    const material = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geometria, material);
    mesh.userData.esRespaldo = true;
    mesh.userData.assetId = entry.id;

    return mesh;
  }

  /**
   * Construye un modelo procedural compuesto de Codi (la mascota: un
   * cocodrilo/caimán verde cartoon con panza amarilla a rayas, ojos grandes
   * y expresivos, hocico alargado y cola) combinando primitivas simples de
   * Three.js con `MeshStandardMaterial`, ensambladas como hijos de un único
   * `THREE.Group`.
   *
   * Piezas incluidas (todas hijas directas o anidadas del `Group` devuelto):
   *   - Torso: esfera verde achatada (nodo base).
   *   - Panza: esfera amarilla más pequeña, superpuesta al frente/abajo del
   *     torso (color sólido diferenciado — suficiente para el MVP, sin
   *     textura de rayas real).
   *   - Cabeza: esfera verde sobre/adelante del torso.
   *   - Hocico: caja alargada y achatada, verde, saliendo hacia adelante de
   *     la cabeza.
   *   - Ojos: dos esferas blancas con una pupila negra más pequeña anidada
   *     como hijo de cada una.
   *   - Cola: cono verde alargado, saliendo hacia atrás del torso.
   *   - Crestas: dos conos pequeños verdes sobre el lomo (detalle opcional).
   *
   * Altura total aproximada ~1.6 unidades, en línea con la cápsula de
   * respaldo previa, para no alterar las proporciones relativas al resto de
   * la escena (jugador/mundo).
   *
   * @private
   * @returns {import('three').Group}
   */
  _crearModeloCodiProcedural() {
    const VERDE = 0x2ecc71;
    const AMARILLO = 0xf4c430;
    const BLANCO = 0xffffff;
    const NEGRO = 0x1a1a1a;

    const materialVerde = new THREE.MeshStandardMaterial({ color: VERDE });
    const materialAmarillo = new THREE.MeshStandardMaterial({ color: AMARILLO });
    const materialBlanco = new THREE.MeshStandardMaterial({ color: BLANCO });
    const materialNegro = new THREE.MeshStandardMaterial({ color: NEGRO });

    const grupo = new THREE.Group();

    // Torso: esfera verde achatada para dar forma ovalada de cuerpo.
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), materialVerde);
    torso.scale.set(1, 0.75, 1.2);
    torso.position.set(0, 0.5, 0);
    grupo.add(torso);

    // Panza amarilla: esfera más pequeña, al frente/abajo del torso,
    // ligeramente superpuesta.
    const panza = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), materialAmarillo);
    panza.scale.set(0.9, 0.7, 0.7);
    panza.position.set(0, 0.35, 0.28);
    grupo.add(panza);

    // Cabeza: esfera verde arriba/adelante del torso.
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), materialVerde);
    cabeza.position.set(0, 0.95, 0.35);
    grupo.add(cabeza);

    // Hocico: caja alargada y achatada saliendo hacia adelante de la cabeza.
    const hocico = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.5), materialVerde);
    hocico.position.set(0, 0.85, 0.72);
    grupo.add(hocico);

    // Ojos: dos esferas blancas con pupila negra anidada.
    const offsetsOjos = [-0.14, 0.14];
    for (const offsetX of offsetsOjos) {
      const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), materialBlanco);
      ojo.position.set(offsetX, 1.15, 0.42);
      grupo.add(ojo);

      const pupila = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), materialNegro);
      // Posición relativa al ojo (hijo de la esfera blanca): ligeramente
      // adelante/arriba, simulando la pupila.
      pupila.position.set(0, 0.02, 0.07);
      ojo.add(pupila);
    }

    // Cola: cono verde alargado saliendo hacia atrás del torso.
    const cola = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 8), materialVerde);
    cola.rotation.x = Math.PI / 2;
    cola.position.set(0, 0.45, -0.75);
    grupo.add(cola);

    // Crestas: pequeños conos verdes sobre el lomo (detalle opcional).
    const offsetsCrestas = [-0.15, 0.15];
    for (const offsetZ of offsetsCrestas) {
      const cresta = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 8), materialVerde);
      cresta.position.set(0, 0.92, offsetZ);
      grupo.add(cresta);
    }

    return grupo;
  }

  /**
   * Carga un único asset del manifiesto. Nunca rechaza la Promise devuelta:
   * cualquier error de `GLTFLoader` (archivo faltante, corrupto, error de
   * red) se captura internamente y se refleja en el campo `error` del
   * resultado. La distinción "crítico vs no crítico" NO se resuelve aquí
   * — ocurre en `cargarTodos`, que es quien conoce el manifiesto completo.
   *
   * Comportamiento ante fallo, según `usarRespaldoSiFalla` (opción del
   * constructor, por defecto `false`):
   *   - `false` (default, preserva el comportamiento previo a esta opción):
   *     se devuelve `{ exito: false, objeto3D: null, error }`.
   *   - `true`: se genera una geometría de respaldo vía
   *     `crearGeometriaRespaldo`, se le aplica `normalizarEscalaYEjes` igual
   *     que a un asset exitoso, y se devuelve `{ exito: true, objeto3D:
   *     <respaldo>, error, usoRespaldo: true }`. El error original NO se
   *     descarta (queda en el campo `error`) para no perder el diagnóstico
   *     de qué asset real falta reemplazar. En cualquier caso, el fallo
   *     original se registra en consola (`console.error`) para que quede
   *     constancia de que ese asset está usando un placeholder.
   *
   * @param {AssetManifestEntry} entry
   * @returns {Promise<ResultadoCargaAsset>}
   */
  async cargarUno(entry) {
    try {
      const gltf = await this._gltfLoader.loadAsync(entry.url);
      const objeto3D = this.normalizarEscalaYEjes(gltf.scene, entry);
      return { id: entry.id, exito: true, objeto3D, error: null };
    } catch (error) {
      if (this._usarRespaldoSiFalla) {
        // eslint-disable-next-line no-console
        console.error(
          `[AssetLoader] No se pudo cargar el asset "${entry.id}" (${entry.url}); se usa geometría de respaldo temporal:`,
          error
        );
        const respaldo = this.normalizarEscalaYEjes(this.crearGeometriaRespaldo(entry), entry);
        return { id: entry.id, exito: true, objeto3D: respaldo, error, usoRespaldo: true };
      }
      return { id: entry.id, exito: false, objeto3D: null, error };
    }
  }

  /**
   * Carga todas las entradas del manifiesto, sin que el fallo de una
   * entrada detenga la carga de las demás (usa `Promise.allSettled`: dado
   * que `cargarUno` nunca rechaza, esto es una capa de robustez adicional
   * sobre el comportamiento ya seguro de `Promise.all`).
   *
   * Registra en `console.error` cualquier fallo (incluyendo el `id` del
   * asset), reporta progreso incremental vía `onProgreso` conforme cada
   * asset se resuelve, y agrega los resultados en
   * `modelos`/`errores`/`fallaCritica`.
   *
   * `fallaCritica` señala a quien invoque este método que debe mostrarse la
   * pantalla de error bloqueante descrita en la tabla de Error Handling de
   * design.md (implementada por `UISystem` en tareas posteriores), sin que
   * eso implique perder los assets que sí se cargaron con éxito. Con
   * `usarRespaldoSiFalla: true` (ver constructor), un asset crítico que
   * falla pero recibe una geometría de respaldo ya no dispara
   * `fallaCritica` (sí tiene un `objeto3D` válido); en su lugar, esa
   * entrada se agrega a `assetsConRespaldo` (ver `ResultadosCargaTodos`),
   * permitiendo informar de forma no bloqueante qué assets están usando
   * geometría temporal.
   *
   * @param {AssetManifestEntry[]} manifiesto
   * @param {(progreso: ProgresoCarga) => void} [onProgreso] - Callback
   *   opcional invocado cada vez que se resuelve un asset (exitoso o
   *   fallido).
   * @returns {Promise<ResultadosCargaTodos>}
   */
  async cargarTodos(manifiesto, onProgreso) {
    const total = manifiesto.length;
    let cargados = 0;

    const asentados = await Promise.allSettled(
      manifiesto.map((entry) => this.cargarUno(entry))
    );

    /** @type {Map<string, import('three').Object3D>} */
    const modelos = new Map();
    /** @type {Array<{id: string, error: Error}>} */
    const errores = [];
    /** @type {Array<{id: string, error: Error}>} */
    const assetsConRespaldo = [];
    let fallaCritica = false;

    asentados.forEach((asentado, indice) => {
      const entry = manifiesto[indice];

      // cargarUno no relanza excepciones, por lo que en la práctica siempre
      // llegará como 'fulfilled'; se maneja el caso 'rejected' de forma
      // defensiva por si en el futuro cambia esa garantía.
      const resultado =
        asentado.status === 'fulfilled'
          ? asentado.value
          : { id: entry.id, exito: false, objeto3D: null, error: asentado.reason };

      if (resultado.exito) {
        modelos.set(resultado.id, resultado.objeto3D);
        if (resultado.usoRespaldo) {
          assetsConRespaldo.push({ id: resultado.id, error: resultado.error });
        }
      } else {
        // eslint-disable-next-line no-console
        console.error(`[AssetLoader] Falló la carga del asset "${entry.id}" (${entry.url}):`, resultado.error);
        errores.push({ id: resultado.id, error: resultado.error });
        if (entry.critico) {
          fallaCritica = true;
        }
      }

      cargados += 1;
      onProgreso?.({ cargados, total, ultimoId: entry.id });
    });

    return { modelos, errores, fallaCritica, assetsConRespaldo };
  }
}
