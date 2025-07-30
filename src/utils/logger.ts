// src/utils/logger.ts

// Set this to `true` to enable logs, `false` to disable them.
// For production builds, this could be controlled via Vite environment variables.
const DEBUG_MODE = false;

export function log(...args: any[]) {
  if (DEBUG_MODE) {
    console.log(...args);
  }
}

export function error(...args: any[]) {
  if (DEBUG_MODE) {
    console.error(...args);
  }
}
