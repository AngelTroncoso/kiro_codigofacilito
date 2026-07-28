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
   * La geometría/material elegidos dependen de `entry.categoria` (si se
   * omite, se usa un cubo genérico gris):
   *   - `'codi'`: modelo procedural compuesto (`THREE.Group`) que aproxima
   *     la silueta reconocible de la mascota — ver `_crearModeloCodiProcedural`.
   *   - `'entorno'`: caja grande y plana, plataforma metalizada oscura
   *     (tono servidor/espacio, alto roughness/metalness) — ver
   *     estética cyberpunk/sci-fi de la "Biblioteca del Código".
   *   - `'mecanismo'`: caja mediana, mismo metal oscuro de base pero con
   *     `emissive` cian para simular circuitos/módulos de código activos.
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
    let material;

    switch (categoria) {
      case 'entorno':
        // Plataforma de piedra antigua (SPEC-03: World Atmosphere &
        // Rendering, docs/art-direction.md secciones 1 y 17): alto
        // roughness y metalness moderado para un acabado mineral, no
        // pulido/futurista, con un `emissive` muy sutil y frío que sugiere
        // "conocimiento vivo" latente bajo la superficie (bioluminiscencia
        // apenas perceptible, no un módulo activo como los mecanismos) —
        // color/roughness/metalness base sin cambios respecto a la
        // implementación previa (AssetLoader.fallback.test.js los fija).
        //
        // HACKATHON AWS: Textura dinámica con logo AWS proyectado + emissive
        // naranja brillante para que el logo brille con luz propia, visible
        // en cualquier condición de iluminación. La textura se asigna tanto
        // a `map` (color base) como a `emissiveMap` (emisión de luz) para
        // máxima visibilidad del sponsor oficial.
        geometria = new THREE.BoxGeometry(10, 0.5, 10);
        {
          const texturaAWS = this._crearTexturaAWS();
          material = new THREE.MeshStandardMaterial({
            color: 0x1e293b,
            roughness: 0.85,
            metalness: 0.6,
            emissive: new THREE.Color(0xFF9900), // Naranja AWS como emisión de luz
            emissiveIntensity: 0.8, // Intensidad calibrada para brillo sin saturar
            map: texturaAWS, // Textura AWS como color base
            emissiveMap: texturaAWS, // Misma textura para emisión de luz propia
          });
        }
        break;
      case 'mecanismo':
        // Mismo metal oscuro de base que las plataformas, pero con un
        // acento emissive cian para simular circuitos/módulos de código
        // activos (interactivo, se distingue visualmente del entorno pasivo).
        geometria = new THREE.BoxGeometry(1.5, 1, 1.5);
        material = new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          roughness: 0.7,
          metalness: 0.5,
          emissive: 0x06b6d4,
          emissiveIntensity: 0.3,
        });
        break;
      case 'libro':
        // Los libros de conocimiento se crean con geometría genérica aquí,
        // pero se personalizan por habilidad en main.js usando
        // _crearLibroConocimiento3D() cuando se clonan y posicionan.
        geometria = new THREE.BoxGeometry(0.4, 0.5, 0.3);
        material = new THREE.MeshStandardMaterial({ color: 0xf4c430 });
        break;
      default:
        geometria = new THREE.BoxGeometry(1, 1, 1);
        material = new THREE.MeshStandardMaterial({ color: 0x999999 });
        break;
    }

    const mesh = new THREE.Mesh(geometria, material);
    mesh.userData.esRespaldo = true;
    mesh.userData.assetId = entry.id;

    return mesh;
  }

  /**
   * Construye un modelo procedural compuesto de Codi (la mascota oficial: un
   * cocodrilo/caimán verde esmeralda con vientre amarillo cálido a rayas de
   * escamas, ojos grandes y expresivos, hocico alargado con dientes
   * visibles, patas y brazos, y una cresta de picos que recorre el lomo
   * hasta la punta de la cola) combinando primitivas simples de Three.js
   * con `MeshStandardMaterial`, ensambladas como hijos de un único
   * `THREE.Group`.
   *
   * Piezas incluidas (todas hijas directas o anidadas del `Group` devuelto):
   *   - Cuerpo: torso ovoide verde esmeralda/neón (con un ligero `emissive`
   *     para el efecto "neón") y una placa de vientre amarilla cálida
   *     (`0xfbcd16`) con líneas de escamas horizontales (anillos delgados)
   *     superpuestas.
   *   - Cabeza y rostro: hocico alargado y plano con fosas nasales,
   *     dientes triangulares blancos visibles a los lados de la mandíbula,
   *     y dos ojos grandes (esferas blancas con pupila negra anidada)
   *     orientados al frente.
   *   - Extremidades: dos patas traseras cortas y firmes (con garras
   *     pequeñas) y dos brazos delanteros, cada uno montado sobre un
   *     `THREE.Group` "pivote" (hombro/cadera) en vez de directamente sobre
   *     el torso, para poder rotarlos de forma creíble en el ciclo de
   *     caminata (ver `userData.partesAnimables` más abajo).
   *   - Cresta y cola: picos (conos) verdes alineados sobre el lomo, más
   *     una cola (cono alargado) montada sobre su propio `Group` pivote en
   *     la base, con picos adicionales más pequeños hasta la punta.
   *
   * `userData.partesAnimables` expone las referencias a los `Group` pivote
   * de patas traseras, brazos y cola (NO al torso/cabeza, que permanecen
   * estáticos) para que `RenderEngine`/`actualizarCicloCaminata` pueda
   * oscilarlos en cada frame según la velocidad de Codi, sin que quien
   * anime necesite conocer la jerarquía interna completa del modelo:
   *   `{ patasTraseras: [Group, Group], brazos: [Group, Group], cola: Group }`
   *
   * Altura total aproximada ~1.3 unidades (pies a la altura del suelo
   * `y≈0`, cabeza hasta `y≈1.28`), en línea con las proporciones previas
   * para no alterar demasiado la relación con el resto de la escena
   * (jugador/mundo).
   *
   * @private
   * @returns {import('three').Group}
   */
  _crearModeloCodiProcedural() {
    const VERDE = 0x1fce6b; // verde neón/esmeralda
    const VERDE_OSCURO = 0x188a52; // detalle de garras
    const AMARILLO_VIENTRE = 0xfbcd16; // vientre, amarillo cálido oficial
    const AMARILLO_ESCAMA = 0xd9a915; // líneas de escamas del vientre, tono más oscuro
    const BLANCO = 0xffffff;
    const NEGRO = 0x1a1a1a;

    const materialVerde = new THREE.MeshStandardMaterial({
      color: VERDE,
      emissive: new THREE.Color(VERDE),
      emissiveIntensity: 0.12,
    });
    const materialVerdeOscuro = new THREE.MeshStandardMaterial({ color: VERDE_OSCURO });
    const materialVientre = new THREE.MeshStandardMaterial({ color: AMARILLO_VIENTRE });
    const materialEscama = new THREE.MeshStandardMaterial({ color: AMARILLO_ESCAMA });
    // Esclerótica blanca BRILLANTE: además del color blanco puro, se le da
    // un ligero `emissive` blanco para que los ojos resalten visualmente
    // sobre el verde del resto del cuerpo (ajuste de Ojos y Mirada).
    const materialBlanco = new THREE.MeshStandardMaterial({
      color: BLANCO,
      emissive: new THREE.Color(BLANCO),
      emissiveIntensity: 0.15,
    });
    const materialNegro = new THREE.MeshStandardMaterial({ color: NEGRO });

    const grupo = new THREE.Group();

    // --- Cuerpo y vientre ---

    // Torso: esfera verde ovoide (nodo base del cuerpo).
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), materialVerde);
    torso.scale.set(1, 0.8, 1.35);
    torso.position.set(0, 0.62, 0);
    grupo.add(torso);

    // Vientre: placa amarilla cálida, ligeramente curvada, superpuesta al
    // frente/abajo del torso. Escalado y desplazado más hacia el
    // frente/abajo (mayor que la versión anterior) para que sea claramente
    // visible desde la cámara en vez de quedar semi-oculto detrás del
    // torso verde.
    const vientre = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), materialVientre);
    vientre.scale.set(0.95, 0.68, 0.75);
    vientre.position.set(0, 0.38, 0.4);
    grupo.add(vientre);

    // Líneas de escamas horizontales sobre el vientre: bandas planas y
    // delgadas (cajas achatadas, no anillos/toros) que lo envuelven a
    // distintas alturas. Se usan `BoxGeometry` en vez de `TorusGeometry`
    // deliberadamente: un torus de pocos segmentos, visto de perfil/desde
    // abajo, se leía visualmente como una espiral/resorte flotando bajo el
    // cuerpo (defecto reportado y eliminado); una banda plana da el mismo
    // efecto de "línea de escama" sin ese artefacto de lectura 3D.
    const alturasEscamas = [0.26, 0.34, 0.42];
    for (const y of alturasEscamas) {
      const lineaEscama = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.05), materialEscama);
      lineaEscama.position.set(0, y, 0.62);
      grupo.add(lineaEscama);
    }

    // --- Cabeza y rostro ---

    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), materialVerde);
    cabeza.scale.set(1, 0.85, 1);
    cabeza.position.set(0, 1.02, 0.38);
    grupo.add(cabeza);

    // Hocico alargado y plano, saliendo hacia adelante de la cabeza.
    const hocico = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.55), materialVerde);
    hocico.position.set(0, 0.93, 0.78);
    grupo.add(hocico);

    // Fosas nasales, en la punta superior del hocico.
    const offsetsNarinas = [-0.06, 0.06];
    for (const x of offsetsNarinas) {
      const narina = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), materialNegro);
      narina.position.set(x, 1.0, 1.02);
      grupo.add(narina);
    }

    // Dientes triangulares blancos, visibles a los lados de la mandíbula.
    const offsetsDientes = [-0.12, -0.05, 0.05, 0.12];
    for (const x of offsetsDientes) {
      const diente = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4), materialBlanco);
      diente.rotation.x = Math.PI;
      diente.position.set(x, 0.865, 0.95);
      grupo.add(diente);
    }

    // Ojos grandes y expresivos, con esclerótica blanca brillante y
    // pupila negra anidada mirando estrictamente hacia el frente (eje +Z
    // del ojo, sin componente vertical): la pupila se posiciona a la misma
    // altura Y que el centro del ojo (y=0 relativo), solo desplazada en Z,
    // para que la mirada de Codi apunte al frente y no hacia arriba.
    //
    // Las referencias a cada ojo y su pupila se guardan en `ojos`/`pupilas`
    // (mismo patrón que `patasTraseras`/`brazos`/`cola` más abajo) para que
    // `RenderEngine` pueda animarlas (parpadeo, micro-movimientos de
    // mirada) sin que este método necesite saber nada sobre esa animación
    // — geometría, materiales y posiciones iniciales quedan sin cambios.
    const ojos = [];
    const pupilas = [];
    const offsetsOjos = [-0.15, 0.15];
    for (const offsetX of offsetsOjos) {
      const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), materialBlanco);
      ojo.position.set(offsetX, 1.18, 0.5);
      grupo.add(ojo);
      ojos.push(ojo);

      const pupila = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), materialNegro);
      pupila.position.set(0, 0, 0.095);
      ojo.add(pupila);
      pupilas.push(pupila);
    }

    // --- Extremidades ---

    // Patas traseras: cortas y firmes, cada una sobre un Group pivote (la
    // cadera) para poder rotarlas de forma creíble en el ciclo de caminata,
    // con pequeñas garras en la punta.
    const patasTraseras = [];
    // Offsets ligeramente mayores que la versión anterior (-0.24/0.24) para
    // una postura más firme y natural, con las patas apoyadas un poco más
    // hacia afuera del eje central del cuerpo.
    const offsetsPatasTraseras = [-0.3, 0.3];
    for (const x of offsetsPatasTraseras) {
      const pivotPata = new THREE.Group();
      pivotPata.position.set(x, 0.34, -0.12);
      grupo.add(pivotPata);

      const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.32, 8), materialVerde);
      pata.position.set(0, -0.16, 0);
      pivotPata.add(pata);

      const offsetsGarras = [-0.05, 0, 0.05];
      for (const gx of offsetsGarras) {
        const garra = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 6), materialVerdeOscuro);
        garra.rotation.x = Math.PI / 2;
        garra.position.set(gx, -0.32, 0.07);
        pivotPata.add(garra);
      }

      patasTraseras.push(pivotPata);
    }

    // Brazos: dos brazos superiores, cada uno sobre un Group pivote (el
    // hombro) para el ciclo de caminata.
    const brazos = [];
    const offsetsBrazos = [-0.34, 0.34];
    for (const x of offsetsBrazos) {
      const pivotBrazo = new THREE.Group();
      pivotBrazo.position.set(x, 0.58, 0.15);
      grupo.add(pivotBrazo);

      const brazo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 8), materialVerde);
      brazo.rotation.z = x < 0 ? 0.35 : -0.35;
      brazo.position.set(0, -0.14, 0);
      pivotBrazo.add(brazo);

      brazos.push(pivotBrazo);
    }

    // --- Cresta y cola ---

    // Picos de la cresta sobre el lomo (fijos, no animados).
    const offsetsCrestaLomo = [-0.28, -0.08, 0.12, 0.32];
    for (const z of offsetsCrestaLomo) {
      const cresta = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), materialVerde);
      cresta.position.set(0, 0.98, z);
      grupo.add(cresta);
    }

    // Cola: cono verde alargado sobre un Group pivote en la base, con picos
    // adicionales de la cresta hasta la punta (todos animados junto con la cola).
    const pivotCola = new THREE.Group();
    pivotCola.position.set(0, 0.55, -0.55);
    grupo.add(pivotCola);

    const cola = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.85, 8), materialVerde);
    cola.rotation.x = Math.PI / 2;
    cola.position.set(0, 0, -0.4);
    pivotCola.add(cola);

    const offsetsCrestaCola = [-0.15, -0.35, -0.55, -0.75];
    for (const z of offsetsCrestaCola) {
      const crestaCola = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 6), materialVerde);
      crestaCola.position.set(0, 0.14, z);
      pivotCola.add(crestaCola);
    }

    grupo.userData.partesAnimables = { patasTraseras, brazos, cola: pivotCola, ojos, pupilas, cabeza };

    return grupo;
  }

  /**
   * HACKATHON AWS: Genera una textura dinámica usando HTML Canvas con el
   * logo "AWS" prominente y limpio en naranja oficial (#FF9900) sobre fondo
   * oscuro profesional.
   * 
   * Diseño simplificado: Fondo azul oscuro profundo (#070b19), marco naranja
   * de 12px, logo "AWS" ultra-bold centrado en tamaño prominente (200px).
   * 
   * Cero archivos externos - todo generado en memoria mediante Canvas 2D API.
   * 
   * @private
   * @returns {import('three').CanvasTexture}
   */
  _crearTexturaAWS() {
    // Crear canvas en memoria (sin agregarlo al DOM)
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // Fallback: retornar textura vacía si canvas no está disponible
      return new THREE.CanvasTexture(canvas);
    }

    // Fondo azul oscuro profundo (coherente con estética de servidor)
    ctx.fillStyle = '#070b19';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Marco naranja AWS de 12px de grosor
    ctx.strokeStyle = '#FF9900';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    // Configuración de texto AWS principal (ultra-bold, 200px prominente)
    ctx.fillStyle = '#FF9900'; // Naranja oficial de AWS
    ctx.font = '900 200px Arial, sans-serif'; // 900 = ultra-bold, tamaño aumentado
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Glow naranja intenso para efecto neón brillante
    ctx.shadowColor = '#FF9900';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Dibujar "AWS" centrado (sin textos adicionales)
    ctx.fillText('AWS', canvas.width / 2, canvas.height / 2);

    // Crear y configurar la textura de Three.js
    const textura = new THREE.CanvasTexture(canvas);
    textura.needsUpdate = true;
    
    return textura;
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

  /**
   * Crea un "Libro de Conocimiento" 3D procedural con geometrías nativas de
   * Three.js, diseñado para ser visualmente reconocible como un libro real
   * con portada, páginas y lomo. El color de la portada se asigna según la
   * habilidad del lenguaje de programación.
   * 
   * Componentes del libro:
   * - PORTADA/PASTA: BoxGeometry con el color distintivo del lenguaje
   *   (Python azul, JavaScript amarillo, SQL cian) + emissive para brillo
   * - HOJAS/PÁGINAS: BoxGeometry interior blanco/crema que simula el bloque
   *   de hojas sobresaliendo por 3 lados
   * - LOMO: Sección lateral de la portada ligeramente más gruesa
   * 
   * El libro se retorna dentro de un THREE.Group con rotación inicial de
   * ~15 grados para darle aspecto dinámico de ítem coleccionable.
   * 
   * @param {'python'|'javascript'|'sql'} habilidadId - Identificador de la
   *   habilidad para determinar el color de la portada
   * @returns {THREE.Group} Grupo que contiene el libro 3D completo
   */
  crearLibroConocimiento3D(habilidadId) {
    const grupo = new THREE.Group();

    // Colores y siglas por lenguaje de programación
    const CONFIGURACION_LENGUAJES = {
      python: { 
        colorFondo: 0x306998,      // Azul Python oficial
        siglas: 'PY',
        colorTexto: '#FFD43B',     // Amarillo Python
      },
      javascript: { 
        colorFondo: 0xf7df1e,      // Amarillo JavaScript oficial
        siglas: 'JS',
        colorTexto: '#323330',     // Negro/marrón JS
      },
      sql: { 
        colorFondo: 0x00758f,      // Azul cian tecnológico SQL
        siglas: 'SQL',
        colorTexto: '#FFFFFF',     // Blanco brillante
      },
    };

    const config = CONFIGURACION_LENGUAJES[habilidadId] || { 
      colorFondo: 0x8b4513, 
      siglas: '??', 
      colorTexto: '#FFFFFF' 
    };

    // Crear textura con siglas usando Canvas2D
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Fondo del color del lenguaje
    ctx.fillStyle = '#' + config.colorFondo.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, 256, 256);

    // Dibujar siglas en el centro
    ctx.fillStyle = config.colorTexto;
    ctx.font = 'bold 120px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(config.siglas, 128, 128);

    // Convertir canvas a textura
    const textura = new THREE.CanvasTexture(canvas);
    textura.needsUpdate = true;

    // PORTADA/PASTA - Tapa frontal y trasera del libro
    const geometriaPortada = new THREE.BoxGeometry(0.5, 0.7, 0.05);
    const materialPortada = new THREE.MeshStandardMaterial({
      map: textura,                  // Textura con siglas
      emissive: config.colorFondo,
      emissiveMap: textura,          // Textura también en emisión para que las siglas brillen
      emissiveIntensity: 0.85,       // Brillo intenso para máxima visibilidad a distancia
      roughness: 0.4,
      metalness: 0.3,
    });

    // Material sin textura para la tapa trasera
    const materialPortadaTrasera = new THREE.MeshStandardMaterial({
      color: config.colorFondo,
      emissive: config.colorFondo,
      emissiveIntensity: 0.85,
      roughness: 0.4,
      metalness: 0.3,
    });

    // Tapa frontal (con siglas)
    const portadaFrontal = new THREE.Mesh(geometriaPortada, materialPortada);
    portadaFrontal.position.z = 0.125;
    grupo.add(portadaFrontal);

    // Tapa trasera (sin siglas)
    const portadaTrasera = new THREE.Mesh(geometriaPortada, materialPortadaTrasera);
    portadaTrasera.position.z = -0.125;
    grupo.add(portadaTrasera);

    // LOMO - Lateral del libro (un poco más grueso)
    const geometriaLomo = new THREE.BoxGeometry(0.52, 0.72, 0.05);
    const materialLomo = new THREE.MeshStandardMaterial({
      color: config.colorFondo,
      emissive: config.colorFondo,
      emissiveIntensity: 0.85,
      roughness: 0.4,
      metalness: 0.3,
    });
    const lomo = new THREE.Mesh(geometriaLomo, materialLomo);
    lomo.rotation.y = Math.PI / 2; // Rotar 90° para que sea el lateral
    lomo.position.x = -0.225;
    grupo.add(lomo);

    // HOJAS/PÁGINAS - Bloque interior blanco/crema
    const geometriaPaginas = new THREE.BoxGeometry(0.44, 0.64, 0.2);
    const materialPaginas = new THREE.MeshStandardMaterial({
      color: 0xf0f0f0,      // Blanco/crema para simular papel
      roughness: 0.9,       // Alta rugosidad para textura de papel
      metalness: 0.0,
    });
    const paginas = new THREE.Mesh(geometriaPaginas, materialPaginas);
    paginas.position.x = 0.03; // Desplazar ligeramente para que sobresalga del lado opuesto al lomo
    grupo.add(paginas);

    // Inclinación inicial de ~15 grados para aspecto dinámico
    grupo.rotation.x = Math.PI / 12; // ~15 grados
    grupo.rotation.z = -Math.PI / 24; // ~7.5 grados adicionales en Z

    // Metadata para identificar que es un libro de conocimiento
    grupo.userData.esLibroConocimiento = true;
    grupo.userData.habilidadId = habilidadId;

    return grupo;
  }

  /**
   * SPEC-CHAR01: Crea un modelo 3D procedural del personaje "Kiro", el
   * fantasmita blanco de AWS/Kiro Cloud. Compuesto exclusivamente por
   * geometrías procedimentales de Three.js (cero archivos externos).
   *
   * Estructura visual (silueta de fantasma clásico):
   *   - Cuerpo: esfera blanca alargada (0xFFFFFF) con emisivo suave.
   *   - Ojos: 2 óvalos negros (0x050505) altos y juntos, con highlights.
   *   - Faldón: 6 conos invertidos en círculo formando el borde ondeado.
   *   - Brazos/costados: 2 pequeñas esferas laterales que oscilan al caminar.
   *   - Halo emisivo violeta/azul AWS (0x8A2BE2 / 0x38BDF8) en la base.
   *
   * Convención de orientación: el frente del modelo es +Z local (ojos en
   * `z = +0.42`), la misma que usa Codi (`ojo.position.set(x, 1.18, 0.5)`).
   * `RenderEngine.render()` asigna `rotation.y = poseCodi.rotationY` y la
   * pose inicial es `Math.PI`, por lo que el rostro queda mirando hacia -Z
   * (el camino y el portal) al avanzar con 'W'.
   *
   * Compatibilidad con sistema de animación:
   *   Expone `userData.partesAnimables` con EXACTAMENTE la misma estructura
   *   que Codi ({ patasTraseras, brazos, cola, ojos, pupilas, cabeza }) para
   *   que RenderEngine._actualizarCicloCaminata() y
   *   _actualizarPersonalidadCodi() funcionen sin cambios, evitando romper
   *   los 165 tests del suite.
   *
   * @returns {THREE.Group} Grupo Three.js con la geometría procedural de Kiro
   */
  crearModeloKiroProcedural() {
    const grupo = new THREE.Group();

    // ================================================================
    // 1. CUERPO PRINCIPAL - Esfera blanca alargada tipo fantasma
    // ================================================================
    const geometriaCuerpo = new THREE.SphereGeometry(0.5, 32, 32);
    const materialCuerpo = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,           // Blanco puro (SPEC-CHAR01)
      emissive: 0xE0E7FF,        // Emisión blanca con tinte azulado suave
      emissiveIntensity: 0.4,    // Brillo etéreo
      roughness: 0.25,
      metalness: 0.1,
    });

    const cuerpo = new THREE.Mesh(geometriaCuerpo, materialCuerpo);
    cuerpo.scale.set(1.0, 1.35, 1.0); // Alargar verticalmente estilo fantasma
    cuerpo.position.y = 0.85; // Elevar sobre el suelo (flota)
    grupo.add(cuerpo);

    // ================================================================
    // 2. CABEZA PIVOT - Para animaciones de idle/parpadeo/mirada
    //    Es un grupo interno que contiene ojos y brillos, permitiendo
    //    rotación independiente del cuerpo (compat con Codi).
    //    IMPORTANTE: y = 1.02 es la altura base que espera
    //    RenderEngine._actualizarRespiracionIdle().
    // ================================================================
    const cabeza = new THREE.Group();
    cabeza.position.set(0, 1.02, 0);
    grupo.add(cabeza);

    // ================================================================
    // 3. OJOS - Dos esferas negras expresivas (0x050505)
    //
    //    CONVENCIÓN DE ORIENTACIÓN (crítica): los ojos se colocan en
    //    Z POSITIVO (+0.42), igual que en el modelo de Codi
    //    (`ojo.position.set(offsetX, 1.18, 0.5)`). El motor aplica
    //    `rotationY = Math.PI` al grupo raíz, de modo que el frente local
    //    (+Z) termina apuntando hacia -Z en el mundo, es decir, hacia el
    //    camino/portal. Colocarlos en Z negativo provocaba que la cara
    //    quedara hacia la cámara y "los ojos se fueran para atrás".
    //
    //    La forma ovalada va en la GEOMETRÍA (no en mesh.scale) porque el
    //    sistema de parpadeo (`_actualizarParpadeo`) escribe
    //    `ojo.scale.y = 1` al terminar cada parpadeo, lo que aplanaría
    //    cualquier escala vertical aplicada al mesh.
    // ================================================================
    const geometriaOjo = new THREE.SphereGeometry(0.12, 18, 14);
    geometriaOjo.scale(1.0, 1.3, 0.85); // Óvalo vertical, ligeramente aplanado al frente

    const materialOjoBase = new THREE.MeshStandardMaterial({
      color: 0x050505,           // Negro casi puro (SPEC-CHAR01)
      emissive: 0x000000,
      emissiveIntensity: 0.0,
      roughness: 0.15,
      metalness: 0.85,           // Brillo tipo obsidiana
    });

    // Altura local dentro de `cabeza`: +0.18 → y ≈ 1.20 en el grupo,
    // es decir, la mitad superior del cuerpo (mirada alta y despierta).
    const ALTURA_OJOS_LOCAL = 0.18;
    const SEPARACION_OJOS = 0.15; // Ojos juntos = expresión tierna
    const PROFUNDIDAD_CARA = 0.42; // +Z local = frente

    const geometriaBrillo = new THREE.SphereGeometry(0.032, 10, 8);
    const materialBrillo = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    const ojos = [];
    const pupilas = [];
    for (const offsetX of [-SEPARACION_OJOS, SEPARACION_OJOS]) {
      const ojo = new THREE.Mesh(geometriaOjo, materialOjoBase.clone());
      ojo.position.set(offsetX, ALTURA_OJOS_LOCAL, PROFUNDIDAD_CARA);
      cabeza.add(ojo);
      ojos.push(ojo);

      // Highlight como hijo del ojo (igual que Codi): acompaña parpadeo
      // y mirada ambiental sin cálculos extra.
      const brillo = new THREE.Mesh(geometriaBrillo, materialBrillo);
      brillo.position.set(offsetX > 0 ? 0.035 : -0.035, 0.045, 0.085);
      ojo.add(brillo);
      pupilas.push(brillo);
    }

    // ================================================================
    // 4. BRAZOS/COSTADOS - Dos esferitas laterales que oscilan al caminar
    //    Compatibilidad con Codi (partesAnimables.brazos)
    // ================================================================
    const geometriaBrazo = new THREE.SphereGeometry(0.14, 16, 16);
    geometriaBrazo.scale(0.85, 1.25, 0.85);
    const materialBrazo = materialCuerpo.clone();

    const brazoIzquierdo = new THREE.Mesh(geometriaBrazo, materialBrazo);
    brazoIzquierdo.position.set(-0.5, 0.82, 0);
    grupo.add(brazoIzquierdo);

    const brazoDerecho = new THREE.Mesh(geometriaBrazo, materialBrazo.clone());
    brazoDerecho.position.set(0.5, 0.82, 0);
    grupo.add(brazoDerecho);

    // ================================================================
    // 5. FALDÓN DE FANTASMA CLÁSICO - 6 conos invertidos en círculo
    //
    //    Sustituye las esferas de la versión anterior, que generaban un
    //    bulto/protuberancia extraña en la base. Cada cono va dentro de
    //    un pivot Group: el cono conserva su `rotation.x = Math.PI`
    //    (punta hacia abajo) mientras el pivot es el que oscila cuando
    //    `_actualizarCicloCaminata` escribe `patasTraseras[i].rotation.x`,
    //    de modo que la animación nunca voltea el faldón.
    // ================================================================
    const patasTraseras = [];
    const NUM_PICOS_FALDON = 6;
    const RADIO_FALDON = 0.36;
    const ALTURA_FALDON = 0.26;

    for (let i = 0; i < NUM_PICOS_FALDON; i += 1) {
      const angulo = (i / NUM_PICOS_FALDON) * Math.PI * 2;
      const x = Math.cos(angulo) * RADIO_FALDON;
      const z = Math.sin(angulo) * RADIO_FALDON;

      // Pivot: es lo que se anima (rotación suave al caminar)
      const pivotPico = new THREE.Group();
      pivotPico.position.set(x, ALTURA_FALDON, z);
      grupo.add(pivotPico);

      // Cono invertido: mismo material blanco suave del cuerpo
      const cono = new THREE.Mesh(
        new THREE.ConeGeometry(0.17, 0.34, 14),
        materialCuerpo.clone()
      );
      cono.rotation.x = Math.PI; // Punta hacia abajo (faldón ondeado)
      cono.position.y = -0.1;
      pivotPico.add(cono);

      // Dos picos opuestos actúan como "patas" para el ciclo de caminata
      if (i === 0 || i === Math.floor(NUM_PICOS_FALDON / 2)) {
        patasTraseras.push(pivotPico);
      }
    }

    // ================================================================
    // 6. COLA/PIVOT - Grupo pivot para compatibilidad con animación de cola
    //    de Codi. En Kiro es visualmente invisible pero satisface la
    //    interfaz de partesAnimables.
    // ================================================================
    const pivotCola = new THREE.Group();
    pivotCola.position.set(0, 0.55, 0.4);
    grupo.add(pivotCola);

    // ================================================================
    // 7. HALO EMISIVO EN LA BASE - Aura violeta/azul AWS (SPEC-CHAR01)
    // ================================================================
    // Halo principal violeta AWS
    const geometriaHaloBase = new THREE.CircleGeometry(0.7, 32);
    const materialHaloBase = new THREE.MeshBasicMaterial({
      color: 0x8A2BE2,          // Violeta AWS (SPEC-CHAR01)
      transparent: true,
      opacity: 0.35,
      side: 2, // DoubleSide
    });
    const haloBase = new THREE.Mesh(geometriaHaloBase, materialHaloBase);
    haloBase.rotation.x = -Math.PI / 2; // Acostado en el suelo
    haloBase.position.y = 0.02;
    grupo.add(haloBase);

    // Halo secundario azul AWS (más pequeño, encima)
    const geometriaHaloAzul = new THREE.CircleGeometry(0.5, 32);
    const materialHaloAzul = new THREE.MeshBasicMaterial({
      color: 0x38BDF8,          // Azul AWS (SPEC-CHAR01)
      transparent: true,
      opacity: 0.5,
      side: 2,
    });
    const haloAzul = new THREE.Mesh(geometriaHaloAzul, materialHaloAzul);
    haloAzul.rotation.x = -Math.PI / 2;
    haloAzul.position.y = 0.03;
    grupo.add(haloAzul);

    // Aura envolvente esférica (halo etéreo alrededor del cuerpo)
    const geometriaAura = new THREE.SphereGeometry(0.75, 16, 16);
    const materialAura = new THREE.MeshBasicMaterial({
      color: 0x8A2BE2,          // Violeta AWS
      transparent: true,
      opacity: 0.12,
    });
    const aura = new THREE.Mesh(geometriaAura, materialAura);
    aura.position.y = 0.85;
    aura.scale.set(1.0, 1.4, 1.0);
    grupo.add(aura);

    // ================================================================
    // 8. METADATA - Compatibilidad con sistema de animación de Codi
    //    Estructura IDÉNTICA a la de partesAnimables de Codi.
    // ================================================================
    grupo.userData.esKiro = true;
    grupo.userData.partesAnimables = {
      patasTraseras,                           // 2 pivots del faldón oscilan
      brazos: [brazoIzquierdo, brazoDerecho],  // Costados oscilan al caminar
      cola: pivotCola,                         // Pivot invisible (compat)
      ojos,                                    // Parpadeo funciona
      pupilas,                                 // Highlights (hijos de los ojos)
      cabeza,                                  // Idle/mirada ambiental
    };

    // Referencias adicionales para animación de flotación/bobbing
    grupo.userData.cuerpoKiro = cuerpo;
    grupo.userData.auraKiro = aura;
    grupo.userData.haloBaseKiro = haloBase;
    grupo.userData.haloAzulKiro = haloAzul;
    grupo.userData.tiempoFlotacion = 0;

    return grupo;
  }
}

