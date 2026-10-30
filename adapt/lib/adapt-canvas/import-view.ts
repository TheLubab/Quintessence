import type { Thing } from "../adapt/core/contracts.ts";
import type { PendingImport, ImportDestination } from "./imports.ts";
import { beginRoundedRectPath, type Rect } from "./paint.ts";
import { fittedImage } from "./renderers/image.ts";
import { clamp, type BodyGeometry, type Paint, type IconPainter } from "./renderers/types.ts";

type Point = { x: number; y: number };
type PendingBody = {
  item: PendingImport;
  thing: Thing;
  x: number;
  y: number;
  r: number;
  phase: number;
  px: number;
  py: number;
  size: number;
  alpha: number;
  vx: number;
  vy: number;
};

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}


const inside = (x: number, y: number, r: Rect) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// Owns temporary visuals only. Queue actions and session changes belong to the caller.
export function createImportView(options: {
  ctx: CanvasRenderingContext2D;
  paint: Pick<Paint, "fill" | "glass" | "fitText" | "dropZone" | "progressRing" | "pendingCard" | "roundedImage">;
  imageFor: (src: string) => HTMLImageElement;
  drawImageIcon: IconPainter;
  fileIcon: Path2D;
  label: (text: string, x: number, y: number, max: number, strength: number) => void;
}) {
  const { ctx, imageFor, drawImageIcon, fileIcon, label } = options;
  const { fill, glass, fitText, dropZone, progressRing, pendingCard, roundedImage } = options.paint;
  const pendingBodies = new Map<string, PendingBody>();
  let scene: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let canvasRect = scene;
  let w = 1, h = 1, time = 0;
  let input: { hover: string | null; keyboard: string | null } = { hover: null, keyboard: null };
  function pendingThing(item: PendingImport): Thing {
    const id = `import:${item.id}`;

    return item.preview
      ? {
          id,
          type: "image",
          parent: item.destination.parent,
          data: { title: item.name, src: item.preview, assetId: item.id },
        }
      : {
          id,
          type: "file",
          parent: item.destination.parent,
          data: { title: item.name },
        };
  }

  function importOrigin(item: PendingImport): Point {
    if (item.origin) {
      const rect = canvasRect;

      return {
        x: ((item.origin.x - rect.x) * w) / Math.max(1, rect.w),
        y: ((item.origin.y - rect.y) * h) / Math.max(1, rect.h),
      };
    }

    return { x: scene.x + scene.w / 2, y: scene.y + scene.h / 2 };
  }

  function importTarget(base: Point, index: number, count: number): Point {
    if (count <= 1) return base;

    const angle = index * GOLDEN - Math.PI / 2;
    const distance = clamp(54 + Math.sqrt(index + 0.4) * 24, 54, 146);

    return {
      x: base.x + Math.cos(angle) * distance,
      y: base.y + Math.sin(angle) * distance,
    };
  }

  function pendingRadius(): number {
    return clamp(Math.min(scene.w, scene.h) * 0.085, 34, 54);
  }

  function sync(items: readonly PendingImport[], viewport: { scene: Rect; canvas: Rect; width: number; height: number }, reducedMotion: boolean): void {
    scene = viewport.scene;
    canvasRect = viewport.canvas;
    w = viewport.width;
    h = viewport.height;
    const live = new Set(items.map((item) => item.id));

    for (const id of [...pendingBodies.keys()])
      if (!live.has(id)) pendingBodies.delete(id);

    items.forEach((item, index) => {
      const base = importOrigin(item);
      const target = importTarget(base, index, items.length);
      const radius = pendingRadius();
      const existing = pendingBodies.get(item.id);

      if (existing) {
        existing.item = item;
        existing.thing = pendingThing(item);
        existing.x = target.x;
        existing.y = target.y;
        existing.r = radius;
      } else {
        pendingBodies.set(item.id, {
          item,
          thing: pendingThing(item),
          x: target.x,
          y: target.y,
          r: radius,
          phase: hash(item.id) * TAU,
          px: base.x,
          py: base.y,
          size: reducedMotion ? radius : 1,
          alpha: reducedMotion ? 1 : 0,
          vx: 0,
          vy: 0,
        });
      }
    });

  }


  function animatePending(dt: number, instant: boolean): boolean {
    let settling = false;

    for (const body of pendingBodies.values()) {
      const failed = body.item.status === "failed";
      const margin = body.r + 13;
      const minX = scene.x + margin;
      const maxX = Math.max(minX, scene.x + scene.w - margin);
      const minY = scene.y + margin;
      const maxY = Math.max(
        minY,
        scene.y + scene.h - margin - (failed ? 70 : 0),
      );
      const tx = clamp(body.x, minX, maxX);
      const ty = clamp(body.y, minY, maxY);
      const k = 5.5;
      const damping = Math.exp(-dt * 7.5);

      if (instant) {
        body.px = tx;
        body.py = ty;
        body.vx = 0;
        body.vy = 0;
        body.size = body.r;
        body.alpha = 1;
      } else {
        body.vx = (body.vx + (tx - body.px) * k * k * dt) * damping;
        body.vy = (body.vy + (ty - body.py) * k * k * dt) * damping;
        body.px += body.vx * dt;
        body.py += body.vy * dt;
        body.size = lerp(body.size, body.r, 1 - Math.exp(-dt * 11));
        body.alpha = lerp(body.alpha, 1, 1 - Math.exp(-dt * 9));
        settling ||=
          Math.abs(body.vx) + Math.abs(body.vy) > 0.07 ||
          Math.abs(body.r - body.size) > 0.07;
      }
    }

    return settling;
  }


  function pendingGeometry(body: PendingBody): BodyGeometry {
    const fitted = fittedImage(body, body.size, imageFor);

    if (fitted)
      return {
        x: body.px,
        y: body.py,
        radius: body.size,
        halfWidth: fitted.w / 2,
        halfHeight: fitted.h / 2,
        shape: "rect",
        fitted,
      };

    return {
      x: body.px,
      y: body.py,
      radius: body.size,
      halfWidth: body.size * 0.9,
      halfHeight: body.size * 0.7,
      shape: "rect",
      fitted: null,
    };
  }

  function pendingActionRects(
    body: PendingBody,
  ): { retry: Rect; remove: Rect } | null {
    if (body.item.status !== "failed") return null;

    const geometry = pendingGeometry(body);
    const width = 58;
    const height = 30;
    const gap = 8;
    const left = clamp(
      geometry.x - width - gap / 2,
      scene.x + 8,
      Math.max(scene.x + 8, scene.x + scene.w - width * 2 - gap - 8),
    );
    const top = Math.min(
      geometry.y + geometry.halfHeight + 44,
      scene.y + scene.h - height - 8,
    );

    return {
      retry: { x: left, y: top, w: width, h: height },
      remove: { x: left + width + gap, y: top, w: width, h: height },
    };
  }

  function drawPendingAction(
    text: string,
    rect: Rect,
    key: string,
    alpha: number,
  ) {
    const hot = input.hover === key || input.keyboard === key;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (hot) glass(rect, rect.h / 2, 0.86);
    else fill(rect, rect.h / 2, 0.58);

    ctx.fillStyle = hot ? "#3b5fae" : "#293653";
    ctx.font = "600 11px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.4);
    ctx.restore();
  }

  function drawPending(body: PendingBody) {
    if (body.alpha < 0.02) return;

    const item = body.item;
    const failed = item.status === "failed";
    const geometry = pendingGeometry(body);
    const { x, y, halfWidth, halfHeight } = geometry;
    const rect = {
      x: x - halfWidth,
      y: y - halfHeight,
      w: halfWidth * 2,
      h: halfHeight * 2,
    };
    const alpha = body.alpha;

    ctx.save();

    if (geometry.fitted) {
      roundedImage(rect, 16, geometry.fitted.image, alpha);

      ctx.globalAlpha = alpha;
      beginRoundedRectPath(ctx, rect, 16);
      ctx.strokeStyle = failed
        ? "rgba(185,80,101,.72)"
        : "rgba(255,255,255,.92)";
      ctx.lineWidth = failed ? 2 : 1.4;
      ctx.stroke();
    } else {
      pendingCard(rect, 16, alpha, failed);
      ctx.globalAlpha = alpha;
      drawImageIcon(
        fileIcon,
        x,
        y - 6,
        Math.min(rect.w, rect.h) * 0.42,
        "rgba(62,81,128,.55)",
      );
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(74,91,132,.76)";
      ctx.fillText(fitText(item.type, rect.w - 16), x, y + rect.h * 0.28);
    }

    ctx.globalAlpha = alpha;
    label(item.name, x, y + halfHeight + 15, Math.min(180, scene.w - 30), 0);

    if (failed && item.error) {
      ctx.save();
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = "#b95065";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        fitText(item.error, Math.min(190, scene.w - 30)),
        x,
        y + halfHeight + 31,
      );
      ctx.restore();
    } else if (item.status !== "complete") {
      progressRing(
        x + halfWidth - 6,
        y + halfHeight - 6,
        10,
        item.progress,
        time,
        alpha,
      );
    }

    const actions = pendingActionRects(body);

    if (actions) {
      drawPendingAction(
        "Retry",
        actions.retry,
        `import:retry:${item.id}`,
        alpha,
      );
      drawPendingAction(
        "Remove",
        actions.remove,
        `import:remove:${item.id}`,
        alpha,
      );
    }

    ctx.restore();
  }

  function drawDropCue(destination: ImportDestination) {
    const text = `Drop to add to ${destination.label}`;

    ctx.save();
    ctx.font = "600 14px system-ui, -apple-system, sans-serif";
    const width = Math.min(
      scene.w - 24,
      Math.max(180, ctx.measureText(text).width + 46),
    );
    const rect = {
      x: scene.x + scene.w / 2 - width / 2,
      y: scene.y + scene.h - 58,
      w: width,
      h: 42,
    };

    glass(rect, 21, 0.82);
    ctx.fillStyle = "#4d7adf";
    ctx.beginPath();
    ctx.arc(rect.x + 20, rect.y + rect.h / 2, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#293653";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      fitText(text, rect.w - 40),
      rect.x + 32,
      rect.y + rect.h / 2 + 0.4,
    );
    ctx.restore();
  }


  return {
    sync,
    animate: animatePending,
    get size() { return pendingBodies.size; },
    get(id: string): Readonly<PendingBody> | undefined { return pendingBodies.get(id); },
    clear() { pendingBodies.clear(); },
    drawBackground(destination: ImportDestination | null) {
      if (destination) dropZone(scene, 24, 1);
    },
    draw(now: number, selection: { hover: string | null; keyboard: string | null }, destination: ImportDestination | null) {
      time = now;
      input = selection;
      for (const body of pendingBodies.values()) drawPending(body);
      if (destination) drawDropCue(destination);
    },
    hitTest(x: number, y: number): string | null {
    for (const body of pendingBodies.values()) {
      const actions = pendingActionRects(body);

      if (!actions) continue;
      if (inside(x, y, actions.retry)) return `import:retry:${body.item.id}`;
      if (inside(x, y, actions.remove)) return `import:remove:${body.item.id}`;
    }


      return null;
    },
    keys(): string[] {
      return [...pendingBodies.values()].filter(body => body.item.status === "failed")
        .flatMap(body => ["import:retry:" + body.item.id, "import:remove:" + body.item.id]);
    },
  };
}
