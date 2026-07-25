# Implementation Plan: Codi y la Biblioteca Perdida del Código

## Overview

Este plan traduce el diseño técnico (Three.js + Vite, colisión manual, `ProgressStore` en memoria, arquitectura preparada para WebXR) en una secuencia incremental de tareas de código, calibrada para las 24-48 horas efectivas de la hackatón. El orden de construcción es: (1) núcleo del motor y estado de progreso, (2) entrada/movimiento/cámara, (3) renderizado y carga de assets, (4) modelo de mundo, (5) absorción y habilidades, (6) interfaz, (7) contenido concreto del mundo (Zonas/Mecanismos/Libros), (8) desafío final contra el Bug_Supremo, (9) integración final y manejo de errores. Cada tarea de código pura (colisión, gating, progreso, cámara, mensajes) se acompaña de su prueba basada en propiedades correspondiente del diseño (15 en total), y cada componente con comportamiento fijo se acompaña de pruebas unitarias puntuales.

## Tasks

- [x] 1. Configurar el proyecto base
  - [x] 1.1 Inicializar proyecto Vite + Three.js + Vitest + fast-check
    - Crear `package.json`, `vite.config.js`, estructura de carpetas `src/{core,input,movement,camera,absorption,abilities,ui,rendering,assets,world,config}`, `tests/{unit,property}`, `public/assets/{models,textures}`
    - Configurar Vitest como test runner e instalar `fast-check`
    - _Requirements: Restricciones técnicas 2, 4, 7, 8_

- [x] 2. Implementar el núcleo del bucle de juego y el estado de progreso
  - [x] 2.1 Implementar `ProgressStore` (habilidades obtenidas, mecanismos resueltos, desafío completado, suscripción a cambios)
    - _Requirements: 9.1, 9.2, Requisitos funcionales 4_

  - [x]* 2.2 Escribir property test para `ProgressStore`
    - **Property 9: Estado inicial de una nueva sesión**
    - **Validates: Requirements 9.3**

  - [x]* 2.3 Escribir property test para `ProgressStore`
    - **Property 8: Monotonía del progreso durante la sesión**
    - **Validates: Requirements 6.4, 7.3, 9.1, 9.2**

  - [x]* 2.4 Escribir property test para `ProgressStore`
    - **Property 15: Consistencia de lectura del ProgressStore**
    - **Validates: Requisitos funcionales 4**

  - [x] 2.5 Implementar `GameLoop` (orquestación de sistemas vía `renderer.setAnimationLoop`, manejo de excepciones de nivel superior)
    - _Requirements: Requisitos funcionales 3_

  - [x]* 2.6 Escribir unit tests para `GameLoop`
    - Verificar que una excepción no controlada en un frame detiene el bucle y notifica un mensaje de error genérico en vez de congelar la pantalla
    - _Requirements: Requisitos funcionales 3_

- [x] 3. Implementar la capa de entrada abstracta
  - [x] 3.1 Implementar interfaz `InputProvider` y typedef `InputState`
    - _Requirements: Arquitectura escalable a WebXR 1_

  - [x] 3.2 Implementar `KeyboardMouseInputProvider` (teclado WASD/flechas, mouse, flags edge-triggered de salto/interacción)
    - _Requirements: 1.1, 1.2, 2.2, Restricciones técnicas 10_

  - [x]* 3.3 Escribir unit tests para `KeyboardMouseInputProvider`
    - Verificar normalización del vector de movimiento y comportamiento edge-triggered de la tecla de salto
    - _Requirements: 1.2_

- [x] 4. Implementar movimiento y colisión de Codi
  - [x] 4.1 Implementar funciones puras de colisión en `movement/collision.js` (intersección AABB/esfera, raycast vertical de suelo, resolución de deslizamiento)
    - _Requirements: 1.5, 1.4_

  - [x]* 4.2 Escribir property test para `movement/collision.js`
    - **Property 5: Colisión impide atravesar geometría sólida**
    - **Validates: Requirements 1.5**

  - [x]* 4.3 Escribir property test para `movement/collision.js`
    - **Property 6: Reposicionamiento seguro fuera de límites**
    - **Validates: Requirements 1.4**

  - [x] 4.4 Implementar `MovementSystem` (traducción de `InputState` a nueva pose, gating espacial de Zona_Bloqueada, selección de `animState`, adherencia a plataformas)
    - _Requirements: 1.1, 1.2, 1.3, 7.2, Requisitos funcionales 5_

  - [x]* 4.5 Escribir property test para `MovementSystem`
    - **Property 11: Adherencia a plataformas móviles**
    - **Validates: Requirements 5.4**

  - [x]* 4.6 Escribir unit tests para `MovementSystem`
    - Verificar disparo de animación de salto (1.2) y posición de inicio fija en la primera Zona (Requisitos funcionales 5)
    - _Requirements: 1.2, Requisitos funcionales 5_

- [x] 5. Checkpoint - Asegurar que todas las pruebas de núcleo, entrada y movimiento pasen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implementar el sistema de cámara en tercera persona
  - [x] 6.1 Implementar `CameraSystem` (clamp de yaw/pitch, órbita alrededor de Codi, raycast anti-obstrucción, actualización de aspect ratio en resize)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x]* 6.2 Escribir property test para `CameraSystem`
    - **Property 7: Rotación de cámara y aspect ratio**
    - **Validates: Requirements 2.2, 2.4**

  - [x]* 6.3 Escribir property test para `CameraSystem`
    - **Property 10: Cámara evita obstrucción sin atravesar geometría**
    - **Validates: Requirements 2.3**

- [x] 7. Implementar el motor de renderizado y la carga de assets
  - [x] 7.1 Implementar `RenderEngine` (escena/cámara/renderer de Three.js, `setAnimationLoop`, listener de resize, detección de soporte WebGL)
    - _Requirements: Requisitos funcionales 3, Compatibilidad de navegador y WebGL 1, 2_

  - [x] 7.2 Implementar `AssetLoader` (`GLTFLoader` + `DRACOLoader` opcional, normalización de escala/ejes por asset, manejo de error por asset individual sin abortar el resto)
    - _Requirements: Requisitos funcionales 1, Requisitos funcionales 2_

  - [x]* 7.3 Escribir unit tests para `AssetLoader`
    - Verificar que el fallo de un asset no crítico no aborta la carga de los demás, y que el fallo del modelo de Codi produce un error bloqueante
    - _Requirements: Requisitos funcionales 2_

  - [x] 7.4 Implementar `corruptionShader.js` (ShaderMaterial/`onBeforeCompile` de corrupción aplicado sobre geometría del entorno)
    - _Requirements: 10.3_

- [x] 8. Implementar el modelo de mundo y su validación de esquema
  - [x] 8.1 Implementar tipos de `WorldModel` (Habilidad, MecanismoAmbiental, Zona, LibroConocimiento) y el validador de esquema de carga
    - _Requirements: Requisitos funcionales 6_

  - [x]* 8.2 Escribir property test para el validador de `WorldModel`
    - **Property 14: Validación de esquema de Mecanismo_Ambiental**
    - **Validates: Requisitos funcionales 6**

  - [x] 8.3 Implementar el catálogo fijo de 3 Habilidades (python, javascript, sql) y la estructura inicial declarativa de `world/zones.data.js`
    - _Requirements: Alcance del MVP 5_

- [x] 9. Checkpoint - Asegurar que todas las pruebas de cámara, renderizado y modelo de mundo pasen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implementar el sistema de absorción de conocimiento
  - [x] 10.1 Implementar `AbsorptionSystem.revisarContacto` (detección de contacto, otorgamiento de habilidad, marcado de libro absorbido)
    - _Requirements: 3.1, 3.4_

  - [x]* 10.2 Escribir property test para `AbsorptionSystem`
    - **Property 1: Absorción otorga habilidad y remueve el libro**
    - **Validates: Requirements 3.1, 3.4**

  - [x]* 10.3 Escribir property test para `AbsorptionSystem`
    - **Property 2: Absorción es idempotente**
    - **Validates: Requirements 3.5**

  - [x]* 10.4 Escribir unit test para la animación/efecto visual de absorción
    - Verificar que la animación de absorción se reproduce antes de devolver el control al Jugador
    - _Requirements: 3.2_

- [x] 11. Implementar el sistema de habilidades
  - [x] 11.1 Implementar gating genérico `AbilitySystem.puedeInteractuar` / `puedeAcceder`
    - _Requirements: 4.1, 4.3, 5.1, 5.3, 6.1, 6.3, 7.1, 7.2, 10.1_

  - [x]* 11.2 Escribir property test para `AbilitySystem`
    - **Property 3: Gating por conjunto de habilidades requeridas**
    - **Validates: Requirements 4.1, 4.3, 5.1, 5.3, 6.1, 6.3, 7.1, 7.2, 10.1**

  - [x] 11.3 Implementar `AbilitySystem.interactuar` (máquina de estados bloqueado→resuelto) y `abilities/mechanismDefinitions.js` para los seis tipos de mecanismo
    - _Requirements: 4.2, 4.4, 5.2, 5.4, 6.2, 6.4_

  - [x]* 11.4 Escribir property test para `AbilitySystem.interactuar`
    - **Property 4: Activación exitosa resuelve el mecanismo y es idempotente**
    - **Validates: Requirements 4.2, 4.4, 5.2, 6.2**

  - [x] 11.5 Implementar los efectos visuales de resolución por tipo de mecanismo (extender puente, iniciar recorrido de plataforma, revelar geometría oculta) conectados al `RenderEngine`, representados siempre como acciones creativas, nunca agresivas
    - _Requirements: 4.2, 5.2, 6.2, 11.4_

- [x] 12. Implementar el sistema de interfaz
  - [x] 12.1 Implementar `ui/messages.js` (`generarMensaje` puro, tono optimista y curioso)
    - _Requirements: 3.3, 8.2, 11.3_

  - [x]* 12.2 Escribir property test para `messages.js`
    - **Property 13: Generación de mensajes contextuales no vacíos y relevantes**
    - **Validates: Requirements 3.3, 8.2**

  - [x] 12.3 Implementar `UISystem` (overlay HTML/CSS: indicador permanente de habilidades, mensajes contextuales con expiración, mensajes de error de carga/WebGL)
    - _Requirements: 8.1, 8.3, 8.4, Requisitos funcionales 2, Compatibilidad de navegador y WebGL 2, Accesibilidad 1, 2_

  - [x]* 12.4 Escribir property test para `UISystem`
    - **Property 12: Consistencia del indicador de habilidades**
    - **Validates: Requirements 8.1**

  - [x]* 12.5 Escribir unit tests para `UISystem`
    - Verificar el ocultamiento automático de mensajes contextuales tras un periodo breve o tras una nueva acción relevante
    - _Requirements: 8.3_

- [x] 13. Checkpoint - Asegurar que todas las pruebas de absorción, habilidades e interfaz pasen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Construir el contenido concreto del mundo: Zonas, Mecanismos y Libros
  - [x] 14.1 Definir 3-4 Zonas conectadas con sus límites (AABB) y `habilidadesRequeridas` en `zones.data.js`
    - _Requirements: Alcance del MVP 1, 7.2_

  - [x] 14.2 Definir los Mecanismos_Ambientales de tipo Python (puente, solución automatizada), reutilizados en distintas Zonas
    - _Requirements: 4.1, 4.2, 4.4, Alcance del MVP 6_

  - [x] 14.3 Definir los Mecanismos_Ambientales de tipo JavaScript (dispositivo, plataforma móvil)
    - _Requirements: 5.1, 5.2, 5.4, Alcance del MVP 6_

  - [x] 14.4 Definir los Mecanismos_Ambientales de tipo SQL (camino oculto, fuente de información)
    - _Requirements: 6.1, 6.2, 6.4, Alcance del MVP 6_

  - [x] 14.5 Definir los tres Libros_de_Conocimiento (python, javascript, sql) y su posicionamiento en sus Zonas
    - _Requirements: Alcance del MVP 4, 5_

  - [x] 14.6 Integrar el manifiesto de assets GLB/GLTF (Codi, entorno, mecanismos) en `AssetLoader`
    - _Requirements: Requisitos funcionales 1, Restricciones técnicas 3, 9_

- [x] 15. Implementar el Desafío Final contra el Bug Supremo
  - [x] 15.1 Definir la Zona final con gating de las tres Habilidades y aplicar `corruptionShader` sobre la geometría del entorno existente
    - _Requirements: 10.1, 10.3_

  - [x] 15.2 Implementar la secuencia del Desafío_Final que requiera combinar al menos dos Habilidades, comunicada como un problema a resolver y no como combate
    - _Requirements: 10.2, 10.5_

  - [x]* 15.3 Escribir unit test para el Desafío_Final
    - Verificar que la secuencia diseñada usa al menos dos Habilidades distintas y que resolverla marca el juego como completado
    - _Requirements: 10.2, 10.4_

  - [x] 15.4 Conectar la resolución del Desafío_Final con `ProgressStore.marcarDesafioCompletado`
    - _Requirements: 10.4_

- [x] 16. Integración final y manejo de errores globales
  - [x] 16.1 Implementar `main.js`: detección de WebGL, carga de assets con progreso, y arranque del `GameLoop` con todos los sistemas conectados (entrada, movimiento, cámara, absorción, habilidades, progreso, renderizado, interfaz)
    - _Requirements: Requisitos funcionales 1, 3, 5, Compatibilidad de navegador y WebGL 2, Rendimiento 2_

  - [x] 16.2 Conectar en `UISystem` los mensajes de error de WebGL no soportado y de fallo de carga de assets
    - _Requirements: Requisitos funcionales 2, Compatibilidad de navegador y WebGL 2, Rendimiento 2_

  - [x]* 16.3 Escribir test de integración de `AssetLoader`
    - Verificar que un manifiesto con un asset inválido produce el mensaje de error esperado sin abortar la carga de los demás assets
    - _Requirements: Requisitos funcionales 2_

  - [x]* 16.4 Escribir test de integración smoke de arranque de la aplicación
    - Verificar que la app arranca, detecta WebGL y renderiza el primer frame sin excepciones
    - _Requirements: Requisitos funcionales 3, Compatibilidad de navegador y WebGL 1_

- [x] 17. Checkpoint final - Asegurar que todas las pruebas pasen y el recorrido completo (obtener las 3 Habilidades → resolver el Desafío_Final) sea coherente
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales (pruebas) y pueden omitirse para un MVP más rápido, aunque se recomienda mantenerlas dado que cubren toda la lógica pura del juego.
- Las 15 Correctness Properties del diseño están cubiertas, cada una en su propia sub-tarea, ubicada junto a la implementación del componente que valida.
- No se incluyen tareas de gamepad, multijugador, persistencia entre sesiones, ni habilidades fuera de alcance (C++, Java, Rust, Go, IA), conforme al Alcance del MVP.
- El Bug_Supremo se implementa exclusivamente como shader/efecto visual sobre geometría del entorno existente (tareas 7.4, 15.1); en ningún momento se modela como personaje independiente.
- Los checkpoints (tareas 5, 9, 13 y 17) son puntos de validación incremental; no implican nueva lógica de producto.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "7.1", "7.2", "8.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "3.2", "4.2", "4.3", "7.3", "7.4", "8.2", "8.3"] },
    { "id": 3, "tasks": ["2.6", "3.3", "4.4", "6.1", "12.1"] },
    { "id": 4, "tasks": ["4.5", "4.6", "6.2", "6.3", "12.2"] },
    { "id": 5, "tasks": ["10.1", "11.1", "12.3"] },
    { "id": 6, "tasks": ["10.2", "10.3", "10.4", "11.2", "11.3", "12.4", "12.5"] },
    { "id": 7, "tasks": ["11.4", "11.5"] },
    { "id": 8, "tasks": ["14.1", "14.6"] },
    { "id": 9, "tasks": ["14.2"] },
    { "id": 10, "tasks": ["14.3"] },
    { "id": 11, "tasks": ["14.4"] },
    { "id": 12, "tasks": ["14.5"] },
    { "id": 13, "tasks": ["15.1"] },
    { "id": 14, "tasks": ["15.2"] },
    { "id": 15, "tasks": ["15.3", "15.4"] },
    { "id": 16, "tasks": ["16.1"] },
    { "id": 17, "tasks": ["16.2"] },
    { "id": 18, "tasks": ["16.3", "16.4"] }
  ]
}
```
