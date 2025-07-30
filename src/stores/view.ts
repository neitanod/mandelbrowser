import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useViewStore = defineStore('view', () => {
  const centerX = ref(-0.5);
  const centerY = ref(0);
  const zoom = ref(4 / (window.innerWidth || 1024));

  function setView(newView: { centerX: number; centerY: number; zoom: number }) {
    centerX.value = newView.centerX;
    centerY.value = newView.centerY;
    zoom.value = newView.zoom;
  }

  function updateFromUrl(hash: string) {
    if (!hash.startsWith('#/')) return;
    // Remove the '#/` part to get a valid query string
    const params = new URLSearchParams(hash.substring(2));
    const x = parseFloat(params.get('x') || '');
    const y = parseFloat(params.get('y') || '');
    const z = parseFloat(params.get('z') || '');

    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
      setView({ centerX: x, centerY: y, zoom: z });
    }
  }

  return { centerX, centerY, zoom, setView, updateFromUrl };
});
