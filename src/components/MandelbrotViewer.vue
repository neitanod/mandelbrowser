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
    <div class="size-indicator">
      <div>{{ formattedSize }}</div>
      <div v-if="pixelSizeInfo">{{ pixelSizeInfo }}</div>
      <div v-if="useGPU" class="gpu-badge">GPU</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import { useHybridRenderer } from '../composables/useHybridRenderer';
import { usePhysicalSize } from '../composables/usePhysicalSize';
import { useViewStore } from '../stores/view';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { log } from '../utils/logger';
import { calculateNewView, type FractalView, type RenderCanvasInfo, type ViewportInfo } from '../logic/viewUtils';
import Decimal from 'decimal.js';

// --- State Management ---
const viewStore = useViewStore();
const { centerX, centerY, zoom, centerXLo, centerYLo, centerX2, centerX3, centerY2, centerY3, centerXDecimal, centerYDecimal, zoomDecimal, centerXStr, centerYStr, zoomStr } = storeToRefs(viewStore);
const { setView, updateFromUrl } = viewStore;
const router = useRouter();
const route = useRoute();

// --- Canvas Elements ---
const displayCanvas = ref<HTMLCanvasElement | undefined>(undefined);
let renderWidth = 0;
let renderHeight = 0;

// --- Physical Size Calculation ---
const { formattedSize, pixelSizeInfo } = usePhysicalSize(displayCanvas);

// --- Hybrid Renderer (GPU with CPU fallback) ---
const { isRendering, useGPU, init, resize, render, setOnRenderComplete } = useHybridRenderer();

// --- Gesture State ---
const isPointerDown = ref(false);
const panStart = ref({ x: 0, y: 0 });
const touchState = ref<{
  initialDistance: number;
  initialPivot: { x: number; y: number };
  initialCenterX: Decimal;
  initialCenterY: Decimal;
  initialZoom: Decimal;
} | null>(null);

// --- Visual Preview State (CSS Transforms) ---
const viewPanX = ref(0);
const viewPanY = ref(0);
const viewGestureZoom = ref(1);
const viewTransformOrigin = ref('center center');

// --- Constants ---
const getMaxCanvasDimension = (): number => {
  const dpr = window.devicePixelRatio || 1;
  const screenSize = Math.max(window.screen.width, window.screen.height);

  if (screenSize <= 768) {
    return 600;
  }
  if (screenSize <= 1024) {
    return 800;
  }
  if (dpr >= 2) {
    return 1200;
  }
  return 1000;
};

const MAX_CANVAS_DIMENSION = getMaxCanvasDimension();

// --- Lifecycle Hooks ---
onMounted(async () => {
  const canvas = displayCanvas.value;
  if (!canvas) return;

  setupCanvasDimensions(canvas);
  calculateRenderDimensions(canvas);

  // Initialize hybrid renderer with calculated dimensions
  const { gpuSupported } = init(renderWidth, renderHeight);
  log('Renderer initialized. GPU:', gpuSupported);

  // Set callback for when render completes
  setOnRenderComplete((sourceCanvas: HTMLCanvasElement) => {
    resetViewTransforms();
    drawToDisplay(sourceCanvas);
  });

  await router.isReady();
  updateFromUrl(route.hash);
  requestRender();
});

// --- Watchers ---
watch([centerXStr, centerYStr, zoomStr], () => {
  requestRender();
  updateUrl();
});

watch(() => route.hash, (newHash) => {
  if (!isPointerDown.value) {
    updateFromUrl(newHash);
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

function calculateRenderDimensions(canvas: HTMLCanvasElement) {
  const aspectRatio = canvas.width / canvas.height;
  if (canvas.width > MAX_CANVAS_DIMENSION || canvas.height > MAX_CANVAS_DIMENSION) {
    if (canvas.width > canvas.height) {
      renderWidth = MAX_CANVAS_DIMENSION;
      renderHeight = Math.floor(MAX_CANVAS_DIMENSION / aspectRatio);
    } else {
      renderHeight = MAX_CANVAS_DIMENSION;
      renderWidth = Math.floor(MAX_CANVAS_DIMENSION * aspectRatio);
    }
  } else {
    renderWidth = canvas.width;
    renderHeight = canvas.height;
  }
}

// --- Rendering Functions ---
function requestRender() {
  if (renderWidth === 0 || renderHeight === 0) return;

  nextTick(() => {
    render({
      width: renderWidth,
      height: renderHeight,
      centerXDecimal: centerXDecimal.value,
      centerYDecimal: centerYDecimal.value,
      centerX: centerX.value,
      centerY: centerY.value,
      zoom: zoom.value,
      centerXLo: centerXLo.value,
      centerYLo: centerYLo.value,
      centerX2: centerX2.value,
      centerX3: centerX3.value,
      centerY2: centerY2.value,
      centerY3: centerY3.value,
    });
  });
}

function drawToDisplay(sourceCanvas: HTMLCanvasElement) {
  const displayCtx = displayCanvas.value?.getContext('2d');
  if (displayCtx && displayCanvas.value) {
    displayCtx.clearRect(0, 0, displayCanvas.value.width, displayCanvas.value.height);
    displayCtx.drawImage(
      sourceCanvas,
      0, 0, sourceCanvas.width, sourceCanvas.height,
      0, 0, displayCanvas.value.width, displayCanvas.value.height
    );
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
  const hash = `#/x=${centerXDecimal.value.toString()}&y=${centerYDecimal.value.toString()}&z=${zoomDecimal.value.toExponential(10)}`;
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

  if ((viewPanX.value !== 0 || viewPanY.value !== 0) && renderWidth > 0) {
    const scaleX = new Decimal(renderWidth).div(window.innerWidth);
    const scaleY = new Decimal(renderHeight).div(window.innerHeight);
    const deltaX = scaleX.mul(viewPanX.value).mul(zoomDecimal.value);
    const deltaY = scaleY.mul(viewPanY.value).mul(zoomDecimal.value);
    const newCenterX = centerXDecimal.value.minus(deltaX);
    const newCenterY = centerYDecimal.value.minus(deltaY);
    setView({ centerX: newCenterX, centerY: newCenterY, zoom: zoomDecimal.value });
  }
}

function handleWheel(e: WheelEvent) {
  if (renderWidth === 0) return;
  const zoomFactor = new Decimal(e.deltaY < 0 ? 0.8 : 1.25);
  const rect = displayCanvas.value!.getBoundingClientRect();

  const offsetCssX = e.clientX - rect.left - rect.width / 2;
  const offsetCssY = e.clientY - rect.top - rect.height / 2;

  const scaleX = new Decimal(renderWidth).div(rect.width);
  const scaleY = new Decimal(renderHeight).div(rect.height);
  const offsetRenderX = scaleX.mul(offsetCssX);
  const offsetRenderY = scaleY.mul(offsetCssY);

  const oneMinusZoomFactor = new Decimal(1).minus(zoomFactor);
  const newZoom = zoomDecimal.value.mul(zoomFactor);
  const newCenterX = centerXDecimal.value.plus(offsetRenderX.mul(zoomDecimal.value).mul(oneMinusZoomFactor));
  const newCenterY = centerYDecimal.value.plus(offsetRenderY.mul(zoomDecimal.value).mul(oneMinusZoomFactor));

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
      initialCenterX: centerXDecimal.value,
      initialCenterY: centerYDecimal.value,
      initialZoom: zoomDecimal.value,
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

function handleTouchEnd() {
  if (!isPointerDown.value || !displayCanvas.value || renderWidth === 0) return;
  isPointerDown.value = false;

  // Two-finger pinch-zoom gesture
  if (touchState.value) {
    const initialView: FractalView = {
      centerX: touchState.value.initialCenterX,
      centerY: touchState.value.initialCenterY,
      zoom: touchState.value.initialZoom,
    };

    const finalDisplayCanvasRect = displayCanvas.value.getBoundingClientRect();

    const renderCanvasInfo: RenderCanvasInfo = {
      width: renderWidth,
      height: renderHeight,
    };

    const viewportInfo: ViewportInfo = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const newView = calculateNewView(
      initialView,
      finalDisplayCanvasRect,
      renderCanvasInfo,
      viewportInfo
    );

    setView(newView);
    touchState.value = null;
  } else {
    // Single-finger pan - use same logic as mouse drag
    if (viewPanX.value !== 0 || viewPanY.value !== 0) {
      const scaleX = new Decimal(renderWidth).div(window.innerWidth);
      const scaleY = new Decimal(renderHeight).div(window.innerHeight);
      const deltaX = scaleX.mul(viewPanX.value).mul(zoomDecimal.value);
      const deltaY = scaleY.mul(viewPanY.value).mul(zoomDecimal.value);
      const newCenterX = centerXDecimal.value.minus(deltaX);
      const newCenterY = centerYDecimal.value.minus(deltaY);
      setView({ centerX: newCenterX, centerY: newCenterY, zoom: zoomDecimal.value });
    }
  }
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
.size-indicator {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 5px 10px;
  border-radius: 5px;
  font-family: sans-serif;
  white-space: nowrap;
}
.gpu-badge {
  display: inline-block;
  background-color: #4CAF50;
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.8em;
  margin-top: 4px;
}
</style>
