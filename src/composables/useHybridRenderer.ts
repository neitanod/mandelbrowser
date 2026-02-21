import { ref, onUnmounted } from 'vue';
import Decimal from 'decimal.js';
import { log, error } from '../utils/logger';
import { WebGLMandelbrotRenderer } from '../renderers/webglRenderer';
import MandelbrotWorker from '../workers/mandelbrot.worker?worker';

// Configure Decimal for high precision
Decimal.set({ precision: 50 });

function createWorker() {
  return new MandelbrotWorker();
}

export function useHybridRenderer() {
  let worker = createWorker();
  let gpuRenderer: WebGLMandelbrotRenderer | null = null;
  let gpuCanvas: HTMLCanvasElement | null = null;
  let cpuCanvas: HTMLCanvasElement | null = null;

  const isRendering = ref(false);
  const currentRenderId = ref(0);
  const useGPU = ref(false);

  // Callback to notify when render is complete
  let onRenderComplete: ((canvas: HTMLCanvasElement) => void) | null = null;

  function setOnRenderComplete(callback: (canvas: HTMLCanvasElement) => void) {
    onRenderComplete = callback;
  }

  // Initialize with two separate canvases
  function init(width: number, height: number): { gpuSupported: boolean } {
    // Create CPU canvas (2D context)
    cpuCanvas = document.createElement('canvas');
    cpuCanvas.width = width;
    cpuCanvas.height = height;

    // Create GPU canvas (WebGL context)
    gpuCanvas = document.createElement('canvas');
    gpuCanvas.width = width;
    gpuCanvas.height = height;

    // Try to initialize GPU renderer
    try {
      gpuRenderer = new WebGLMandelbrotRenderer(gpuCanvas);
      // GPU disabled for now - precision issues at deep zoom
      useGPU.value = false;
      log('GPU renderer initialized but disabled (precision issues)');
    } catch (e) {
      error('Failed to initialize GPU renderer:', e);
      useGPU.value = false;
    }

    return { gpuSupported: false };
  }

  function resize(width: number, height: number) {
    if (cpuCanvas) {
      cpuCanvas.width = width;
      cpuCanvas.height = height;
    }
    if (gpuCanvas) {
      gpuCanvas.width = width;
      gpuCanvas.height = height;
    }
  }

  function setupWorkerHandlers() {
    worker.onmessage = (e) => {
      const { imageData, renderId, isComplete, pass } = e.data;
      if (renderId === currentRenderId.value) {
        // Draw to CPU canvas
        if (cpuCanvas) {
          const ctx = cpuCanvas.getContext('2d');
          if (ctx) {
            ctx.putImageData(imageData, 0, 0);
            // Notify that we have a new frame
            if (onRenderComplete) {
              onRenderComplete(cpuCanvas);
            }
          }
        }

        if (isComplete) {
          isRendering.value = false;
          log('CPU render complete.');
        } else {
          log('CPU progressive pass', pass, 'received.');
        }
      } else {
        log('Discarding old render result.', renderId, currentRenderId.value);
      }
    };

    worker.onerror = (e) => {
      error('Error in Mandelbrot worker:', e);
      isRendering.value = false;
    };
  }

  setupWorkerHandlers();

  function calculateMaxIterations(zoom: number): number {
    // MUST match CPU worker exactly for consistent colors!
    const BASE_ITERATIONS = 300;
    const ITERATION_SCALE = 150;
    const zoomFactor = Math.max(0, -Math.log10(zoom) - 2);
    return Math.min(Math.floor(BASE_ITERATIONS + ITERATION_SCALE * zoomFactor), 200000);
  }

  function renderGPU(options: {
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    centerXLo: number;
    centerYLo: number;
    zoom: number;
  }): boolean {
    if (!gpuRenderer || !gpuCanvas || !useGPU.value) {
      return false;
    }

    const maxIterations = calculateMaxIterations(options.zoom);

    // Split float64 into two float32 for GPU
    // The trick: cast to float32, then compute the remainder
    const splitDouble = (x: number): [number, number] => {
      const hi = Math.fround(x);  // Cast to float32
      const lo = x - hi;          // Remainder (still float64, but small enough for float32)
      return [hi, Math.fround(lo)];
    };

    // Combine the Decimal-derived hi/lo with proper float32 splitting
    const fullX = options.centerX + options.centerXLo;
    const fullY = options.centerY + options.centerYLo;
    const [cxHi, cxLo] = splitDouble(fullX);
    const [cyHi, cyLo] = splitDouble(fullY);

    // Split zoom into double-single as well
    const [zoomHi, zoomLo] = splitDouble(options.zoom);

    log('GPU render: zoom=', options.zoom, 'zoomSplit=', zoomHi, zoomLo, 'maxIterations=', maxIterations, 'size=', options.width, 'x', options.height);
    log('GPU center split: hi=', cxHi, cyHi, 'lo=', cxLo, cyLo);

    // Resize GPU canvas to match render dimensions
    gpuCanvas.width = options.width;
    gpuCanvas.height = options.height;

    // Render directly on GPU
    gpuRenderer.render(
      options.width,
      options.height,
      cxHi,
      cyHi,
      cxLo,
      cyLo,
      zoomHi,
      zoomLo,
      maxIterations
    );

    // Notify completion
    if (onRenderComplete) {
      onRenderComplete(gpuCanvas);
    }

    isRendering.value = false;
    return true;
  }

  function renderCPU(options: {
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    zoom: number;
    centerXLo?: number;
    centerYLo?: number;
    centerX2?: number;
    centerX3?: number;
    centerY2?: number;
    centerY3?: number;
  }) {
    // Cancel previous render
    if (isRendering.value) {
      log('Cancelling previous render, creating new worker.');
      worker.terminate();
      worker = createWorker();
      setupWorkerHandlers();
    }

    currentRenderId.value++;
    const renderOptions = {
      ...options,
      canvasWidth: options.width,
      canvasHeight: options.height,
      renderId: currentRenderId.value,
    };
    log('Sending to CPU worker.');
    isRendering.value = true;
    worker.postMessage(renderOptions);
  }

  // COMPARISON MODE: Render both GPU and CPU side by side
  let comparisonCanvas: HTMLCanvasElement | null = null;

  function renderComparison(options: {
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    centerXLo: number;
    centerYLo: number;
    zoom: number;
  }) {
    if (!gpuRenderer || !gpuCanvas || !cpuCanvas) return;

    const halfWidth = Math.floor(options.width / 2);
    const maxIterations = calculateMaxIterations(options.zoom);

    // Split for GPU
    const splitDouble = (x: number): [number, number] => {
      const hi = Math.fround(x);
      const lo = x - hi;
      return [hi, Math.fround(lo)];
    };

    const fullX = options.centerX + options.centerXLo;
    const fullY = options.centerY + options.centerYLo;
    const [cxHi, cxLo] = splitDouble(fullX);
    const [cyHi, cyLo] = splitDouble(fullY);
    const [zoomHi, zoomLo] = splitDouble(options.zoom);

    // Render GPU to left half
    gpuCanvas.width = halfWidth;
    gpuCanvas.height = options.height;
    gpuRenderer.render(
      halfWidth,
      options.height,
      cxHi, cyHi, cxLo, cyLo,
      zoomHi, zoomLo,
      maxIterations
    );

    // Create comparison canvas if needed
    if (!comparisonCanvas) {
      comparisonCanvas = document.createElement('canvas');
    }
    comparisonCanvas.width = options.width;
    comparisonCanvas.height = options.height;
    const ctx = comparisonCanvas.getContext('2d')!;

    // Draw GPU result on left
    ctx.drawImage(gpuCanvas, 0, 0);

    // Draw dividing line
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(halfWidth, 0);
    ctx.lineTo(halfWidth, options.height);
    ctx.stroke();

    // Labels
    ctx.fillStyle = 'white';
    ctx.font = '16px sans-serif';
    ctx.fillText('GPU', 10, 25);
    ctx.fillText('CPU', halfWidth + 10, 25);

    // Notify with partial result (GPU only for now)
    if (onRenderComplete) {
      onRenderComplete(comparisonCanvas);
    }

    // Now start CPU render for right half
    cpuCanvas.width = halfWidth;
    cpuCanvas.height = options.height;

    // Temporarily override the worker handler to composite
    const originalHandler = worker.onmessage;
    worker.onmessage = (e) => {
      const { imageData, renderId, isComplete } = e.data;
      if (renderId === currentRenderId.value && cpuCanvas && comparisonCanvas) {
        const cpuCtx = cpuCanvas.getContext('2d');
        if (cpuCtx) {
          cpuCtx.putImageData(imageData, 0, 0);
          // Composite onto comparison canvas
          const compCtx = comparisonCanvas.getContext('2d')!;
          compCtx.drawImage(cpuCanvas, halfWidth, 0);
          // Redraw labels
          compCtx.fillStyle = 'white';
          compCtx.font = '16px sans-serif';
          compCtx.fillText('GPU', 10, 25);
          compCtx.fillText('CPU', halfWidth + 10, 25);
          if (onRenderComplete) {
            onRenderComplete(comparisonCanvas);
          }
        }
        if (isComplete) {
          isRendering.value = false;
          worker.onmessage = originalHandler;
          // Generate comparison report
          log('CPU complete, generating report...');
          if (gpuRenderer && cpuCanvas) {
            log('Renderer and canvas available, calling generateComparisonReport');
            generateComparisonReport(gpuRenderer, cpuCanvas, options);
          } else {
            log('ERROR: gpuRenderer or cpuCanvas is null!');
          }
        }
      }
    };

    currentRenderId.value++;
    isRendering.value = true;
    worker.postMessage({
      canvasWidth: halfWidth,
      canvasHeight: options.height,
      centerX: options.centerX,
      centerY: options.centerY,
      centerXLo: options.centerXLo,
      centerYLo: options.centerYLo,
      zoom: options.zoom,
      renderId: currentRenderId.value,
    });
  }

  function generateComparisonReport(renderer: WebGLMandelbrotRenderer, cpuCanvas: HTMLCanvasElement, options: {
    centerX: number;
    centerY: number;
    centerXLo: number;
    centerYLo: number;
    zoom: number;
  }) {
    log('generateComparisonReport called');

    const cpuCtx = cpuCanvas.getContext('2d');
    if (!cpuCtx) {
      log('ERROR: Could not get CPU canvas context');
      return;
    }

    const width = cpuCanvas.width;
    const height = cpuCanvas.height;

    // Read GPU pixels using the renderer's method
    const gpuData = renderer.readPixels();
    if (!gpuData) {
      log('ERROR: Could not read GPU pixels');
      return;
    }

    const cpuData = cpuCtx.getImageData(0, 0, width, height).data;
    log('Got pixel data, analyzing...');

    // Sample points to compare
    const samplePoints = [
      { name: 'center', x: Math.floor(width / 2), y: Math.floor(height / 2) },
      { name: 'top-left', x: 10, y: 10 },
      { name: 'top-right', x: width - 10, y: 10 },
      { name: 'bottom-left', x: 10, y: height - 10 },
      { name: 'bottom-right', x: width - 10, y: height - 10 },
      { name: 'left-edge', x: 0, y: Math.floor(height / 2) },
      { name: 'right-edge', x: width - 1, y: Math.floor(height / 2) },
    ];

    // Count differences
    let totalDiff = 0;
    let maxDiff = 0;
    let diffPixels = 0;
    for (let i = 0; i < gpuData.length; i += 4) {
      const diff = Math.abs(gpuData[i] - cpuData[i]) +
                   Math.abs(gpuData[i+1] - cpuData[i+1]) +
                   Math.abs(gpuData[i+2] - cpuData[i+2]);
      if (diff > 0) {
        diffPixels++;
        totalDiff += diff;
        maxDiff = Math.max(maxDiff, diff);
      }
    }

    const totalPixels = width * height;
    const diffPercent = (diffPixels / totalPixels * 100).toFixed(2);

    // Calculate expected center pixel coordinate - step by step like GPU does
    const centerPixelX = Math.floor(width / 2);
    const centerPixelY = Math.floor(height / 2);

    // Step-by-step calculation matching GPU shader
    const pixelX_cpu = centerPixelX - width / 2;
    const pixelY_cpu = centerPixelY - height / 2;

    const offsetX_cpu = pixelX_cpu * options.zoom;
    const offsetY_cpu = pixelY_cpu * options.zoom;

    const fullCenterX = options.centerX + options.centerXLo;
    const fullCenterY = options.centerY + options.centerYLo;

    const cr_cpu = fullCenterX + offsetX_cpu;
    const ci_cpu = fullCenterY + offsetY_cpu;

    // Simulate GPU float32 precision
    const f32 = (x: number) => Math.fround(x);
    const pixelX_gpu = f32(f32(centerPixelX) - f32(width) * 0.5);
    const pixelY_gpu = f32(f32(centerPixelY) - f32(height) * 0.5);

    const zoomHi = f32(options.zoom);
    const offsetX_gpu = f32(pixelX_gpu * zoomHi);
    const offsetY_gpu = f32(pixelY_gpu * zoomHi);

    // GPU center split
    const centerXHi = f32(fullCenterX);
    const centerXLo = f32(fullCenterX - centerXHi);
    const centerYHi = f32(fullCenterY);
    const centerYLo = f32(fullCenterY - centerYHi);

    // ds_add_f simulation: twoSum(centerHi, offset) then add centerLo
    const s1_x = f32(centerXHi + offsetX_gpu);
    const v_x = f32(s1_x - centerXHi);
    const e_x = f32(f32(centerXHi - f32(s1_x - v_x)) + f32(offsetX_gpu - v_x));
    const s2_x = f32(e_x + centerXLo);
    const cr_gpu_hi = f32(s1_x + s2_x);
    const cr_gpu_lo = f32(s2_x - f32(cr_gpu_hi - s1_x));
    const cr_gpu = cr_gpu_hi + cr_gpu_lo;

    const s1_y = f32(centerYHi + offsetY_gpu);
    const v_y = f32(s1_y - centerYHi);
    const e_y = f32(f32(centerYHi - f32(s1_y - v_y)) + f32(offsetY_gpu - v_y));
    const s2_y = f32(e_y + centerYLo);
    const ci_gpu_hi = f32(s1_y + s2_y);
    const ci_gpu_lo = f32(s2_y - f32(ci_gpu_hi - s1_y));
    const ci_gpu = ci_gpu_hi + ci_gpu_lo;

    let report = `
========== GPU vs CPU COMPARISON REPORT ==========
Canvas size: ${width} x ${height}
Zoom: ${options.zoom}
Center: (${fullCenterX}, ${fullCenterY})

STEP-BY-STEP FOR CENTER PIXEL (${centerPixelX}, ${centerPixelY}):

1. PIXEL OFFSET FROM CENTER:
   CPU: pixelX = ${pixelX_cpu}, pixelY = ${pixelY_cpu}
   GPU: pixelX = ${pixelX_gpu}, pixelY = ${pixelY_gpu}

2. OFFSET * ZOOM:
   CPU: offsetX = ${offsetX_cpu}, offsetY = ${offsetY_cpu}
   GPU: offsetX = ${offsetX_gpu}, offsetY = ${offsetY_gpu}
   (zoom used: CPU=${options.zoom}, GPU zoomHi=${zoomHi})

3. CENTER SPLIT (GPU):
   centerXHi = ${centerXHi}, centerXLo = ${centerXLo}
   centerYHi = ${centerYHi}, centerYLo = ${centerYLo}

4. FINAL C = CENTER + OFFSET:
   CPU: cr = ${cr_cpu}, ci = ${ci_cpu}
   GPU: cr = ${cr_gpu} (hi=${cr_gpu_hi}, lo=${cr_gpu_lo})
        ci = ${ci_gpu} (hi=${ci_gpu_hi}, lo=${ci_gpu_lo})

5. DIFFERENCE:
   cr diff = ${Math.abs(cr_cpu - cr_gpu)} (${(Math.abs(cr_cpu - cr_gpu) / options.zoom).toFixed(2)} pixels)
   ci diff = ${Math.abs(ci_cpu - ci_gpu)} (${(Math.abs(ci_cpu - ci_gpu) / options.zoom).toFixed(2)} pixels)

6. ITERATION COMPARISON (first 5 iterations):
${(() => {
  // CPU iteration (float64)
  let zr_cpu = 0, zi_cpu = 0;
  let cpu_steps = [];
  for (let i = 0; i < 5; i++) {
    const zr2 = zr_cpu * zr_cpu;
    const zi2 = zi_cpu * zi_cpu;
    const new_zr = zr2 - zi2 + cr_cpu;
    const new_zi = 2 * zr_cpu * zi_cpu + ci_cpu;
    zr_cpu = new_zr;
    zi_cpu = new_zi;
    cpu_steps.push(`   i=${i+1}: zr=${zr_cpu}, zi=${zi_cpu}`);
  }

  // GPU iteration (float32 DS simulation)
  // DS = [hi, lo], we simulate with f32
  let zx_hi = 0, zx_lo = 0, zy_hi = 0, zy_lo = 0;
  const cx_hi = cr_gpu_hi, cx_lo = cr_gpu_lo;
  const cy_hi = ci_gpu_hi, cy_lo = ci_gpu_lo;
  let gpu_steps = [];

  // Helper: DS multiply
  const SPLIT = 4097;
  const ds_mul = (a_hi: number, a_lo: number, b_hi: number, b_lo: number): [number, number] => {
    const p = f32(a_hi * b_hi);
    const t = f32(SPLIT * a_hi);
    const a_hi_s = f32(t - f32(t - a_hi));
    const a_lo_s = f32(a_hi - a_hi_s);
    const t2 = f32(SPLIT * b_hi);
    const b_hi_s = f32(t2 - f32(t2 - b_hi));
    const b_lo_s = f32(b_hi - b_hi_s);
    const err = f32(f32(f32(f32(a_hi_s * b_hi_s - p) + a_hi_s * b_lo_s) + a_lo_s * b_hi_s) + a_lo_s * b_lo_s);
    const p_lo = f32(err + f32(a_hi * b_lo + a_lo * b_hi));
    const s = f32(p + p_lo);
    return [s, f32(p_lo - f32(s - p))];
  };

  // Helper: DS add
  const ds_add = (a_hi: number, a_lo: number, b_hi: number, b_lo: number): [number, number] => {
    const s = f32(a_hi + b_hi);
    const v = f32(s - a_hi);
    const e = f32(f32(a_hi - f32(s - v)) + f32(b_hi - v));
    const t_hi = f32(a_lo + b_lo);
    const t_v = f32(t_hi - a_lo);
    const t_e = f32(f32(a_lo - f32(t_hi - t_v)) + f32(b_lo - t_v));
    let s2 = f32(e + t_hi);
    const [s1f, s2f] = [f32(s + s2), f32(s2 - f32(f32(s + s2) - s))];
    const s2n = f32(s2f + t_e);
    return [f32(s1f + s2n), f32(s2n - f32(f32(s1f + s2n) - s1f))];
  };

  // Helper: DS sub
  const ds_sub = (a_hi: number, a_lo: number, b_hi: number, b_lo: number): [number, number] => {
    return ds_add(a_hi, a_lo, -b_hi, -b_lo);
  };

  for (let i = 0; i < 5; i++) {
    // zx^2
    const [zx2_hi, zx2_lo] = ds_mul(zx_hi, zx_lo, zx_hi, zx_lo);
    // zy^2
    const [zy2_hi, zy2_lo] = ds_mul(zy_hi, zy_lo, zy_hi, zy_lo);
    // zx*zy
    const [zxzy_hi, zxzy_lo] = ds_mul(zx_hi, zx_lo, zy_hi, zy_lo);
    // 2*zx*zy
    const [two_zxzy_hi, two_zxzy_lo] = ds_add(zxzy_hi, zxzy_lo, zxzy_hi, zxzy_lo);
    // new_zy = 2*zx*zy + cy
    const [new_zy_hi, new_zy_lo] = ds_add(two_zxzy_hi, two_zxzy_lo, cy_hi, cy_lo);
    // zx^2 - zy^2
    const [diff_hi, diff_lo] = ds_sub(zx2_hi, zx2_lo, zy2_hi, zy2_lo);
    // new_zx = zx^2 - zy^2 + cx
    const [new_zx_hi, new_zx_lo] = ds_add(diff_hi, diff_lo, cx_hi, cx_lo);

    zx_hi = new_zx_hi; zx_lo = new_zx_lo;
    zy_hi = new_zy_hi; zy_lo = new_zy_lo;
    gpu_steps.push(`   i=${i+1}: zr=${zx_hi + zx_lo}, zi=${zy_hi + zy_lo}`);
  }

  return '   CPU:\n' + cpu_steps.join('\n') + '\n   GPU (simulated):\n' + gpu_steps.join('\n');
})()}

PIXEL DIFFERENCES:
- Different pixels: ${diffPixels} / ${totalPixels} (${diffPercent}%)
- Max color diff: ${maxDiff}
- Avg diff (when different): ${diffPixels > 0 ? (totalDiff / diffPixels).toFixed(1) : 0}

SAMPLE POINTS (GPU vs CPU):
`;

    for (const pt of samplePoints) {
      const idx = (pt.y * width + pt.x) * 4;
      const gpuR = gpuData[idx], gpuG = gpuData[idx+1], gpuB = gpuData[idx+2];
      const cpuR = cpuData[idx], cpuG = cpuData[idx+1], cpuB = cpuData[idx+2];
      const match = (gpuR === cpuR && gpuG === cpuG && gpuB === cpuB) ? '✓' : '✗';
      report += `  ${pt.name} (${pt.x},${pt.y}): GPU(${gpuR},${gpuG},${gpuB}) vs CPU(${cpuR},${cpuG},${cpuB}) ${match}\n`;
    }

    // Check for horizontal banding (same color in horizontal lines)
    let horizontalBands = 0;
    for (let y = 0; y < height; y += 10) {
      let sameRow = true;
      const firstIdx = y * width * 4;
      for (let x = 1; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (gpuData[idx] !== gpuData[firstIdx] ||
            gpuData[idx+1] !== gpuData[firstIdx+1] ||
            gpuData[idx+2] !== gpuData[firstIdx+2]) {
          sameRow = false;
          break;
        }
      }
      if (sameRow) horizontalBands++;
    }

    // Check for vertical banding
    let verticalBands = 0;
    for (let x = 0; x < width; x += 10) {
      let sameCol = true;
      const firstIdx = x * 4;
      for (let y = 1; y < height; y++) {
        const idx = (y * width + x) * 4;
        if (gpuData[idx] !== gpuData[firstIdx] ||
            gpuData[idx+1] !== gpuData[firstIdx+1] ||
            gpuData[idx+2] !== gpuData[firstIdx+2]) {
          sameCol = false;
          break;
        }
      }
      if (sameCol) verticalBands++;
    }

    report += `
BANDING ANALYSIS (GPU):
- Horizontal bands detected: ${horizontalBands} / ${Math.floor(height/10)} rows sampled
- Vertical bands detected: ${verticalBands} / ${Math.floor(width/10)} cols sampled
`;

    if (horizontalBands > 5) {
      report += `  ⚠️  HIGH HORIZONTAL BANDING - suggests Y coordinate not varying properly\n`;
    }
    if (verticalBands > 5) {
      report += `  ⚠️  HIGH VERTICAL BANDING - suggests X coordinate not varying properly\n`;
    }

    report += `\n========== END REPORT ==========\n`;

    console.log(report);

    // Show floating div with report
    let reportDiv = document.getElementById('comparison-report');
    if (!reportDiv) {
      reportDiv = document.createElement('div');
      reportDiv.id = 'comparison-report';
      reportDiv.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        width: 450px;
        max-height: 80vh;
        background: rgba(0, 0, 0, 0.9);
        color: #0f0;
        font-family: monospace;
        font-size: 11px;
        padding: 10px;
        border-radius: 8px;
        z-index: 10000;
        overflow-y: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
      `;
      document.body.appendChild(reportDiv);
    }

    const copyBtn = `<button id="copy-report-btn" style="
      background: #4CAF50;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      margin-bottom: 10px;
      font-size: 12px;
    ">📋 COPY TO CLIPBOARD</button>
    <button id="close-report-btn" style="
      background: #f44336;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      margin-bottom: 10px;
      margin-left: 8px;
      font-size: 12px;
    ">✕ CLOSE</button>`;

    reportDiv.innerHTML = copyBtn + `<pre id="report-content" style="margin: 0;">${report}</pre>`;

    document.getElementById('copy-report-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(report).then(() => {
        const btn = document.getElementById('copy-report-btn');
        if (btn) {
          btn.textContent = '✓ COPIED!';
          btn.style.background = '#2196F3';
          setTimeout(() => {
            btn.textContent = '📋 COPY TO CLIPBOARD';
            btn.style.background = '#4CAF50';
          }, 2000);
        }
      });
    });

    document.getElementById('close-report-btn')?.addEventListener('click', () => {
      reportDiv?.remove();
    });
  }

  function render(options: {
    width: number;
    height: number;
    centerXDecimal: Decimal;
    centerYDecimal: Decimal;
    centerX: number;
    centerY: number;
    zoom: number;
    centerXLo?: number;
    centerYLo?: number;
    centerX2?: number;
    centerX3?: number;
    centerY2?: number;
    centerY3?: number;
  }) {
    isRendering.value = true;

    // GPU disabled for now - CPU only at full screen
    renderCPU({
      width: options.width,
      height: options.height,
      centerX: options.centerX,
      centerY: options.centerY,
      zoom: options.zoom,
      centerXLo: options.centerXLo,
      centerYLo: options.centerYLo,
      centerX2: options.centerX2,
      centerX3: options.centerX3,
      centerY2: options.centerY2,
      centerY3: options.centerY3,
    });
  }

  onUnmounted(() => {
    worker.terminate();
    gpuRenderer?.dispose();
  });

  return {
    isRendering,
    useGPU,
    init,
    resize,
    render,
    setOnRenderComplete,
  };
}
