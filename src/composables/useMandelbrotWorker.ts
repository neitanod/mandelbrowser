import { ref, onUnmounted } from 'vue';
import { log, error } from '../utils/logger';

export function useMandelbrotWorker() {
  const worker = new Worker(new URL('../workers/mandelbrot.worker.ts', import.meta.url), { type: 'module' });

  const isRendering = ref(false);
  const renderedImage = ref<ImageData | null>(null);
  const currentRenderId = ref(0); // Add currentRenderId

  worker.onmessage = (e) => {
    const { imageData, renderId } = e.data; // Worker will send imageData and renderId
    if (renderId === currentRenderId.value) { // Check if renderId matches
      renderedImage.value = imageData;
      isRendering.value = false;
    } else {
      log('useMandelbrotWorker: Discarding old render result.', renderId, currentRenderId.value);
    }
  };

  worker.onerror = (e) => {
    error('Error in Mandelbrot worker:', e);
    isRendering.value = false;
  };

  function render(options: { 
    canvasWidth: number; 
    canvasHeight: number; 
    centerX: number; 
    centerY: number; 
    zoom: number; 
  }) {
    currentRenderId.value++; // Increment renderId for new request
    const renderOptions = { ...options, renderId: currentRenderId.value }; // Pass renderId
    log('useMandelbrotWorker: Sending message to worker.', renderOptions);
    if (isRendering.value) {
      // Optional: Cancel previous work if a new render is requested
      // For now, we just ignore new requests while rendering.
      // For progressive rendering, we might want to send a "cancel" message to the worker.
    }
    isRendering.value = true;
    worker.postMessage(renderOptions);
  }

  onUnmounted(() => {
    worker.terminate();
  });

  return { isRendering, renderedImage, render };
}
