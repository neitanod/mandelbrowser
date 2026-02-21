import { log, error } from '../utils/logger';
import type { ReferenceOrbit } from './perturbation';

// Vertex shader - just passes through coordinates
const vertexShaderSource = `#version 300 es
in vec2 a_position;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  // Convert from clip space (-1 to 1) to texture coords (0 to 1)
  v_texCoord = (a_position + 1.0) / 2.0;
}
`;

// Fragment shader with perturbation theory
// Uses double emulation for delta calculations
const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

// View parameters
uniform vec2 u_resolution;
uniform float u_zoom;
uniform vec2 u_centerOffset; // Offset from reference point in fractal units

// Reference orbit texture
uniform sampler2D u_referenceReal;
uniform sampler2D u_referenceImag;
uniform int u_referenceLength;
uniform int u_maxIterations;

// Color palette
const vec3 palette[9] = vec3[9](
  vec3(0.0, 0.027, 0.392),   // Deep blue
  vec3(0.125, 0.420, 0.796), // Ocean blue
  vec3(0.929, 1.0, 1.0),     // Cyan white
  vec3(1.0, 0.667, 0.0),     // Orange
  vec3(1.0, 0.333, 0.0),     // Red orange
  vec3(0.784, 0.078, 0.235), // Crimson
  vec3(0.392, 0.027, 0.392), // Purple
  vec3(0.196, 0.039, 0.314), // Dark purple
  vec3(0.039, 0.020, 0.157)  // Very dark blue
);

vec3 getColor(int iterations) {
  if (iterations == 0) return vec3(0.0);

  float t = float(iterations) / float(u_maxIterations);
  float scaledPos = t * 8.0 * 3.0; // Cycle through palette 3 times
  int index = int(floor(scaledPos)) % 8;
  float frac = fract(scaledPos);

  return mix(palette[index], palette[index + 1], frac);
}

void main() {
  // Calculate pixel offset from center in fractal units
  vec2 pixelOffset = (v_texCoord - 0.5) * u_resolution * u_zoom;

  // Delta_0 = pixel position - reference position
  // (reference is at center, so delta_0 = pixelOffset + centerOffset)
  vec2 delta = pixelOffset + u_centerOffset;
  vec2 delta0 = delta;

  int iterations = 0;

  // Perturbation iteration:
  // delta_{n+1} = 2 * Z_n * delta_n + delta_n² + delta_0
  // where Z_n is the reference orbit
  for (int i = 0; i < u_referenceLength && i < u_maxIterations; i++) {
    // Get reference orbit value at this iteration
    float refReal = texelFetch(u_referenceReal, ivec2(i, 0), 0).r;
    float refImag = texelFetch(u_referenceImag, ivec2(i, 0), 0).r;

    // Full z = Z + delta (for escape check)
    vec2 z = vec2(refReal + delta.x, refImag + delta.y);

    // Check escape: |z|² > 4
    if (dot(z, z) > 4.0) {
      iterations = i;
      break;
    }

    // delta_{n+1} = 2 * Z_n * delta_n + delta_n² + delta_0
    // Complex multiplication: (a+bi)(c+di) = (ac-bd) + (ad+bc)i

    // 2 * Z_n * delta_n
    float twoZdReal = 2.0 * (refReal * delta.x - refImag * delta.y);
    float twoZdImag = 2.0 * (refReal * delta.y + refImag * delta.x);

    // delta_n²
    float delta2Real = delta.x * delta.x - delta.y * delta.y;
    float delta2Imag = 2.0 * delta.x * delta.y;

    // Sum all terms
    delta.x = twoZdReal + delta2Real + delta0.x;
    delta.y = twoZdImag + delta2Imag + delta0.y;

    iterations = i + 1;
  }

  // If we used all reference orbit iterations, point is likely in set
  if (iterations >= u_referenceLength - 1) {
    iterations = 0;
  }

  fragColor = vec4(getColor(iterations), 1.0);
}
`;

export class WebGLPerturbationRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private referenceRealTexture: WebGLTexture | null = null;
  private referenceImagTexture: WebGLTexture | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initWebGL();
  }

  private initWebGL(): boolean {
    const gl = this.canvas.getContext('webgl2', {
      antialias: false,
      depth: false,
      preserveDrawingBuffer: true,
    });

    if (!gl) {
      error('WebGL2 not supported');
      return false;
    }

    this.gl = gl;

    // Create shaders
    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) {
      return false;
    }

    // Create program
    const program = gl.createProgram();
    if (!program) {
      error('Failed to create WebGL program');
      return false;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      error('Program link error:', gl.getProgramInfoLog(program));
      return false;
    }

    this.program = program;

    // Set up geometry (full-screen quad)
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Create textures for reference orbit
    this.referenceRealTexture = gl.createTexture();
    this.referenceImagTexture = gl.createTexture();

    log('WebGL perturbation renderer initialized');
    return true;
  }

  private createShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) {
      error('Failed to create shader');
      return null;
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  uploadReferenceOrbit(orbit: ReferenceOrbit): void {
    const gl = this.gl;
    if (!gl) return;

    // Upload real parts
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.referenceRealTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R32F,
      orbit.length, 1, 0,
      gl.RED, gl.FLOAT,
      new Float32Array(orbit.zReal)
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Upload imaginary parts
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.referenceImagTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R32F,
      orbit.length, 1, 0,
      gl.RED, gl.FLOAT,
      new Float32Array(orbit.zImag)
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    log('Uploaded reference orbit with', orbit.length, 'iterations');
  }

  render(
    width: number,
    height: number,
    zoom: number,
    centerOffsetX: number,
    centerOffsetY: number,
    referenceLength: number,
    maxIterations: number
  ): void {
    const gl = this.gl;
    const program = this.program;
    if (!gl || !program) return;

    gl.viewport(0, 0, width, height);
    gl.useProgram(program);

    // Set uniforms
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);
    gl.uniform1f(gl.getUniformLocation(program, 'u_zoom'), zoom);
    gl.uniform2f(gl.getUniformLocation(program, 'u_centerOffset'), centerOffsetX, centerOffsetY);
    gl.uniform1i(gl.getUniformLocation(program, 'u_referenceLength'), referenceLength);
    gl.uniform1i(gl.getUniformLocation(program, 'u_maxIterations'), maxIterations);

    // Bind textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.referenceRealTexture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_referenceReal'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.referenceImagTexture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_referenceImag'), 1);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  getImageData(): ImageData | null {
    const gl = this.gl;
    if (!gl) return null;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // WebGL has origin at bottom-left, flip vertically
    const flipped = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const srcRow = (height - 1 - y) * width * 4;
      const dstRow = y * width * 4;
      flipped.set(pixels.subarray(srcRow, srcRow + width * 4), dstRow);
    }

    return new ImageData(flipped, width, height);
  }

  isSupported(): boolean {
    return this.gl !== null && this.program !== null;
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.referenceRealTexture) gl.deleteTexture(this.referenceRealTexture);
    if (this.referenceImagTexture) gl.deleteTexture(this.referenceImagTexture);
    if (this.program) gl.deleteProgram(this.program);
  }
}
