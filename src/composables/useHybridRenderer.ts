import { ref, onUnmounted, shallowRef } from 'vue';
import Decimal from 'decimal.js';
import { log, error } from '../utils/logger';
import { calculateReferenceOrbit, type ReferenceOrbit } from '../renderers/perturbation';
import { WebGLPerturbationRenderer } from '../renderers/webglRenderer';
import MandelbrotWorker from '../workers/mandelbrot.worker?worker';

// Configure Decimal for high precision
Decimal.set({ precision: 50 });

function createWorker() {
  return new MandelbrotWorker();
}

export function useHybridRenderer() {
  let worker = createWorker();
  let gpuRenderer: WebGLPerturbationRenderer | null = null;
  let gpuCanvas: HTMLCanvasElement | null = null;

  const isRendering = ref(false);
  const renderedImage = ref<ImageData | null>(null);
  const currentRenderId = ref(0);
  const useGPU = ref(false);
  const referenceOrbit = shallowRef<ReferenceOrbit | null>(null);

  // Initialize GPU renderer
  function initGPU(canvas: HTMLCanvasElement): boolean {
    try {
      gpuCanvas = canvas;
      gpuRenderer = new WebGLPerturbationRenderer(canvas);
      useGPU.value = gpuRenderer.isSupported();
      log('GPU renderer initialized, supported:', useGPU.value);
      return useGPU.value;
    } catch (e) {
      error('Failed to initialize GPU renderer:', e);
      useGPU.value = false;
      return false;
    }
  }

  function setupWorkerHandlers() {
    worker.onmessage = (e) => {
      const { imageData, renderId, isComplete, pass } = e.data;
      if (renderId === currentRenderId.value) {
        renderedImage.value = imageData;
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
    const BASE_ITERATIONS = 300;
    const ITERATION_SCALE = 150;
    const zoomFactor = Math.max(0, -Math.log10(zoom) - 2);
    return Math.min(Math.floor(BASE_ITERATIONS + ITERATION_SCALE * zoomFactor), 200000);
  }

  function renderGPU(options: {
    canvasWidth: number;
    canvasHeight: number;
    centerX: Decimal;
    centerY: Decimal;
    zoom: number;
  }) {
    if (!gpuRenderer || !gpuCanvas) {
      log('GPU not available, falling back to CPU');
      return false;
    }

    const maxIterations = calculateMaxIterations(options.zoom);

    // Check if we need to recalculate reference orbit
    const needNewOrbit = !referenceOrbit.value ||
      referenceOrbit.value.centerX !== options.centerX.toString() ||
      referenceOrbit.value.centerY !== options.centerY.toString() ||
      referenceOrbit.value.length < maxIterations;

    if (needNewOrbit) {
      log('Calculating new reference orbit...');
      referenceOrbit.value = calculateReferenceOrbit(
        options.centerX,
        options.centerY,
        maxIterations
      );
      gpuRenderer.uploadReferenceOrbit(referenceOrbit.value);
    }

    // Resize canvas if needed
    if (gpuCanvas.width !== options.canvasWidth || gpuCanvas.height !== options.canvasHeight) {
      gpuCanvas.width = options.canvasWidth;
      gpuCanvas.height = options.canvasHeight;
    }

    // Render with GPU
    // centerOffset is 0 because reference point IS the center
    gpuRenderer.render(
      options.canvasWidth,
      options.canvasHeight,
      options.zoom,
      0, 0, // center offset
      referenceOrbit.value!.length,
      maxIterations
    );

    // Get rendered image
    renderedImage.value = gpuRenderer.getImageData();
    isRendering.value = false;

    return true;
  }

  function renderCPU(options: {
    canvasWidth: number;
    canvasHeight: number;
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
    // If already rendering, terminate current worker and create a new one
    if (isRendering.value) {
      log('Cancelling previous render, creating new worker.');
      worker.terminate();
      worker = createWorker();
      setupWorkerHandlers();
    }

    currentRenderId.value++;
    const renderOptions = { ...options, renderId: currentRenderId.value };
    log('Sending to CPU worker.', renderOptions);
    isRendering.value = true;
    worker.postMessage(renderOptions);
  }

  function render(options: {
    canvasWidth: number;
    canvasHeight: number;
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

    // TODO: GPU rendering with perturbation theory is implemented but disabled
    // for now due to canvas context conflicts. The CPU progressive renderer
    // works well. GPU can be re-enabled once we sort out the dual-canvas approach.

    // For now, always use CPU which has progressive rendering
    renderCPU({
      canvasWidth: options.canvasWidth,
      canvasHeight: options.canvasHeight,
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
    renderedImage,
    useGPU,
    render,
    initGPU,
  };
}
