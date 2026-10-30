import { beginSquirclePath } from "./squircle.ts";
import { createImageSampler } from "./image-sampling.ts";
import type { Thing } from "../../adapt/core/contracts.ts";
import { clamp, type RenderBody, type BodyGeometry, type ImageFit, type ThingPresentation, type IconPainter } from "./types.ts";
function source(thing: Thing): string | null {
  const d = thing.data;
  if (thing.type !== "image" || !d || typeof d !== "object" || !("src" in d))
    return null;
  return typeof d.src === "string" && d.src.trim() ? d.src : null;
}


export function createImageRenderer(ctx: CanvasRenderingContext2D, imageFor: (src: string) => HTMLImageElement, drawImageIcon: IconPainter, imageIcon: Path2D, brokenImageIcon: Path2D): ThingPresentation {
  const sample = createImageSampler();

  function drawSampled(image: HTMLImageElement, x: number, y: number, width: number, height: number) {
    const transform = ctx.getTransform();
    const scaleX = Math.hypot(transform.a, transform.b);
    const scaleY = Math.hypot(transform.c, transform.d);
    const sampled = sample(image, width * scaleX, height * scaleY);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sampled, x, y, width, height);
    ctx.restore();
  }

  function drawImageBody(b: RenderBody, geometry: BodyGeometry, alpha: number) {
    const { x: px, y: py, radius: r, fitted } = geometry;
    if (b.role !== "focus") {
      const half = geometry.halfWidth;
      ctx.save();
      ctx.globalAlpha = alpha;
      beginSquirclePath(ctx, px, py, half);
      ctx.fillStyle = "rgba(255,255,255,.45)";
      ctx.fill();
      ctx.save();
      ctx.clip();
      if (fitted) {
        const image = fitted.image;
        const scale = (half * 2) / Math.min(image.naturalWidth, image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        drawSampled(image, px - width / 2, py - height / 2, width, height);
      } else {
        const src = source(b.thing);
        const image = src ? imageFor(src) : null;
        const failed = image !== null && image.complete && image.naturalWidth === 0;
        drawImageIcon(failed ? brokenImageIcon : imageIcon, px, py, half,
          "rgba(62,81,128,.42)");
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,.65)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    } else if (fitted) {
      ctx.globalAlpha = alpha;
      drawSampled(
        fitted.image,
        px - fitted.w / 2,
        py - fitted.h / 2,
        fitted.w,
        fitted.h,
      );
      ctx.globalAlpha = b.alpha;
    } else {
      const side = r * 2.4;
      const src = source(b.thing);
      const image = src ? imageFor(src) : null;
      const failed =
        image !== null && image.complete && image.naturalWidth === 0;
      ctx.globalAlpha = alpha;
      drawImageIcon(
        failed ? brokenImageIcon : imageIcon,
        px,
        py,
        side * 0.44,
        "rgba(62,81,128,.42)",
      );
      ctx.globalAlpha = b.alpha;
    }
  }


  return {
    heading: false,
    zoomable: true,
    hoverScale: false,
    focusRadius: (span) => clamp(span * 0.3, 88, 220),
    measure: (body, radius) => {
      const fitted = fittedImage(body, radius, imageFor);
      return {
        halfWidth: body.role === "focus" && fitted ? fitted.w / 2 : radius * 1.2,
        halfHeight: body.role === "focus" && fitted ? fitted.h / 2 : radius * 1.2,
        shape: "rect",
        fitted,
      };
    },
    draw: drawImageBody,
  };

}

export function fittedImage(b: Pick<RenderBody, "thing">, r: number, imageFor: (src: string) => HTMLImageElement): ImageFit | null {
    const src = source(b.thing);
    const image = src ? imageFor(src) : null;

    if (!image?.complete || !image.naturalWidth) return null;

    const span = r * 2.4;
    const scale = Math.min(
      span / image.naturalWidth,
      span / image.naturalHeight,
    );

    return {
      image,
      w: image.naturalWidth * scale,
      h: image.naturalHeight * scale,
    };
  }


