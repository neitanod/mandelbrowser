# Session Summary - 2026-02-21

## Intento de GPU con alta precisión - Debugging profundo

### Objetivo
Hacer que el GPU renderice Mandelbrot con precisión suficiente para zooms profundos (~1e-8 a 1e-50), sin fallback a CPU.

### El problema
A zoom ~1e-8, el GPU mostraba "píxeles en bloques" - muchos píxeles con el mismo color en lugar de detalle fino. El CPU funcionaba bien.

### Proceso de debugging

Se implementó un modo de comparación lado a lado (GPU izquierda, CPU derecha) con reporte detallado.

#### Tests de diagnóstico paso a paso:

1. **v_texCoord** - ✅ Funciona (degradé suave)
2. **pixelX/pixelY** - ✅ Funciona (degradé)
3. **offsetX/offsetY** (después de DS multiply) - ✅ Funciona (degradé)
4. **cx/cy** (después de ds_add_f) - ✅ Funciona (degradé)
5. **cr/ci** (coordenadas finales) - ✅ Funciona (degradé)
6. **iterations** - ❌ BLOQUES (problema aquí)
7. **zr1 = cr** (después de 1 iteración) - ✅ Funciona (degradé)

#### Hallazgo clave
Las coordenadas c varían correctamente entre píxeles, pero esa variación se pierde durante las iteraciones. Float32 no tiene suficiente precisión para mantener diferencias de ~1e-8 cuando los valores intermedios son ~0.6.

### Perturbation Theory - Solución parcial

Se implementó perturbation theory que rastrea deltas en vez de valores absolutos:

```glsl
// En lugar de: z = z² + c
// Rastreamos: δz = 2·z_ref·δz + δz² + δc
```

**Resultado del test**: El debug de 4 colores (amarillo/verde/rojo/negro) mostró degradé suave después de 10 iteraciones - la teoría funciona.

**Problema**: Al implementar el algoritmo completo, los colores no eran consistentes con CPU. Causas identificadas:
- maxIterations diferentes entre GPU y CPU (corregido: ambos usan 300 + 150*zoomFactor)
- Paleta de colores con valores ligeramente diferentes (corregido: valores RGB exactos)
- La perturbation theory es una aproximación que puede diferir del cálculo directo

### Decisión: Deshabilitar GPU temporalmente

El usuario pidió no cambiar a estrategias menos precisas sin consultar. Se deshabilitó GPU y se dejó CPU a pantalla completa funcionando correctamente.

### Cambios realizados

- `src/composables/useHybridRenderer.ts`:
  - GPU deshabilitado (`useGPU.value = false`)
  - Función `render()` usa solo CPU
  - Badge "GPU" ya no se muestra

- `src/renderers/webglRenderer.ts`:
  - Contiene código de perturbation theory (no activo)
  - Paleta de colores sincronizada con CPU

### Pendientes para futuras sesiones

- Implementar perturbation theory completa con manejo de "glitches" (cuando z_ref escapa)
- Considerar "rebasing" del reference point cuando ocurren glitches
- Alternativa: Series Approximation (SA) para acelerar iteraciones iniciales

### Notas técnicas

El badge verde "GPU" se quitó porque confundía - el GPU no está siendo usado aunque el hardware lo soporte.
