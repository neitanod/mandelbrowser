<template>
  <div
    class="viewer-container"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseUp"
    @wheel="handleWheel"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <canvas
      ref="displayCanvas"
      class="display-canvas"
      :style="{ transform: `translate(${viewPanX}px, ${viewPanY}px) scale(${viewGestureZoom})` }"
    ></canvas>
    <div v-if="isRendering" class="loading-indicator">Rendering...</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import { useMandelbrotWorker } from '../composables/useMandelbrotWorker';
import { useViewStore } from '../stores/view';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { log } from '../utils/logger';

// State and Store
const viewStore = useViewStore();
const { centerX, centerY, zoom } = storeToRefs(viewStore);
const { setView, updateFromUrl } = viewStore;

const router = useRouter();
const route = useRoute();

// Worker
const { isRendering, renderedImage, render } = useMandelbrotWorker();

// Canvas Refs
const displayCanvas = ref<HTMLCanvasElement | null>(null);
let renderCanvas: HTMLCanvasElement | null = null; // Off-screen canvas

// Gesture State
const isPanning = ref(false);
const panStartX = ref(0);
const panStartY = ref(0);
const panX = ref(0);
const panY = ref(0);
const gestureZoom = ref(1);
let initialTouchDistance = 0;

// View State (for CSS transform)
const viewPanX = ref(0);
const viewPanY = ref(0);
const viewGestureZoom = ref(1);

// --- Lifecycle and Initialization ---

const MAX_CANVAS_DIMENSION = 800; // Max width or height for the render canvas

// --- Lifecycle and Initialization ---

onMounted(async () => {
  const canvas = displayCanvas.value;
  if (!canvas) return;

  setupCanvasDimensions(canvas);

  renderCanvas = document.createElement('canvas');
  // Adjust render canvas dimensions based on MAX_CANVAS_DIMENSION
  const aspectRatio = canvas.width / canvas.height;
  if (canvas.width > MAX_CANVAS_DIMENSION || canvas.height > MAX_CANVAS_DIMENSION) {
    if (canvas.width > canvas.height) {
      renderCanvas.width = MAX_CANVAS_DIMENSION;
      renderCanvas.height = MAX_CANVAS_DIMENSION / aspectRatio;
    } else {
      renderCanvas.height = MAX_CANVAS_DIMENSION;
      renderCanvas.width = MAX_CANVAS_DIMENSION * aspectRatio;
    }
  } else {
    renderCanvas.width = canvas.width;
    renderCanvas.height = canvas.height;
  }

  log('MandelbrotViewer: onMounted - Canvas setup complete.');

  // Wait for the initial navigation to complete
  await router.isReady();

  log('MandelbrotViewer: onMounted - Router ready. Current hash:', route.hash);

  // Now that the router is ready, the hash is reliable.
  updateFromUrl(route.hash);
  requestRender(); // Perform the initial render

  // Watch for subsequent state changes to re-render and update URL
  watch([centerX, centerY, zoom], (newValue, oldValue) => {
    log('MandelbrotViewer: WATCH triggered. New values:', newValue);
    log('MandelbrotViewer: WATCH triggered. Old values:', oldValue);
    // Avoid re-rendering if the change came from the URL itself
    // if (newValue.every((v, i) => v === oldValue[i])) return; // Temporarily disabled for debugging
    log('MandelbrotViewer: State changed. Requesting render.', { centerX: centerX.value, centerY: centerY.value, zoom: zoom.value });
    requestRender();
    updateUrl();
  });

  // Watch for browser back/forward navigation
  watch(() => route.hash, (newHash) => {
    log('MandelbrotViewer: URL hash changed. Updating from URL.', newHash);
    updateFromUrl(newHash);
  });
});

function setupCanvasDimensions(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  log('MandelbrotViewer: Canvas dimensions set.', { width: canvas.width, height: canvas.height, dpr });
}

// --- Rendering Logic ---

function requestRender() {
  log('MandelbrotViewer: requestRender called.', { renderCanvasReady: !!renderCanvas, isRendering: isRendering.value });
  if (!renderCanvas || isRendering.value) return;

  // Do NOT reset transformations here. They will be reset after the new image is drawn.

  nextTick(() => {
    log('MandelbrotViewer: Sending render request to worker.', {
      canvasWidth: renderCanvas!.width,
      canvasHeight: renderCanvas!.height,
      centerX: centerX.value,
      centerY: centerY.value,
      zoom: zoom.value,
    });
    render({
      canvasWidth: renderCanvas!.width,
      canvasHeight: renderCanvas!.height,
      centerX: centerX.value,
      centerY: centerY.value,
      zoom: zoom.value,
    });
  });
}

watch(renderedImage, (newImage) => {
  log('MandelbrotViewer: renderedImage updated.', { newImage: !!newImage });
  if (newImage && renderCanvas) {
    const renderCtx = renderCanvas.getContext('2d');
    if (renderCtx) {
      renderCtx.putImageData(newImage, 0, 0);
      resetViewTransforms(); // Reset visual state when new image arrives
      drawRenderedToDisplay();
      log('MandelbrotViewer: Image drawn to display canvas.');
    }
  }
});

function drawRenderedToDisplay() {
  const displayCtx = displayCanvas.value?.getContext('2d');
  if (displayCtx && renderCanvas && displayCanvas.value) {
    displayCtx.clearRect(0, 0, displayCanvas.value.width, displayCanvas.value.height);
    // Draw the off-screen rendered image onto the visible canvas, scaling it to fit
    displayCtx.drawImage(
      renderCanvas,
      0, 0, renderCanvas.width, renderCanvas.height, // Source rectangle (entire renderCanvas)
      0, 0, displayCanvas.value.width, displayCanvas.value.height // Destination rectangle (entire displayCanvas)
    );
  }
}

function resetTransforms() {
  panX.value = 0;
  panY.value = 0;
  gestureZoom.value = 1;
}

function resetViewTransforms() {
  viewPanX.value = 0;
  viewPanY.value = 0;
  viewGestureZoom.value = 1;
}

// --- URL Synchronization ---

function updateUrl() {
  const hash = `#/x=${centerX.value.toFixed(10)}&y=${centerY.value.toFixed(10)}&z=${zoom.value.toExponential(2)}`;
  router.replace({ hash });
}

// --- Interaction Handlers ---

// Mouse Pan
function handleMouseDown(e: MouseEvent) {
  log('handleMouseDown: Event clientX, clientY:', e.clientX, e.clientY);
  log('handleMouseDown: Initial viewPanX, viewPanY:', viewPanX.value, viewPanY.value);
  log('handleMouseDown: Current centerX, centerY, zoom:', centerX.value, centerY.value, zoom.value);
  isPanning.value = true;
  panStartX.value = e.clientX - viewPanX.value;
  panStartY.value = e.clientY - viewPanY.value;
}

function handleMouseMove(e: MouseEvent) {
  if (!isPanning.value) return;
  viewPanX.value = e.clientX - panStartX.value;
  viewPanY.value = e.clientY - panStartY.value;
  log('handleMouseMove: Current clientX, clientY:', e.clientX, e.clientY);
  log('handleMouseMove: Updated viewPanX, viewPanY:', viewPanX.value, viewPanY.value);
}

function handleMouseUp() {
  if (!isPanning.value) return;
  isPanning.value = false;
  applyPan();
  resetTransforms(); // Reset calculation state immediately
}

// Mouse Wheel Zoom
function handleWheel(e: WheelEvent) {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 0.8 : 1.25; // Zoom in or out
  applyZoom(e.clientX, e.clientY, zoomFactor);
}

// Touch Gestures
function handleTouchStart(e: TouchEvent) {
  log('handleTouchStart: Event clientX, clientY:', e.touches[0].clientX, e.touches[0].clientY);
  log('handleTouchStart: Initial viewPanX, viewPanY:', viewPanX.value, viewPanY.value);
  log('handleTouchStart: Current centerX, centerY, zoom:', centerX.value, centerY.value, zoom.value);
  if (e.touches.length === 1) {
    isPanning.value = true;
    panStartX.value = e.touches[0].clientX - viewPanX.value;
    panStartY.value = e.touches[0].clientY - viewPanY.value;
  } else if (e.touches.length === 2) {
    isPanning.value = false; // Stop panning when two fingers are down
    initialTouchDistance = getTouchDistance(e.touches);
  }
}

function handleTouchMove(e: TouchEvent) {
  log('handleTouchMove: Event triggered.');
  e.preventDefault();
  if (e.touches.length === 1 && isPanning.value) {
    viewPanX.value = e.touches[0].clientX - panStartX.value;
    viewPanY.value = e.touches[0].clientY - panStartY.value;
    // Update panX and panY for calculation
    panX.value = viewPanX.value;
    panY.value = viewPanY.value;
    log('handleTouchMove: Current clientX, clientY:', e.touches[0].clientX, e.touches[0].clientY);
    log('handleTouchMove: Updated viewPanX, viewPanY:', viewPanX.value, viewPanY.value);
  } else if (e.touches.length === 2) {
    const newDist = getTouchDistance(e.touches);
    viewGestureZoom.value = newDist / initialTouchDistance;
    // Update gestureZoom for calculation
    gestureZoom.value = viewGestureZoom.value;
  }
}

function handleTouchEnd(e: TouchEvent) {
  log('handleTouchEnd: Event triggered.');
  if (isPanning.value) {
    isPanning.value = false;
    applyPan();
    resetTransforms(); // Reset calculation state immediately after pan
  }
  if (gestureZoom.value !== 1) {
    const rect = displayCanvas.value!.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    applyZoom(centerX, centerY, 1 / gestureZoom.value);
    resetTransforms(); // Reset calculation state immediately after zoom
  }
}

function getTouchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}


// --- Applying Transformations ---

function applyPan() {
  log('applyPan: Before calculation - panX, panY:', panX.value, panY.value);
  log('applyPan: Before calculation - centerX, centerY, zoom:', centerX.value, centerY.value, zoom.value);
  const dpr = window.devicePixelRatio || 1;
  log('applyPan: dpr:', dpr);
  // CORRECTED: Removed multiplication by dpr
  const newCenterX = centerX.value - (panX.value * zoom.value);
  const newCenterY = centerY.value - (panY.value * zoom.value);
  log('applyPan: Calculated newCenterX, newCenterY:', newCenterX, newCenterY);
  log('applyPan: Calling setView with:', { centerX: newCenterX, centerY: newCenterY, zoom: zoom.value });
  setView({ centerX: newCenterX, centerY: newCenterY, zoom: zoom.value });
}

function applyZoom(pivotX: number, pivotY: number, zoomFactor: number) {
  const dpr = window.devicePixelRatio || 1;
  const rect = displayCanvas.value!.getBoundingClientRect();

  // Mouse position in canvas coordinate system
  const mouseX = (pivotX - rect.left) * dpr;
  const mouseY = (pivotY - rect.top) * dpr;

  // Convert mouse position to complex plane coordinates
  const pointX = centerX.value + (mouseX - rect.width * dpr / 2) * zoom.value;
  const pointY = centerY.value + (mouseY - rect.height * dpr / 2) * zoom.value;

  const newZoom = zoom.value * zoomFactor;

  // New center should be the point we zoomed in on
  const newCenterX = pointX;
  const newCenterY = pointY;

  log('applyZoom: Calculated newCenterX, newCenterY, newZoom:', newCenterX, newCenterY, newZoom);
  log('applyZoom: Calling setView with:', { centerX: newCenterX, centerY: newCenterY, zoom: newZoom });
  setView({ centerX: newCenterX, centerY: newCenterY, zoom: newZoom });
}

</script>

<style scoped>
.viewer-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: grab;
}
.viewer-container:active {
  cursor: grabbing;
}
.display-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform-origin: center center;
}
.loading-indicator {
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 5px 10px;
  border-radius: 5px;
  font-family: sans-serif;
}
</style>
