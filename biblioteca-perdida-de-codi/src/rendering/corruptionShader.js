import * as THREE from 'three';

/**
 * corruptionShader - Efecto visual de corrupción del Bug_Supremo
 * (Requisitos de aceptación 10.3; Requisitos funcionales 11 (uso de un
 * shader/material de corrupción, sin modelo 3D propio); filosofía no
 * agresiva del Sistema_de_Habilidades, Requisito 11.4).
 *
 * DECISIÓN DE DISEÑO (alternativa descartada): `design.md` deja abiertas dos
 * técnicas posibles para este efecto: (a) reemplazar el material de la malla
 * objetivo por un `THREE.ShaderMaterial` completo y propio, o (b) inyectar
 * código GLSL en el material PBR ya existente de la malla mediante
 * `material.onBeforeCompile`. Se elige la opción (b) y se descarta la (a)
 * porque las mallas del entorno son cargadas por `AssetLoader`
 * (`GLTFLoader`) con sus propios materiales (`MeshStandardMaterial` u otros)
 * y texturas ya configuradas (mapas de color, normal, rugosidad, etc.).
 * Sustituir ese material por un `ShaderMaterial` propio obligaría a
 * reimplementar manualmente la iluminación PBR (luces, sombras, IBL) y a
 * volver a cablear cada textura del material original, lo cual excede el
 * alcance y el tiempo disponible para el MVP de la hackatón sin aportar
 * ningún beneficio visual adicional. `onBeforeCompile` permite en cambio
 * inyectar la distorsión de vértices y el tinte de corrupción directamente
 * sobre los shaders que Three.js ya genera para el material existente,
 * preservando toda su apariencia PBR original.
 *
 * El efecto nunca se aplica sobre una malla propia del Bug_Supremo (este no
 * tiene modelo 3D ni animaciones propias, Requisito 10.3): siempre se aplica
 * sobre materiales de mallas del entorno/geometría ya cargadas por
 * `AssetLoader`.
 */

/**
 * Aproximación de ruido simple basada en senos/cosenos, usada tanto para
 * distorsionar vértices como (indirectamente, vía el mismo patrón) para dar
 * variación al tinte de corrupción.
 *
 * DECISIÓN DE DISEÑO: se descarta implementar Simplex/Perlin noise completo
 * (p.ej. una función `snoise` de varias decenas de líneas de GLSL) porque el
 * MVP solo necesita una distorsión visualmente creíble de "glitch/corrupción
 * del conocimiento", no una superficie de ruido de alta fidelidad; una
 * combinación de senos/cosenos con frecuencias distintas por eje es
 * suficiente y mucho más simple de mantener y depurar dentro del tiempo de
 * la hackatón.
 *
 * @type {string} Fragmento GLSL que declara `float ruidoCorrupcion(vec3 p, float t)`.
 */
const GLSL_RUIDO_CORRUPCION = `
  float ruidoCorrupcion(vec3 p, float t) {
    return sin(p.x * 6.0 + t * 1.7) * cos(p.y * 8.0 - t * 1.3) * sin(p.z * 5.0 + t * 2.1);
  }
`;

/**
 * Aplica (o actualiza) el efecto de corrupción del Bug_Supremo sobre un
 * material ya existente, mediante `onBeforeCompile` (ver DECISIÓN DE DISEÑO
 * arriba). Distorsiona la posición de cada vértice con una aproximación de
 * ruido dependiente del tiempo (`uTime`) y de la intensidad (`uIntensidad`),
 * y en el fragment shader desatura el color final y lo tiñe hacia un tono
 * violáceo/"digital" en proporción a `uIntensidad` — deliberadamente sin
 * rojo puro ni connotaciones de sangre/violencia, coherente con la
 * filosofía de que ninguna Habilidad ni el propio Bug_Supremo se
 * representan mediante acciones agresivas o destructivas (Requisito 11.4).
 *
 * El material recibido se modifica in-place (se añaden uniforms y se
 * marca `needsUpdate = true` para forzar la recompilación de sus shaders);
 * no se crea un material nuevo, precisamente para preservar sus texturas y
 * su respuesta a la iluminación PBR original.
 *
 * @param {THREE.Material} material - Material existente de una malla del
 *   entorno (típicamente `THREE.MeshStandardMaterial`, o cualquier material
 *   que exponga `onBeforeCompile`, parte de la API base de `THREE.Material`).
 *   Nunca debe ser el material de una malla propia del Bug_Supremo (este no
 *   tiene malla propia).
 * @param {number} [intensidad=1] - Intensidad inicial del efecto, en `[0, 1]`
 *   (0 = sin efecto visible, 1 = corrupción máxima). Se expone luego como
 *   `uniforms.uIntensidad.value`, actualizable en caliente.
 * @param {Object} [opciones] - Ajustes opcionales del efecto.
 * @param {number} [opciones.amplitud=0.08] - Amplitud máxima (en unidades de
 *   mundo) de la distorsión de vértices.
 * @param {number} [opciones.colorCorrupcion] - Color (hex, p.ej. `0x2a1240`)
 *   hacia el que se tiñe el fragmento a máxima intensidad. Por defecto un
 *   violeta oscuro ("corrupción digital"), evitando rojo/sangre.
 * @returns {{ uniforms: { uTime: {value:number}, uIntensidad: {value:number} } }}
 *   Referencia a los uniforms creados, para que quien orquesta el render
 *   (p.ej. `RenderEngine`) pueda actualizar `uTime` en cada frame y/o
 *   `uIntensidad` según el progreso del Desafio_Final.
 */
export function aplicarShaderCorrupcion(material, intensidad = 1, opciones = {}) {
  if (!material || typeof material.onBeforeCompile !== 'function') {
    // eslint-disable-next-line no-console
    console.warn(
      'aplicarShaderCorrupcion: se esperaba un THREE.Material válido con onBeforeCompile; no-op.'
    );
    return { uniforms: { uTime: { value: 0 }, uIntensidad: { value: 0 } } };
  }

  const amplitud = opciones.amplitud ?? 0.08;
  const colorCorrupcion = new THREE.Color(opciones.colorCorrupcion ?? 0x2a1240);

  const uniforms = {
    uTime: { value: 0 },
    uIntensidad: { value: intensidad },
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uIntensidad = uniforms.uIntensidad;
    shader.uniforms.uColorCorrupcion = { value: colorCorrupcion };
    shader.uniforms.uAmplitud = { value: amplitud };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uIntensidad;
        uniform float uAmplitud;
        ${GLSL_RUIDO_CORRUPCION}`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ruido = ruidoCorrupcion(position, uTime);
        transformed += normal * ruido * uAmplitud * uIntensidad;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uIntensidad;
        uniform vec3 uColorCorrupcion;`
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float gris = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 desaturado = mix(gl_FragColor.rgb, vec3(gris), uIntensidad);
        gl_FragColor.rgb = mix(desaturado, uColorCorrupcion, uIntensidad * 0.5);`
      );
  };

  material.needsUpdate = true;

  return { uniforms };
}
