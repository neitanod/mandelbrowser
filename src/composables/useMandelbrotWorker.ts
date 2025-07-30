import { ref, onUnmounted } from 'vue';

export function useMandelbrotWorker() {
  const worker = new Worker(new URL('../workers/mandelbrot.worker.ts', import.meta.url), { type: 'module' });

  const isRendering = ref(false);
  const renderedImage = ref<ImageData | null>(null);

  worker.onmessage = (e) => {
    renderedImage.value = e.data;
    isRendering.value = false;
  };

  worker.onerror = (e) => {
    console.error('Error in Mandelbrot worker:', e);
    isRendering.value = false;
  };

  function render(options: { 
    canvasWidth: number; 
    canvasHeight: number; 
    centerX: number; 
    centerY: number; 
    zoom: number; 
  }) {
    console.log('useMandelbrotWorker: Sending message to worker.', options);
    if (isRendering.value) {
      // Optional: Cancel previous work if a new render is requested
      // For now, we just ignore new requests while rendering.
      return;
    }
    isRendering.value = true;
    worker.postMessage(options);
  }

  onUnmounted(() => {
    worker.terminate();
  });

  return { isRendering, renderedImage, render };
}
