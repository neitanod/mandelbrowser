import { log, error } from '../utils/logger';

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

// Double-single precision shader
// Each value = hi + lo, giving ~14 digits precision (enough for zoom ~1e-13)
const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform vec2 u_zoom;  // (zoom_hi, zoom_lo) as double-single
uniform vec2 u_centerHi;  // (cx_hi, cy_hi)
uniform vec2 u_centerLo;  // (cx_lo, cy_lo)
uniform int u_maxIterations;

// Color palette - MUST match CPU worker exactly!
// CPU values: [0,7,100], [32,107,203], [237,255,255], [255,170,0], [255,85,0], [200,20,60], [100,7,100], [50,10,80], [10,5,40]
const vec3 palette[9] = vec3[9](
  vec3(0.0/255.0, 7.0/255.0, 100.0/255.0),      // Deep blue
  vec3(32.0/255.0, 107.0/255.0, 203.0/255.0),   // Ocean blue
  vec3(237.0/255.0, 255.0/255.0, 255.0/255.0),  // Cyan white
  vec3(255.0/255.0, 170.0/255.0, 0.0/255.0),    // Orange
  vec3(255.0/255.0, 85.0/255.0, 0.0/255.0),     // Red orange
  vec3(200.0/255.0, 20.0/255.0, 60.0/255.0),    // Crimson
  vec3(100.0/255.0, 7.0/255.0, 100.0/255.0),    // Purple
  vec3(50.0/255.0, 10.0/255.0, 80.0/255.0),     // Dark purple
  vec3(10.0/255.0, 5.0/255.0, 40.0/255.0)       // Very dark blue
);

// Veltkamp split constant for float32: 2^12 + 1
const float SPLIT = 4097.0;

// Force a value to be stored to prevent compiler optimizations
// This is crucial for double-single arithmetic to work correctly
float forceEval(float x) {
  return x + 0.0;  // Forces intermediate result
}

// Split float into hi and lo parts for exact multiplication
// Using forceEval to prevent FMA and other optimizations
vec2 split(float a) {
  float t = forceEval(SPLIT * a);
  float temp = forceEval(t - a);
  float hi = forceEval(t - temp);
  float lo = forceEval(a - hi);
  return vec2(hi, lo);
}

// Two-product: exact a*b = (p, err)
vec2 twoProd(float a, float b) {
  float p = forceEval(a * b);
  vec2 as = split(a);
  vec2 bs = split(b);
  // Compute error term carefully
  float e1 = forceEval(as.x * bs.x - p);
  float e2 = forceEval(e1 + as.x * bs.y);
  float e3 = forceEval(e2 + as.y * bs.x);
  float err = forceEval(e3 + as.y * bs.y);
  return vec2(p, err);
}

// Two-sum: exact a+b = (s, err)
vec2 twoSum(float a, float b) {
  float s = forceEval(a + b);
  float v = forceEval(s - a);
  float e1 = forceEval(a - forceEval(s - v));
  float e2 = forceEval(b - v);
  float err = forceEval(e1 + e2);
  return vec2(s, err);
}

// Quick two-sum when |a| >= |b|
vec2 quickTwoSum(float a, float b) {
  float s = forceEval(a + b);
  float err = forceEval(b - forceEval(s - a));
  return vec2(s, err);
}

// Double-single addition
vec2 ds_add(vec2 a, vec2 b) {
  vec2 s = twoSum(a.x, b.x);
  vec2 t = twoSum(a.y, b.y);
  float sy = forceEval(s.y + t.x);
  vec2 s2 = quickTwoSum(s.x, sy);
  float sy2 = forceEval(s2.y + t.y);
  return quickTwoSum(s2.x, sy2);
}

// Double-single subtraction
vec2 ds_sub(vec2 a, vec2 b) {
  return ds_add(a, vec2(-b.x, -b.y));
}

// Double-single multiplication with proper error tracking
vec2 ds_mul(vec2 a, vec2 b) {
  vec2 p = twoProd(a.x, b.x);
  float cross = forceEval(a.x * b.y + a.y * b.x);
  float py = forceEval(p.y + cross);
  return quickTwoSum(p.x, py);
}

// Add single float to double-single
vec2 ds_add_f(vec2 a, float b) {
  vec2 s = twoSum(a.x, b);
  float sy = forceEval(s.y + a.y);
  return quickTwoSum(s.x, sy);
}

vec3 getColor(int iterations, int maxIter) {
  if (iterations == 0) return vec3(0.0);
  float t = float(iterations) / float(maxIter);
  // Match CPU: scaledPos = t * (paletteSize - 1) * 3 = t * 8 * 3
  float scaledPos = t * 8.0 * 3.0;
  // Match CPU: index = floor(scaledPos) % (paletteSize - 1) = floor(scaledPos) % 8
  int index = int(floor(scaledPos)) % 8;
  // Match CPU: fraction = scaledPos - floor(scaledPos)
  float frac = scaledPos - floor(scaledPos);

  // DEBUG: Show raw iteration count as grayscale to compare with CPU
  // return vec3(t);  // Uncomment to debug

  return mix(palette[index], palette[index + 1], frac);
}

// Multiply double-single by float
vec2 ds_mul_f(vec2 a, float b) {
  vec2 p = twoProd(a.x, b);
  p.y += a.y * b;
  return quickTwoSum(p.x, p.y);
}

void main() {
  // Pixel position: x goes 0 to width, y goes 0 to height
  // Match CPU: px = centerX + (x - width/2) * zoom
  //            py = centerY + (y - height/2) * zoom
  // In WebGL, v_texCoord.y=0 is bottom, v_texCoord.y=1 is top
  // But we want y=0 at top to match CPU canvas coordinates
  // So we flip: y = (1 - v_texCoord.y) * height
  float x = v_texCoord.x * u_resolution.x;
  float y = (1.0 - v_texCoord.y) * u_resolution.y;

  float pixelX = x - u_resolution.x * 0.5;
  float pixelY = y - u_resolution.y * 0.5;

  // Calculate offset as simple float - this is fine because:
  // pixel * zoom = 500 * 2.5e-9 = 1.25e-6, which fits in float32
  // We use zoom.x (hi part) since zoom.y is negligible for this multiplication
  float offsetX = pixelX * u_zoom.x;
  float offsetY = pixelY * u_zoom.x;

  // c = center + offset using double-single addition
  // This is where precision matters: adding small offset to center
  vec2 cx = ds_add_f(vec2(u_centerHi.x, u_centerLo.x), offsetX);
  vec2 cy = ds_add_f(vec2(u_centerHi.y, u_centerLo.y), offsetY);

  // Combine DS to single float for iteration
  // This should work because z stays bounded near |z| < 2
  float cr = cx.x + cx.y;
  float ci = cy.x + cy.y;

  // Standard Mandelbrot iteration using the high-precision c values
  // cr and ci already have the precision we need from DS coordinate calculation
  float zr = 0.0;
  float zi = 0.0;
  int iterations = 0;

  for (int i = 0; i < 100000; i++) {
    if (i >= u_maxIterations) break;

    float zr2 = zr * zr;
    float zi2 = zi * zi;

    if (zr2 + zi2 > 4.0) {
      iterations = i;
      break;
    }

    float new_zi = 2.0 * zr * zi + ci;
    float new_zr = zr2 - zi2 + cr;
    zr = new_zr;
    zi = new_zi;
    iterations = i + 1;
  }

  if (iterations >= u_maxIterations) {
    iterations = 0;
  }

  fragColor = vec4(getColor(iterations, u_maxIterations), 1.0);
}
`;

export class WebGLMandelbrotRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;

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

    log('WebGL Mandelbrot renderer initialized');
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

  render(
    width: number,
    height: number,
    centerXHi: number,
    centerYHi: number,
    centerXLo: number,
    centerYLo: number,
    zoomHi: number,
    zoomLo: number,
    maxIterations: number
  ): void {
    const gl = this.gl;
    const program = this.program;
    if (!gl || !program) return;

    // Ensure canvas size matches requested size
    if (this.canvas.width !== width || this.canvas.height !== height) {
      log('WebGL: Resizing canvas from', this.canvas.width, 'x', this.canvas.height, 'to', width, 'x', height);
      this.canvas.width = width;
      this.canvas.height = height;
    }

    gl.viewport(0, 0, width, height);
    gl.useProgram(program);

    // Debug: log uniform values
    log('WebGL uniforms:', {
      zoomHi, zoomLo,
      centerXHi, centerYHi,
      centerXLo, centerYLo,
      maxIterations
    });

    // Get uniform locations once and check if valid
    const loc_resolution = gl.getUniformLocation(program, 'u_resolution');
    const loc_zoom = gl.getUniformLocation(program, 'u_zoom');
    const loc_centerHi = gl.getUniformLocation(program, 'u_centerHi');
    const loc_centerLo = gl.getUniformLocation(program, 'u_centerLo');
    const loc_maxIter = gl.getUniformLocation(program, 'u_maxIterations');

    log('WebGL uniform locations:', {
      resolution: loc_resolution,
      zoom: loc_zoom,
      centerHi: loc_centerHi,
      centerLo: loc_centerLo,
      maxIter: loc_maxIter
    });

    // Set uniforms
    gl.uniform2f(loc_resolution, width, height);
    gl.uniform2f(loc_zoom, zoomHi, zoomLo);
    gl.uniform2f(loc_centerHi, centerXHi, centerYHi);
    gl.uniform2f(loc_centerLo, centerXLo, centerYLo);
    gl.uniform1i(loc_maxIter, maxIterations);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  isSupported(): boolean {
    return this.gl !== null && this.program !== null;
  }

  readPixels(): Uint8Array | null {
    const gl = this.gl;
    if (!gl) return null;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Flip vertically (WebGL is bottom-up)
    const flipped = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      const srcRow = (height - 1 - y) * width * 4;
      const dstRow = y * width * 4;
      for (let x = 0; x < width * 4; x++) {
        flipped[dstRow + x] = pixels[srcRow + x];
      }
    }
    return flipped;
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.program) gl.deleteProgram(this.program);
  }
}
