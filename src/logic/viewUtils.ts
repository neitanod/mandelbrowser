import Decimal from 'decimal.js';

export interface FractalView {
  centerX: Decimal;
  centerY: Decimal;
  zoom: Decimal;
}

export interface RenderCanvasInfo {
  width: number;
  height: number;
}

export interface ViewportInfo {
  width: number;
  height: number;
}

export function calculateNewView(
  initialView: FractalView,
  finalDisplayCanvasRect: DOMRect,
  renderCanvasInfo: RenderCanvasInfo,
  viewportInfo: ViewportInfo
): FractalView {
  // All calculations use Decimal for precision at high zoom levels

  const scaleX = new Decimal(renderCanvasInfo.width).div(viewportInfo.width);
  const scaleY = new Decimal(renderCanvasInfo.height).div(viewportInfo.height);

  // Calculate new zoom based on the visual scale change
  const visualScaleFactor = new Decimal(finalDisplayCanvasRect.width).div(viewportInfo.width);
  const newZoom = initialView.zoom.div(visualScaleFactor);

  // Calculate the pan offset in CSS pixels (how much the canvas moved)
  const canvasCenterCssX = finalDisplayCanvasRect.left + finalDisplayCanvasRect.width / 2;
  const canvasCenterCssY = finalDisplayCanvasRect.top + finalDisplayCanvasRect.height / 2;
  const viewportCenterX = viewportInfo.width / 2;
  const viewportCenterY = viewportInfo.height / 2;

  // Pan delta: how much the viewport center moved relative to the canvas center
  const panDeltaCssX = new Decimal(viewportCenterX - canvasCenterCssX);
  const panDeltaCssY = new Decimal(viewportCenterY - canvasCenterCssY);

  // Convert to render canvas pixels (accounting for zoom gesture scale)
  const panDeltaRenderX = panDeltaCssX.div(visualScaleFactor).mul(scaleX);
  const panDeltaRenderY = panDeltaCssY.div(visualScaleFactor).mul(scaleY);

  // Apply delta to center - this preserves precision
  const newCenterX = initialView.centerX.plus(panDeltaRenderX.mul(initialView.zoom));
  const newCenterY = initialView.centerY.plus(panDeltaRenderY.mul(initialView.zoom));

  return { centerX: newCenterX, centerY: newCenterY, zoom: newZoom };
}
