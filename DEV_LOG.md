# Log de Desarrollo - Aplicación Web de Mandelbrot

Este documento registra el progreso, las decisiones clave y los hitos del desarrollo de la aplicación.

## 2025-07-30

### Hito: Implementación de Wrapper para Logs

**Estado:** Completado.

**Actividades Realizadas:**

1.  **Creación de `src/utils/logger.ts`:** Se creó un módulo centralizado para el manejo de logs (`log`, `error`) con un flag `DEBUG_MODE` para activar/desactivar la salida de la consola.
2.  **Reemplazo de `console.log`:** Todas las llamadas directas a `console.log` y `console.error` en `main.ts`, `App.vue`, `HomeView.vue`, `MandelbrotViewer.vue`, `useMandelbrotWorker.ts` y `mandelbrot.worker.ts` fueron reemplazadas por llamadas a las funciones `log` y `error` del nuevo módulo.

---

### Hito: Ajuste de Paleta de Colores (Azules Apagados y Naranjas Calmos)

**Estado:** Completado.

**Actividades Realizadas:**

1.  **Modificación de `getColor`:** Se actualizó la función `getColor` en `src/workers/mandelbrot.worker.ts` para implementar una nueva paleta de colores.
    *   Se utiliza un gradiente lineal entre un azul-gris apagado (`r: 70, g: 90, b: 110`) y un naranja calmo (`r: 255, g: 160, b: 80`).
    *   El negro se mantiene para los puntos dentro del conjunto de Mandelbrot.

---

### Hito: Corrección de Build en Producción y Errores de TypeScript

**Estado:** Completado.

**Actividades Realizadas:**

1.  **Problema de Renderizado en Producción:** Se identificó que la aplicación no renderizaba el fractal en producción (se quedaba en "Hello Vue!") debido a un manejo incorrecto del Web Worker por parte de Vite.
2.  **Solución del Web Worker:**
    *   Se movió `public/mandelbrot.worker.js` a `src/workers/mandelbrot.worker.ts`.
    *   Se actualizó `src/composables/useMandelbrotWorker.ts` para instanciar el worker usando `new Worker(new URL('../workers/mandelbrot.worker.ts', import.meta.url), { type: 'module' })`.
    *   Se eliminó el archivo antiguo de `public/`.
3.  **Errores de TypeScript en Worker:** Tras el movimiento, TypeScript detectó errores de tipo implícitos en `src/workers/mandelbrot.worker.ts`.
4.  **Corrección de Tipos:** Se añadieron anotaciones de tipo explícitas a los parámetros de las funciones `calculateMandelbrot`, `getColor` y `hslToRgb` en el worker.
5.  **Recompilación:** Se generó una nueva versión de producción con todos los cambios aplicados.

---

### Hito: Correcciones Finales y Mejora de Paleta de Colores

**Estado:** Completado.

**Actividades Realizadas:**

1.  **Corrección de Renderizado Inicial:** Se solucionó el problema de la pantalla en blanco al cargar la página sin interacción. Se modificó `MandelbrotViewer.vue` para usar `await router.isReady()` y asegurar que el renderizado inicial se dispare correctamente después de que Vue Router haya procesado la URL.
2.  **Corrección de Parseo de URL:** Se corrigió el error en `src/stores/view.ts` donde `URLSearchParams` no procesaba correctamente el hash de la URL debido a una barra (`/`) inicial. Se ajustó `hash.substring(1)` a `hash.substring(2)`.
3.  **Mejora de Paleta de Colores:** Se modificó la función `getColor` en `public/mandelbrot.worker.js` para implementar una paleta de colores más específica:
    *   Negro para los puntos dentro del conjunto.
    *   Gradiente de azul oscuro pastel a azul/gris claro para los puntos fuera del conjunto, utilizando interpolación lineal y una escala logarítmica para el factor de interpolación.

---

### Hito: Corrección de Carga de Estado desde URL

**Estado:** Completado.

**Actividades Realizadas:**

1.  **Identificación del Problema:** Se detectó que el estado de la vista no se cargaba desde la URL al acceder directamente a un enlace con hash. El componente se montaba antes de que Vue Router procesara el hash.
2.  **Implementación de la Solución:** Se modificó `MandelbrotViewer.vue` para usar un `watch` en `route.hash` con la opción `{ immediate: true }`. Esto asegura que el estado se lea tanto en la carga inicial como en cambios posteriores (ej. botones de historial del navegador).
3.  **Recompilación:** Se generó una nueva versión de producción con la lógica corregida.

---

### Hito: Corrección de Despliegue y Finalización de la Fase 3

**Estado:** Completado.

**Actividades Realizadas:**

1.  **Compilación para Producción.**
2.  **Corrección de Rutas de Archivos (`vite.config.ts`).**
3.  **Recompilación.**

**Resultado Final:** La aplicación ahora es completamente funcional, cumple con todos los requisitos iniciales y está correctamente configurada para ser desplegada en cualquier ruta de un servidor web.

---

### Hito: Finalización de la Fase 2 - Interacción Fluida y Sincronización de Estado

**Estado:** Completado.

---

### Hito: Finalización de la Fase 1 - Núcleo Lógico y Web Worker

**Estado:** Completado.

---

### Hito: Inicio de la Fase 2 - Plan de Interacción

**Estado:** Completado.

---

### Hito: Finalización de la Fase 0 - Cimentación del Proyecto

**Estado:** Completado.

---

### Hito: Inicio del Proyecto y Definición del Plan

**Estado:** Completado.

