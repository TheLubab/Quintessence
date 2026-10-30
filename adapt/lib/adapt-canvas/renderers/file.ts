import { clamp, type ThingPresentation, type IconPainter } from "./types.ts";
import { beginSquirclePath } from "./squircle.ts";

export function createFileRenderer(
  ctx: CanvasRenderingContext2D,
  drawImageIcon: IconPainter,
  fileIcon: Path2D,
  fallback: ThingPresentation,
): ThingPresentation {
  return {
    ...fallback,
    hoverScale: false,
    labelWidth: 220,
    measure: (_body, radius) => ({
      halfWidth: radius * 1.2, halfHeight: radius * 1.2,
      shape: "rect", fitted: null,
    }),
    draw: (body, geometry, alpha) => {
      const { x, y, halfWidth: half } = geometry;
      const data = body.thing.data;
      const name = data && typeof data === "object" && "title" in data &&
        typeof data.title === "string" ? data.title : "File";
      const dot = name.lastIndexOf(".");
      const extension = dot > 0 && dot < name.length - 1
        ? name.slice(dot + 1).toUpperCase() : "FILE";
      ctx.save();
      ctx.globalAlpha = alpha;
      beginSquirclePath(ctx, x, y, half);
      const gradient = ctx.createLinearGradient(x, y - half, x, y + half);
      gradient.addColorStop(0, "rgba(255,255,255,.88)");
      gradient.addColorStop(1, "rgba(220,230,250,.72)");
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.clip();
      drawImageIcon(fileIcon, x, y - half * 0.22, half * 0.8, "rgba(62,81,128,.55)");
      ctx.font = "600 " + clamp(half * 0.27, 9, 14) + "px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#3e5180";
      let text = extension;
      if (ctx.measureText(text).width > half * 1.5) {
        while (text.length && ctx.measureText(text + "…").width > half * 1.5)
          text = text.slice(0, -1);
        text += "…";
      }
      ctx.fillText(text, x, y + half * 0.44);
      ctx.restore();
    },
  };
}
