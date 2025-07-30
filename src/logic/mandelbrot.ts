/**
 * Calculates the number of iterations it takes for a point (cx, cy) to escape
 * the Mandelbrot set.
 * @param cx The real part of the complex number.
 * @param cy The imaginary part of the complex number.
 * @param maxIterations The maximum number of iterations to perform.
 * @returns The number of iterations, or 0 if the point is likely in the set.
 */
export function calculateMandelbrot(
  cx: number,
  cy: number,
  maxIterations: number
): number {
  let zx = 0;
  let zy = 0;
  let i = 0;

  while (zx * zx + zy * zy <= 4 && i < maxIterations) {
    const xtemp = zx * zx - zy * zy + cx;
    zy = 2 * zx * zy + cy;
    zx = xtemp;
    i++;
  }

  // If we reached the max iterations, we assume the point is in the set
  // and return 0 for our specific use case.
  return i === maxIterations ? 0 : i;
}
