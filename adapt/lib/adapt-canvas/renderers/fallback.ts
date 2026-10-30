import { clamp, type ThingPresentation, type RenderBody, type BodyGeometry, type Paint } from "./types.ts";
export function createFallbackRenderer(ctx: CanvasRenderingContext2D, glassOrb: Paint["glassOrb"]): ThingPresentation {
  function drawTypeGlyph(b: RenderBody, x: number, y: number, r: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(62,81,128,.76)";
    ctx.font = `600 ${clamp(r * 0.59, 11, 38)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.thing.type.slice(0, 1).toUpperCase(), 0, 1);
    ctx.restore();
  }


  function drawOrb(
    b: RenderBody,
    geometry: BodyGeometry,
    alpha: number,
    glyph: (body: RenderBody, x: number, y: number, radius: number) => void,
  ) {
    glassOrb(geometry.x, geometry.y, geometry.radius, alpha);
    ctx.globalAlpha = b.alpha;
    glyph(b, geometry.x, geometry.y, geometry.radius);
  }


  return {
    heading: false,
    zoomable: false,
    hoverScale: true,
    focusRadius: (span) => clamp(span * 0.16, 49, 108),
    measure: (_body, radius) => ({
      halfWidth: radius,
      halfHeight: radius,
      shape: "circle",
      fitted: null,
    }),
    draw: (body, geometry, alpha) =>
      drawOrb(body, geometry, alpha, drawTypeGlyph),
  };

}
