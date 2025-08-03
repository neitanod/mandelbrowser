import { ref, computed, onMounted, type Ref } from 'vue'
import { useViewStore } from '@/stores/view'

const CM_PER_INCH = 2.54
const METERS_PER_CM = 0.01
const KM_PER_METER = 0.001
const AU_PER_KM = 1 / 149597870.7
const LIGHTYEAR_PER_KM = 1 / 9.461e12
const UNIVERSE_DIAMETERS_PER_KM = 1 / 8.8e23

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
  const initialWidthCm = ref(0)

  const calculateInitialSize = () => {
    if (elementRef.value) {
      const dpi = getDPI()
      const widthPx = elementRef.value.clientWidth
      initialWidthCm.value = (widthPx / dpi) * CM_PER_INCH
    }
  }

  onMounted(() => {
    // Ensure the element is mounted and rendered
    setTimeout(calculateInitialSize, 100)
    window.addEventListener('resize', calculateInitialSize)
  })

  const formattedSize = computed(() => {
    if (initialWidthCm.value === 0) {
      return 'Set size: calculating...'
    }

    // The "magnification" is the inverse of the zoom level in the store
    const magnification = 1 / viewStore.zoom
    const currentWidthCm = initialWidthCm.value * magnification
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

  return {
    formattedSize,
  }
}
