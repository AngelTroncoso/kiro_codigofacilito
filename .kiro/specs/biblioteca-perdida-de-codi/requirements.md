# Requirements Document

## Introduction

"Codi y la Biblioteca Perdida del Código" es un videojuego de exploración en 3D desarrollado para la Hackatón de Código Facilito. El Jugador controla a Codi, la mascota oficial de Código Facilito, en un viaje por una isla selvática donde una antigua civilización escondió el conocimiento de la programación en forma de libros mágicos. Cada libro que Codi absorbe representa un lenguaje de programación y le otorga una nueva forma de interactuar con el entorno, nunca un arma ni una herramienta de destrucción. El juego transmite curiosidad, descubrimiento, aprendizaje y creatividad, reforzando la idea de que programar es resolver problemas y no memorizar sintaxis.

Este documento define los requisitos del Producto Mínimo Viable (MVP) que debe poder demostrarse de forma completa y pulida dentro del tiempo limitado de la hackatón, priorizando una experiencia corta y sólida sobre una experiencia grande e incompleta.

## Glossary

- **Jugador**: Persona que interactúa con el juego a través de teclado y mouse en un navegador web de escritorio.
- **Codi**: Personaje protagonista controlado por el Jugador; un cocodrilo/caimán 3D estilo cartoon, curioso, amigable y expresivo, que nunca actúa de forma agresiva ni violenta.
- **Isla**: Escenario principal de exploración en 3D, una selva donde está dispersa la Biblioteca Perdida del Código.
- **Zona**: Subdivisión navegable de la Isla que agrupa uno o más Mecanismos_Ambientales y, opcionalmente, un Libro_de_Conocimiento.
- **Libro_de_Conocimiento**: Objeto interactivo del mundo que representa un lenguaje de programación. Al ser alcanzado por Codi, es absorbido automáticamente (no se recoge ni se guarda como ítem).
- **Habilidad**: Capacidad permanente que Codi obtiene al absorber un Libro_de_Conocimiento, y que modifica su forma de interactuar con el entorno.
- **Mecanismo_Ambiental**: Elemento del entorno (puente, plataforma, dispositivo, camino oculto, estructura, etc.) que puede ser transformado, revelado o activado mediante una Habilidad específica.
- **Zona_Bloqueada**: Área de la Isla que no puede resolverse ni atravesarse hasta que Codi posea la Habilidad requerida.
- **Bug_Supremo**: Entidad antagonista que representa el caos y la corrupción del conocimiento; constituye el desafío final del juego. No es un enemigo de combate. Se manifiesta mediante un efecto visual/shader de corrupción aplicado sobre la geometría y el entorno existentes, sin modelo 3D ni animaciones propias.
- **Desafio_Final**: Secuencia de juego en la que el Jugador debe combinar varias Habilidades para resolver el conflicto con el Bug_Supremo.
- **Sesion_de_Juego**: Periodo continuo de juego desde que el Jugador inicia el juego hasta que cierra o recarga la pestaña del navegador.
- **Sistema_de_Movimiento**: Subsistema responsable de trasladar y animar a Codi en respuesta a la entrada del Jugador.
- **Sistema_de_Camara**: Subsistema responsable de posicionar y mover la cámara virtual en la escena 3D.
- **Sistema_de_Absorcion**: Subsistema responsable de detectar el contacto entre Codi y un Libro_de_Conocimiento y de otorgar la Habilidad correspondiente.
- **Sistema_de_Habilidades**: Subsistema responsable de aplicar los efectos de una Habilidad activa sobre un Mecanismo_Ambiental.
- **Sistema_de_Interfaz**: Subsistema responsable de mostrar información al Jugador (indicadores de Habilidades, mensajes contextuales, pistas).
- **Sistema_de_Progreso**: Subsistema responsable de registrar, durante la Sesion_de_Juego, qué Habilidades posee Codi y qué Mecanismos_Ambientales han sido resueltos.
- **Motor_de_Renderizado**: Subsistema basado en WebGL (Three.js) responsable de dibujar la escena 3D en el navegador.
- **Sistema_de_Carga_de_Assets**: Subsistema responsable de cargar modelos GLB/GLTF, texturas y demás recursos necesarios para la escena.
- **Arquitectura_WebXR_Preparada**: Conjunto de decisiones de diseño de software (separación de entrada, cámara y renderizado) que permite, en el futuro, agregar soporte de realidad extendida sin rediseñar los sistemas centrales.

## Visión del producto

Codi y la Biblioteca Perdida del Código es una aventura de exploración en tercera persona, en navegador, donde aprender a programar se representa como el acto de recuperar conocimiento perdido y usarlo para transformar el mundo. El juego debe transmitir en cada mecánica la filosofía de que programar es resolver problemas: cada Habilidad abre nuevas formas de avanzar, nunca nuevas formas de atacar. La experiencia debe sentirse cálida, colorida y accesible para todas las edades, alineada visualmente con la identidad oficial de Codi (cartoon 3D, expresivo, nunca agresivo).

## Objetivos

1. Entregar un MVP jugable de principio a fin dentro del tiempo disponible de la hackatón.
2. Representar de forma clara y consistente la filosofía "programar es resolver problemas, no memorizar sintaxis" a través de las mecánicas de juego.
3. Mantener la identidad visual y de personalidad de Codi (curioso, amigable, aventurero, divertido, optimista) en cada interacción.
4. Ofrecer al menos tres formas de pensamiento/lenguaje distintas y claramente diferenciadas como Habilidades jugables.
5. Construir el juego sobre una base técnica en navegador (WebGL) que pueda escalar a WebXR en el futuro sin retrabajo estructural.
6. Priorizar la calidad y el pulido de un alcance reducido sobre la cantidad de contenido.

## Público objetivo

- Jueces y asistentes de la Hackatón de Código Facilito, con conocimientos técnicos variados (desde principiantes hasta desarrolladores experimentados).
- Estudiantes y comunidad de Código Facilito interesados en aprender programación de forma lúdica.
- Jugadores casuales de todas las edades familiarizados con juegos de plataformas/exploración tipo Astro Bot, Super Mario Odyssey, Banjo Kazooie, Ratchet & Clank, Sackboy o Crash Bandicoot.
- No se asume conocimiento previo de programación para disfrutar o comprender la narrativa del juego.

## Alcance del MVP

### Dentro del alcance

1. Una única Isla explorable en 3D, de tamaño reducido, dividida en 3 a 4 Zonas conectadas. Este número de Zonas y las tres Habilidades jugables están calibrados para completarse dentro de las 24-48 horas efectivas de desarrollo disponibles en la hackatón (ver Supuestos).
2. Movimiento libre de Codi en tercera persona (caminar, correr, saltar) mediante teclado y mouse.
3. Cámara en tercera persona controlada por el Jugador (estilo orbital, siguiendo a Codi).
4. Sistema_de_Absorcion que otorga una Habilidad de forma automática al contacto con un Libro_de_Conocimiento, sin gestión de inventario.
5. Exactamente tres Habilidades jugables, completas y pulidas, correspondientes a Python, JavaScript y SQL.
6. Al menos un Mecanismo_Ambiental funcional por Habilidad, reutilizado en distintas Zonas para reforzar el aprendizaje del jugador.
7. Un Desafio_Final contra el Bug_Supremo que requiera combinar las tres Habilidades obtenidas.
8. Interfaz mínima: indicador de Habilidades obtenidas y mensajes contextuales de objetivo/pista.
9. Progreso de Habilidades y Mecanismos_Ambientales resueltos dentro de una misma Sesion_de_Juego.
10. Compatibilidad con navegadores de escritorio modernos mediante WebGL.
11. Uso de modelos en formato GLB/GLTF para Codi y el entorno, y de un shader/material de corrupción para representar al Bug_Supremo.
12. Arquitectura de código preparada (sin implementación funcional) para escalar a WebXR.
13. Estilo visual cartoon 3D, colorido y coherente con la identidad oficial de Codi.
14. Ausencia total de combate, daño a Codi o condiciones de derrota por combate.

### Fuera del alcance (explícitamente excluido del MVP)

1. Habilidades jugables adicionales de C++, HTML/CSS, Java, Rust, Go e Inteligencia Artificial (quedan documentadas como roadmap posterior a la hackatón).
2. Cualquier modo multijugador o interacción en red.
3. Soporte funcional de dispositivos WebXR/VR reales (visores); solo se prepara la arquitectura, no se implementa.
4. Controles táctiles o adaptaciones para dispositivos móviles.
5. Soporte de entrada por gamepad; el MVP solo soporta teclado y mouse.
6. Persistencia de progreso entre Sesiones_de_Juego (guardado en servidor o almacenamiento local).
7. Sistema de combate, daño o condición de derrota para Codi.
8. Inventario de ítems o recolección de objetos coleccionables adicionales.
9. Cinemáticas complejas, doblaje de voz o secuencias narrativas extensas.
10. Menús de configuración avanzados (gráficos, remapeo de controles, opciones de red).
11. Sistemas de logros, puntuaciones o tablas de clasificación.
12. Soporte multi-idioma; el MVP se entrega en un único idioma.
13. Sistema de misiones secundarias, diálogos ramificados o NPCs adicionales más allá de los estrictamente necesarios para el Desafio_Final.

## Mecánicas principales

1. **Exploración libre**: Codi recorre la Isla a pie, con salto, sin límites de tiempo ni presión de combate.
2. **Absorción de conocimiento**: al tocar un Libro_de_Conocimiento, Codi lo absorbe de inmediato y obtiene una Habilidad permanente; no existe gestión manual de inventario.
3. **Transformación del entorno mediante Habilidades**:
   - Python: permite construir puentes y activar soluciones automatizadas para atravesar obstáculos.
   - JavaScript: permite activar mecanismos, mover plataformas y controlar dispositivos del entorno.
   - SQL: permite descubrir caminos ocultos y consultar información antigua para revelar partes del mapa.
4. **Progresión por descubrimiento**: algunas Zonas están bloqueadas hasta que Codi posea la Habilidad necesaria, incentivando la exploración y el regreso a zonas previas.
5. **Resolución creativa, no destructiva**: ninguna Habilidad se usa para atacar, dañar o destruir; todas transforman o crean.
6. **Desafío final combinatorio**: el Bug_Supremo se resuelve combinando las tres Habilidades en una secuencia de resolución de problemas, no mediante combate.

## Requirements

### Requisito 1: Movimiento y exploración de Codi

**User Story:** Como Jugador, quiero mover a Codi libremente por la Isla, para poder explorar el entorno y descubrir la Biblioteca Perdida.

#### Criterios de aceptación

1. WHEN el Jugador presiona las teclas de dirección o WASD, THE Sistema_de_Movimiento SHALL trasladar a Codi en la dirección correspondiente sobre el terreno de la Isla.
2. WHEN el Jugador presiona la tecla de salto, THE Sistema_de_Movimiento SHALL hacer que Codi ejecute una animación de salto y se eleve sobre el terreno.
3. WHILE Codi se está desplazando, THE Sistema_de_Movimiento SHALL reproducir la animación de caminar o correr correspondiente a la velocidad actual.
4. IF Codi cae fuera de los límites navegables de la Isla, THEN THE Sistema_de_Movimiento SHALL reposicionar a Codi en el último punto seguro registrado.
5. THE Sistema_de_Movimiento SHALL impedir que Codi atraviese geometría sólida del entorno.

### Requisito 2: Cámara en tercera persona

**User Story:** Como Jugador, quiero controlar la cámara alrededor de Codi, para poder observar el entorno y planear mis movimientos.

#### Criterios de aceptación

1. THE Sistema_de_Camara SHALL mantener el encuadre de Codi dentro del campo de visión durante la exploración.
2. WHEN el Jugador mueve el mouse o el stick de cámara, THE Sistema_de_Camara SHALL rotar la vista alrededor de Codi.
3. IF la cámara detecta geometría del entorno entre Codi y la posición ideal de la cámara, THEN THE Sistema_de_Camara SHALL acercar la cámara para evitar que la vista quede bloqueada u obstruida.
4. WHEN el tamaño de la ventana del navegador cambia, THE Sistema_de_Camara SHALL ajustar la relación de aspecto de la cámara sin distorsionar la escena.

### Requisito 3: Absorción de conocimiento

**User Story:** Como Jugador, quiero que Codi absorba automáticamente los libros de conocimiento que encuentre, para poder obtener nuevas Habilidades sin gestionar un inventario.

#### Criterios de aceptación

1. WHEN Codi entra en contacto con un Libro_de_Conocimiento, THE Sistema_de_Absorcion SHALL otorgar de inmediato la Habilidad asociada a Codi.
2. WHEN una Habilidad es otorgada, THE Sistema_de_Absorcion SHALL reproducir una animación o efecto visual de absorción antes de devolver el control total al Jugador.
3. WHEN una Habilidad es otorgada, THE Sistema_de_Interfaz SHALL mostrar un mensaje contextual que identifique la Habilidad obtenida y su forma general de uso.
4. THE Sistema_de_Absorcion SHALL remover el Libro_de_Conocimiento de la escena una vez que su Habilidad ha sido otorgada.
5. IF Codi entra en contacto con un Libro_de_Conocimiento cuya Habilidad ya fue otorgada previamente en la Sesion_de_Juego, THEN THE Sistema_de_Absorcion SHALL ignorar el contacto sin alterar el estado de Codi.

### Requisito 4: Habilidad Python — soluciones automatizadas

**User Story:** Como Jugador, quiero usar la Habilidad de Python para construir puentes y activar soluciones automatizadas, para poder atravesar obstáculos que antes eran imposibles.

#### Criterios de aceptación

1. WHERE Codi posee la Habilidad de Python, THE Sistema_de_Habilidades SHALL permitir que el Jugador active Mecanismos_Ambientales de tipo "puente" o "solución automatizada" cercanos a Codi.
2. WHEN el Jugador activa un Mecanismo_Ambiental de tipo Python, THE Sistema_de_Habilidades SHALL transformar dicho mecanismo en una estructura transitable (por ejemplo, un puente extendido).
3. IF el Jugador intenta activar un Mecanismo_Ambiental de tipo Python sin que Codi posea la Habilidad de Python, THEN THE Sistema_de_Interfaz SHALL mostrar un mensaje indicando que se requiere el conocimiento de Python.
4. WHILE un Mecanismo_Ambiental de tipo Python permanece activado, THE Sistema_de_Habilidades SHALL mantener dicha estructura transitable sin requerir reactivación continua.

### Requisito 5: Habilidad JavaScript — mecanismos y plataformas

**User Story:** Como Jugador, quiero usar la Habilidad de JavaScript para activar mecanismos y mover plataformas, para poder controlar dispositivos del entorno.

#### Criterios de aceptación

1. WHERE Codi posee la Habilidad de JavaScript, THE Sistema_de_Habilidades SHALL permitir que el Jugador active Mecanismos_Ambientales de tipo "dispositivo" o "plataforma móvil" cercanos a Codi.
2. WHEN el Jugador activa un Mecanismo_Ambiental de tipo JavaScript, THE Sistema_de_Habilidades SHALL iniciar el comportamiento definido del mecanismo (por ejemplo, desplazar una plataforma entre dos puntos).
3. IF el Jugador intenta activar un Mecanismo_Ambiental de tipo JavaScript sin que Codi posea la Habilidad de JavaScript, THEN THE Sistema_de_Interfaz SHALL mostrar un mensaje indicando que se requiere el conocimiento de JavaScript.
4. WHILE una plataforma de tipo JavaScript está en movimiento, THE Sistema_de_Habilidades SHALL mantener a Codi sobre la plataforma si Codi permanece sobre su superficie.

### Requisito 6: Habilidad SQL — caminos ocultos e información antigua

**User Story:** Como Jugador, quiero usar la Habilidad de SQL para descubrir caminos ocultos y consultar información antigua, para poder revelar partes del mapa que antes eran invisibles.

#### Criterios de aceptación

1. WHERE Codi posee la Habilidad de SQL, THE Sistema_de_Habilidades SHALL permitir que el Jugador consulte Mecanismos_Ambientales de tipo "camino oculto" o "fuente de información" cercanos a Codi.
2. WHEN el Jugador consulta un Mecanismo_Ambiental de tipo SQL, THE Sistema_de_Habilidades SHALL revelar el elemento oculto correspondiente (por ejemplo, un camino, plataforma o pista antes invisible).
3. IF el Jugador intenta consultar un Mecanismo_Ambiental de tipo SQL sin que Codi posea la Habilidad de SQL, THEN THE Sistema_de_Interfaz SHALL mostrar un mensaje indicando que se requiere el conocimiento de SQL.
4. WHEN un elemento oculto es revelado mediante la Habilidad de SQL, THE Sistema_de_Progreso SHALL registrar dicho elemento como permanentemente revelado durante la Sesion_de_Juego.

### Requisito 7: Zonas bloqueadas y guía al Jugador

**User Story:** Como Jugador, quiero recibir indicaciones claras cuando no tengo el conocimiento necesario para avanzar, para poder entender qué debo explorar antes de continuar.

#### Criterios de aceptación

1. IF el Jugador intenta ingresar a una Zona_Bloqueada sin la Habilidad requerida, THEN THE Sistema_de_Interfaz SHALL mostrar una pista contextual sobre qué tipo de conocimiento se necesita.
2. THE Sistema_de_Movimiento SHALL impedir que Codi atraviese una Zona_Bloqueada sin bloquear por completo la exploración de las Zonas ya disponibles.
3. WHEN Codi obtiene la Habilidad requerida para una Zona_Bloqueada previamente visitada, THE Sistema_de_Habilidades SHALL permitir el acceso a dicha Zona en cualquier visita posterior dentro de la misma Sesion_de_Juego.

### Requisito 8: Interfaz y retroalimentación al Jugador

**User Story:** Como Jugador, quiero ver claramente qué Habilidades tengo y qué debo hacer, para poder tomar decisiones informadas durante la exploración.

#### Criterios de aceptación

1. THE Sistema_de_Interfaz SHALL mostrar de forma permanente un indicador visual de las Habilidades que Codi posee durante la Sesion_de_Juego.
2. WHEN ocurre un evento relevante para el Jugador (obtención de Habilidad, bloqueo de Zona, activación de Mecanismo_Ambiental), THE Sistema_de_Interfaz SHALL mostrar un mensaje contextual breve relacionado con dicho evento.
3. THE Sistema_de_Interfaz SHALL ocultar automáticamente los mensajes contextuales después de un periodo breve o tras una nueva acción relevante del Jugador.
4. THE Sistema_de_Interfaz SHALL presentar todo texto en un estilo visual coherente con el tono amigable y optimista de Codi.

### Requisito 9: Progreso durante la sesión de juego

**User Story:** Como Jugador, quiero que mi progreso se mantenga mientras estoy jugando, para no perder avances por errores momentáneos dentro de la misma sesión.

#### Criterios de aceptación

1. THE Sistema_de_Progreso SHALL mantener el registro de Habilidades obtenidas por Codi durante toda la Sesion_de_Juego.
2. THE Sistema_de_Progreso SHALL mantener el registro de Mecanismos_Ambientales resueltos por Codi durante toda la Sesion_de_Juego.
3. IF el Jugador recarga o cierra la pestaña del navegador, THEN THE Sistema_de_Progreso SHALL reiniciar el progreso al comenzar una nueva Sesion_de_Juego.

### Requisito 10: Desafío final contra el Bug Supremo

**User Story:** Como Jugador, quiero enfrentar un desafío final que combine todo lo que aprendí, para poder sentir que el conocimiento adquirido tiene un propósito culminante.

#### Criterios de aceptación

1. WHEN Codi posee las tres Habilidades del MVP y llega a la zona final, THE Sistema_de_Habilidades SHALL habilitar el inicio del Desafio_Final contra el Bug_Supremo.
2. THE Desafio_Final SHALL requerir el uso de al menos dos de las tres Habilidades obtenidas para completarse.
3. THE Bug_Supremo SHALL representarse mediante un efecto visual/shader de corrupción aplicado sobre la geometría y el entorno existentes, sin modelo 3D ni animaciones propias, y sin infligir daño ni condición de derrota a Codi.
4. WHEN el Jugador resuelve correctamente la secuencia del Desafio_Final, THE Sistema_de_Progreso SHALL marcar el juego como completado dentro de la Sesion_de_Juego.
5. THE Desafio_Final SHALL comunicarse al Jugador como un problema a resolver mediante conocimiento combinado, no como un combate.

### Requisito 11: Identidad visual y narrativa de Codi

**User Story:** Como Jugador, quiero que Codi se comporte y luzca de forma consistente con su identidad oficial, para poder identificarme con el personaje y disfrutar del tono del juego.

#### Criterios de aceptación

1. THE Motor_de_Renderizado SHALL representar a Codi utilizando su modelo 3D oficial (cocodrilo/caimán verde, panza amarilla a rayas, ojos expresivos) sin alterar su diseño base.
2. THE Sistema_de_Movimiento SHALL utilizar animaciones y poses que reflejen una personalidad curiosa, amigable y aventurera.
3. THE Sistema_de_Interfaz SHALL utilizar un tono narrativo optimista, curioso y no amenazante en todos los mensajes mostrados al Jugador.
4. THE Sistema_de_Habilidades SHALL representar cada efecto de Habilidad como una acción creativa o constructiva, nunca como una acción agresiva o destructiva.

## Requisitos funcionales

1. THE Sistema_de_Carga_de_Assets SHALL cargar los modelos 3D de Codi, el entorno y el Bug_Supremo en formato GLB o GLTF antes de iniciar la Sesion_de_Juego.
2. IF un modelo GLB/GLTF requerido falla al cargar, THEN THE Sistema_de_Carga_de_Assets SHALL mostrar un mensaje de error comprensible al Jugador en lugar de dejar la pantalla en blanco.
3. THE Motor_de_Renderizado SHALL renderizar la escena 3D de la Isla de forma continua mientras la Sesion_de_Juego esté activa.
4. THE Sistema_de_Progreso SHALL exponer el estado actual de Habilidades y Mecanismos_Ambientales resueltos a los demás subsistemas del juego (Interfaz, Habilidades, Movimiento) de forma consistente.
5. WHEN el Jugador inicia el juego, THE Sistema_de_Movimiento SHALL ubicar a Codi en un punto de inicio fijo dentro de la primera Zona de la Isla.
6. THE Sistema_de_Habilidades SHALL asociar cada Mecanismo_Ambiental con exactamente un tipo de Habilidad requerida.

## Requisitos no funcionales

### Rendimiento

1. WHILE la Sesion_de_Juego está activa en una computadora de gama media con GPU integrada (sin tarjeta dedicada), THE Motor_de_Renderizado SHALL mantener una tasa de refresco visualmente fluida adecuada para exploración en tercera persona.
2. THE Sistema_de_Carga_de_Assets SHALL completar la carga inicial de la Isla en un tiempo que no genere una espera percibida como excesiva por el Jugador antes de mostrar retroalimentación de progreso de carga.

Se asume, a falta de un perfil de hardware específico de los jueces, que una laptop de gama media genérica con GPU integrada representa el objetivo mínimo de rendimiento a soportar (ver Supuestos).

### Compatibilidad de navegador y WebGL

1. THE Motor_de_Renderizado SHALL ejecutarse en navegadores de escritorio actualizados con soporte de WebGL (Chrome, Firefox y Edge en sus versiones estables más recientes).
2. IF el navegador del Jugador no soporta WebGL, THEN THE Sistema_de_Interfaz SHALL mostrar un mensaje explicando el requisito técnico en lugar de fallar silenciosamente.

### Accesibilidad

1. THE Sistema_de_Interfaz SHALL presentar el texto de mensajes contextuales con suficiente contraste respecto al fondo para asegurar su legibilidad.
2. THE Sistema_de_Habilidades SHALL comunicar el tipo de Habilidad requerida para cada Mecanismo_Ambiental mediante texto o iconografía, sin depender exclusivamente del color.

### Arquitectura escalable a WebXR

1. THE Sistema_de_Movimiento y el Sistema_de_Camara SHALL implementarse como módulos independientes de la lógica de entrada específica de teclado/mouse, de forma que puedan sustituirse por controladores de WebXR en una fase futura.
2. THE Motor_de_Renderizado SHALL configurarse de forma que el bucle de renderizado sea compatible con la extensión futura hacia una sesión WebXR, sin requerir dicha sesión en el MVP.
3. THE Arquitectura_WebXR_Preparada SHALL documentarse en el diseño técnico como una capa de abstracción, sin implementar entrada, renderizado estereoscópico ni interacción WebXR en el MVP.

## Restricciones técnicas

1. THE juego SHALL ejecutarse completamente dentro de un navegador web de escritorio, sin requerir instalación de software adicional por parte del Jugador.
2. THE juego SHALL renderizarse utilizando WebGL a través de la biblioteca Three.js como motor 3D implícito del stack.
3. THE juego SHALL utilizar exclusivamente modelos en formato GLB o GLTF para los assets 3D.
4. THE juego SHALL desarrollarse utilizando el conjunto de herramientas disponibles para la hackatón: Kiro, Claude Sonnet, GLTF/GLB Viewer, Super GLB Viewer, Live Server, SnippetStudio y Vite como bundler/servidor de desarrollo.
5. THE alcance del MVP SHALL ajustarse al tiempo limitado disponible durante la hackatón (24-48 horas efectivas de desarrollo), priorizando el pulido sobre la cantidad de contenido.
6. THE juego SHALL evitar dependencias de motores de videojuego externos distintos a Three.js/WebGL sin justificación técnica explícita.
7. THE juego SHALL implementar la detección de colisiones mediante técnicas simplificadas hechas a mano (raycasts y volúmenes simples tipo AABB/esferas), sin depender de una biblioteca de físicas externa (se descartan cannon-es, rapier y ammo.js para el MVP).
8. THE juego SHALL utilizar Three.js junto con Vite como bundler y servidor de desarrollo, en lugar de Three.js vanilla sin bundler; Live Server puede seguir usándose de forma complementaria para pruebas rápidas de assets estáticos.
9. THE juego SHALL depender de assets 3D genéricos o de librerías de recursos de terceros (por ejemplo Mixamo, Sketchfab, Poly Pizza) para Codi, el entorno y los elementos relacionados con el Bug_Supremo, sujetos a licencias compatibles con su uso en la hackatón.
10. THE juego SHALL soportar exclusivamente entrada por teclado y mouse; no se implementará soporte de gamepad en el MVP.

## Riesgos

1. La producción de assets 3D (modelo animado de Codi, entorno de la Isla, Bug_Supremo) puede tomar más tiempo del disponible en la hackatón.
2. El control de cámara en tercera persona es una de las mecánicas más difíciles de pulir y puede afectar negativamente la percepción de calidad del MVP si se subestima su tiempo de desarrollo.
3. Definir y balancear tres Mecanismos_Ambientales distintos y reutilizables puede generar más trabajo de diseño e implementación del previsto.
4. El rendimiento en WebGL puede degradarse en las computadoras usadas por los jueces si no se controla la complejidad de los modelos 3D.
5. La necesidad de comunicar la filosofía educativa sin diálogos extensos puede resultar en una narrativa poco clara si no se diseña cuidadosamente el sistema de mensajes contextuales.
6. El deseo de agregar más Habilidades (C++, Java, Rust, Go, IA) durante el desarrollo puede generar expansión de alcance ("scope creep") que ponga en riesgo el MVP.
7. La preparación de la arquitectura para WebXR, si no se delimita bien, puede consumir tiempo de diseño que debería dedicarse al MVP funcional en WebGL.
8. Ningún asset genérico o de librería (Mixamo, Sketchfab, Poly Pizza) puede encajar visualmente con la identidad oficial de Codi sin un trabajo de adaptación (materiales, proporciones, rigging) mayor al previsto, dado que se depende de assets de terceros en lugar de assets originales.
9. La ventana de tiempo efectiva de la hackatón (24-48 horas) es limitada; el alcance de 3-4 Zonas y 3 Habilidades está calibrado a esta disponibilidad, pero cualquier imprevisto (bloqueo técnico, adaptación de assets, integración de Vite) puede comprometer la finalización del MVP dentro de ese plazo.

## Supuestos

1. El equipo tiene o puede obtener, dentro del tiempo de la hackatón, un modelo 3D animado de Codi en formato GLB/GLTF con las poses e identidad visual oficiales, adaptado a partir de assets genéricos/de librería (por ejemplo Mixamo, Sketchfab, Poly Pizza) cuando no exista un modelo original disponible.
2. El equipo tiene o puede producir/adaptar assets 3D de entorno (selva, biblioteca, mecanismos) y elementos relacionados con el Bug_Supremo en formato GLB/GLTF de bajo/medio conteo de polígonos, a partir de assets genéricos/de librería con licencias compatibles, coherentes con el estilo cartoon buscado en la medida de lo posible.
3. El público objetivo de la demostración utilizará computadoras de escritorio o laptops con soporte WebGL habilitado.
4. El Jugador cuenta con teclado y mouse como único método de entrada durante la demostración; no se dispone ni se requiere gamepad.
5. No se requiere conexión a un backend o servidor externo para que el MVP funcione; el juego puede ejecutarse como una aplicación estática servida localmente (Vite como servidor de desarrollo, o Live Server para pruebas rápidas de assets estáticos) o desde un hosting estático.
6. El equipo de desarrollo tiene familiaridad básica con Three.js y Vite, o puede adquirirla rápidamente con apoyo de Kiro y Claude Sonnet.
7. El equipo dispone de 24 a 48 horas efectivas de desarrollo durante la hackatón; el alcance del MVP (3-4 Zonas, 3 Habilidades) está calibrado a esta ventana de tiempo.
8. No existe un perfil de hardware específico proporcionado por la organización de la hackatón para los jueces; se asume como objetivo mínimo una laptop de gama media genérica con GPU integrada (sin tarjeta dedicada).

## Casos límite

1. Codi intenta activar o consultar un Mecanismo_Ambiental sin poseer la Habilidad requerida: el sistema debe informar la carencia sin bloquear ni romper el estado del juego.
2. El Jugador intenta absorber un Libro_de_Conocimiento cuya Habilidad ya fue obtenida: el sistema debe ignorar el evento sin duplicar efectos ni romper el estado de progreso.
3. Codi cae fuera de los límites navegables de la Isla o queda atascado en geometría: el sistema debe reposicionarlo en un punto seguro conocido.
4. El Jugador redimensiona o cambia el modo de pantalla del navegador durante el juego: la cámara y el renderizado deben adaptarse sin distorsión ni pérdida de control.
5. Un modelo GLB/GLTF no se carga correctamente (archivo faltante o corrupto): el juego debe informarlo en lugar de mostrar una pantalla en blanco o fallar sin explicación.
6. El Jugador activa un Mecanismo_Ambiental de tipo JavaScript mientras Codi está sobre una plataforma en movimiento y luego intenta saltar o moverse: el sistema debe mantener un comportamiento predecible y no expulsar a Codi de forma abrupta.
7. El Jugador llega a la zona del Desafio_Final sin poseer las tres Habilidades del MVP: el sistema debe impedir el inicio del desafío y explicar qué falta.
8. El navegador del Jugador no soporta WebGL o lo tiene deshabilitado: el juego debe comunicarlo claramente en vez de fallar silenciosamente.
9. El Jugador recarga la página en cualquier punto de la Sesion_de_Juego: el juego debe reiniciar de forma limpia y predecible desde el punto de inicio.

## Criterios de aceptación generales

1. THE MVP SHALL poder jugarse de principio a fin (desde el inicio hasta la resolución del Desafio_Final) sin errores que interrumpan la Sesion_de_Juego.
2. THE MVP SHALL permitir obtener las tres Habilidades (Python, JavaScript, SQL) mediante exploración libre antes de habilitar el Desafio_Final.
3. THE MVP SHALL representar visual y narrativamente a Codi de forma consistente con su identidad oficial en todas las pantallas del juego.
4. THE MVP SHALL ejecutarse en al menos un navegador de escritorio moderno con soporte WebGL sin requerir instalación adicional.
5. THE MVP SHALL estar libre de mecánicas de combate, daño o destrucción como medio de resolución de obstáculos.
6. THE MVP SHALL comunicar mediante texto o iconografía, en cada Mecanismo_Ambiental bloqueado, qué Habilidad se necesita para resolverlo.

## Dependencias

1. Biblioteca Three.js (u otra biblioteca de renderizado WebGL equivalente) como motor de renderizado 3D.
2. Cargadores de modelos GLTF/GLB (por ejemplo, GLTFLoader) compatibles con el motor de renderizado elegido.
3. Modelo 3D de Codi con animaciones básicas (idle, caminar, correr, saltar, absorber conocimiento) en formato GLB/GLTF, obtenido y adaptado a partir de assets genéricos/de librería (Mixamo, Sketchfab, Poly Pizza u otros) con licencias compatibles.
4. Assets 3D del entorno de la Isla en formato GLB/GLTF, adaptados a partir de assets genéricos/de librería con licencias compatibles, y un shader/material de corrupción para representar visualmente al Bug_Supremo (sin modelo 3D propio).
5. Herramientas de la hackatón: Kiro, Claude Sonnet, GLTF/GLB Viewer, Super GLB Viewer, Live Server, SnippetStudio y Vite, para desarrollo, inspección de assets y pruebas locales.
6. Un navegador de escritorio con soporte WebGL para ejecutar y demostrar el juego.

## Preguntas abiertas

Las siguientes preguntas deben resolverse antes de elaborar el documento de diseño técnico (design.md):

1. Los modelos GLB/GLTF de Codi, el entorno y los elementos del Bug_Supremo se obtendrán a partir de assets genéricos/de librería (Mixamo, Sketchfab, Poly Pizza) adaptados visualmente. Queda pendiente: ¿qué licencias específicas tienen los assets concretos que se seleccionen, y son compatibles con el uso y posible distribución del proyecto de la hackatón (por ejemplo, licencias CC0, CC-BY con atribución, o restricciones de uso comercial)?
2. ¿Se desea previsualizar o dejar documentada alguna convención de nombres/estructura de carpetas para los assets GLB/GLTF que facilite el trabajo del equipo multidisciplinario?
3. ¿El mensaje contextual y la narrativa del MVP se mostrarán únicamente en español, confirmando que la internacionalización queda fuera de alcance?
4. ¿Existe alguna restricción de tamaño total de assets (peso en MB) impuesta por la plataforma de entrega/hosting de la hackatón?
