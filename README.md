# 🐊 La Biblioteca Perdida de Codi

![AWS](https://img.shields.io/badge/AWS-Hackathon-FF9900?style=flat-square&logo=amazonaws&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-3D-black?style=flat-square&logo=three.js)
![Tests](https://img.shields.io/badge/Tests-165%2F165-brightgreen?style=flat-square)

Videojuego 3D de plataformas y exploración construido con **Three.js** y **Kiro**, para la Hackathon **AWS + Código Facilito**. El jugador controla a **Codi**, quien debe recorrer una isla flotante, recuperar tres libros de conocimiento (**Python, JavaScript, SQL**) y cruzar el Portal de Restauración para salvar la Biblioteca.

🔗 **Demo en vivo:** [Netlify](#) — *(reemplazar con tu enlace)*
📦 **Repositorio:** [AngelTroncoso/kiro_codigofacilito](https://github.com/AngelTroncoso/kiro_codigofacilito)

---

## ✨ Características

- **Motor Zero-Asset:** texturas AWS, palmeras, libros 3D y audio se generan 100% por código (Canvas API + Web Audio API), sin archivos externos → build < 1 MB.
- **Circuito guiado en línea recta** con salto para recolectar libros flotantes.
- **Narrativa:** diálogos de gratitud al absorber cada libro; portal final con confeti y fanfarria.
- **Jury Demo Mode:** atajos de teclado para presentación en vivo.

## 🕹️ Controles

| Tecla | Acción |
|---|---|
| `W A S D` / Flechas | Mover a Codi |
| `Espacio` | Saltar |
| `E` | Absorber libro / interactuar |
| Mouse | Rotar cámara |
| `🎯` (HUD) | Centrar cámara detrás de Codi |

## 🔑 Atajos para el jurado

| Tecla | Acción |
|---|---|
| `K` | Victoria instantánea |
| `R` | Reiniciar demo |
| `M` | Velocidad x2 |

## 🏗️ Arquitectura

```mermaid
graph TD
    PS[ProgressStore.js<br/>Estado] --> UI[UISystem.js<br/>Interfaz + Audio]
    PS --> RE[RenderEngine.js<br/>Motor 3D]
    IP[Input/CameraSystem] --> RE
    AL[AssetLoader.js<br/>Texturas/Libros] --> RE
```

## 🔄 Core Loop

```mermaid
flowchart LR
    A[Terminal Inicio] --> B[Explorar]
    B --> C[Saltar y absorber libro]
    C --> D{¿3 libros?}
    D -- No --> B
    D -- Sí --> E[Portal se activa]
    E --> F[Victoria + Confeti]
    F -->|Volver a jugar| B
```

## ☁️ AWS y Kiro

- Desarrollado íntegramente con **Kiro IDE** (prompts de especificación técnica).
- Identidad visual de AWS integrada como texturas emisivas en el escenario.
- Preparado para desplegar en **AWS Amplify Hosting**; actualmente en **Netlify**.

## 🚀 Instalación local

```bash
git clone https://github.com/AngelTroncoso/kiro_codigofacilito.git
cd biblioteca-perdida-de-codi
npm install
npm run dev      # http://localhost:5173
npm run build    # build de producción
npm test         # 165 tests
```

## 📁 Stack

Three.js · JavaScript ES6 · Vite · Vitest · Web Audio API
