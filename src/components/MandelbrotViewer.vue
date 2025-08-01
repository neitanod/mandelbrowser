<template>
  <div
    class="viewer-container"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseUp"
    @wheel="handleWheel"
    @touchstart.prevent="handleTouchStart"
    @touchmove.prevent="handleTouchMove"
    @touchend.prevent="handleTouchEnd"
  >
    <canvas
      ref="displayCanvas"
      class="display-canvas"
      :style="{ transform: `translate(${viewPanX}px, ${viewPanY}px) scale(${viewGestureZoom})`, 'transform-origin': viewTransformOrigin }"
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

// --- State Management ---
const viewStore = useViewStore();
const { centerX, centerY, zoom } = storeToRefs(viewStore);
const { setView, updateFromUrl } = viewStore;
const router = useRouter();
const route = useRoute();

// --- Worker Communication ---
const { isRendering, renderedImage, render } = useMandelbrotWorker();

// --- Canvas Elements ---
const displayCanvas = ref<HTMLCanvasElement | null>(null);
let renderCanvas: HTMLCanvasElement | null = null;

// --- Gesture State ---
const isPointerDown = ref(false);
const panStart = ref({ x: 0, y: 0 });
const touchState = ref<{
  initialDistance: number;
  initialPivot: { x: number; y: number };
  initialCenterX: number;
  initialCenterY: number;
  initialZoom: number;
} | null>(null);

// --- Visual Preview State (CSS Transforms) ---
const viewPanX = ref(0);
const viewPanY = ref(0);
const viewGestureZoom = ref(1);
const viewTransformOrigin = ref('center center');

// --- Constants ---
const MAX_CANVAS_DIMENSION = 800;

// --- Lifecycle Hooks ---
onMounted(async () => {
  const canvas = displayCanvas.value;
  if (!canvas) return;

  setupCanvasDimensions(canvas);
  setupRenderCanvas(canvas);

  await router.isReady();
  updateFromUrl(route.hash);
});

// --- Watchers (The Single Source of Truth for Rendering) ---
watch([centerX, centerY, zoom], () => {
  requestRender();
  updateUrl();
});

watch(() => route.hash, (newHash) => {
  // Avoid updating from URL if a gesture just finished, as it will be redundant.
  if (!isPointerDown.value) {
    updateFromUrl(newHash);
  }
});

watch(renderedImage, (newImage) => {
  if (newImage && renderCanvas) {
    const renderCtx = renderCanvas.getContext('2d');
    if (renderCtx) {
      renderCtx.putImageData(newImage, 0, 0);
      resetViewTransforms();
      drawRenderedToDisplay();
    }
  }
});

// --- Setup Functions ---
function setupCanvasDimensions(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}

function setupRenderCanvas(canvas: HTMLCanvasElement) {
  renderCanvas = document.createElement('canvas');
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
}

// --- Rendering Functions ---
function requestRender() {
  if (!renderCanvas) return;
  // The isRendering flag in the worker prevents multiple renders from running in parallel.
  // The renderId system ensures only the latest result is used.
  nextTick(() => {
    render({
      canvasWidth: renderCanvas!.width,
      canvasHeight: renderCanvas!.height,
      centerX: centerX.value,
      centerY: centerY.value,
      zoom: zoom.value,
    });
  });
}

function drawRenderedToDisplay() {
  const displayCtx = displayCanvas.value?.getContext('2d');
  if (displayCtx && renderCanvas && displayCanvas.value) {
    displayCtx.clearRect(0, 0, displayCanvas.value.width, displayCanvas.value.height);
    displayCtx.drawImage(renderCanvas, 0, 0, renderCanvas.width, renderCanvas.height, 0, 0, displayCanvas.value.width, displayCanvas.value.height);
  }
}

function resetViewTransforms() {
  viewPanX.value = 0;
  viewPanY.value = 0;
  viewGestureZoom.value = 1;
  viewTransformOrigin.value = 'center center';
}

// --- URL Synchronization ---
function updateUrl() {
  const hash = `#/x=${centerX.value.toFixed(10)}&y=${centerY.value.toFixed(10)}&z=${zoom.value.toExponential(2)}`;
  router.replace({ hash });
}

// --- Interaction Handlers ---

function handleMouseDown(e: MouseEvent) {
  isPointerDown.value = true;
  panStart.value = { x: e.clientX, y: e.clientY };
}

function handleMouseMove(e: MouseEvent) {
  if (!isPointerDown.value || e.buttons !== 1) return;
  viewPanX.value = e.clientX - panStart.value.x;
  viewPanY.value = e.clientY - panStart.value.y;
}

function handleMouseUp() {
  if (!isPointerDown.value) return;
  isPointerDown.value = false;

  if (viewPanX.value !== 0 || viewPanY.value !== 0) {
    const newCenterX = centerX.value - (viewPanX.value * zoom.value);
    const newCenterY = centerY.value - (viewPanY.value * zoom.value);
    setView({ centerX: newCenterX, centerY: newCenterY, zoom: zoom.value });
  }
}

function handleWheel(e: WheelEvent) {
  const zoomFactor = e.deltaY < 0 ? 0.8 : 1.25;
  const dpr = window.devicePixelRatio || 1;
  const rect = displayCanvas.value!.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left) * dpr;
  const mouseY = (e.clientY - rect.top) * dpr;

  const pointX = centerX.value + (mouseX - rect.width * dpr / 2) * zoom.value;
  const pointY = centerY.value + (mouseY - rect.height * dpr / 2) * zoom.value;

  const newZoom = zoom.value * zoomFactor;
  const newCenterX = pointX + (centerX.value - pointX) * zoomFactor;
  const newCenterY = pointY + (centerY.value - pointY) * zoomFactor;

  setView({ centerX: newCenterX, centerY: newCenterY, zoom: newZoom });
}

function handleTouchStart(e: TouchEvent) {
  isPointerDown.value = true;
  if (e.touches.length === 1) {
    panStart.value = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  } else if (e.touches.length === 2) {
    const initialPivot = getTouchMidpoint(e.touches);
    touchState.value = {
      initialDistance: getTouchDistance(e.touches),
      initialPivot: initialPivot,
      initialCenterX: centerX.value,
      initialCenterY: centerY.value,
      initialZoom: zoom.value,
    };

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    viewTransformOrigin.value = `${initialPivot.x - rect.left}px ${initialPivot.y - rect.top}px`;
  }
}

function handleTouchMove(e: TouchEvent) {
  if (!isPointerDown.value) return;

  if (e.touches.length === 1) {
    viewPanX.value = e.touches[0].clientX - panStart.value.x;
    viewPanY.value = e.touches[0].clientY - panStart.value.y;
  } else if (e.touches.length === 2 && touchState.value) {
    const currentDist = getTouchDistance(e.touches);
    if (touchState.value.initialDistance > 0) {
      viewGestureZoom.value = currentDist / touchState.value.initialDistance;
    }
    const currentPivot = getTouchMidpoint(e.touches);
    viewPanX.value = currentPivot.x - touchState.value.initialPivot.x;
    viewPanY.value = currentPivot.y - touchState.value.initialPivot.y;
  }
}

function handleTouchEnd(e: TouchEvent) {
  if (!isPointerDown.value) return;
  isPointerDown.value = false;

  if (touchState.value) { // It was a 2-finger gesture
    const { initialCenterX, initialCenterY, initialZoom } = touchState.value;
    const scale = viewGestureZoom.value;

    const rect = displayCanvas.value!.getBoundingClientRect();
    const viewportCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const relativeX = (viewportCenter.x - rect.left) / rect.width;
    const relativeY = (viewportCenter.y - rect.top) / rect.height;

    const fractalWidth = renderCanvas!.width * initialZoom;
    const fractalHeight = renderCanvas!.height * initialZoom;

    const finalCenterX = initialCenterX - (fractalWidth / 2) + (relativeX * fractalWidth);
    const finalCenterY = initialCenterY - (fractalHeight / 2) + (relativeY * fractalHeight);
    const finalZoom = initialZoom / scale;

    setView({ centerX: finalCenterX, centerY: finalCenterY, zoom: finalZoom });

  } else { // It was a 1-finger pan
    if (viewPanX.value !== 0 || viewPanY.value !== 0) {
      const newCenterX = centerX.value - (viewPanX.value * zoom.value);
      const newCenterY = centerY.value - (viewPanY.value * zoom.value);
      setView({ centerX: newCenterX, centerY: newCenterY, zoom: zoom.value });
    }
  }
  touchState.value = null;
}

function getTouchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchMidpoint(touches: TouchList): { x: number; y: number } {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
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
