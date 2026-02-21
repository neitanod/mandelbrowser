# Session Summary - 2026-02-20

## Implementación de precisión múltiple para zoom profundo

Se implementó un sistema de precisión escalonada para permitir explorar el set de Mandelbrot a escalas extremas (hasta la longitud de Planck ~1e-35):

### Niveles de precisión

| Zoom | Modo | Precisión | Block size |
|------|------|-----------|------------|
| > 1e-13 | Standard | ~16 dígitos | 1x1 |
| 1e-13 a 1e-15 | DD coords | ~31 dígitos coords | 1x1 |
| 1e-15 a 1e-28 | Full DD | ~31 dígitos | 2x2 |
| 1e-28 a 1e-31 | Full DD | ~31 dígitos | 3x3 |
| < 1e-31 | Quad-double | ~31 dígitos | 4x4 |

### Decisiones técnicas

- **Decimal.js para navegación**: Almacenamos las coordenadas en el store como strings de Decimal.js (50 dígitos). Esto permite navegar con precisión arbitraria.

- **Double-double para rendering**: Implementamos aritmética DD inline en el worker (no se pueden importar módulos en workers de producción con Vite).

- **Watchers de strings**: Un bug importante fue que el drag no funcionaba a zoom e-32 porque los watchers observaban `toNumber()` que no cambiaba. Solucionado observando los strings (`centerXStr`, etc).

- **Quad-double simplificado**: El modo "quad-double" en realidad usa DD con los 4 componentes colapsados. La implementación QD completa era demasiado compleja y no funcionaba bien. El enfoque actual funciona razonablemente hasta ~1e-31.

### Indicadores de escala física

- Set size: Muestra el tamaño físico del set completo (cm, m, km, AU, light-years, universos observables)
- Pixel size: Aparece al llegar a escala de Planck, mostrando el tamaño de cada pixel en longitudes de Planck

## Refactor de cálculo de vista

Extrajimos `calculateNewView` a `src/logic/viewUtils.ts` para manejar correctamente la conversión entre:
- CSS pixels (lo que ve el usuario)
- Render canvas pixels (el canvas interno más pequeño)
- Fractal units (coordenadas matemáticas)

El cálculo usa deltas en lugar de posiciones absolutas para preservar precisión.

## Deploy a producción

- URL: https://mandelbrot.ip1.cc
- Servidor: mini.framework.cc
- Configuración: Apache vhost con SSL wildcard de ip1.cc

## Favicon del set de Mandelbrot

Creamos un ícono SVG estilizado con:
- Silueta negra del set (cardioide + bulbos)
- Bandas de colores representando iteraciones
- Fondo blanco para mejor visibilidad

Formatos generados: SVG, ICO, PNG 192px, PNG 512px

## Archivos modificados/creados

- `src/workers/mandelbrot.worker.ts` - Rendering multi-precisión
- `src/stores/view.ts` - Estado con Decimal.js y componentes hi/lo
- `src/composables/usePhysicalSize.ts` - Indicadores de escala
- `src/logic/viewUtils.ts` - Cálculos de vista (nuevo)
- `public/mandelbrot-icon.svg` - Favicon (nuevo)
- `index.html` - Referencias a íconos

## Renderizado progresivo

Implementamos rendering progresivo para mejor UX:

- El worker ahora renderiza en múltiples pasadas: 16x16 → 8x8 → 4x4 → 2x2 → 1x1
- Cada pasada envía un mensaje al main thread que actualiza el canvas
- El usuario ve la imagen pixelada inmediatamente y observa cómo se refina
- Esto permite usar más iteraciones sin frustrar al usuario con esperas

### Cambios en iteraciones

Con el rendering progresivo, aumentamos las iteraciones:
- Base: 300 iteraciones (zoom inicial)
- Escala: +150 iteraciones por orden de magnitud de zoom
- Cap máximo: 100,000 iteraciones

### Paleta de colores mejorada

Nueva paleta con transiciones suaves:
- Deep blue → Ocean blue → Cyan white → Orange → Red orange → Crimson → Purple → Dark purple → Very dark blue
- Interpolación lineal entre colores
- Cicla 3 veces a través de la paleta para más variación

## Pendientes para futuras sesiones

- La precisión quad-double real requeriría una implementación más compleja
- Posible optimización: Web Workers paralelos para tiles
- Considerar WebGL para aceleración por GPU
