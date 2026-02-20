import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import Decimal from 'decimal.js';

// Configure Decimal for high precision
Decimal.set({ precision: 50 });

export const useViewStore = defineStore('view', () => {
  // Store coordinates as Decimal strings for precision
  const centerXStr = ref('-0.5');
  const centerYStr = ref('0');
  const zoomStr = ref(new Decimal(4).div(window.innerWidth || 1024).toString());

  // Computed getters that return Decimal objects
  const centerXDecimal = computed(() => new Decimal(centerXStr.value));
  const centerYDecimal = computed(() => new Decimal(centerYStr.value));
  const zoomDecimal = computed(() => new Decimal(zoomStr.value));

  // Number getters for compatibility with worker (which uses native doubles)
  const centerX = computed(() => centerXDecimal.value.toNumber());
  const centerY = computed(() => centerYDecimal.value.toNumber());
  const zoom = computed(() => zoomDecimal.value.toNumber());

  // Low components for double-double precision rendering
  // lo = fullValue - hi (the residual that doesn't fit in a double)
  const centerXLo = computed(() => {
    const hi = centerX.value;
    // Subtract hi from the full precision value to get the residual
    return centerXDecimal.value.minus(hi).toNumber();
  });
  const centerYLo = computed(() => {
    const hi = centerY.value;
    return centerYDecimal.value.minus(hi).toNumber();
  });

  // Quad-double components for ultra-deep zoom (e-31 and beyond)
  // Split the Decimal into 4 double components: hi, lo, lo2, lo3
  const centerX2 = computed(() => {
    const hi = centerX.value;
    const lo = centerXLo.value;
    // What remains after subtracting hi and lo
    return centerXDecimal.value.minus(hi).minus(lo).toNumber();
  });
  const centerX3 = computed(() => {
    const hi = centerX.value;
    const lo = centerXLo.value;
    const lo2 = centerX2.value;
    return centerXDecimal.value.minus(hi).minus(lo).minus(lo2).toNumber();
  });
  const centerY2 = computed(() => {
    const hi = centerY.value;
    const lo = centerYLo.value;
    return centerYDecimal.value.minus(hi).minus(lo).toNumber();
  });
  const centerY3 = computed(() => {
    const hi = centerY.value;
    const lo = centerYLo.value;
    const lo2 = centerY2.value;
    return centerYDecimal.value.minus(hi).minus(lo).minus(lo2).toNumber();
  });

  function setView(newView: { centerX: Decimal; centerY: Decimal; zoom: Decimal }) {
    centerXStr.value = newView.centerX.toString();
    centerYStr.value = newView.centerY.toString();
    zoomStr.value = newView.zoom.toString();
  }

  // Convenience method for setting from numbers (less precise, for simple cases)
  function setViewFromNumbers(newView: { centerX: number; centerY: number; zoom: number }) {
    centerXStr.value = new Decimal(newView.centerX).toString();
    centerYStr.value = new Decimal(newView.centerY).toString();
    zoomStr.value = new Decimal(newView.zoom).toString();
  }

  function updateFromUrl(hash: string) {
    if (!hash.startsWith('#/')) return;
    const params = new URLSearchParams(hash.substring(2));
    const x = params.get('x');
    const y = params.get('y');
    const z = params.get('z');

    if (x && y && z) {
      try {
        // Parse directly as Decimal to preserve precision from URL
        setView({
          centerX: new Decimal(x),
          centerY: new Decimal(y),
          zoom: new Decimal(z),
        });
      } catch {
        // Invalid decimal strings, ignore
      }
    }
  }

  return {
    centerX,
    centerY,
    zoom,
    centerXLo,
    centerYLo,
    // Quad-double components
    centerX2,
    centerX3,
    centerY2,
    centerY3,
    centerXDecimal,
    centerYDecimal,
    zoomDecimal,
    // Expose strings for watchers (changes even when toNumber() doesn't)
    centerXStr,
    centerYStr,
    zoomStr,
    setView,
    setViewFromNumbers,
    updateFromUrl,
  };
});
