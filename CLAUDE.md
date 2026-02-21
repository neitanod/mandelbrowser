# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Interactive Mandelbrot set fractal viewer built with Vue 3 + TypeScript. Mobile-first design with touch gestures (pinch-to-zoom, pan) and desktop support (mouse drag, wheel zoom). View state persists in URL hash for sharing.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Type-check + production build
npm run test:unit    # Run tests (Vitest)
npm run lint         # ESLint with auto-fix
npm run format       # Prettier formatting
npm run type-check   # TypeScript check only
```

Run a single test file:
```bash
npx vitest run src/logic/__tests__/mandelbrot.spec.ts
```

## Architecture

**Rendering Pipeline:**
1. `MandelbrotViewer.vue` - Main component handling gestures and canvas management
2. `useMandelbrotWorker.ts` - Composable managing Web Worker communication with render ID tracking
3. `mandelbrot.worker.ts` - Off-main-thread fractal calculation (MAX_ITERATIONS=1000, HSL coloring)

**Performance Strategy (Google Maps-like):**
- During gestures: CSS transforms on existing canvas for instant visual feedback
- On gesture end: Calculate new view coordinates, trigger worker render
- Worker returns `ImageData`, drawn to off-screen canvas then scaled to display
- Worker cancellation: When a new render is requested while one is in progress, the worker is terminated and recreated to avoid wasted CPU cycles

**State Flow:**
- `useViewStore` (Pinia) holds `centerX`, `centerY`, `zoom`
- URL hash format: `#/x=<x>&y=<y>&z=<zoom>`
- Vue Router with hash history syncs URL ↔ store

**Canvas Setup:**
- Display canvas: full viewport at device pixel ratio
- Render canvas: adaptive max dimension based on device (600px mobile, 800px tablet, 1000-1200px desktop)

**Key Files:**
- `src/components/MandelbrotViewer.vue` - Gesture handlers, canvas rendering, URL sync
- `src/stores/view.ts` - View state management
- `src/logic/viewUtils.ts` - View calculation utilities
- `src/composables/usePhysicalSize.ts` - Physical size display calculation
