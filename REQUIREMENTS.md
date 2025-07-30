# Requisitos de la Aplicación Web de Mandelbrot

Este documento describe los requisitos funcionales y no funcionales para la aplicación web interactiva de visualización del conjunto de Mandelbrot.

## Requisitos Funcionales

1.  **Visualización del Fractal:** La aplicación debe renderizar una representación visual del conjunto de Mandelbrot en un elemento `<canvas>` de HTML.
2.  **Navegación Interactiva:**
    *   **Zoom:** Los usuarios deben poder hacer zoom en cualquier parte del fractal.
        *   En dispositivos táctiles, el zoom se controlará con el gesto de "pellizcar" (pinch-to-zoom).
        *   En dispositivos de escritorio, el zoom se controlará con la rueda del mouse.
    *   **Desplazamiento (Pan):** Los usuarios deben poder desplazarse por el fractal.
        *   En dispositivos táctiles, el desplazamiento se controlará arrastrando con un dedo.
        *   En dispositivos de escritorio, el desplazamiento se controlará haciendo clic y arrastrando el mouse.
3.  **URL Persistente:** El estado actual de la visualización (coordenadas del centro y nivel de zoom) debe reflejarse en el hash de la URL.
    *   Ejemplo de formato: `/#x=<coordenada_x>&y=<coordenada_y>&z=<nivel_zoom>`
    *   Al cargar una URL con estos parámetros, la aplicación debe mostrar directamente la vista correspondiente.
    *   Esto permite guardar y compartir vistas específicas del fractal.

## Requisitos No Funcionales

1.  **Plataforma Tecnológica:**
    *   **Framework:** Vue 3.
    *   **Lenguaje:** TypeScript.
    *   **Gestión de Estado:** Pinia.
    *   **Enrutamiento:** Vue Router.
    *   **Pruebas:** Vitest.
    *   **Calidad de Código:** ESLint y Prettier.
2.  **Diseño Responsivo (Mobile-First):** La interfaz de usuario debe estar optimizada para dispositivos móviles primero, y luego adaptarse a pantallas de escritorio. Debe ser usable y estéticamente agradable en ambos entornos.
3.  **Alto Rendimiento (Renderizado Eficiente):**
    *   La interacción del usuario (zoom, pan) debe ser fluida y no debe verse bloqueada por el cálculo del fractal.
    *   Se debe implementar una estrategia de renderizado similar a la de Google Maps:
        *   Durante un gesto, se manipula una imagen ya renderizada (mediante transformaciones CSS/canvas) para dar una respuesta visual inmediata, aunque sea a menor resolución.
        *   El cálculo de alta fidelidad de la nueva vista se realiza en un hilo secundario (Web Worker) y se activa solo al finalizar el gesto.
        *   La nueva vista de alta calidad reemplaza a la vista transformada una vez que el cálculo ha finalizado.
4.  **Pruebas Automatizadas:** El proyecto debe incluir un conjunto de pruebas unitarias (con Vitest) para validar la lógica principal, especialmente el cálculo del conjunto de Mandelbrot. Estas pruebas servirán para la verificación continua y la prevención de regresiones.
5.  **Registro de Desarrollo:** Se debe mantener un archivo `DEV_LOG.md` que documente el proceso de desarrollo, las decisiones de arquitectura y el estado del proyecto en cada hito importante.
6.  **Documentación de Requisitos:** Este mismo archivo (`REQUIREMENTS.md`) debe mantenerse actualizado si los requisitos cambian.
