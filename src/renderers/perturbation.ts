import Decimal from 'decimal.js';

// Configure high precision for reference orbit
Decimal.set({ precision: 50 });

export interface ReferenceOrbit {
  // Real and imaginary parts of z at each iteration
  // Stored as regular doubles since we'll pass to GPU
  zReal: Float64Array;
  zImag: Float64Array;
  // Number of iterations before escape (or maxIterations)
  length: number;
  // The center point used (for validation)
  centerX: string;
  centerY: string;
}

/**
 * Calculate reference orbit at the center point using arbitrary precision.
 * This orbit will be used by the GPU to compute perturbations.
 */
export function calculateReferenceOrbit(
  centerX: Decimal,
  centerY: Decimal,
  maxIterations: number
): ReferenceOrbit {
  const zReal = new Float64Array(maxIterations);
  const zImag = new Float64Array(maxIterations);

  let zx = new Decimal(0);
  let zy = new Decimal(0);
  let length = 0;

  for (let i = 0; i < maxIterations; i++) {
    // Store current z as doubles for GPU
    zReal[i] = zx.toNumber();
    zImag[i] = zy.toNumber();

    // Check escape: |z|² > 4
    const zx2 = zx.mul(zx);
    const zy2 = zy.mul(zy);
    if (zx2.plus(zy2).greaterThan(4)) {
      length = i;
      break;
    }

    // z = z² + c
    const newZx = zx2.minus(zy2).plus(centerX);
    const newZy = zx.mul(zy).mul(2).plus(centerY);
    zx = newZx;
    zy = newZy;
    length = i + 1;
  }

  return {
    zReal: zReal.slice(0, length),
    zImag: zImag.slice(0, length),
    length,
    centerX: centerX.toString(),
    centerY: centerY.toString(),
  };
}

/**
 * For pixels where perturbation loses precision (glitches),
 * we need to recalculate with a new reference point.
 * This detects if a delta has grown too large.
 */
export function needsRebasing(deltaReal: number, deltaImag: number, tolerance: number = 1e-3): boolean {
  return Math.abs(deltaReal) > tolerance || Math.abs(deltaImag) > tolerance;
}
