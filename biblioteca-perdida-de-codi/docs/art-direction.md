# Dirección Artística — Codi y la Biblioteca Perdida del Código

**Estado:** Aprobado con observaciones. Referencia oficial de la experiencia visual del proyecto. No implementado todavía.
**Tipo de documento:** Especificación de diseño visual (UI/UX), complementaria al Spec técnico existente.
**No modifica:** `requirements.md`, `design.md`, `tasks.md`, arquitectura, lógica de juego, APIs públicas, ni tests del Spec `biblioteca-perdida-de-codi`.

---

## 0. Relación con el Spec técnico existente

Este documento **no reemplaza** ni **contradice** `design.md`/`requirements.md`. Se apoya en las decisiones técnicas ya fijadas y las trata como restricciones duras:

- El stack sigue siendo **Three.js + Vite**, sin motor de físicas, sin librerías de UI adicionales (Requisito "Restricciones técnicas").
- El HUD sigue viviendo en **HTML/CSS superpuesto al canvas** (`UISystem.renderizarEnDOM`), no dentro de la escena 3D — se mantiene por accesibilidad de texto (contraste, tamaño, lectores de pantalla) tal como ya está justificado en `design.md`.
- Los `id`/clases que usa `UISystem.js` (`ui-system-overlay`, `ui-system-habilidades`, `ui-system-mensaje`, `ui-system-controles`, `hud-card`, `hud-title`, `hud-skill-badge`, `hud-key-badge`, etc.) **no se renombran**; cualquier cambio visual futuro se implementa ajustando las reglas CSS existentes en `index.html`, nunca la estructura/IDs que los tests de `UISystem.test.js` verifican.
- El tono narrativo debe seguir siendo **optimista, curioso y no amenazante** (Requisito 11.3): el "misterio" de esta dirección artística es el de una biblioteca antigua por descubrir, nunca terror, amenaza real ni ansiedad.
- Cualquier trabajo futuro de implementación derivado de este documento se limita a: CSS (`index.html`), materiales/colores/luces/postprocesado en `RenderEngine.js`/`AssetLoader.js`/`corruptionShader.js`, y contenido puramente visual — nunca a la lógica de `MovementSystem`, `AbilitySystem`, `AbsorptionSystem`, `ProgressStore`, ni a las Correctness Properties 1-15.
- Rendimiento: el juego debe seguir funcionando fluido en **GPU integrada** (restricción ya documentada). Todo lo propuesto aquí es deliberadamente ligero: sin motor de partículas de terceros, sin shadow maps de alta resolución, postprocesado opcional y desactivable.

Este documento es la **única fuente de verdad visual** de aquí en adelante: cualquier Specification o tarea de "pulido gráfico" futura debe alinearse con lo aquí definido en vez de introducir decisiones de estilo ad-hoc.

---

## 0.1 Design Principles

Estos nueve principios son la **constitución** de esta dirección artística: toda sección de este documento, y toda decisión de implementación futura derivada de él, debe poder justificarse contra ellos. Tienen prioridad sobre cualquier preferencia estética individual. Cuando dos principios entren en tensión, se resuelve en el orden en que están numerados (el principio de menor número gana).

1. **El conocimiento debe sentirse mágico.** Cada interacción debe transmitir descubrimiento, curiosidad y creatividad. Los efectos visuales deben sugerir que el conocimiento transforma el mundo — nunca presentarse como un objeto/mecanismo técnico frío (sin barras de progreso genéricas, sin iconografía de archivo/carpeta).
2. **Nunca transmitir violencia.** Ninguna Habilidad, animación, efecto visual o interfaz deberá comunicar agresividad, destrucción o combate. Toda interacción debe representar creación, activación o descubrimiento. Incluye al Bug_Supremo: su corrupción es *inquietante por lo extraño*, nunca por lo violento (sin sangre, armas, ángulos dentados/agresivos, ni rojo como color de amenaza física).
3. **La interfaz debe desaparecer durante la exploración.** El HUD debe mostrar únicamente la información necesaria. Cuando no existan eventos relevantes, la interfaz debe minimizar su presencia para favorecer la inmersión.
4. **Cada efecto visual debe comunicar información.** Las partículas, colores, luces y animaciones nunca serán únicamente decorativas. Cada elemento visual debe ayudar al jugador a comprender el estado del mundo o una interacción. Un efecto que no informa nada es candidato a eliminarse.
5. **Menos es más.** Priorizar claridad sobre espectacularidad. Evitar saturación visual, exceso de partículas, exceso de colores y animaciones innecesarias. Ante la duda entre agregar un elemento más o dejar espacio negativo, se elige el espacio negativo.
6. **Cada Habilidad debe poseer una identidad visual propia.** Python, JavaScript y SQL deberán ser reconocibles de inmediato mediante una combinación consistente de colores, partículas, iluminación, materiales y animaciones (ver sección 6, "Identidad visual de las Habilidades").
7. **Los elementos interactivos deben ser evidentes.** El jugador debe identificar intuitivamente qué objetos pueden activarse, absorberse o utilizarse, sin necesidad de instrucciones constantes (ver regla de "brillo pulsante = interactivo", sección 3).
8. **La identidad oficial de Codi es inalterable.** Toda mejora artística deberá preservar la silueta, personalidad, expresividad y apariencia oficial de Codi (cocodrilo/caimán verde, panza amarilla a rayas, ojos expresivos, personalidad curiosa y amigable — Requisito 11.1 de `requirements.md`). Se podrán mejorar materiales, shaders, iluminación y animaciones, pero nunca alterar su identidad visual (ver sección 7, "Guía oficial de Codi"). Si una propuesta de esta dirección artística entra en conflicto con la identidad de Codi, Codi no se ajusta al entorno: el entorno se ajusta para que Codi se siga viendo fiel a su identidad oficial.
9. **El rendimiento forma parte del diseño.** Toda mejora visual deberá respetar los objetivos de rendimiento definidos en `requirements.md`/`design.md` (GPU integrada como caso base). Ningún efecto gráfico podrá comprometer la fluidez del juego. Todo efecto costoso debe poder degradarse o desactivarse (ver sección 20, "Escalabilidad gráfica").

---

## 1. Identidad visual

**Nombre de la dirección artística: "Archivo Vivo" (*Living Archive*).**

Codi explora una biblioteca ancestral que no es un edificio muerto de piedra, sino un organismo semi-digital que **aún respira conocimiento**: columnas de piedra antigua atravesadas por vetas de luz que pulsan como código ejecutándose, libros que flotan como luciérnagas, salas que se iluminan progresivamente a medida que Codi restaura fragmentos perdidos del saber. La tecnología no es fría ni corporativa — es **mágica y viva**, como si la programación fuera una forma de magia natural redescubierta, no inventada.

Principio rector: *"La tecnología antigua que aún sueña."*

- No es cyberpunk urbano/neón corporativo (evitar estética "sala de servidores").
- No es fantasía medieval genérica (evitar antorchas, mazmorras, dragones).
- Es una fusión: **ruinas ancestrales + bioluminiscencia de datos**, con la calidez de una biblioteca real y el asombro de descubrir tecnología olvidada.

## 2. Dirección artística

Tres pilares no negociables, en orden de prioridad cuando haya tensión entre ellos:

1. **Claridad ante todo (legibilidad de juego).** Inspirado en Zelda BOTW: la silueta de Codi, los objetivos interactivos y los caminos navegables deben ser reconocibles al instante, incluso en una escena visualmente rica. Ningún efecto decorativo puede competir visualmente con la información de gameplay.
2. **Calidez sobre frialdad.** Inspirado en Journey y Ori: la paleta general debe sentirse acogedora y curiosa, nunca clínica ni amenazante, incluso en las zonas más "tecnológicas" o en la presencia del Bug_Supremo.
3. **Minimalismo con propósito.** Inspirado en Monument Valley y Apple Vision Pro: cada elemento de UI/entorno que se agregue debe justificar su existencia; se prefiere un espacio negativo bien usado a saturar la pantalla de detalle.

### Cómo se traduce cada referencia

| Referencia | Qué tomamos de ella | Qué NO tomamos |
|---|---|---|
| **Monument Valley** | Geometría limpia, formas arquitectónicas simples y reconocibles, paletas de color por zona muy controladas (2-3 tonos dominantes + 1 acento) | Su estilo isométrico/imposible-geometry (el juego es 3D en tercera persona real) |
| **Ori and the Blind Forest** | Bioluminiscencia como lenguaje visual de "lo importante/interactivo" (todo lo que brilla se puede usar), partículas suaves flotando en el aire | Su densidad de detalle pictórico en fondos (nuestro entorno debe ser más limpio, por rendimiento y por el tiempo de producción) |
| **Journey** | Escala que transmite asombro, gradientes de cielo/luz suaves, sensación de viaje/progreso visual constante | Su paleta desértica cálida literal (la nuestra es más "biblioteca", ver sección 5) |
| **Zelda BOTW** | HUD minimalista que desaparece cuando no se necesita, iconografía simple de alto contraste | Su UI diegética compleja de menús (nuestro alcance de UI es mucho menor) |
| **Apple Vision Pro** | Superficies de vidrio con profundidad real (blur + brillo de borde + sombra suave), tipografía limpia sans-serif, jerarquía por contraste y no por exceso de color | Su minimalismo absoluto de color (nuestro juego necesita más personalidad/calidez que un sistema operativo) |
| **Glassmorphism** | Tarjetas HUD translúcidas ya implementadas (`.hud-card`) como lenguaje consistente para *toda* superficie de información (mensajes, panel de controles, futuros menús) | Saturar la pantalla de paneles de cristal simultáneos — máximo 2-3 tarjetas visibles a la vez |

## 3. Lenguaje visual

Vocabulario de formas y motivos recurrentes, para que cualquier elemento nuevo (mecanismo, libro, ícono) se sienta parte del mismo mundo:

- **Formas primarias:** hexágonos y arcos redondeados para estructuras "activas/tecnológicas" (mecanismos, receptáculos); óvalos y curvas suaves para elementos "naturales/ancestrales" (piedra base de la Isla, plataformas). Nunca ángulos agresivos/dentados (asociados a peligro/combate, fuera de tono — Principio 2).
- **Motivo de "código visible":** líneas finas y brillantes que recorren superficies (vetas en la piedra, costuras en el vientre de Codi, bordes de tarjetas HUD) evocan sintaxis/circuitos sin usar texto de código literal ilegible.
- **Motivo de "conocimiento flotante":** los Libros_de_Conocimiento y las partículas ambientales comparten una misma "familia" de brillo suave pulsante — el jugador aprende a asociar ese brillo con "esto es importante/interactivo" en toda la Isla (Principio 7, refuerza Zelda BOTW: claridad por lenguaje visual consistente, no por etiquetas de texto).
- **Jerarquía por brillo, no por tamaño:** en un entorno donde todo puede tener glow, solo los elementos con los que el jugador puede interactuar (Libros, Mecanismos activables, el objetivo de Zona) llevan el brillo pulsante animado; la decoración ambiental usa un glow estático y más tenue.

## 4. Moodboard e inspiración (descripción dirigida)

Al no poder adjuntar imágenes en este documento, se describe el moodboard como una serie de "fotogramas objetivo" que cualquier artista/implementador puede usar como referencia de encuadre:

1. **Fotograma 1 — Primera impresión (pantalla de carga → primer frame jugable):** Codi de perfil, iluminado por una luz cálida ambar desde abajo (un libro cercano) y una luz cian fría desde arriba (la bóveda de la biblioteca); fondo desenfocado por profundidad de campo sutil; una sola partícula de luz cruza el encuadre.
2. **Fotograma 2 — Exploración general:** vista de tercera persona típica del juego; suelo de piedra clara con vetas de luz tenues; 2-3 columnas con code-glow visibles a media distancia; niebla ligera que difumina el horizonte (Journey); ningún elemento de HUD compite con el paisaje.
3. **Fotograma 3 — Momento de absorción de Habilidad:** el Libro pulsa más rápido, emite un breve estallido de partículas cálidas (no un flash agresivo), Codi hace una pose de sorpresa/alegría; la tarjeta de mensaje de cristal aparece con un fade suave desde abajo.
4. **Fotograma 4 — Mecanismo resuelto:** las vetas de luz del mecanismo cambian de un azul apagado ("dormido") a un cian vivo ("activo"), con una pequeña onda de partículas expandiéndose desde el punto de activación.
5. **Fotograma 5 — Presencia del Bug_Supremo:** la corrupción visual (shader existente) tiñe la geometría cercana con un magenta/violeta desaturado y ligera distorsión — mantiene la paleta de acento ya usada en el resto del juego (nunca introduce rojo/sangre ni iconografía de amenaza física, Principio 2), preservando el tono "misterioso pero no aterrador".

## 5. Paleta de colores

Se consolida una paleta única de proyecto, reemplazando en una futura implementación los valores hexadecimales dispersos hoy en `RenderEngine.js`/`AssetLoader.js`/`index.html` por esta referencia central.

### 5.1 Colores base (entorno / atmósfera)

| Token | Hex | Uso |
|---|---|---|
| `--world-bg-deep` | `#0d1b2a` | Fondo de escena / niebla lejana. Azul profundo de biblioteca nocturna, **no negro puro** (más cálido que el `#070b19` cyberpunk actual, para sentirse "biblioteca ancestral" y no "sala de servidores"). |
| `--world-stone-base` | `#2b2438` | Piedra/estructura base de la Isla, tono violeta-grafito neutro. |
| `--world-stone-light` | `#4a4160` | Variante clara de piedra, para superficies iluminadas directamente. |
| `--world-fog` | `#16233a` | Color de la niebla `FogExp2` (profundidad, estilo Journey). |

### 5.2 Colores de acento (interactividad y magia)

| Token | Hex | Uso |
|---|---|---|
| `--accent-code-cyan` | `#38bdf8` | Código/tecnología activa: vetas de luz, mecanismos resueltos, bordes de HUD, títulos. Identidad de **JavaScript** (ver sección 6). (Ya en uso en el HUD actual — se conserva como ancla de continuidad visual). |
| `--accent-knowledge-amber` | `#fbbf24` | Calidez/conocimiento: brillo de Libros, vientre de Codi, partículas de absorción. Identidad de **Python** (ver sección 6). Sustituye el uso puramente "amarillo mecánico" por una lectura más cálida/mágica. |
| `--accent-life-green` | `#10b981` | Progreso/Habilidades obtenidas en general (ya en uso en badges de habilidades — se conserva como color neutro de "progreso", no ligado a una Habilidad específica). |
| `--accent-mystery-violet` | `#a855f7` | Misterio/Bug_Supremo/acento ambiental nocturno. Identidad de **SQL** (ver sección 6). (Ya en uso como luz de acento — se conserva, reforzando que el "misterio" y la "magia" comparten familia de color). |

### 5.3 Colores de superficie UI (glassmorphism)

| Token | Hex / rgba | Uso |
|---|---|---|
| `--glass-bg` | `rgba(13, 17, 23, 0.72)` | Fondo de tarjetas HUD (ya implementado, se mantiene). |
| `--glass-border` | `rgba(56, 189, 248, 0.28)` | Borde de tarjetas (ya implementado, se mantiene). |
| `--glass-border-warm` | `rgba(251, 191, 36, 0.28)` | Variante cálida del borde, reservada para tarjetas de contexto "narrativo" (p. ej. un futuro panel de lore/objetivo), para diferenciarlas visualmente de las tarjetas de "estado del sistema" (habilidades/controles). |
| `--text-primary` | `#e6edf3` | Texto principal sobre cristal (ya implementado). |
| `--text-muted` | `rgba(230, 237, 243, 0.6)` | Texto secundario/placeholder (ya implementado, p. ej. "ninguna todavía"). |
| `--state-danger` | `#f87171` | Errores/denegaciones (ya implementado). |

### 5.4 Codi (colores de personaje — sin cambios de identidad oficial)

| Token | Hex | Uso |
|---|---|---|
| `--codi-verde` | `#1fce6b` | Piel principal (ya implementado). |
| `--codi-vientre` | `#fbcd16` | Vientre (ya implementado; se reutiliza como referencia visual para `--accent-knowledge-amber`, reforzando que Codi *es* el conocimiento vivo). |

**Regla de composición de paleta:** cada Zona de la Isla usa la paleta base (5.1) + **un único acento dominante** de 5.2 según su Habilidad asociada (Python → ámbar, JavaScript → cian, SQL → violeta), reforzando el aprendizaje de "esta zona/mecanismo pertenece a esta forma de pensar" solo con color, sin depender de texto (Principio 6; refuerzo de accesibilidad, ver sección 25 — el color siempre acompaña al texto, nunca lo sustituye).

## 6. Identidad visual de las Habilidades

Desarrollo directo del Principio 6 ("Cada Habilidad debe poseer una identidad visual propia"). Cada Habilidad se define aquí como un paquete visual/sonoro completo y consistente, aplicado a: el Libro_de_Conocimiento que la otorga, cada Mecanismo_Ambiental que la requiere, el mensaje de absorción, y el matiz de luz de acento que sigue a Codi tras obtenerla (sección 14).

### 6.1 Python

| Aspecto | Definición |
|---|---|
| Color principal | `--accent-knowledge-amber` (`#fbbf24`) |
| Color secundario | `--codi-vientre` (`#fbcd16`) como acento cálido de refuerzo, y `--world-stone-light` como base neutra sobre la que resalta |
| Materiales | Piedra/madera cálida con vetas emissive ámbar de baja intensidad (0.2–0.3); superficies orgánicas, curvas, nunca metálicas — Python se lee como "construcción/crecimiento natural" (puentes, soluciones automatizadas) |
| Iluminación | Luz puntual de punto de interés en tono ámbar cálido (sección 14); mayor `warmth` percibida que las otras dos Habilidades |
| Partículas | Motas doradas cálidas, movimiento ascendente lento, como luciérnagas o semillas de luz — evocan crecimiento/construcción |
| Animaciones | Mecanismos de Python (puente, solución automatizada) se activan con un movimiento de **extensión/despliegue** orgánico (crecer, desplegarse), nunca mecánico-brusco |
| Sonido asociado | Acorde ascendente cálido, tipo cuerda pulsada; sonido de mecanismo resuelto: tono cristalino grave-cálido (ver sección 24) |
| Sensación a transmitir | Crecimiento, construcción amable, "las cosas florecen cuando las entiendes" |
| Ejemplos de uso visual | El puente que Codi construye brilla en vetas ámbar mientras se extiende; el Libro de Python pulsa con un brillo dorado suave antes de ser absorbido |

### 6.2 JavaScript

| Aspecto | Definición |
|---|---|
| Color principal | `--accent-code-cyan` (`#38bdf8`) |
| Color secundario | `--world-bg-deep` como fondo de contraste, y blanco cálido (`--text-primary`, `#e6edf3`) para destellos de activación |
| Materiales | Metal oscuro con `emissive` cian (patrón ya implementado en mecanismos — se documenta aquí como el estándar oficial de JavaScript específicamente, no de "todo lo tecnológico" en general) |
| Iluminación | Luz puntual de punto de interés cian vivo, parpadeo sutil y rápido (evoca "activación eléctrica" sin ser agresivo) |
| Partículas | Chispas pequeñas y rápidas, trayectoria en zigzag corto — evocan "activación instantánea" de un mecanismo/dispositivo |
| Animaciones | Mecanismos de JavaScript (dispositivo, plataforma móvil) se activan con un movimiento de **encendido/arranque** (un pulso rápido que se estabiliza), nunca una sacudida violenta |
| Sonido asociado | Tono electrónico limpio y corto, tipo "click" suave de activación; sonido de mecanismo resuelto: campanita aguda y breve (ver sección 24) |
| Sensación a transmitir | Energía, inmediatez, "el mundo responde a tu voluntad al instante" |
| Ejemplos de uso visual | La plataforma móvil se enciende con un destello cian antes de comenzar su recorrido; el Libro de JavaScript titila más rápido que los otros dos al acercarse Codi |

### 6.3 SQL

| Aspecto | Definición |
|---|---|
| Color principal | `--accent-mystery-violet` (`#a855f7`) |
| Color secundario | Lavanda pálido (variante clara del violeta, para texturas de "información antigua") y `--world-stone-base` como base neutra |
| Materiales | Piedra con vetas violeta translúcidas, efecto de "profundidad" (como si se pudiera ver a través de capas de información) — superficie ligeramente más reflectante que la de Python, sin llegar al metal de JavaScript |
| Iluminación | Luz puntual de punto de interés violeta tenue y estable (sin parpadeo — SQL se lee como "consulta calmada", no como acción rápida) |
| Partículas | Motas violetas que se mueven lento en patrones ordenados (líneas/rejillas sutiles), evocando la idea de "consultar/ordenar información" sin ser literal (sin texto de código flotante) |
| Animaciones | Mecanismos de SQL (camino oculto, fuente de información) se activan con una **revelación progresiva** (fade-in gradual de geometría/información), nunca una aparición abrupta |
| Sonido asociado | Tono grave y resonante, como una campana lejana; sonido de mecanismo resuelto: acorde descendente suave, casi susurrado (ver sección 24) |
| Sensación a transmitir | Misterio calmado, profundidad, "el conocimiento antiguo se revela a quien sabe preguntar" |
| Ejemplos de uso visual | El camino oculto se revela como un sendero de vetas violetas que aparecen de atrás hacia adelante; el Libro de SQL emite un brillo violeta constante, sin parpadeo, distinguible a distancia de los otros dos |

### 6.4 Regla de no-superposición

Para que el Principio 6 se cumpla en la práctica: ningún Mecanismo, Libro o efecto de una Habilidad debe usar el color de acento principal de otra Habilidad. Si un elemento necesita un color neutro (p. ej. la piedra base de cualquier Zona), debe usar la paleta base (5.1), nunca "prestar" el ámbar/cian/violeta de una Habilidad distinta a la que representa.

## 7. Guía oficial de Codi

Desarrollo directo del Principio 8 ("La identidad oficial de Codi es inalterable"). Esta sección existe para que cualquier Specification de implementación futura pueda auto-verificarse sin ambigüedad.

### 7.1 Elementos INALTERABLES (no pueden cambiar bajo ninguna propuesta visual)

- **Especie y silueta general:** cocodrilo/caimán, cuerpo alargado de cuatro extremidades, cola con cresta de picos, hocico alargado.
- **Colores de identidad:** piel verde (`--codi-verde`, familia de `#1fce6b`) y vientre amarillo cálido a rayas/escamas (`--codi-vientre`, familia de `#fbcd16`). No se permite recolorear a Codi con la paleta de una Zona/Habilidad (Codi no "se disfraza" de Python/JS/SQL).
- **Ojos y expresividad facial:** ojos grandes, blancos con pupila negra, mirando al frente — la expresividad del rostro es el vehículo principal de su personalidad y no puede reducirse ni cubrirse (p. ej. con accesorios que oculten los ojos).
- **Personalidad:** curiosa, amigable, aventurera, optimista, nunca agresiva (Principio 2 y 8 combinados) — toda animación nueva debe poder describirse con estos adjetivos.
- **Ausencia total de iconografía de combate/daño:** sin animaciones de "herido", "atacar" ni "derrota"; no existen en el diseño de Codi bajo ninguna circunstancia.

### 7.2 Elementos que PUEDEN evolucionar visualmente (con criterio y sin tocar lo anterior)

- **Calidad del material/shader:** más detalle en `roughness`/`metalness`/`emissive`, mapas de normal, oclusión ambiental, etc. — mejoras de fidelidad, no de diseño.
- **Iluminación sobre Codi:** cómo la luz ambiental/direccional/de acento (sección 14) lo ilumina en cada momento, incluyendo el matiz sutil por Habilidad ya propuesto (sección 5.2/14) — nunca cambia su color base, solo cómo la luz externa incide sobre él.
- **Animaciones secundarias:** ciclo de caminata (ya implementado), respiración en idle, pose de sorpresa al absorber (sección 22) — mientras se mantengan dentro del rango de personalidad de 7.1.
- **Nivel de detalle geométrico:** de la geometría procedural actual (`_crearModeloCodiProcedural`) a un futuro modelo GLB más detallado, siempre que preserve silueta, colores y expresividad ya fijados.
- **Sombra de contacto (blob shadow, sección 18):** puede añadirse/mejorarse sin alterar el modelo de Codi en sí.

### 7.3 Criterio de verificación rápida

Antes de aprobar cualquier cambio visual sobre Codi, debe poder responderse "sí" a las tres preguntas:
1. ¿Sigue siendo inequívocamente reconocible como Codi de perfil, en silueta, sin color? (silueta intacta)
2. ¿Sigue transmitiendo curiosidad/calidez y nunca agresividad? (personalidad intacta)
3. ¿Conserva el verde/amarillo de identidad como colores base, incluso bajo distintas luces? (paleta de personaje intacta)

Si alguna respuesta es "no", el cambio se descarta o se ajusta — independientemente de qué tan atractivo sea por sí solo (Principio 8 sobre cualquier preferencia estética).

## 8. Tipografía

- **Familia principal (UI):** `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif` — ya declarada en `index.html`. Se mantiene: es limpia, muy legible en pantalla, y evoca la claridad tipo Apple Vision Pro/Zelda BOTW.
- **Familia secundaria (acentos "técnicos"):** `'Fira Code', monospace` — ya declarada, reservada exclusivamente para las **teclas del panel de controles** (`.hud-key-badge`) y, en el futuro, para pequeños fragmentos decorativos de "sintaxis" en mecanismos (nunca para párrafos largos: rompe la calidez si se usa en exceso).
- **Escala tipográfica propuesta** (unifica los tamaños hoy dispersos en `index.html`):

| Rol | Tamaño | Peso | Ejemplo de uso |
|---|---|---|---|
| Título de tarjeta HUD | 12px, `uppercase`, `letter-spacing: 0.06em` | 600 | "Habilidades", "Controles" (ya implementado) |
| Mensaje contextual | 14–15px | 500 | Mensajes de absorción/denegación |
| Texto de acción (controles) | 13px | 400 | "— Mover", "— Saltar" |
| Badge de habilidad/tecla | 11–12px | 500 | "python", "W A S D" |
| Texto narrativo largo (futuro, si se agrega un panel de lore) | 15–16px, `line-height: 1.6` | 400 | Fragmentos de historia de un Libro |

No se introducen pesos ultra-bold ni tipografías decorativas: la personalidad viene del color/glow, no de la tipografía (Principio 5, minimalismo).

## 9. Iconografía

Set de iconos mínimo, coherente con el lenguaje visual (sección 3): trazo simple, esquinas redondeadas, un solo color de relleno + glow opcional.

| Ícono | Uso | Nota de estilo |
|---|---|---|
| Insignia circular con la inicial del lenguaje (🐍 estilizado simple / `{ }` / `▤`) | Badge de Habilidad obtenida | Ya se resuelve hoy con texto plano (`python`); evolución opcional: reemplazar el texto por un pictograma + texto, nunca solo pictograma (accesibilidad, sección 25). |
| Rombo/diamante hueco pulsante | Marcador de Libro_de_Conocimiento no absorbido, visible a distancia moderada | Refuerza "esto brilla = esto importa" (Principio 7) sin depender de un minimapa (fuera de alcance del MVP). |
| Candado de líneas simples (sin escudo/medieval) | Zona_Bloqueada / Mecanismo sin la habilidad requerida | Debe leerse como "temporalmente inaccesible", no como "prohibido/peligroso" (Principio 2). |
| Check suave (trazo curvo, no un ✔ agresivo) | Mecanismo resuelto | Aparece brevemente y se disuelve en partículas, no queda como sello permanente en pantalla. |

Todos los íconos se implementan como SVG inline o `background-image` CSS (sin librerías de iconos externas, respetando la restricción de no añadir dependencias).

## 10. Diseño del HUD

Se conserva la estructura ya implementada (3 tarjetas: Habilidades, Mensaje, Controles) y se refina su composición:

- **Panel de Habilidades** (arriba-izquierda): se mantiene `.hud-card`. Evolución visual: cada badge de habilidad obtenida usa el acento de color de esa Habilidad (sección 6) en vez de un verde único, para que el panel funcione como un "mapa de color" del progreso a simple vista.
- **Cuadro de Mensaje** (abajo-centro): se mantiene. Se refina el timing de entrada/salida (ver sección 21, Animaciones UI) para que se sienta como una tarjeta que "flota hacia la existencia" en vez de aparecer abruptamente.
- **Guía de Controles** (abajo-derecha): se mantiene igual; es deliberadamente la tarjeta más discreta (menor prioridad visual), en línea con el Principio 3 ("la UI de referencia no debe competir con la exploración").
- **Regla de densidad:** nunca más de 3 tarjetas simultáneas en pantalla en el MVP actual (Principio 5). Si una fase futura añade un indicador de objetivo/lore, debe **sustituir** temporalmente al Cuadro de Mensaje (mismo espacio, mismo slot), no sumarse como una cuarta tarjeta (ver checklist de consistencia visual, sección 27).

## 11. Diseño de menús

El MVP actual no tiene pantalla de menú principal (arranca directo al juego). Se propone, para una fase visual futura (no implementada ahora):

- Una pantalla de **título minimalista**: fondo con la misma atmósfera del juego (no una imagen estática distinta), el logo/título centrado con tipografía limpia, y un único botón de estilo `.hud-card` ("Comenzar la exploración"). Sin submenús de opciones en el MVP (fuera de alcance).
- Si se agrega, debe reusar exactamente el mismo lenguaje de tarjeta de cristal que el HUD — nunca un estilo de menú distinto — para no romper la consistencia visual (sección 27).

## 12. Diseño de mensajes

- Los mensajes contextuales (`#ui-system-mensaje`) mantienen su rol funcional actual (texto breve, se auto-oculta). Refinamiento visual:
  - Mensajes de **éxito/absorción**: borde izquierdo en el color de acento de la Habilidad obtenida (sección 6), no un cian genérico — diferencia visualmente "gané algo" de "estado neutro" y refuerza el Principio 6.
  - Mensajes de **denegación/gating**: borde izquierdo en un tono neutro atenuado (gris-azulado de la paleta base), nunca en `--state-danger` (rojo) — un gating no es un error ni una falla, es una pista amistosa ("aún no puedes, pero pronto podrás"; Principio 2, nunca alarmante).
  - Mensajes de **error real** (WebGL no soportado, asset crítico faltante): único caso que usa `--state-danger`, reservando el rojo exclusivamente para fallos técnicos genuinos.
- Tono de copy (ya cubierto por Requisito 11.3, se reafirma aquí desde lo visual): el mensaje nunca debe ir acompañado de un ícono o color que sugiera urgencia/alarma, salvo en el caso de error técnico real arriba mencionado.

## 13. Diseño de botones

No hay botones interactivos de mouse en el MVP actual (todo es teclado/mouse-look). Para futuros elementos clicables (p. ej. el botón de la pantalla de título, sección 11, o un futuro botón de "reintentar" en pantallas de error):

- Forma: rectángulo con `border-radius: 12px` (coherente con `.hud-card`), mismo fondo de cristal, mismo borde cian.
- Estado *hover*: aumento sutil del brillo del borde (`box-shadow` con el acento cian, +20% de opacidad) — nunca un cambio de escala agresivo (evita sensación "gamer arcade", Principio 2).
- Estado *focus* (accesibilidad de teclado): contorno adicional de 2px en `--accent-code-cyan` sólido, para navegación sin mouse.
- Estado *disabled*: opacidad reducida al 40% + `cursor: not-allowed`, sin cambiar de color (para no confundirse con estado de error).

## 14. Diseño del sistema de carga

Actualmente `UISystem.mostrarMensaje('Cargando... N/total', ...)` reutiliza el Cuadro de Mensaje genérico. Propuesta de evolución visual (misma estructura de datos, solo presentación):

- Reemplazar el texto plano de progreso por una **barra de progreso fina** (2-4px de alto) integrada dentro de la misma tarjeta de cristal, con el relleno en `--accent-code-cyan` y un brillo suave que se desplaza (efecto "pulso de energía recorriendo la barra", coherente con el motivo de "código visible" de la sección 3).
- Texto de acompañamiento breve y en tono narrativo ("Despertando la biblioteca...", "Restaurando fragmentos de memoria...") en vez de un porcentaje frío — mantiene el tono cálido incluso en pantallas técnicas (Principio 1).
- Si un asset usa geometría de respaldo (`assetsConRespaldo`), el aviso no bloqueante ya existente se mantiene, pero se recomienda un ícono discreto (rombo hueco, sección 9) en vez de solo texto, para escaneo visual rápido.

## 15. Partículas

Sistema de partículas **ligero**, implementable con `THREE.Points` + un material simple (sin librerías externas de VFX, respetando restricciones técnicas). Cada tipo de partícula existe para comunicar algo concreto (Principio 4), nunca solo decoración:

| Tipo | Cantidad aproximada | Comportamiento | Dónde | Qué comunica |
|---|---|---|---|---|
| Motas ambientales | 30–60 partículas por Zona visible | Flotan lento hacia arriba, con drift lateral suave (ruido simple, no física real) | Aire de toda la Isla, densidad baja constante (Journey/Ori) | "Este lugar está vivo/mágico" (Principio 1) |
| Estallido de absorción | 12–20 partículas, vida corta (~0.8s), color de la Habilidad obtenida (sección 6) | Emergen radialmente del Libro y se desvanecen | Al absorber una Habilidad | "Acabas de obtener algo" + qué Habilidad es, por color |
| Onda de activación | Anillo de 8–12 partículas expandiéndose, color de la Habilidad del mecanismo | Se expande y se desvanece en ~1s | Al resolver un Mecanismo | "Este mecanismo ya está resuelto" |
| Motas de corrupción | 10–15 partículas erráticas, movimiento tembloroso | Reutilizan el tinte del `corruptionShader` existente | Alrededor de geometría corrompida por el Bug_Supremo | "Esta zona está afectada por la corrupción" |

**Presupuesto de rendimiento:** máximo ~100 partículas activas simultáneas en pantalla en cualquier momento (suma de todos los tipos), con un único `THREE.Points`/`BufferGeometry` por tipo (no un mesh por partícula) para minimizar draw calls en GPU integrada. En el perfil gráfico "Bajo" (sección 20), las motas ambientales se reducen o desactivan primero, ya que son las únicas puramente atmosféricas.

## 16. Iluminación

Se refina (no se reemplaza) el esquema ya implementado en `RenderEngine.js`:

- **Luz ambiental:** se mantiene el enfoque de una `AmbientLight` fría de base, pero se recomienda templar ligeramente su tono hacia `--world-bg-deep` (más azul-violeta de biblioteca que azul-servidor puro) para reforzar "Archivo Vivo" sobre "sala de servidores".
- **Luz direccional principal:** se mantiene como "luz de bóveda" cian/blanca cenital — sigue funcionando como la luz de "razón/tecnología".
- **Luz de acento puntual (sigue a Codi):** se mantiene el comportamiento ya implementado (sigue a Codi); su color puede variar sutilmente según la última Habilidad obtenida (ámbar tras Python, cian tras JavaScript, violeta tras SQL — sección 6) como refuerzo narrativo discreto, sin lógica de gameplay nueva — solo lectura visual de `ProgressStore.habilidades()`, ya expuesto hoy.
- **Luces de "punto de interés"** (nuevas, opcionales): una luz puntual tenue en cada Libro_de_Conocimiento y Mecanismo activo, del color de su Habilidad (sección 6) — es lo que hace que "brillen" de forma creíble en 3D además del material emissive que ya tienen.
- **Regla de presupuesto:** máximo 1 luz direccional + 1 ambiental + 1 puntual-sigue-a-Codi + hasta 4 puntuales estáticas de bajo alcance visibles simultáneamente (las de Zonas no visibles se pueden desactivar/omitir), para no penalizar GPU integrada. En el perfil "Bajo" (sección 20), las puntuales de punto de interés se desactivan primero.

## 17. Materiales

- **Piedra/estructura de la Isla:** `MeshStandardMaterial` con `roughness` alto (0.8–0.9) y `metalness` bajo (0.05–0.15) — superficie mate, ancestral, nunca "pulida/futurista".
- **Vetas de luz sobre la piedra:** el mismo material base + un mapa `emissive` de baja intensidad (0.2–0.4) en el color de acento de la Habilidad de la Zona (sección 6) — evita necesitar un shader custom adicional para este efecto.
- **Mecanismos activos:** metal oscuro + `emissive` del color de su Habilidad (patrón ya implementado para JavaScript — sección 6.2 lo formaliza como estándar por Habilidad, no genérico).
- **Codi:** se mantiene `MeshStandardMaterial` con el ligero `emissive` verde ya implementado (efecto "criatura viva que brilla suavemente", coherente con Ori) — ver restricciones de la sección 7.
- **Bug_Supremo (shader de corrupción):** sin cambios de arquitectura (sigue siendo `corruptionShader.js` aplicado sobre geometría existente); se recomienda ajustar su paleta para usar `--accent-mystery-violet` de forma consistente con el resto de la paleta de "misterio", en vez de un tono desconectado.

## 18. Sombras

- Se mantiene la decisión técnica ya documentada de **no activar `shadowMap` completo** (costo en GPU integrada no justificado para el MVP).
- Alternativa ligera recomendada para dar sensación de contacto con el suelo sin sombras dinámicas reales: una sombra "blob" simple (un círculo semi-transparente oscuro, `MeshBasicMaterial` con opacidad baja, o un decal plano) bajo Codi y bajo cada Mecanismo, que se escala levemente con la altura sobre el suelo. Costo de render mínimo, mejora perceptible de "anclaje" en el espacio 3D.
- Si en el futuro el rendimiento medido lo permite, se puede evaluar activar sombras solo para la luz direccional principal y solo sobre Codi (no sobre todo el entorno) — queda como mejora opcional del perfil "Alto" (sección 20), no como requisito de esta fase.

## 19. Postprocesado

Todo postprocesado debe ser **opcional y desactivable** (Principio 9 — el rendimiento forma parte del diseño). Orden de prioridad si se implementa:

1. **Viñeta suave** (`vignette` simple vía shader de post-proceso o incluso un `<div>` CSS con `radial-gradient` superpuesto al canvas): refuerza el foco en el centro de la escena, coherente con Journey. Costo casi nulo si se hace en CSS en vez de un pase de render adicional.
2. **Bloom muy sutil** sobre los elementos `emissive` (Libros, mecanismos activos, vetas de luz): refuerza el motivo de "brillo = interactivo" (sección 3, Principio 7). Debe implementarse con el `UnrealBloomPass` estándar de Three.js con un umbral alto (para que solo brille lo realmente emissive, no toda la escena) y una intensidad baja.
3. **Corrección de color/tono cálido leve** (LUT simple o ajuste de `toneMappingExposure`): para que el conjunto se sienta cálido y no "azul frío" por defecto, sin necesitar retocar cada material individualmente.

Ninguno de estos pases es necesario para que el juego funcione — son mejoras incrementales exclusivas del perfil gráfico "Alto" (sección 20) y deben poder omitirse por completo si el rendimiento en un equipo de gama baja lo requiere.

## 20. Escalabilidad gráfica

Desarrollo directo del Principio 9 ("El rendimiento forma parte del diseño"). Se definen tres perfiles gráficos. El perfil no altera ninguna lógica de juego, colores de identidad ni la estructura del HUD — solo la cantidad/calidad de efectos puramente visuales descritos en las secciones 15-19.

| Efecto | Perfil Bajo | Perfil Medio | Perfil Alto |
|---|---|---|---|
| Motas ambientales (sección 15) | Desactivadas | 15–30 por Zona visible | 30–60 por Zona visible |
| Estallido de absorción / onda de activación (sección 15) | Activas, sin reducción (costo bajo y muy breve; se conservan por Principio 4 — comunican información clave) | Activas | Activas |
| Motas de corrupción (sección 15) | Reducidas (5-8) | 10–15 | 10–15 |
| Luces de punto de interés (sección 16) | Desactivadas (el `emissive` del material sigue comunicando "interactivo" por sí solo) | Hasta 2 simultáneas | Hasta 4 simultáneas |
| Luz de acento que sigue a Codi (sección 16) | Activa, sin variación de color por Habilidad | Activa, con variación de color por Habilidad | Activa, con variación de color por Habilidad |
| Sombra de contacto "blob" (sección 18) | Activa (costo mínimo, ayuda mucho a la legibilidad espacial — Principio 4) | Activa | Activa |
| `shadowMap` dinámico sobre Codi (sección 18) | Desactivado | Desactivado | Opcional, si el hardware lo permite |
| Viñeta CSS (sección 19) | Activa (costo nulo) | Activa | Activa |
| Bloom (`UnrealBloomPass`, sección 19) | Desactivado | Desactivado | Activo, intensidad baja |
| Corrección de color/tono (sección 19) | Desactivada | Activa | Activa |
| `emissiveIntensity` de materiales (secciones 6, 17) | Valores base sin ajuste | Valores base | +10–15% para reforzar el bloom activo |

**Criterio de asignación de perfil (sin implementación de detección automática en esta fase):** el perfil "Medio" es el valor por defecto recomendado, pensado para GPU integrada (caso base del proyecto). El perfil "Bajo" es una opción de accesibilidad/rendimiento explícita para hardware muy limitado o para jugadores con `prefers-reduced-motion` (sección 25). El perfil "Alto" es una mejora opcional para hardware dedicado, nunca la experiencia de referencia del MVP.

**Regla de coherencia entre perfiles:** ningún perfil puede alterar la paleta de colores (sección 5-6), la iconografía (sección 9) ni la información comunicada por cada efecto (Principio 4) — solo su cantidad, intensidad o presencia/ausencia. Un jugador en perfil "Bajo" debe poder identificar Habilidades, elementos interactivos y estado del mundo igual de bien que uno en perfil "Alto", solo con menos ornamentación atmosférica.

## 21. Animaciones UI

- **Entrada/salida de tarjetas HUD:** actualmente el Cuadro de Mensaje aparece/desaparece con `display: block/none` instantáneo. Se propone una transición CSS breve (`opacity` + `translateY` de ~8px, 150–200ms, `ease-out`) al mostrarse y (`ease-in`) al ocultarse — refuerza la sensación "flota hacia la existencia" (sección 10) sin tocar la lógica de `UISystem` (el cambio es puramente CSS sobre las clases/estilos ya existentes).
- **Badges de habilidad nuevos:** cuando se añade un nuevo badge al Panel de Habilidades (evento de absorción), un breve "pop" de escala (0.8 → 1.0, ~200ms) lo distingue de los badges ya existentes en ese mismo frame.
- **Hover/focus de futuros botones:** transición de 100-150ms en `box-shadow`/`border-color` (sección 13), nunca instantánea ni más lenta de 250ms (debe sentirse responsivo, no "pesado").
- Todas las animaciones de UI se implementan con CSS transitions/keyframes estándar — no se introduce ninguna librería de animación.
- Deben respetar `prefers-reduced-motion` (sección 25).

## 22. Animaciones de Codi

Sin modificar `MovementSystem`/`AbilitySystem` (que ya determinan `animState`: `idle | walk | run | jump`), se refina la capa puramente visual ya existente en `RenderEngine._actualizarCicloCaminata`, respetando siempre la Guía oficial de Codi (sección 7):

- **Idle:** se recomienda añadir un balanceo vertical muy sutil (respiración) cuando `animState === 'idle'`, reutilizando el mismo reloj interno de `RenderEngine` — refuerza que Codi está "viva y curiosa", no congelada, incluso quieta.
- **Walk/Run:** el ciclo de caminata ya implementado se mantiene; se recomienda aumentar ligeramente la amplitud de cola en `run` respecto a `walk` (ya existe la distinción de `animState`, es solo cuestión de leerla en la función de animación) para dar sensación de mayor energía sin nueva lógica de gameplay.
- **Momento de absorción:** una pequeña pose de "sorpresa alegre" (cabeza ligeramente hacia atrás/arriba, ~300ms) disparada por el mismo evento que ya usa `UISystem.mostrarMensaje` para el mensaje de absorción — puramente decorativa, no afecta `CodiPose` real ni colisión.
- Se descarta cualquier animación de "daño" o "ataque": no existen en el diseño de personalidad de Codi (Principio 2 y 8; Requisito: ausencia total de combate).

## 23. Sonido y música

Fuera del alcance técnico actual (no hay sistema de audio implementado en el MVP), pero se documenta la dirección para cuando se aborde, reforzando la identidad por Habilidad de la sección 6:

- **Música ambiental:** capas suaves, orgánicas (cuerdas/pads cálidos) con un elemento sutil de "brillo" electrónico de fondo (evocando el motivo tecnológico) — nunca percusión agresiva ni synths fríos dominantes (Principio 2).
- **Sonido de absorción:** varía sutilmente por Habilidad (ver 6.1–6.3: acorde ascendente cálido para Python, click electrónico limpio para JavaScript, tono grave resonante para SQL), siempre corto y no intrusivo.
- **Sonido de mecanismo resuelto:** distinto por Habilidad (campanita cálida / campanita aguda / acorde descendente susurrado — sección 6), reforzando la asociación color-sonido-habilidad del Principio 6.
- **Ambiente del Bug_Supremo:** disonancia sutil y distante (no un "jumpscare" ni sonido de amenaza física, Principio 2), coherente con "misterio, no terror".
- Todo el diseño de audio queda pendiente de una fase futura con su propio documento técnico; se incluye aquí únicamente como guía de tono para no contradecir la identidad visual cuando se implemente.

## 24. Principios UX

1. **La exploración nunca se interrumpe por la UI.** Ningún elemento de interfaz debe requerir pausar el juego o bloquear el input de movimiento (ya se cumple hoy; se preserva como principio explícito — Principio 3).
2. **Un solo foco de atención a la vez.** Si hay un mensaje contextual activo, no debe competir con una animación de partículas grande simultánea en el mismo punto de la pantalla (Principio 5).
3. **El color enseña antes que el texto.** Todo sistema de gating/progreso debe poder entenderse parcialmente por color/glow incluso sin leer el texto (refuerzo, no sustituto, del texto — ver accesibilidad, sección 25).
4. **La cámara y el HUD nunca ocultan el objetivo.** Las tarjetas HUD se ubican en las esquinas precisamente para no interferir con la línea de visión central hacia Codi/objetivos.
5. **Todo feedback es inmediato y proporcional.** Una acción pequeña (mover) tiene feedback sutil (ciclo de caminata); una acción grande (resolver el Desafío Final) tiene feedback proporcionalmente mayor (partículas, mensaje persistente) — nunca al revés (Principio 4).

## 25. Accesibilidad

- **Contraste:** todo texto sobre `.hud-card` debe mantener una relación de contraste mínima AA (4.5:1) entre `--text-primary`/`--text-muted` y `--glass-bg` — a verificar manualmente al implementar cualquier ajuste de opacidad del cristal (bajar demasiado la opacidad del fondo por estética rompería este requisito).
- **No depender solo del color:** ya es un principio del `design.md` técnico (Accesibilidad 2); esta dirección artística lo refuerza: cada badge de habilidad sigue mostrando el nombre en texto (no solo un color de fondo), cada mensaje de error/denegación sigue teniendo texto explícito además del borde de color.
- **Navegación por teclado:** cualquier botón futuro (sección 13) debe ser alcanzable y operable por teclado (`Tab`/`Enter`), con estado de foco visible.
- **Reducción de movimiento:** se recomienda respetar `prefers-reduced-motion` en CSS para las animaciones de entrada/salida de tarjetas (sección 21) y el balanceo de partículas ambientales (mostrar/ocultar sin transición, partículas estáticas o desactivadas) para jugadores sensibles al movimiento. Se recomienda que este ajuste se alinee automáticamente con el perfil gráfico "Bajo" (sección 20).
- **Tamaño de texto mínimo:** ningún texto de UI por debajo de 11px (ya se cumple en los tamaños propuestos en la sección 8).

> Nota: como ya se indicó en instrucciones previas del proyecto, la validación completa de accesibilidad requiere pruebas manuales con tecnología asistida real y revisión experta; este documento fija los principios de diseño, no certifica cumplimiento WCAG.

## 26. Responsive

El MVP está definido para navegadores de escritorio (Requisito: teclado + mouse, sin soporte de gamepad/móvil en el alcance actual). Aun así, se recomienda que el HUD tolere razonablemente distintos tamaños de ventana de escritorio:

- Las tarjetas HUD usan posicionamiento `fixed` con márgenes fijos (ya implementado) — funciona correctamente en cualquier resolución de escritorio común (1280×720 en adelante).
- Por debajo de un ancho de ventana muy reducido (< 900px, caso límite de ventana no maximizada), se recomienda que el panel de Controles reduzca su padding/tamaño de fuente en un paso (una única media query), en vez de superponerse con el Panel de Habilidades.
- No se diseña para viewport móvil/táctil: está explícitamente fuera del alcance del MVP (Supuesto: teclado y mouse como único método de entrada).

## 27. Consistencia visual

Checklist de continuidad que cualquier futura Specification/tarea de implementación visual debe cumplir antes de considerarse terminada, verificado contra los Design Principles (sección 0.1):

- [ ] Usa exclusivamente los tokens de color de la sección 5 y la identidad por Habilidad de la sección 6 (no introduce hex codes nuevos sin antes añadirlos a este documento). *(Principios 5, 6)*
- [ ] Cualquier tarjeta de información nueva reutiliza `.hud-card` (mismo blur, borde, radio, sombra) — nunca un estilo de panel distinto. *(Principio 5)*
- [ ] Cualquier elemento brillante nuevo sigue la regla "brillo pulsante = interactivo, brillo estático = decorativo" (sección 3). *(Principio 7)*
- [ ] Ningún elemento nuevo introduce ángulos agresivos, rojo como color dominante, o iconografía de amenaza/combate. *(Principio 2)*
- [ ] Cada efecto visual nuevo puede explicarse en una frase de qué información comunica al jugador; si no puede, se reconsidera o elimina. *(Principio 4)*
- [ ] Ningún cambio afecta la silueta, colores base o personalidad de Codi fuera de lo permitido en la sección 7. *(Principio 8)*
- [ ] Todo cambio de material/luz/partícula/postprocesado se clasifica explícitamente en un perfil gráfico (sección 20) y respeta el presupuesto de rendimiento de las secciones 15-16. *(Principio 9)*
- [ ] Toda animación nueva es CSS/Three.js nativo, sin nuevas dependencias, y respeta `prefers-reduced-motion` si aplica.
- [ ] Ningún cambio visual modifica un `id`, clase estructural, o contrato de función que los tests existentes verifiquen.

---

## Próximos pasos

Este documento queda **aprobado con las observaciones incorporadas en esta revisión** como referencia oficial de dirección artística. Cualquier nueva Specification de implementación visual (CSS, materiales, luces, partículas, postprocesado, audio) debe:

1. Citar explícitamente qué secciones de este documento implementa.
2. Pasar el checklist de la sección 27 antes de cerrarse.
3. No proponer cambios a los Design Principles (sección 0.1) ni a la Guía oficial de Codi (sección 7) sin pasar antes por una revisión y aprobación explícita de este mismo documento.

Se detiene aquí y se espera aprobación antes de crear cualquier Specification de implementación visual derivada.
