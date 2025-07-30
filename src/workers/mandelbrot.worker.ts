import { log } from '../utils/logger';

self.onmessage = function (e) {
  log('Worker: Message received.', e.data);
  const { canvasWidth, canvasHeight, centerX, centerY, zoom } = e.data;
  const MAX_ITERATIONS = 1000;

  const imageData = new ImageData(canvasWidth, canvasHeight);
  const data = imageData.data;

  for (let x = 0; x < canvasWidth; x++) {
    for (let y = 0; y < canvasHeight; y++) {
      const cx = centerX + (x - canvasWidth / 2) * zoom;
      const cy = centerY + (y - canvasHeight / 2) * zoom;

      const iterations = calculateMandelbrot(cx, cy, MAX_ITERATIONS);

      const pixelIndex = (y * canvasWidth + x) * 4;
      const color = iterations === 0 
        ? { r: 0, g: 0, b: 0 } 
        : getColor(iterations, MAX_ITERATIONS);

      data[pixelIndex] = color.r;
      data[pixelIndex + 1] = color.g;
      data[pixelIndex + 2] = color.b;
      data[pixelIndex + 3] = 255; // Alpha
    }
  }

  log('Worker: Sending message back.');
  self.postMessage(imageData);
};

function calculateMandelbrot(cx: number, cy: number, maxIterations: number): number {
  let zx = 0;
  let zy = 0;
  let i = 0;
  while (zx * zx + zy * zy <= 4 && i < maxIterations) {
    const xtemp = zx * zx - zy * zy + cx;
    zy = 2 * zx * zy + cy;
    zx = xtemp;
    i++;
  }
  return i === maxIterations ? 0 : i;
}

function getColor(iterations: number, maxIterations: number) {
  // Define the gradient colors
  // Blue-gray (apagado)
  const startColor = { r: 70, g: 90, b: 110 }; 
  // Calm Orange (calmo)
  const endColor = { r: 255, g: 160, b: 80 }; 

  // Create a smooth, non-linear gradient
  // Using Math.log gives more color variation to points closer to the set
  let t = Math.log(iterations) / Math.log(maxIterations - 1.0);
  t = Math.min(1, Math.max(0, t)); // Clamp t to the [0, 1] range

  // Linear interpolation between the two colors
  const r = Math.round(startColor.r + t * (endColor.r - startColor.r));
  const g = Math.round(startColor.g + t * (endColor.g - startColor.g));
  const b = Math.round(startColor.b + t * (endColor.b - startColor.b));

  return { r, g, b };
}

// HSL to RGB conversion (no longer used, but kept for potential future use)
function hslToRgb(h: number, s: number, l: number) {
  let r, g, b;
  if (s == 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}
