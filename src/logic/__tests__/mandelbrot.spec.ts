import { describe, it, expect } from 'vitest';
import { calculateMandelbrot } from '../mandelbrot';

describe('calculateMandelbrot', () => {
  const MAX_ITERATIONS = 100;

  it('should return 0 for a point inside the set (origin)', () => {
    // The origin (0,0) is the center of the set and should never escape.
    // We expect it to reach the max iteration count, which we'll represent as 0 for simplicity.
    const iterations = calculateMandelbrot(0, 0, MAX_ITERATIONS);
    expect(iterations).toBe(0);
  });

  it('should return a low iteration count for a point far outside the set', () => {
    // The point (2, 2) is far from the set and should escape very quickly.
    const iterations = calculateMandelbrot(2, 2, MAX_ITERATIONS);
    expect(iterations).toBeGreaterThan(0);
    expect(iterations).toBeLessThan(5);
  });

  it('should return 0 for a point on the cusp of the main cardioid', () => {
    // This point is within the main cardioid and should not escape.
    const iterations = calculateMandelbrot(-0.25, 0.5, MAX_ITERATIONS);
    expect(iterations).toBe(0);
  });
});
