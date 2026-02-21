/**
 * Double-double arithmetic for ~31 digits of precision
 * Uses two 64-bit floats: hi (main value) + lo (residual/error)
 *
 * Based on algorithms from:
 * - Dekker (1971) "A floating-point technique for extending the available precision"
 * - Shewchuk (1997) "Adaptive Precision Floating-Point Arithmetic"
 */

export type DD = [number, number]; // [hi, lo]

// Split constant for Dekker multiplication
// 2^27 + 1 = 134217729
const SPLIT = 134217729;

/**
 * Create a double-double from a single number
 */
export function dd(x: number): DD {
  return [x, 0];
}

/**
 * Quick two-sum: assumes |a| >= |b|
 */
function quickTwoSum(a: number, b: number): DD {
  const s = a + b;
  const e = b - (s - a);
  return [s, e];
}

/**
 * Two-sum: no assumption about magnitudes
 */
function twoSum(a: number, b: number): DD {
  const s = a + b;
  const v = s - a;
  const e = (a - (s - v)) + (b - v);
  return [s, e];
}

/**
 * Split a number into high and low parts for multiplication
 */
function split(a: number): [number, number] {
  const t = SPLIT * a;
  const hi = t - (t - a);
  const lo = a - hi;
  return [hi, lo];
}

/**
 * Two-product: exact product of two doubles as double-double
 */
function twoProduct(a: number, b: number): DD {
  const p = a * b;
  const [aHi, aLo] = split(a);
  const [bHi, bLo] = split(b);
  const err = ((aHi * bHi - p) + aHi * bLo + aLo * bHi) + aLo * bLo;
  return [p, err];
}

/**
 * Add two double-doubles
 */
export function ddAdd(a: DD, b: DD): DD {
  const [s1, s2] = twoSum(a[0], b[0]);
  const [t1, t2] = twoSum(a[1], b[1]);
  let s2New = s2 + t1;
  const [s1Final, s2Final] = quickTwoSum(s1, s2New);
  s2New = s2Final + t2;
  return quickTwoSum(s1Final, s2New);
}

/**
 * Subtract two double-doubles (a - b)
 */
export function ddSub(a: DD, b: DD): DD {
  return ddAdd(a, [-b[0], -b[1]]);
}

/**
 * Multiply two double-doubles
 */
export function ddMul(a: DD, b: DD): DD {
  const [p1, p2] = twoProduct(a[0], b[0]);
  const p2New = p2 + (a[0] * b[1] + a[1] * b[0]);
  return quickTwoSum(p1, p2New);
}

/**
 * Multiply double-double by a regular double
 */
export function ddMulD(a: DD, b: number): DD {
  const [p1, p2] = twoProduct(a[0], b);
  const p2New = p2 + a[1] * b;
  return quickTwoSum(p1, p2New);
}

/**
 * Add a regular double to a double-double
 */
export function ddAddD(a: DD, b: number): DD {
  const [s1, s2] = twoSum(a[0], b);
  const s2New = s2 + a[1];
  return quickTwoSum(s1, s2New);
}

/**
 * Check if |a| > 4 (escape condition for Mandelbrot)
 */
export function ddGt4(a: DD): boolean {
  return a[0] > 4 || (a[0] === 4 && a[1] > 0);
}

/**
 * Convert double-double to regular double
 */
export function ddToNumber(a: DD): number {
  return a[0] + a[1];
}

/**
 * Square a double-double (optimized, faster than ddMul(a, a))
 */
export function ddSqr(a: DD): DD {
  const [p1, p2] = twoProduct(a[0], a[0]);
  const p2New = p2 + 2 * a[0] * a[1];
  return quickTwoSum(p1, p2New);
}

/**
 * Calculate Mandelbrot iteration using double-double precision
 * Returns iterations, or 0 if point is in the set
 */
export function calculateMandelbrotDD(
  cxHi: number, cxLo: number,
  cyHi: number, cyLo: number,
  maxIterations: number
): number {
  let zx: DD = [0, 0];
  let zy: DD = [0, 0];
  const cx: DD = [cxHi, cxLo];
  const cy: DD = [cyHi, cyLo];

  for (let i = 0; i < maxIterations; i++) {
    // zx² and zy²
    const zx2 = ddSqr(zx);
    const zy2 = ddSqr(zy);

    // |z|² = zx² + zy²
    const mag2 = ddAdd(zx2, zy2);

    // Escape check: |z|² > 4
    if (ddGt4(mag2)) {
      return i;
    }

    // zy = 2 * zx * zy + cy
    const zxzy = ddMul(zx, zy);
    const twoZxZy = ddMulD(zxzy, 2);
    zy = ddAdd(twoZxZy, cy);

    // zx = zx² - zy² + cx
    const diff = ddSub(zx2, zy2);
    zx = ddAdd(diff, cx);
  }

  return 0; // In the set
}
