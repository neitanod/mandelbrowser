import { ref, computed, onMounted, type Ref } from 'vue'
import { useViewStore } from '@/stores/view'

const CM_PER_INCH = 2.54
const METERS_PER_CM = 0.01
const KM_PER_METER = 0.001
const AU_PER_KM = 1 / 149597870.7
const LIGHTYEAR_PER_KM = 1 / 9.461e12
const UNIVERSE_DIAMETERS_PER_KM = 1 / 8.8e23

// Planck length in meters
const PLANCK_LENGTH_M = 1.616255e-35

// The Mandelbrot set spans approximately 4 units (-2 to 2)
const MANDELBROT_SET_WIDTH = 4

function getDPI() {
  const div = document.createElement('div')
  div.style.width = '1in'
  document.body.appendChild(div)
  const dpi = div.offsetWidth
  document.body.removeChild(div)
  return dpi || 96 // Fallback DPI
}

export function usePhysicalSize(elementRef: Ref<HTMLElement | undefined>) {
  const viewStore = useViewStore()
  const viewportWidthCm = ref(0)

  const calculateViewportSize = () => {
    if (elementRef.value) {
      const dpi = getDPI()
      const widthPx = elementRef.value.clientWidth
      viewportWidthCm.value = (widthPx / dpi) * CM_PER_INCH
    }
  }

  onMounted(() => {
    setTimeout(calculateViewportSize, 100)
    window.addEventListener('resize', calculateViewportSize)
  })

  const formattedSize = computed(() => {
    if (viewportWidthCm.value === 0) {
      return 'Set size: calculating...'
    }

    // Calculate the "base" zoom where the full set fits in viewport
    // baseZoom = setWidth / viewportWidthPx = 4 / window.innerWidth
    const baseZoom = MANDELBROT_SET_WIDTH / window.innerWidth

    // Magnification is how much we've zoomed in from the base
    // If currentZoom < baseZoom, we're zoomed in and the set appears larger
    const magnification = baseZoom / viewStore.zoom

    // At base zoom (magnification = 1), set size = viewport size in cm
    const currentWidthCm = viewportWidthCm.value * magnification
    const currentWidthM = currentWidthCm * METERS_PER_CM
    const currentWidthKm = currentWidthM * KM_PER_METER

    if (currentWidthKm > 1) {
      const currentWidthAU = currentWidthKm * AU_PER_KM
      if (currentWidthAU > 0.1) {
        const currentWidthLY = currentWidthKm * LIGHTYEAR_PER_KM
        if (currentWidthLY > 0.1) {
          const currentWidthUniverses = currentWidthKm * UNIVERSE_DIAMETERS_PER_KM
          if (currentWidthUniverses > 0.1) {
            return `Set size: ${currentWidthUniverses.toExponential(2)} observable universes`
          }
          return `Set size: ${currentWidthLY.toExponential(2)} light-years`
        }
        return `Set size: ${currentWidthAU.toExponential(2)} AU`
      }
      return `Set size: ${currentWidthKm.toLocaleString(undefined, { maximumFractionDigits: 2 })} km`
    }

    if (currentWidthM > 1) {
      return `Set size: ${currentWidthM.toLocaleString(undefined, { maximumFractionDigits: 2 })} m`
    }

    return `Set size: ${currentWidthCm.toLocaleString(undefined, { maximumFractionDigits: 2 })} cm`
  })

  // Calculate pixel size for Planck scale display
  const pixelSizeInfo = computed(() => {
    if (viewportWidthCm.value === 0) {
      return null
    }

    // One pixel represents zoom units in the fractal
    // zoom = units per pixel in render canvas
    // But we want CSS pixels, so we need to account for render canvas scaling
    const pixelUnits = viewStore.zoom

    // At base zoom, 1 fractal unit = (viewport width cm / set width) cm
    // = viewportWidthCm / 4 cm per unit
    const cmPerUnit = viewportWidthCm.value / MANDELBROT_SET_WIDTH
    const pixelWidthCm = pixelUnits * cmPerUnit
    const pixelWidthM = pixelWidthCm * METERS_PER_CM

    // Only show if we're at or below Planck scale (approx 1e-31 zoom or smaller pixel size)
    if (pixelWidthM > PLANCK_LENGTH_M * 1000) {
      return null // Not yet at Planck scale
    }

    const planckLengths = pixelWidthM / PLANCK_LENGTH_M

    if (planckLengths >= 1) {
      return `Pixel size: ${planckLengths.toFixed(1)} Planck lengths`
    } else {
      return `Pixel size: ${planckLengths.toExponential(2)} Planck lengths`
    }
  })

  return {
    formattedSize,
    pixelSizeInfo,
  }
}
