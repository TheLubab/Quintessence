import { beginRoundedRectPath } from "../paint.ts";
import type { ThingPresentation } from "./types.ts";

export function createCollectionRenderer(
  ctx: CanvasRenderingContext2D,
  fallback: ThingPresentation,
): ThingPresentation {
  return {
    ...fallback,
    heading: true,
    hoverScale: false,
    labelWidth: 140,
    dockLabel: true,
    measure: (_body, radius) => ({
      halfWidth: radius * 1.1,
      halfHeight: radius * 0.9,
      shape: "rect",
      fitted: null,
    }),
    draw(_body, geometry, alpha) {
      const { x, y, radius: r } = geometry;
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = alpha;

      // Two offset panels form a simple, compact stack.
      for (let i = 0; i < 2; i++) {
        ctx.save();
        ctx.translate((i === 0 ? -0.12 : 0.12) * r, (i === 0 ? -0.16 : 0.16) * r);
        ctx.rotate(i === 0 ? -0.08 : 0.04);
        beginRoundedRectPath(ctx, {
          x: -r * 0.9,
          y: -r * 0.65,
          w: r * 1.8,
          h: r * 1.3,
        }, r * 0.18);
        ctx.fillStyle = i === 0
          ? "rgba(235,235,235,.38)"
          : "rgba(255,255,255,.58)";
        ctx.shadowColor = "rgba(0,0,0,.08)";
        ctx.shadowBlur = r * 0.1;
        ctx.shadowOffsetY = r * 0.04;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = "rgba(255,255,255,.8)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    },
  };
}
