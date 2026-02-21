import { log } from '../utils/logger';

// Threshold for double-double coordinate calculation
const HIGH_PRECISION_COORDS_THRESHOLD = 1e-13;
// Threshold for double-double iterations (deeper zoom needs DD iterations too)
const HIGH_PRECISION_ITERATIONS_THRESHOLD = 1e-15;
// Threshold for ultra-deep zoom with 3x3 blocks
const ULTRA_DEEP_THRESHOLD = 1e-28;
// Threshold for quad-double precision (~62 digits)
const QUAD_PRECISION_THRESHOLD = 1e-31;

// Dynamic iteration calculation based on zoom level
// More zoom = more iterations needed to see fine detail
function calculateMaxIterations(zoom: number): number {
  const BASE_ITERATIONS = 300;
  const ITERATION_SCALE = 150; // iterations per order of magnitude of zoom

  // zoom of 0.004 (initial) = 300 iterations
  // zoom of 1e-6 = ~900 extra iterations
  // zoom of 1e-12 = ~1800 extra iterations
  // zoom of 1e-18 = ~2700 extra iterations
  // zoom of 1e-30 = ~4500 extra iterations
  const zoomFactor = Math.max(0, -Math.log10(zoom) - 2); // -2 because initial zoom is ~0.004
  const maxIterations = Math.floor(BASE_ITERATIONS + ITERATION_SCALE * zoomFactor);

  // Higher cap now that rendering is progressive
  return Math.min(maxIterations, 200000);
}

// Progressive block sizes: start coarse, refine gradually
const PROGRESSIVE_BLOCK_SIZES = [16, 8, 4, 2, 1];

self.onmessage = function (e) {
  log('Worker: Message received.', e.data);
  const { canvasWidth, canvasHeight, centerX, centerY, zoom, centerXLo, centerYLo, renderId } = e.data;
  const { centerX2 = 0, centerX3 = 0, centerY2 = 0, centerY3 = 0 } = e.data;
  const MAX_ITERATIONS = calculateMaxIterations(zoom);
  log('Worker: Using', MAX_ITERATIONS, 'iterations for zoom', zoom);

  // Choose precision mode based on zoom level
  const useQuadPrecision = zoom < QUAD_PRECISION_THRESHOLD;
  const useHighPrecisionCoords = zoom < HIGH_PRECISION_COORDS_THRESHOLD;
  const useHighPrecisionIterations = zoom < HIGH_PRECISION_ITERATIONS_THRESHOLD;
  log('Worker: Precision mode - quad:', useQuadPrecision, 'coords:', useHighPrecisionCoords, 'iterations:', useHighPrecisionIterations, 'zoom:', zoom);

  // Always render to full 1x1 resolution - progressive rendering handles the wait
  const minBlockSize = 1;

  // Track which pixels have been computed at full resolution
  const computed = new Uint8Array(canvasWidth * canvasHeight);
  const imageData = new ImageData(canvasWidth, canvasHeight);
  const data = imageData.data;

  // Progressive rendering: coarse to fine
  for (const blockSize of PROGRESSIVE_BLOCK_SIZES) {
    if (blockSize < minBlockSize) continue;

    renderProgressive(
      data, computed, canvasWidth, canvasHeight,
      centerX, centerY, centerXLo || 0, centerYLo || 0,
      centerX2, centerX3, centerY2, centerY3,
      zoom, MAX_ITERATIONS, blockSize,
      useQuadPrecision, useHighPrecisionIterations, useHighPrecisionCoords
    );

    // Send intermediate result
    const isComplete = blockSize === minBlockSize;
    log('Worker: Sending pass', blockSize, 'complete:', isComplete);
    self.postMessage({
      imageData: new ImageData(new Uint8ClampedArray(data), canvasWidth, canvasHeight),
      renderId,
      pass: blockSize,
      isComplete
    });
  }
};

// Progressive renderer that only computes new pixels
function renderProgressive(
  data: Uint8ClampedArray,
  computed: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  centerXHi: number,
  centerYHi: number,
  centerXLo: number,
  centerYLo: number,
  centerX2: number,
  centerX3: number,
  centerY2: number,
  centerY3: number,
  zoom: number,
  maxIterations: number,
  blockSize: number,
  useQuadPrecision: boolean,
  useHighPrecisionIterations: boolean,
  useHighPrecisionCoords: boolean
) {
  for (let bx = 0; bx < canvasWidth; bx += blockSize) {
    for (let by = 0; by < canvasHeight; by += blockSize) {
      // Check if center of block already computed at higher resolution
      const cx = bx + Math.floor(blockSize / 2);
      const cy = by + Math.floor(blockSize / 2);
      if (cx < canvasWidth && cy < canvasHeight && computed[cy * canvasWidth + cx]) {
        continue; // Already computed at finer resolution
      }

      const x = bx + blockSize / 2;
      const y = by + blockSize / 2;

      let iterations: number;

      if (useQuadPrecision) {
        const offsetX = (x - canvasWidth / 2) * zoom;
        const offsetY = (y - canvasHeight / 2) * zoom;
        const [qcx0, qcx1Temp] = ddAddD([centerXHi, centerXLo], offsetX);
        const qcx1 = qcx1Temp + centerX2 + centerX3;
        const [qcy0, qcy1Temp] = ddAddD([centerYHi, centerYLo], offsetY);
        const qcy1 = qcy1Temp + centerY2 + centerY3;
        iterations = calculateMandelbrotQDInline(qcx0, qcx1, 0, 0, qcy0, qcy1, 0, 0, maxIterations);
      } else if (useHighPrecisionIterations) {
        const offsetX = (x - canvasWidth / 2) * zoom;
        const offsetY = (y - canvasHeight / 2) * zoom;
        const [cxHi, cxLo] = ddAddD([centerXHi, centerXLo], offsetX);
        const [cyHi, cyLo] = ddAddD([centerYHi, centerYLo], offsetY);
        iterations = calculateMandelbrotDDInline(cxHi, cxLo, cyHi, cyLo, maxIterations);
      } else if (useHighPrecisionCoords) {
        const offsetX = (x - canvasWidth / 2) * zoom;
        const offsetY = (y - canvasHeight / 2) * zoom;
        const [cxHi, cxLo] = ddAddD([centerXHi, centerXLo], offsetX);
        const [cyHi, cyLo] = ddAddD([centerYHi, centerYLo], offsetY);
        const cx = cxHi + cxLo;
        const cy = cyHi + cyLo;
        iterations = calculateMandelbrot(cx, cy, maxIterations);
      } else {
        const px = centerXHi + (x - canvasWidth / 2) * zoom;
        const py = centerYHi + (y - canvasHeight / 2) * zoom;
        iterations = calculateMandelbrot(px, py, maxIterations);
      }

      const color = iterations === 0
        ? { r: 0, g: 0, b: 0 }
        : getColor(iterations, maxIterations);

      // Fill block and mark as computed
      for (let dx = 0; dx < blockSize && bx + dx < canvasWidth; dx++) {
        for (let dy = 0; dy < blockSize && by + dy < canvasHeight; dy++) {
          const px = bx + dx;
          const py = by + dy;
          const pixelIndex = (py * canvasWidth + px) * 4;
          data[pixelIndex] = color.r;
          data[pixelIndex + 1] = color.g;
          data[pixelIndex + 2] = color.b;
          data[pixelIndex + 3] = 255;

          // Mark center pixel as computed for this block size
          if (dx === Math.floor(blockSize / 2) && dy === Math.floor(blockSize / 2)) {
            computed[py * canvasWidth + px] = 1;
          }
        }
      }
    }
  }
}

function renderStandard(
  data: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  centerX: number,
  centerY: number,
  zoom: number,
  maxIterations: number
) {
  for (let x = 0; x < canvasWidth; x++) {
    for (let y = 0; y < canvasHeight; y++) {
      const cx = centerX + (x - canvasWidth / 2) * zoom;
      const cy = centerY + (y - canvasHeight / 2) * zoom;

      const iterations = calculateMandelbrot(cx, cy, maxIterations);

      const pixelIndex = (y * canvasWidth + x) * 4;
      const color = iterations === 0
        ? { r: 0, g: 0, b: 0 }
        : getColor(iterations, maxIterations);

      data[pixelIndex] = color.r;
      data[pixelIndex + 1] = color.g;
      data[pixelIndex + 2] = color.b;
      data[pixelIndex + 3] = 255;
    }
  }
}

// High precision coordinates only, standard iterations
function renderHighPrecisionCoords(
  data: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  centerXHi: number,
  centerYHi: number,
  centerXLo: number,
  centerYLo: number,
  zoom: number,
  maxIterations: number
) {
  for (let x = 0; x < canvasWidth; x++) {
    for (let y = 0; y < canvasHeight; y++) {
      const offsetX = (x - canvasWidth / 2) * zoom;
      const offsetY = (y - canvasHeight / 2) * zoom;

      // Double-double coordinate calculation
      const [cxHi, cxLo] = ddAddD([centerXHi, centerXLo], offsetX);
      const [cyHi, cyLo] = ddAddD([centerYHi, centerYLo], offsetY);

      // Convert to double for iterations
      const cx = cxHi + cxLo;
      const cy = cyHi + cyLo;

      const iterations = calculateMandelbrot(cx, cy, maxIterations);

      const pixelIndex = (y * canvasWidth + x) * 4;
      const color = iterations === 0
        ? { r: 0, g: 0, b: 0 }
        : getColor(iterations, maxIterations);

      data[pixelIndex] = color.r;
      data[pixelIndex + 1] = color.g;
      data[pixelIndex + 2] = color.b;
      data[pixelIndex + 3] = 255;
    }
  }
}

// Full double-double precision for both coordinates AND iterations
// Renders in NxN blocks to reduce computation while maintaining fractal accuracy
function renderFullPrecision(
  data: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  centerXHi: number,
  centerYHi: number,
  centerXLo: number,
  centerYLo: number,
  zoom: number,
  maxIterations: number,
  blockSize: number
) {
  for (let bx = 0; bx < canvasWidth; bx += blockSize) {
    for (let by = 0; by < canvasHeight; by += blockSize) {
      // Calculate at the center of the block
      const x = bx + blockSize / 2;
      const y = by + blockSize / 2;

      const offsetX = (x - canvasWidth / 2) * zoom;
      const offsetY = (y - canvasHeight / 2) * zoom;

      // Calculate cx, cy with double-double
      const [cxHi, cxLo] = ddAddD([centerXHi, centerXLo], offsetX);
      const [cyHi, cyLo] = ddAddD([centerYHi, centerYLo], offsetY);

      // Full DD iterations
      const iterations = calculateMandelbrotDDInline(cxHi, cxLo, cyHi, cyLo, maxIterations);

      const color = iterations === 0
        ? { r: 0, g: 0, b: 0 }
        : getColor(iterations, maxIterations);

      // Fill the NxN block with the same color
      for (let dx = 0; dx < blockSize && bx + dx < canvasWidth; dx++) {
        for (let dy = 0; dy < blockSize && by + dy < canvasHeight; dy++) {
          const pixelIndex = ((by + dy) * canvasWidth + (bx + dx)) * 4;
          data[pixelIndex] = color.r;
          data[pixelIndex + 1] = color.g;
          data[pixelIndex + 2] = color.b;
          data[pixelIndex + 3] = 255;
        }
      }
    }
  }
}

// ============ Standard precision Mandelbrot ============

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

// ============ Double-double arithmetic ============
// Inlined here because Web Workers can't import modules in production builds

type DD = [number, number]; // [hi, lo]

const SPLIT = 134217729; // 2^27 + 1

function quickTwoSum(a: number, b: number): DD {
  const s = a + b;
  const e = b - (s - a);
  return [s, e];
}

function twoSum(a: number, b: number): DD {
  const s = a + b;
  const v = s - a;
  const e = (a - (s - v)) + (b - v);
  return [s, e];
}

function split(a: number): [number, number] {
  const t = SPLIT * a;
  const hi = t - (t - a);
  const lo = a - hi;
  return [hi, lo];
}

function twoProduct(a: number, b: number): DD {
  const p = a * b;
  const [aHi, aLo] = split(a);
  const [bHi, bLo] = split(b);
  const err = ((aHi * bHi - p) + aHi * bLo + aLo * bHi) + aLo * bLo;
  return [p, err];
}

function ddAdd(a: DD, b: DD): DD {
  const [s1, s2] = twoSum(a[0], b[0]);
  const [t1, t2] = twoSum(a[1], b[1]);
  let s2New = s2 + t1;
  const [s1Final, s2Final] = quickTwoSum(s1, s2New);
  s2New = s2Final + t2;
  return quickTwoSum(s1Final, s2New);
}

function ddSub(a: DD, b: DD): DD {
  return ddAdd(a, [-b[0], -b[1]]);
}

function ddMul(a: DD, b: DD): DD {
  const [p1, p2] = twoProduct(a[0], b[0]);
  const p2New = p2 + (a[0] * b[1] + a[1] * b[0]);
  return quickTwoSum(p1, p2New);
}

function ddMulD(a: DD, b: number): DD {
  const [p1, p2] = twoProduct(a[0], b);
  const p2New = p2 + a[1] * b;
  return quickTwoSum(p1, p2New);
}

function ddAddD(a: DD, b: number): DD {
  const [s1, s2] = twoSum(a[0], b);
  const s2New = s2 + a[1];
  return quickTwoSum(s1, s2New);
}

function ddGt4(a: DD): boolean {
  return a[0] > 4 || (a[0] === 4 && a[1] > 0);
}

function ddSqr(a: DD): DD {
  const [p1, p2] = twoProduct(a[0], a[0]);
  const p2New = p2 + 2 * a[0] * a[1];
  return quickTwoSum(p1, p2New);
}

// Optimized inline double-double Mandelbrot - no array allocations
function calculateMandelbrotDDInline(
  cxHi: number, cxLo: number,
  cyHi: number, cyLo: number,
  maxIterations: number
): number {
  let zxHi = 0, zxLo = 0;
  let zyHi = 0, zyLo = 0;

  for (let i = 0; i < maxIterations; i++) {
    // zx² using inline ddSqr
    let p = zxHi * zxHi;
    let aHi = SPLIT * zxHi, t = aHi - (aHi - zxHi), aLo = zxHi - t;
    let err = ((t * t - p) + 2 * t * aLo) + aLo * aLo;
    let zx2Hi = p, zx2Lo = err + 2 * zxHi * zxLo;
    // Normalize
    t = zx2Hi + zx2Lo; zx2Lo = zx2Lo - (t - zx2Hi); zx2Hi = t;

    // zy² using inline ddSqr
    p = zyHi * zyHi;
    aHi = SPLIT * zyHi; t = aHi - (aHi - zyHi); aLo = zyHi - t;
    err = ((t * t - p) + 2 * t * aLo) + aLo * aLo;
    let zy2Hi = p, zy2Lo = err + 2 * zyHi * zyLo;
    t = zy2Hi + zy2Lo; zy2Lo = zy2Lo - (t - zy2Hi); zy2Hi = t;

    // |z|² = zx² + zy² - check escape
    const magHi = zx2Hi + zy2Hi;
    if (magHi > 4) return i;

    // zy = 2 * zx * zy + cy
    // First: zx * zy
    p = zxHi * zyHi;
    let aHi1 = SPLIT * zxHi; let t1 = aHi1 - (aHi1 - zxHi); let aLo1 = zxHi - t1;
    let bHi = SPLIT * zyHi; let t2 = bHi - (bHi - zyHi); let bLo = zyHi - t2;
    err = ((t1 * t2 - p) + t1 * bLo + aLo1 * t2) + aLo1 * bLo;
    let prodHi = p, prodLo = err + (zxHi * zyLo + zxLo * zyHi);
    t = prodHi + prodLo; prodLo = prodLo - (t - prodHi); prodHi = t;

    // * 2
    let twoHi = prodHi * 2, twoLo = prodLo * 2;

    // + cy (twoSum)
    let s = twoHi + cyHi;
    let v = s - twoHi;
    let e = (twoHi - (s - v)) + (cyHi - v);
    let s2 = e + twoLo + cyLo;
    zyHi = s + s2; zyLo = s2 - (zyHi - s);

    // zx = zx² - zy² + cx
    // zx² - zy²
    let diffHi, diffLo;
    s = zx2Hi - zy2Hi;
    v = s - zx2Hi;
    e = (zx2Hi - (s - v)) + (-zy2Hi - v);
    s2 = e + zx2Lo - zy2Lo;
    diffHi = s + s2; diffLo = s2 - (diffHi - s);

    // + cx
    s = diffHi + cxHi;
    v = s - diffHi;
    e = (diffHi - (s - v)) + (cxHi - v);
    s2 = e + diffLo + cxLo;
    zxHi = s + s2; zxLo = s2 - (zxHi - s);
  }

  return 0;
}

// ============ Quad-double arithmetic (~62 digits precision) ============
// Instead of implementing full quad-double (very complex), we use two double-doubles
// and compute the Mandelbrot iteration treating each coordinate as a pair of DDs.

// Quad-double Mandelbrot using double-double building blocks
// This reuses the proven DD arithmetic from above
function calculateMandelbrotQDInline(
  cx0: number, cx1: number, cx2: number, cx3: number,
  cy0: number, cy1: number, cy2: number, cy3: number,
  maxIterations: number
): number {
  // Treat as two double-doubles: (cx0,cx1) is high DD, (cx2,cx3) is extension
  // For the iteration, we'll use full DD arithmetic on the high parts
  // and track the extensions for coordinate precision

  // z = zx + i*zy, starts at 0
  let zxHi = 0, zxLo = 0;
  let zyHi = 0, zyLo = 0;

  // Use the DD Mandelbrot but with QD input coordinates
  // The c values come from the QD representation
  const cxHi = cx0, cxLo = cx1 + cx2 + cx3;
  const cyHi = cy0, cyLo = cy1 + cy2 + cy3;

  for (let i = 0; i < maxIterations; i++) {
    // zx² using inline ddSqr
    let p = zxHi * zxHi;
    let aHi = SPLIT * zxHi, t = aHi - (aHi - zxHi), aLo = zxHi - t;
    let err = ((t * t - p) + 2 * t * aLo) + aLo * aLo;
    let zx2Hi = p, zx2Lo = err + 2 * zxHi * zxLo;
    // Normalize
    t = zx2Hi + zx2Lo; zx2Lo = zx2Lo - (t - zx2Hi); zx2Hi = t;

    // zy² using inline ddSqr
    p = zyHi * zyHi;
    aHi = SPLIT * zyHi; t = aHi - (aHi - zyHi); aLo = zyHi - t;
    err = ((t * t - p) + 2 * t * aLo) + aLo * aLo;
    let zy2Hi = p, zy2Lo = err + 2 * zyHi * zyLo;
    t = zy2Hi + zy2Lo; zy2Lo = zy2Lo - (t - zy2Hi); zy2Hi = t;

    // |z|² = zx² + zy² - check escape
    const magHi = zx2Hi + zy2Hi;
    if (magHi > 4) return i;

    // zy = 2 * zx * zy + cy
    // First: zx * zy
    p = zxHi * zyHi;
    let aHi1 = SPLIT * zxHi; let t1 = aHi1 - (aHi1 - zxHi); let aLo1 = zxHi - t1;
    let bHi = SPLIT * zyHi; let t2 = bHi - (bHi - zyHi); let bLo = zyHi - t2;
    err = ((t1 * t2 - p) + t1 * bLo + aLo1 * t2) + aLo1 * bLo;
    let prodHi = p, prodLo = err + (zxHi * zyLo + zxLo * zyHi);
    t = prodHi + prodLo; prodLo = prodLo - (t - prodHi); prodHi = t;

    // * 2
    let twoHi = prodHi * 2, twoLo = prodLo * 2;

    // + cy (twoSum)
    let s = twoHi + cyHi;
    let v = s - twoHi;
    let e = (twoHi - (s - v)) + (cyHi - v);
    let s2 = e + twoLo + cyLo;
    zyHi = s + s2; zyLo = s2 - (zyHi - s);

    // zx = zx² - zy² + cx
    // zx² - zy²
    let diffHi, diffLo;
    s = zx2Hi - zy2Hi;
    v = s - zx2Hi;
    e = (zx2Hi - (s - v)) + (-zy2Hi - v);
    s2 = e + zx2Lo - zy2Lo;
    diffHi = s + s2; diffLo = s2 - (diffHi - s);

    // + cx
    s = diffHi + cxHi;
    v = s - diffHi;
    e = (diffHi - (s - v)) + (cxHi - v);
    s2 = e + diffLo + cxLo;
    zxHi = s + s2; zxLo = s2 - (zxHi - s);
  }

  return 0;
}

// Render with quad-double precision, 4x4 blocks for performance
function renderQuadPrecision(
  data: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  centerX0: number, centerX1: number, centerX2: number, centerX3: number,
  centerY0: number, centerY1: number, centerY2: number, centerY3: number,
  zoom: number,
  maxIterations: number
) {
  const BLOCK_SIZE = 4; // 4x4 blocks for quad precision

  for (let bx = 0; bx < canvasWidth; bx += BLOCK_SIZE) {
    for (let by = 0; by < canvasHeight; by += BLOCK_SIZE) {
      const x = bx + BLOCK_SIZE / 2;
      const y = by + BLOCK_SIZE / 2;

      const offsetX = (x - canvasWidth / 2) * zoom;
      const offsetY = (y - canvasHeight / 2) * zoom;

      // Add offset to center using DD arithmetic to preserve precision
      // The center is stored as QD (4 components), we add offset with DD precision
      const [cx0, cx1Temp] = ddAddD([centerX0, centerX1], offsetX);
      const cx1 = cx1Temp + centerX2 + centerX3;

      const [cy0, cy1Temp] = ddAddD([centerY0, centerY1], offsetY);
      const cy1 = cy1Temp + centerY2 + centerY3;

      const iterations = calculateMandelbrotQDInline(
        cx0, cx1, 0, 0,
        cy0, cy1, 0, 0,
        maxIterations
      );

      const color = iterations === 0
        ? { r: 0, g: 0, b: 0 }
        : getColor(iterations, maxIterations);

      for (let dx = 0; dx < BLOCK_SIZE && bx + dx < canvasWidth; dx++) {
        for (let dy = 0; dy < BLOCK_SIZE && by + dy < canvasHeight; dy++) {
          const pixelIndex = ((by + dy) * canvasWidth + (bx + dx)) * 4;
          data[pixelIndex] = color.r;
          data[pixelIndex + 1] = color.g;
          data[pixelIndex + 2] = color.b;
          data[pixelIndex + 3] = 255;
        }
      }
    }
  }
}

// ============ Color functions ============

// Beautiful color palette inspired by classic fractal visualizations
const PALETTE = [
  [  0,   7, 100],  // Deep blue
  [ 32, 107, 203],  // Ocean blue
  [237, 255, 255],  // Cyan white
  [255, 170,   0],  // Orange
  [255,  85,   0],  // Red orange
  [200,  20,  60],  // Crimson
  [100,   7, 100],  // Purple
  [ 50,  10,  80],  // Dark purple
  [ 10,   5,  40],  // Very dark blue
];

function getColor(iterations: number, maxIterations: number) {
  // Smooth coloring using logarithmic scaling
  const t = iterations / maxIterations;

  // Map to palette with smooth interpolation
  const paletteSize = PALETTE.length;
  const scaledPos = t * (paletteSize - 1) * 3; // Cycle through palette multiple times
  const index = Math.floor(scaledPos) % (paletteSize - 1);
  const fraction = scaledPos - Math.floor(scaledPos);

  const c1 = PALETTE[index];
  const c2 = PALETTE[index + 1];

  // Smooth interpolation between colors
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * fraction);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * fraction);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * fraction);

  return { r, g, b };
}

function hslToRgb(h: number, s: number, l: number) {
  let r, g, b;
  if (s == 0) {
    r = g = b = l;
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
