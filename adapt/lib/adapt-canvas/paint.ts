/** Stateless canvas primitives and visual assets. Workspace behavior lives in index.ts. */
export type Rect = { x: number; y: number; w: number; h: number };

const TAU = Math.PI * 2;

export const IMAGE_ICON_PATH =
  "M16 20H19C20.1046 20 21 19.1046 21 18V13" +
  "M16 20H8H5C3.89543 20 3 19.1046 3 18V15" +
  "M16 20C15.4421 18.8842 13.5695 17.0214 9.87201 15.9119" +
  "M21 13V8C21 6.89543 20.1046 6 19 6H16" +
  "M21 13C17.9242 12.8817 12.6653 13.4351 9.87201 15.9119" +
  "M3 15V8C3 6.89543 3.89543 6 5 6H8" +
  "M3 15C5.77637 15 8.04658 15.3641 9.87201 15.9119" +
  "M8 6L10.5858 3.41421C11.3668 2.63316 12.6332 2.63317 13.4142 3.41421L16 6H8" +
  "M7.5 9C7 9 6 9.3 6 10.5C6 11.7 7 12 7.5 12C8 12 9 11.7 9 10.5C9 9.3 8 9 7.5 9Z";

export const BROKEN_IMAGE_ICON_PATH =
  "M10 3H5A2 2 0 0 0 3 5V19A2 2 0 0 0 5 21H10 " +
  "M15 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H14 " +
  "M12 2L10 9L14 13L11 22 " +
  "M4 17L8 13L11 16 " +
  "M16 13L20 17 " +
  "M9 8A1 1 0 1 1 7 8A1 1 0 1 1 9 8";

export const FILE_ICON_PATH =
  "M7 3H14L19 8V21H7V3Z " + "M14 3V8H19 " + "M10 12H16 " + "M10 16H16";

// The atmosphere is a static CSS backdrop, so no canvas pixels are spent on it.
export const BACKDROP = [
  "radial-gradient(circle at 13% 17%, rgba(103,197,255,0.42), rgba(103,197,255,0.13) 52%, rgba(103,197,255,0) 66%)",
  "radial-gradient(circle at 78% 16%, rgba(194,161,255,0.42), rgba(194,161,255,0.13) 52%, rgba(194,161,255,0) 66%)",
  "radial-gradient(circle at 65% 83%, rgba(255,176,208,0.42), rgba(255,176,208,0.13) 52%, rgba(255,176,208,0) 66%)",
  "radial-gradient(circle at 12% 83%, rgba(132,245,219,0.42), rgba(132,245,219,0.13) 52%, rgba(132,245,219,0) 66%)",
  "linear-gradient(135deg, #e9f5ff 0%, #f3f0fc 45%, #e6edff 100%)",
].join(", ");

export function beginRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  radius: number,
): void {
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, Math.max(0, r.w), Math.max(0, r.h), Math.max(0, rad));
}

export function createCanvasPaint(ctx: CanvasRenderingContext2D) {
  function outline(rect: Rect, radius: number, alpha = 1) {
    ctx.save();
    beginRoundedRectPath(ctx, rect, radius);
    ctx.strokeStyle = `rgba(255,255,255,${0.94 * alpha})`;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    beginRoundedRectPath(
      ctx,
      { x: rect.x + 1.7, y: rect.y + 1.7, w: rect.w - 3.4, h: rect.h - 3.4 },
      radius,
    );
    ctx.strokeStyle = `rgba(110,130,172,${0.12 * alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function fill(rect: Rect, radius: number, opacity: number) {
    ctx.save();
    beginRoundedRectPath(ctx, rect, radius);
    ctx.fillStyle = `rgba(255,255,255,${opacity})`;
    ctx.fill();
    ctx.restore();
  }

  function glass(rect: Rect, radius: number, opacity = 0.58, border = 1) {
    fill(rect, radius, opacity);
    outline(rect, radius, border);
  }

  function glassOrb(x: number, y: number, r: number, alpha: number) {
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x + r * 0.05, y + r * 0.07, r * 0.86, 0, TAU);
    ctx.fillStyle = "rgba(196,214,255,0.22)";
    ctx.fill();

    // Bright and dark rim arcs create the refractive edge.
    ctx.lineWidth = Math.max(1.4, r * 0.035);
    ctx.strokeStyle = "rgba(255,255,255,.98)";
    ctx.beginPath();
    ctx.arc(x, y, r - 1, Math.PI * 0.66, Math.PI * 1.84);
    ctx.stroke();
    ctx.strokeStyle = "rgba(89,116,172,.27)";
    ctx.beginPath();
    ctx.arc(x, y, r - 1, -Math.PI * 0.13, Math.PI * 0.63);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.7)";
    ctx.lineWidth = Math.max(1, r * 0.017);
    ctx.beginPath();
    ctx.arc(
      x - r * 0.035,
      y - r * 0.035,
      r * 0.81,
      Math.PI * 1.08,
      Math.PI * 1.57,
    );
    ctx.stroke();
    ctx.restore();
  }

  // Uses the caller's current font; does not change canvas drawing state.
  function fitText(s: string, limit: number): string {
    if (ctx.measureText(s).width <= limit) return s;
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(s.slice(0, mid) + "…").width <= limit) lo = mid;
      else hi = mid - 1;
    }
    return lo > 0 ? s.slice(0, lo) + "…" : "";
  }

  function dropZone(rect: Rect, radius: number, strength: number) {
    const alpha = Math.max(0, Math.min(1, strength));

    ctx.save();
    beginRoundedRectPath(ctx, rect, radius);
    ctx.fillStyle = `rgba(255,255,255,${0.1 * alpha})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * alpha})`;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    beginRoundedRectPath(
      ctx,
      { x: rect.x + 3, y: rect.y + 3, w: rect.w - 6, h: rect.h - 6 },
      Math.max(0, radius - 3),
    );
    ctx.strokeStyle = `rgba(92,128,220,${0.46 * alpha})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  function progressRing(
    x: number,
    y: number,
    radius: number,
    progress: number | null,
    time: number,
    alpha = 1,
  ) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.8, radius * 0.24);

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.strokeStyle = "rgba(255,255,255,.6)";
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = "rgba(77,122,223,.92)";

    if (progress === null) {
      ctx.arc(x, y, radius, time * 3, time * 3 + Math.PI * 0.85);
    } else {
      const value = Math.max(0, Math.min(1, progress));
      ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + TAU * value);
    }

    ctx.stroke();
    ctx.restore();
  }

  function pendingCard(
    rect: Rect,
    radius: number,
    alpha: number,
    failed: boolean,
  ) {
    ctx.save();
    ctx.globalAlpha = alpha;
    fill(rect, radius, 0.72);
    outline(rect, radius, 0.9);

    if (failed) {
      beginRoundedRectPath(ctx, rect, radius);
      ctx.strokeStyle = "rgba(185,80,101,.68)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    ctx.restore();
  }

  function roundedImage(
    rect: Rect,
    radius: number,
    image: HTMLImageElement,
    alpha: number,
  ) {
    const width = image.naturalWidth;
    const height = image.naturalHeight;

    if (!width || !height) return;

    const scale = Math.max(rect.w / width, rect.h / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;

    ctx.save();
    ctx.globalAlpha = alpha;
    beginRoundedRectPath(ctx, rect, radius);
    ctx.clip();
    ctx.drawImage(
      image,
      rect.x + (rect.w - drawWidth) / 2,
      rect.y + (rect.h - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    ctx.restore();
  }

  return {
    fill,
    glass,
    glassOrb,
    fitText,
    dropZone,
    progressRing,
    pendingCard,
    roundedImage,
  };
}
