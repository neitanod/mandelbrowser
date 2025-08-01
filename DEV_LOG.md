# Log de Desarrollo - Aplicación Web de Mandelbrot

Este documento registra el progreso, las decisiones clave y los hitos del desarrollo de la aplicación.

## 2025-07-31

### Hito: Refactorización del Manejo de Gestos y Renderizado

**Estado:** Completado.

**Actividades Realizadas:**

1.  **Identificación del Problema:** Se detectó que encadenar gestos rápidamente (ej. hacer un zoom e inmediatamente un paneo) podía llevar a un estado inconsistente, donde el renderizado final no se correspondía con la última acción del usuario. Los intentos de solucionar esto con lógica de "interrupción de gestos" resultaron ser demasiado complejos y propensos a errores.
2.  **Simplificación de la Arquitectura:** Se realizó una refactorización profunda para simplificar el flujo de datos y eliminar las condiciones de carrera.
    *   **Fuente Única de Verdad:** Se estableció que el `watch` de Vue sobre el estado (`centerX`, `centerY`, `zoom`) es la **única y exclusiva** fuente de verdad para disparar un nuevo renderizado.
    *   **Eliminación de Lógica Compleja:** Se eliminaron todas las llamadas explícitas a `requestRender()` desde los manejadores de eventos y se deshizo de la bandera `isInteracting` y la lógica de `commitInterruptedGesture`.
3.  **Nuevo Flujo de Datos:**
    *   Los manejadores de eventos (`handleMouseUp`, `handleTouchEnd`) ahora solo tienen una responsabilidad: calcular el estado final del gesto y actualizarlo en la tienda Pinia con `setView()`.
    *   El cambio de estado es detectado por el `watch`, que incondicionalmente solicita un nuevo render.
    *   El sistema de `renderId` existente en el worker se encarga de forma natural de descartar los renders obsoletos si el usuario encadena gestos más rápido de lo que el worker puede renderizar.
4.  **Resultado:** La aplicación ahora es extremadamente robusta y fluida. Se pueden encadenar múltiples gestos rápidos e interrumpir renders en curso sin que la interfaz se bloquee o pierda el estado. La lógica es más simple, más predecible y se alinea mejor con los patrones de diseño de Vue.

---

### Hito: Corrección Avanzada del Gesto de Zoom Táctil

**Estado:** Completado.

**Actividades Realizadas:**

1.  **Identificación del Problema:** Se detectó que el gesto de "pellizcar para hacer zoom" (pinch-to-zoom) en dispositivos táctiles no era intuitivo. El zoom se centraba en el medio de la pantalla en lugar de en el punto medio del gesto, y el paneo realizado durante el zoom no se respetaba en el renderizado final.
2.  **Proceso Iterativo de Depuración:** Se llevó a cabo un proceso de depuración colaborativo para solucionar el problema.
    *   Se intentaron varios enfoques matemáticos para invertir la transformación CSS del gesto.
    *   Se utilizaron logs de depuración para analizar los valores intermedios de los cálculos.
    *   Se identificó que los intentos iniciales fallaban debido a la complejidad de la inversión de la transformación y a errores sutiles en la mezcla de sistemas de coordenadas (`displayCanvas` vs. `renderCanvas`).
3.  **Implementación de la Solución Final (Basada en Proporciones):**
    *   Se adoptó un enfoque más robusto y directo sugerido durante el proceso.
    *   Al final del gesto, se calcula la posición relativa (proporcional, de 0 a 1) del centro del viewport con respecto al canvas transformado por el gesto.
    *   Esta misma proporción se aplica al espacio de coordenadas del fractal para determinar el nuevo centro de la vista.
    *   Se corrigió un error final en el cálculo al asegurar que las dimensiones del `renderCanvas` (y no las del `displayCanvas`) se usaran para determinar el ancho y alto del fractal en el espacio complejo.
4.  **Resultado:** La interacción táctil ahora es completamente intuitiva. El renderizado final coincide perfectamente con la vista previa, respetando tanto el zoom como el paneo realizado durante el gesto.

---

## 2025-07-30

### Hito: Corrección de Paneo en Dispositivos Táctiles

**Estado:** Completado.

**Actividades Realizadas:**

1.  **Diagnóstico del Problema:** Se identificó que el renderizado final del paneo no coincidía con la posición esperada en dispositivos táctiles. Los logs revelaron que el `dpr` (device pixel ratio) se estaba aplicando incorrectamente en el cálculo de las nuevas coordenadas del centro.
2.  **Corrección de `applyPan`:** Se eliminó la multiplicación por `dpr` en el cálculo de `newCenterX` y `newCenterY` dentro de la función `applyPan` en `src/components/MandelbrotViewer.vue`.

---

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


