# Mandelbrowser

![Mandelbrowser Screenshot](docs/screenshot.png) <!-- Placeholder for a future screenshot -->

Una aplicación web interactiva para explorar el fascinante conjunto de Mandelbrot, diseñada con una experiencia de usuario fluida en mente, especialmente para dispositivos móviles.

## Características

*   **Visualización Interactiva:** Explora el conjunto de Mandelbrot con paneo y zoom.
*   **Optimizado para Móviles:** Soporte para gestos táctiles (pinch-to-zoom, arrastrar) y diseño responsivo.
*   **Rendimiento Fluido:** Implementa una estrategia de renderizado progresivo similar a Google Maps, utilizando Web Workers para cálculos intensivos en segundo plano, asegurando que la interfaz de usuario permanezca responsiva.
*   **URL Persistente:** El estado actual de la vista (posición y zoom) se refleja en la URL, permitiendo compartir y guardar vistas específicas del fractal.
*   **Paleta de Colores Personalizada:** Un esquema de colores de azules apagados y naranjas calmos para una estética única.

## Tecnologías Utilizadas

*   **Frontend Framework:** Vue 3
*   **Lenguaje:** TypeScript
*   **Gestión de Estado:** Pinia
*   **Enrutamiento:** Vue Router
*   **Bundler:** Vite
*   **Pruebas Unitarias:** Vitest
*   **Calidad de Código:** ESLint y Prettier

## Configuración del Proyecto

Para configurar y ejecutar el proyecto localmente, sigue estos pasos:

1.  **Clonar el repositorio:**
    ```bash
    git clone <URL_DEL_REPOSITORIO>
    cd mandelbrowser
    ```
2.  **Instalar dependencias:**
    ```bash
    npm install
    ```

## Comandos Disponibles

### Compilar y Recargar en Caliente para Desarrollo

```bash
npm run dev
```

Esto iniciará el servidor de desarrollo en `http://localhost:5173` (o un puerto similar).

### Compilar para Producción

```bash
npm run build
```

Este comando compilará la aplicación para producción en el directorio `dist/`. Los archivos generados están optimizados y listos para ser desplegados en cualquier servidor web estático. La configuración de Vite (`vite.config.ts`) asegura que la aplicación funcione correctamente incluso si se despliega en un subdirectorio.

### Ejecutar Tests Unitarios

```bash
npm run test:unit
```

### Lint y Formatear Código

```bash
npm run lint
npm run format
```

## Registro de Desarrollo

Para un historial detallado de las decisiones de desarrollo, correcciones y características implementadas, consulta el archivo `DEV_LOG.md`.

## Requisitos

Los requisitos detallados del proyecto se encuentran en el archivo `REQUIREMENTS.md`.