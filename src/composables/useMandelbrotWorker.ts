import { ref, onUnmounted } from 'vue';
import { log, error } from '../utils/logger';
import MandelbrotWorker from '../workers/mandelbrot.worker?worker';

function createWorker() {
  return new MandelbrotWorker();
}

export function useMandelbrotWorker() {
  let worker = createWorker();

  const isRendering = ref(false);
  const renderedImage = ref<ImageData | null>(null);
  const currentRenderId = ref(0);

  function setupWorkerHandlers() {
    worker.onmessage = (e) => {
      const { imageData, renderId, isComplete, pass } = e.data;
      if (renderId === currentRenderId.value) {
        // Progressive rendering: update on each pass
        renderedImage.value = imageData;
        if (isComplete) {
          isRendering.value = false;
          log('useMandelbrotWorker: Render complete.');
        } else {
          log('useMandelbrotWorker: Progressive pass', pass, 'received.');
        }
      } else {
        log('useMandelbrotWorker: Discarding old render result.', renderId, currentRenderId.value);
      }
    };

    worker.onerror = (e) => {
      error('Error in Mandelbrot worker:', e);
      isRendering.value = false;
    };
  }

  setupWorkerHandlers();

  function render(options: {
    canvasWidth: number;
    canvasHeight: number;
    centerX: number;
    centerY: number;
    zoom: number;
    centerXLo?: number;  // Low component for double-double precision
    centerYLo?: number;
    // Quad-double components for ultra-deep zoom
    centerX2?: number;
    centerX3?: number;
    centerY2?: number;
    centerY3?: number;
  }) {
    // If already rendering, terminate current worker and create a new one
    // This prevents wasted CPU cycles on obsolete renders
    if (isRendering.value) {
      log('useMandelbrotWorker: Cancelling previous render, creating new worker.');
      worker.terminate();
      worker = createWorker();
      setupWorkerHandlers();
    }

    currentRenderId.value++;
    const renderOptions = { ...options, renderId: currentRenderId.value };
    log('useMandelbrotWorker: Sending message to worker.', renderOptions);
    isRendering.value = true;
    worker.postMessage(renderOptions);
  }

  onUnmounted(() => {
    worker.terminate();
  });

  return { isRendering, renderedImage, render };
}
