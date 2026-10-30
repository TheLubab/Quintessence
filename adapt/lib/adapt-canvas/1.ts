import type { Thing } from "../adapt/core/contracts.ts";
import type { OfferedAction } from "../adapt/core/actions.ts";
import type { Session } from "../adapt/core/session.ts";

type Rect = { x: number; y: number; w: number; h: number };
type NodeRole = "root" | "focus" | "child" | "sibling";
type RailKind = "tools" | "suggestions";

type Orbit = {
  rx: number;
  ry: number;
  angle: number;
  spin: number;
  swirl: number;
};

type NodeTarget = {
  key: string;
  thing: Thing;
  role: NodeRole;
  x: number;
  y: number;
  r: number;
  orbit?: Orbit;
};

type Body = {
  target: NodeTarget;
  x: number;
  y: number;
  r: number;
  opacity: number;
  scale: number;
  vx: number;
  vy: number;
  vr: number;
  vo: number;
  vs: number;
  visible: boolean;
  phase: number;
  hue: number;
};

type Control = Rect & {
  key: string;
  label: string;
  hint?: string;
  enabled: boolean;
  busy?: boolean;
  accent?: boolean;
  rail?: RailKind;
  home?: { x: number; y: number };
  run(): void;
};

type Rail = {
  kind: RailKind;
  label: string;
  rect: Rect;
  clip: Rect;
  axis: "x" | "y";
  start: number;
  view: number;
  max: number;
};

type Pointer = {
  id: number;
  key: string | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
  draggable: boolean;
  lastAngle: number | null;
  rail: RailKind | null;
};

type Status = {
  key: string;
  text: string;
  tone: "info" | "success" | "error";
  busy: boolean;
};

type Layout = {
  scene: Rect;
  tools: Rect | null;
  suggestions: Rect | null;
  dock: Rect | null;
  wide: boolean;
};

type Glass = {
  hue?: number | undefined;
  tint?: string | undefined;
  hot?: boolean | undefined;
  ring?: boolean | undefined;
  lift?: number | undefined;
  lens?: number | undefined;
};

const TAU = Math.PI * 2;
const GOLDEN = 2.399963229728653;
const BASE_SPIN = 0.12;
const BG_SCALE = 0.2;
const FONT =
  '-apple-system, "SF Pro Text", "SF Pro Display", system-ui, sans-serif';

const BLOBS = [
  { hue: 222, fx: 0.11, fy: 0.09, px: 0.0, py: 1.0, size: 0.62 },
  { hue: 268, fx: 0.08, fy: 0.13, px: 2.1, py: 0.3, size: 0.55 },
  { hue: 322, fx: 0.1, fy: 0.07, px: 4.0, py: 2.2, size: 0.48 },
  { hue: 186, fx: 0.07, fy: 0.12, px: 1.2, py: 4.1, size: 0.52 },
  { hue: 28, fx: 0.12, fy: 0.1, px: 5.0, py: 3.0, size: 0.34 },
];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function title(thing: Thing): string {
  const data = thing.data;

  if (typeof data === "string") return data;

  if (data !== null && typeof data === "object") {
    if ("title" in data && typeof data.title === "string") return data.title;
    if ("text" in data && typeof data.text === "string") return data.text;
  }

  return thing.type;
}

function isCollection(thing: Thing): boolean {
  return thing.type === "collection" || thing.type === "group";
}

function imageSource(thing: Thing): string | null {
  const data = thing.data;

  if (
    thing.type !== "image" ||
    data === null ||
    typeof data !== "object" ||
    !("src" in data)
  ) {
    return null;
  }

  return typeof data.src === "string" && data.src.trim() ? data.src : null;
}

function seedOf(key: string): number {
  let hash = 0;
  for (const character of key) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

function spring(
  value: number,
  velocity: number,
  destination: number,
  dt: number,
  frequency = 15,
  damping = 0.85,
): [number, number] {
  const displacement = value - destination;
  const decay = Math.exp(-damping * frequency * dt);

  let position: number;
  let nextVelocity: number;

  if (damping < 1) {
    const wd = frequency * Math.sqrt(1 - damping * damping);
    const cos = Math.cos(wd * dt);
    const sin = Math.sin(wd * dt);
    const b = (velocity + damping * frequency * displacement) / wd;

    position = destination + decay * (displacement * cos + b * sin);

    nextVelocity =
      decay *
      (velocity * cos -
        ((damping * frequency * velocity +
          frequency * frequency * displacement) *
          sin) /
          wd);
  } else {
    const b = velocity + frequency * displacement;
    const criticalDecay = Math.exp(-frequency * dt);

    position = destination + criticalDecay * (displacement + b * dt);
    nextVelocity = criticalDecay * (velocity - frequency * b * dt);
  }

  if (
    Math.abs(position - destination) < 0.02 &&
    Math.abs(nextVelocity) < 0.06
  ) {
    return [destination, 0];
  }

  return [position, nextVelocity];
}

export function canvasView(options: {
  canvas: HTMLCanvasElement;
  session: Session;
}) {
  const { canvas, session } = options;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  const ctx = context;

  // Low-res offscreen aurora. It is both the wallpaper and the "backdrop"
  // every glass surface samples (magnified) to fake refraction.
  const surface = document.createElement("canvas");
  const surfaceContext = surface.getContext("2d");
  if (!surfaceContext) throw new Error("Canvas 2D is unavailable");
  const bgCtx = surfaceContext;

  const bodies = new Map<string, Body>();
  const images = new Map<string, HTMLImageElement>();
  const pending = new Set<string>();

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const originalCursor = canvas.style.cursor;
  const originalTouchAction = canvas.style.touchAction;
  const originalTabIndex = canvas.getAttribute("tabindex");
  const originalLabel = canvas.getAttribute("aria-label");

  let state = session.snapshot();

  let controls: Control[] = [];
  let rails: Rail[] = [];
  let drawn: Body[] = [];
  let guides: Array<{ rx: number; ry: number }> = [];

  let statusNow: Status | null = null;
  let statusRect: Rect | null = null;
  let statusText = "";

  let width = 1;
  let height = 1;
  let dpr = 1;

  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let destroyed = false;

  let hovered: string | null = null;
  let keyboardKey: string | null = null;
  let pointer: Pointer | null = null;
  let mouse: { x: number; y: number } | null = null;

  let orbitAngle = 0;
  let orbitSpeed = BASE_SPIN;
  let focusId: string | null = null;

  const scroll: Record<RailKind, { offset: number; shown: number }> = {
    tools: { offset: 0, shown: 0 },
    suggestions: { offset: 0, shown: 0 },
  };

  let localError: string | null = null;
  let dismissedStatus: string | null = null;

  let wheelAmount = 0;
  let wheelLocked = false;
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;

  let layout: Layout = {
    scene: { x: 20, y: 104, w: 1, h: 1 },
    tools: null,
    suggestions: null,
    dock: null,
    wide: false,
  };

  // ───────────────────────── drawing helpers ─────────────────────────

  function fit(value: string, available: number): string {
    if (available <= 0) return "";
    if (ctx.measureText(value).width <= available) return value;

    const characters = Array.from(value);

    while (
      characters.length &&
      ctx.measureText(`${characters.join("")}…`).width > available
    ) {
      characters.pop();
    }

    return characters.length ? `${characters.join("")}…` : "";
  }

  function roundRect(rect: Rect, radius = 12): void {
    const r = Math.max(0, Math.min(radius, rect.w / 2, rect.h / 2));

    ctx.beginPath();
    ctx.moveTo(rect.x + r, rect.y);
    ctx.arcTo(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h, r);
    ctx.arcTo(rect.x + rect.w, rect.y + rect.h, rect.x, rect.y + rect.h, r);
    ctx.arcTo(rect.x, rect.y + rect.h, rect.x, rect.y, r);
    ctx.arcTo(rect.x, rect.y, rect.x + rect.w, rect.y, r);
    ctx.closePath();
  }

  function paintBackground(): void {
    const bw = surface.width;
    const bh = surface.height;

    bgCtx.globalCompositeOperation = "source-over";
    bgCtx.fillStyle = "#070817";
    bgCtx.fillRect(0, 0, bw, bh);
    bgCtx.globalCompositeOperation = "screen";

    for (const blob of BLOBS) {
      const x = bw * (0.5 + 0.42 * Math.sin(elapsed * blob.fx * 2 + blob.px));
      const y = bh * (0.5 + 0.4 * Math.cos(elapsed * blob.fy * 2 + blob.py));
      const radius = Math.max(bw, bh) * blob.size;
      const hue = (blob.hue + elapsed * 3) % 360;

      const gradient = bgCtx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `hsla(${hue}, 90%, 58%, 0.62)`);
      gradient.addColorStop(1, `hsla(${hue}, 90%, 58%, 0)`);

      bgCtx.fillStyle = gradient;
      bgCtx.fillRect(0, 0, bw, bh);
    }

    bgCtx.globalCompositeOperation = "source-over";
  }

  /**
   * One liquid-glass surface: soft shadow, a magnified sample of the aurora
   * behind it (the lens), frosted tint, optional content, then rim light,
   * inner glow and a specular highlight. A circle is just radius = w / 2.
   */
  function glass(
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    o: Glass = {},
    content?: () => void,
  ): void {
    if (w < 1 || h < 1) return;

    const rect = { x, y, w, h };
    const side = Math.min(w, h);
    const lift = o.lift ?? 0;

    ctx.save();
    ctx.shadowColor = `rgba(2, 4, 28, ${0.34 + lift * 0.18})`;
    ctx.shadowBlur = clamp(side * 0.55, 6, 34) * (1 + lift);
    ctx.shadowOffsetY = clamp(side * 0.2, 2, 14) * (1 + lift);
    ctx.fillStyle = "rgba(12, 16, 48, 0.9)";
    roundRect(rect, radius);
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(rect, radius);
    ctx.clip();

    // Lens: sample a smaller region of the backdrop and stretch it.
    const k = surface.width / width;
    const lens = o.lens ?? 1;
    const sw = (w / lens) * k;
    const sh = (h / lens) * k;
    const sx = clamp(
      (x + w / 2) * k - sw / 2,
      0,
      Math.max(0, surface.width - sw),
    );
    const sy = clamp(
      (y + h / 2) * k - sh / 2,
      0,
      Math.max(0, surface.height - sh),
    );
    ctx.drawImage(surface, sx, sy, sw, sh, x, y, w, h);

    // Frost.
    const boost = o.hot ? 0.09 : 0;
    const frost = ctx.createLinearGradient(x, y, x, y + h);
    frost.addColorStop(0, `rgba(255, 255, 255, ${0.2 + boost})`);
    frost.addColorStop(1, `rgba(255, 255, 255, ${0.05 + boost})`);
    ctx.fillStyle = frost;
    ctx.fillRect(x, y, w, h);

    if (o.hue !== undefined) {
      ctx.fillStyle = `hsla(${o.hue}, 90%, 68%, 0.2)`;
      ctx.fillRect(x, y, w, h);
    }

    if (o.tint) {
      ctx.fillStyle = o.tint;
      ctx.fillRect(x, y, w, h);
    }

    content?.();

    // Inner glow + rim light (top-left and bottom-right catch the light).
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = clamp(side * 0.2, 3, 14);
    roundRect(rect, radius);
    ctx.stroke();

    const rim = ctx.createLinearGradient(x, y, x + w, y + h);
    rim.addColorStop(0, "rgba(255, 255, 255, 0.85)");
    rim.addColorStop(0.3, "rgba(255, 255, 255, 0.1)");
    rim.addColorStop(0.7, "rgba(255, 255, 255, 0.08)");
    rim.addColorStop(1, "rgba(255, 255, 255, 0.5)");
    ctx.strokeStyle = rim;
    ctx.lineWidth = clamp(side * 0.08, 1, 2.4);
    roundRect(rect, radius);
    ctx.stroke();

    // Specular highlight on roughly round shapes.
    if (side >= 26 && w / h < 1.6 && h / w < 1.6) {
      const shine = ctx.createLinearGradient(x, y, x, y + h * 0.5);
      shine.addColorStop(0, "rgba(255, 255, 255, 0.38)");
      shine.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = shine;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h * 0.2, w * 0.34, h * 0.13, 0, 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 1;
    roundRect(rect, radius);
    ctx.stroke();

    if (o.ring) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.lineWidth = 2;
      roundRect({ x: x - 4, y: y - 4, w: w + 8, h: h + 8 }, radius + 4);
      ctx.stroke();
    }
  }

  function label(
    text: string,
    x: number,
    y: number,
    size: number,
    maxWidth: number,
  ): void {
    ctx.save();
    ctx.font = `500 ${size}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.shadowColor = "rgba(0, 0, 24, 0.65)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 1;
    ctx.fillText(fit(text, maxWidth), x, y);
    ctx.restore();
  }

  function chip(text: string, x: number, y: number): void {
    ctx.font = `500 12px ${FONT}`;
    const content = fit(text, 220);
    const w = ctx.measureText(content).width + 26;
    const cx = clamp(x, w / 2 + 8, width - w / 2 - 8);

    glass(cx - w / 2, y - 13, w, 26, 13, { lens: 1.02 });

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.fillText(content, cx, y + 0.5);
  }

  function spinner(x: number, y: number, r = 6): void {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.beginPath();

    const angle = reducedMotion.matches ? -Math.PI / 2 : elapsed * 4;

    ctx.arc(x, y, r, angle, angle + Math.PI * 1.4);
    ctx.stroke();
    ctx.restore();
  }

  function wake(): void {
    if (destroyed || frame) return;

    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function imageFor(src: string): HTMLImageElement {
    const existing = images.get(src);
    if (existing) return existing;

    const image = new Image();
    image.decoding = "async";
    image.onload = wake;
    image.onerror = wake;

    images.set(src, image);
    image.src = src;

    return image;
  }

  function drawCover(
    image: HTMLImageElement,
    x: number,
    y: number,
    r: number,
  ): void {
    const scale = Math.max(
      (r * 2) / image.naturalWidth,
      (r * 2) / image.naturalHeight,
    );
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;

    ctx.drawImage(image, x - w / 2, y - h / 2, w, h);
  }

  // ───────────────────────── actions & status ─────────────────────────

  function actionKey(contextId: string, action: OfferedAction): string {
    return `action:${JSON.stringify([contextId, action.source, action.id])}`;
  }

  function showError(error: unknown): void {
    localError = error instanceof Error ? error.message : String(error);
    dismissedStatus = null;
    rebuild();
  }

  function safe(work: () => void): void {
    try {
      work();
    } catch (error) {
      showError(error);
    }
  }

  async function invoke(
    contextId: string,
    action: OfferedAction,
  ): Promise<void> {
    const key = actionKey(contextId, action);

    if (action.busy || pending.has(key)) return;

    pending.add(key);
    localError = null;
    dismissedStatus = null;
    rebuild();

    try {
      await session.invoke(contextId, action.id, action.source);
    } catch (error) {
      if (!destroyed) {
        localError =
          error instanceof Error ? error.message : "Could not invoke action";
      }
    } finally {
      pending.delete(key);

      if (!destroyed) rebuild();
    }
  }

  function currentStatus(): Status | null {
    let status: Status | null = null;

    if (localError) {
      status = {
        key: `local:${localError}`,
        text: localError,
        tone: "error",
        busy: false,
      };
    } else if (state.operationErrors.length) {
      const error = state.operationErrors.at(-1)!;

      status = {
        key: `tracking:${error.id}:${error.message}`,
        text: `Connection: ${error.message}`,
        tone: "error",
        busy: false,
      };
    } else {
      const running = state.operations.filter(
        (operation) => operation.status === "running",
      );

      if (running.length) {
        status = {
          key: `running:${running.map((operation) => operation.id).join(",")}`,
          text:
            running.length === 1
              ? "Working…"
              : `${running.length} operations running…`,
          tone: "info",
          busy: true,
        };
      } else {
        const latest = [...state.operations].sort((a, b) => {
          const aTime = a.status === "running" ? a.startedAt : a.finishedAt;
          const bTime = b.status === "running" ? b.startedAt : b.finishedAt;

          return bTime - aTime;
        })[0];

        if (latest?.status === "failed") {
          status = {
            key: `failed:${latest.id}`,
            text: latest.error.message,
            tone: "error",
            busy: false,
          };
        } else if (latest?.status === "succeeded") {
          const count = latest.result.things.length;

          status = {
            key: `succeeded:${latest.id}`,
            text:
              count > 0
                ? `Done · ${count} ${count === 1 ? "result" : "results"} available`
                : "Done",
            tone: "success",
            busy: false,
          };
        }
      }

      if (!status && state.error) {
        status = {
          key: `listing:${state.error}`,
          text: state.error,
          tone: "error",
          busy: false,
        };
      }

      if (!status && state.loading) {
        status = {
          key: "loading",
          text: "Loading things…",
          tone: "info",
          busy: true,
        };
      }
    }

    return status?.key === dismissedStatus ? null : status;
  }

  // ───────────────────────── layout ─────────────────────────

  function computeLayout(
    tools: readonly OfferedAction[],
    suggestions: readonly OfferedAction[],
    siblingCount: number,
  ): Layout {
    const wide = width >= 900;
    const nav = state.hasPrevious || state.hasNext ? 46 : 0;

    let bottom = height - 16 - nav;
    let dock: Rect | null = null;

    if (state.focus && siblingCount > 0) {
      const slot = clamp((width - 80) / siblingCount, 12, 56);
      const w = Math.min(width - 40, siblingCount * slot + 40);

      dock = { x: (width - w) / 2, y: bottom - 64, w, h: 64 };
      bottom = dock.y - 12;
    }

    bottom = Math.max(150, bottom);

    let sceneRight = width - 20;
    let sceneBottom = bottom;

    let toolPanel: Rect | null = null;
    let suggestionPanel: Rect | null = null;

    if (state.focus && tools.length) {
      if (wide) {
        toolPanel = {
          x: width - 272,
          y: 104,
          w: 252,
          h: Math.max(100, bottom - 104),
        };
        sceneRight = toolPanel.x - 24;
      } else {
        toolPanel = {
          x: 20,
          y: bottom - 96,
          w: Math.max(1, width - 40),
          h: 96,
        };
        sceneBottom = toolPanel.y - 12;
      }
    }

    if (state.focus && suggestions.length) {
      suggestionPanel = {
        x: 20,
        y: sceneBottom - 96,
        w: Math.max(1, sceneRight - 20),
        h: 96,
      };
      sceneBottom = suggestionPanel.y - 12;
    }

    return {
      wide,
      dock,
      tools: toolPanel,
      suggestions: suggestionPanel,
      scene: {
        x: 20,
        y: 104,
        w: Math.max(1, sceneRight - 20),
        h: Math.max(40, sceneBottom - 104),
      },
    };
  }

  function addControl(control: Control): void {
    controls.push(control);
  }

  /** A scrollable glass tray. No pages: wheel, drag, or arrow keys. */
  function addRail(
    kind: RailKind,
    rect: Rect,
    actions: readonly OfferedAction[],
  ): void {
    const focus = state.focus;
    if (!focus) return;

    const axis = kind === "tools" && layout.wide ? "y" : "x";
    const itemW = axis === "y" ? rect.w - 24 : Math.min(220, rect.w - 28);
    const step = (axis === "y" ? 52 : itemW) + 10;
    const start = axis === "y" ? 40 : 14;
    const view = (axis === "y" ? rect.h : rect.w) - start - 14;
    const max = Math.max(0, actions.length * step - 10 - view);

    scroll[kind].offset = clamp(scroll[kind].offset, 0, max);

    rails.push({
      kind,
      label: kind === "tools" ? "TOOLS" : "SUGGESTED",
      rect,
      clip:
        axis === "y"
          ? { x: rect.x + 4, y: rect.y + 32, w: rect.w - 8, h: rect.h - 36 }
          : { x: rect.x + 6, y: rect.y + 28, w: rect.w - 12, h: rect.h - 32 },
      axis,
      start,
      view,
      max,
    });

    actions.forEach((action, index) => {
      const key = actionKey(focus.id, action);
      const busy = action.busy || pending.has(key);

      const home =
        axis === "y"
          ? { x: rect.x + 12, y: rect.y + start + index * step }
          : { x: rect.x + start + index * step, y: rect.y + 34 };

      addControl({
        key,
        label: action.label,
        hint:
          action.recommendation?.reason ??
          action.description ??
          action.category ??
          "",
        x: home.x,
        y: home.y,
        w: itemW,
        h: 52,
        enabled: !busy,
        busy,
        accent: kind === "suggestions",
        rail: kind,
        home,
        run: () => {
          void invoke(focus.id, action);
        },
      });
    });
  }

  function applyScroll(): void {
    for (const control of controls) {
      if (!control.rail || !control.home) continue;

      const rail = rails.find((item) => item.kind === control.rail);
      if (!rail) continue;

      const shown = scroll[control.rail].shown;

      control.x = control.home.x - (rail.axis === "x" ? shown : 0);
      control.y = control.home.y - (rail.axis === "y" ? shown : 0);
    }
  }

  function scrollBy(rail: Rail, delta: number): void {
    const s = scroll[rail.kind];
    s.offset = clamp(s.offset + delta, 0, rail.max);
    wake();
  }

  function reveal(key: string): void {
    const control = controls.find((item) => item.key === key);
    if (!control?.rail || !control.home) return;

    const rail = rails.find((item) => item.kind === control.rail);
    if (!rail) return;

    const pos =
      rail.axis === "y"
        ? control.home.y - rail.rect.y - rail.start
        : control.home.x - rail.rect.x - rail.start;
    const size = rail.axis === "y" ? control.h : control.w;
    const s = scroll[rail.kind];

    if (pos < s.offset) s.offset = pos;
    else if (pos + size > s.offset + rail.view)
      s.offset = pos + size - rail.view;

    s.offset = clamp(s.offset, 0, rail.max);
  }

  /** Concentric, counter-rotating orbits. Everything fits, nothing pages. */
  function planRings(count: number, focusR: number) {
    const scene = layout.scene;
    let radius = clamp(Math.min(scene.w, scene.h) * 0.075, 14, 34);

    type Ring = { rx: number; ry: number; count: number; spin: number };
    let rings: Ring[] = [];

    if (count === 0) return { radius, rings };

    for (let attempt = 0; attempt < 24; attempt++) {
      const rxMax = Math.max(30, scene.w / 2 - radius - 14);
      const ryMax = Math.max(30, scene.h / 2 - radius - 28);
      const rx0 = Math.min(focusR + radius + 42, rxMax);
      const ry0 = Math.min(focusR + radius + 42, ryMax);
      const most = clamp(Math.floor((ryMax - ry0) / (radius * 2.5)) + 1, 1, 8);

      const shape = (m: number) =>
        Array.from({ length: m }, (_, k) => {
          const u = m === 1 ? 0.8 : k / (m - 1);
          const rx = rx0 + (rxMax - rx0) * u;
          const ry = ry0 + (ryMax - ry0) * u;

          return { rx, ry, len: TAU * Math.sqrt((rx * rx + ry * ry) / 2) };
        });

      const capacity = (m: number) =>
        shape(m).reduce((sum, ring) => sum + ring.len, 0) / (radius * 2.7);

      let chosen = 0;

      for (let m = 1; m <= most; m++) {
        if (capacity(m) >= count * 1.3) {
          chosen = m;
          break;
        }
      }

      if (!chosen && capacity(most) >= count) chosen = most;

      if (chosen || radius <= 8) {
        const used = shape(chosen || most);
        const total = used.reduce((sum, ring) => sum + ring.len, 0);

        let acc = 0;
        let previous = 0;

        rings = used.map((ring, k) => {
          acc += ring.len;
          const upto = Math.round((count * acc) / total);
          const n = upto - previous;
          previous = upto;

          return {
            rx: ring.rx,
            ry: ring.ry,
            count: n,
            spin: (k % 2 === 0 ? 1 : -1) / (1 + k * 0.3),
          };
        });

        break;
      }

      radius *= 0.92;
    }

    return { radius, rings };
  }

  function buildTargets(): NodeTarget[] {
    const targets: NodeTarget[] = [];
    const focus = state.focus;

    const tools = state.actions.filter(
      (action) => action.recommendation === undefined,
    );

    const suggestions = state.actions
      .filter((action) => action.recommendation !== undefined)
      .sort(
        (a, b) =>
          (b.recommendation?.relevance ?? 0) -
          (a.recommendation?.relevance ?? 0),
      );

    const siblings = focus
      ? state.siblings.filter((thing) => thing.id !== focus.id)
      : [];

    layout = computeLayout(tools, suggestions, siblings.length);
    controls = [];
    rails = [];
    guides = [];

    const scene = layout.scene;
    const cx = scene.x + scene.w / 2;
    const cy = scene.y + scene.h / 2;

    function node(
      thing: Thing,
      role: NodeRole,
      x: number,
      y: number,
      r: number,
      orbit?: Orbit,
    ): void {
      targets.push({
        key: `thing:${thing.id}`,
        thing,
        role,
        x,
        y,
        r,
        ...(orbit ? { orbit } : {}),
      });
    }

    if (!focus) {
      // A sunflower spiral: everything fits on one screen and swirls gently.
      const count = state.children.length;

      if (count > 0) {
        const sx = Math.sqrt(clamp(scene.w / scene.h, 1, 1.8));
        const root = Math.sqrt(count);

        const spacing = Math.max(
          6,
          Math.min(
            112,
            (scene.w / 2 - 12) / (root * sx + 0.5),
            (scene.h / 2 - 26) / (root / sx + 0.5),
          ),
        );

        const radius = clamp(spacing * 0.5, 11, 58);

        state.children.forEach((thing, index) => {
          const rho = count === 1 ? 0 : spacing * Math.sqrt(index + 0.3);
          const angle = index * GOLDEN;
          const orbit: Orbit = {
            rx: rho * sx,
            ry: rho / sx,
            angle,
            spin: 0,
            swirl: 0.28,
          };

          node(
            thing,
            "root",
            cx + Math.cos(angle) * orbit.rx,
            cy + Math.sin(angle) * orbit.ry,
            radius,
            orbit,
          );
        });
      }
    } else {
      const focusR = clamp(Math.min(scene.w * 0.16, scene.h * 0.17), 22, 92);

      node(focus, "focus", cx, cy, focusR);

      const plan = planRings(state.children.length, focusR);
      guides = plan.rings.map((ring) => ({ rx: ring.rx, ry: ring.ry }));

      let index = 0;

      plan.rings.forEach((ring, k) => {
        for (let j = 0; j < ring.count; j++) {
          const thing = state.children[index++];
          if (!thing) return;

          const angle = -Math.PI / 2 + k * 0.7 + (j * TAU) / ring.count;
          const orbit: Orbit = {
            rx: ring.rx,
            ry: ring.ry,
            angle,
            spin: ring.spin,
            swirl: 0,
          };

          node(
            thing,
            "child",
            cx + Math.cos(angle) * ring.rx,
            cy + Math.sin(angle) * ring.ry,
            plan.radius,
            orbit,
          );
        }
      });

      if (layout.dock) {
        const dock = layout.dock;
        const slot = (dock.w - 40) / siblings.length;
        const radius = clamp(slot * 0.4, 6, 19);

        siblings.forEach((thing, index) => {
          node(
            thing,
            "sibling",
            dock.x + 20 + (index + 0.5) * slot,
            dock.y + dock.h / 2,
            radius,
          );
        });
      }

      addControl({
        key: "back",
        label: "‹ Back",
        x: 20,
        y: 14,
        w: 84,
        h: 30,
        enabled: true,
        run: () => session.back(),
      });
    }

    if (layout.tools) addRail("tools", layout.tools, tools);
    if (layout.suggestions)
      addRail("suggestions", layout.suggestions, suggestions);

    // Listing pages belong to the session, so these two stay.
    if (state.hasPrevious) {
      addControl({
        key: "previous-page",
        label: "‹ Previous",
        x: width / 2 - 116,
        y: height - 46,
        w: 108,
        h: 32,
        enabled: !state.loading,
        run: () => session.previous(),
      });
    }

    if (state.hasNext) {
      addControl({
        key: "next-page",
        label: "Next ›",
        x: width / 2 + 8,
        y: height - 46,
        w: 108,
        h: 32,
        enabled: !state.loading,
        run: () => session.next(),
      });
    }

    statusNow = currentStatus();
    statusRect = null;
    statusText = "";

    const current = statusNow;

    if (current) {
      ctx.font = `500 12px ${FONT}`;

      const right = current.busy ? 18 : 46;
      statusText = fit(current.text, Math.max(0, width - 40 - 36 - right));

      const w = ctx.measureText(statusText).width + 36 + right;
      const rect = { x: (width - w) / 2, y: 56, w, h: 36 };
      statusRect = rect;

      if (!current.busy) {
        addControl({
          key: "dismiss-status",
          label: "×",
          x: rect.x + rect.w - 38,
          y: 60,
          w: 28,
          h: 28,
          enabled: true,
          run() {
            dismissedStatus = current.key;

            if (current.key.startsWith("local:")) localError = null;

            rebuild();
          },
        });
      }
    }

    if (state.error) {
      addControl({
        key: "refresh",
        label: "↻",
        x: width - 54,
        y: 14,
        w: 34,
        h: 30,
        enabled: !state.loading,
        run() {
          void session.refresh().catch(showError);
        },
      });
    }

    return targets;
  }

  function rebuild(): void {
    if (destroyed) return;

    state = session.snapshot();

    const nextFocus = state.focus?.id ?? null;

    if (nextFocus !== focusId) {
      focusId = nextFocus;
      scroll.tools.offset = scroll.tools.shown = 0;
      scroll.suggestions.offset = scroll.suggestions.shown = 0;
      keyboardKey = null;
      hovered = null;
    }

    for (const body of bodies.values()) body.visible = false;

    const targets = buildTargets();
    applyScroll();

    for (const target of targets) {
      let body = bodies.get(target.key);

      if (!body) {
        const parent = target.thing.parent
          ? bodies.get(`thing:${target.thing.parent}`)
          : undefined;

        const seed = seedOf(target.key);

        body = {
          target,
          x: parent?.x ?? target.x,
          y: parent?.y ?? target.y,
          r: reducedMotion.matches ? target.r : 0,
          opacity: reducedMotion.matches ? 1 : 0,
          scale: 1,
          vx: 0,
          vy: 0,
          vr: 0,
          vo: 0,
          vs: 0,
          visible: true,
          phase: (seed % 6283) / 1000,
          hue: 190 + (seed % 140),
        };

        bodies.set(target.key, body);
      }

      body.target = target;
      body.visible = true;
    }

    if (
      pointer?.draggable &&
      pointer.key &&
      !bodies.get(pointer.key)?.visible
    ) {
      cancelPointer();
    }

    if (
      keyboardKey &&
      !interactiveItems().some((item) => item.key === keyboardKey)
    ) {
      keyboardKey = null;
    }

    wake();
  }

  // ───────────────────────── animation ─────────────────────────

  function tick(time: number): void {
    frame = 0;
    if (destroyed) return;

    const dt = clamp((time - lastTime) / 1000, 0, 0.04);
    lastTime = time;

    const instant = reducedMotion.matches;
    if (!instant) elapsed += dt;

    const hoveringChild =
      hovered !== null && bodies.get(hovered)?.target.role === "child";

    if (!instant && !hoveringChild && !keyboardKey && !pointer?.moved) {
      orbitAngle += orbitSpeed * dt;
      orbitSpeed += (BASE_SPIN - orbitSpeed) * (1 - Math.exp(-dt * 0.7));
    }

    for (const kind of ["tools", "suggestions"] as const) {
      const s = scroll[kind];

      if (instant) {
        s.shown = s.offset;
      } else {
        s.shown += (s.offset - s.shown) * (1 - Math.exp(-dt * 14));
        if (Math.abs(s.offset - s.shown) < 0.2) s.shown = s.offset;
      }
    }

    applyScroll();

    const scene = layout.scene;
    const cx = scene.x + scene.w / 2;
    const cy = scene.y + scene.h / 2;

    let moving = false;

    for (const [key, body] of bodies) {
      const target = body.target;
      const orbit = target.orbit;

      let x = target.x;
      let y = target.y;

      if (orbit) {
        const angle =
          orbit.angle +
          (instant
            ? 0
            : orbitAngle * orbit.spin + Math.sin(elapsed * 0.2) * orbit.swirl);

        const breathe = instant
          ? 1
          : 1 + 0.025 * Math.sin(elapsed * 0.6 + body.phase);

        x = cx + Math.cos(angle) * orbit.rx * breathe;
        y = cy + Math.sin(angle) * orbit.ry * breathe;
      }

      if (!instant && target.role !== "sibling") {
        x += Math.sin(elapsed * 0.7 + body.phase) * 2.5;
        y += Math.cos(elapsed * 0.9 + body.phase * 1.3) * 3;
      }

      const dragging =
        pointer?.key === key && pointer.moved && pointer.draggable;
      const hot = hovered === key || keyboardKey === key;

      let scale = dragging ? 1.12 : hot ? 1.06 : 1;

      // Cursor gravity: root things lean toward the pointer, the dock magnifies.
      if (mouse && !instant && !dragging) {
        if (target.role === "root") {
          const dx = mouse.x - x;
          const dy = mouse.y - y;
          const f = Math.max(0, 1 - Math.hypot(dx, dy) / 160);
          const m = f * f;

          x += dx * m * 0.22;
          y += dy * m * 0.22;
          scale += m * 0.28;
        } else if (target.role === "sibling") {
          const near = clamp(1 - Math.abs(mouse.y - y) / 80, 0, 1);
          const f = Math.max(0, 1 - Math.abs(mouse.x - x) / 90);
          const m = f * f * near;

          scale += m * 0.95;
          y -= m * 14;
          x += (mouse.x - x) * m * 0.2;
        }
      }

      if (dragging && pointer) {
        x = pointer.x - pointer.offsetX;
        y = pointer.y - pointer.offsetY;
      }

      const r = body.visible ? target.r : target.r * 0.8;
      const opacity = body.visible ? 1 : 0;

      if (instant) {
        body.x = x;
        body.y = y;
        body.r = r;
        body.opacity = opacity;
        body.scale = scale;
        body.vx = body.vy = body.vr = body.vo = body.vs = 0;
      } else {
        [body.x, body.vx] = spring(body.x, body.vx, x, dt, dragging ? 25 : 14);
        [body.y, body.vy] = spring(body.y, body.vy, y, dt, dragging ? 25 : 14);
        [body.r, body.vr] = spring(body.r, body.vr, r, dt);
        [body.opacity, body.vo] = spring(
          body.opacity,
          body.vo,
          opacity,
          dt,
          18,
          1,
        );
        [body.scale, body.vs] = spring(body.scale, body.vs, scale, dt, 18);
      }

      if (!body.visible && body.opacity === 0) {
        bodies.delete(key);
        continue;
      }

      moving ||=
        body.vx !== 0 ||
        body.vy !== 0 ||
        body.vr !== 0 ||
        body.vo !== 0 ||
        body.vs !== 0;
    }

    draw();

    if (moving || !instant) frame = requestAnimationFrame(tick);
  }

  // ───────────────────────── rendering ─────────────────────────

  function drawControl(control: Control): void {
    const hot = hovered === control.key || keyboardKey === control.key;
    const compact = control.h <= 34;

    ctx.save();
    ctx.globalAlpha = control.enabled || control.busy ? 1 : 0.4;

    glass(
      control.x,
      control.y,
      control.w,
      control.h,
      compact ? control.h / 2 : 18,
      {
        hot,
        ring: keyboardKey === control.key,
        lens: 1.04,
        tint: control.accent ? "rgba(110, 255, 214, 0.16)" : undefined,
      },
    );

    const reserve = control.busy ? 34 : 14;

    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";

    if (compact) {
      ctx.textAlign = "center";
      ctx.font = `500 13px ${FONT}`;
      ctx.fillText(
        fit(control.label, control.w - 12),
        control.x + control.w / 2,
        control.y + control.h / 2 + 0.5,
      );
    } else {
      ctx.textAlign = "left";
      ctx.font = `600 13px ${FONT}`;

      const labelY = control.hint ? control.y + 20 : control.y + control.h / 2;
      ctx.fillText(
        fit(control.label, control.w - reserve - 14),
        control.x + 14,
        labelY,
      );

      if (control.hint) {
        ctx.font = `11px ${FONT}`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.fillText(
          fit(
            control.busy ? "Working…" : control.hint,
            control.w - reserve - 14,
          ),
          control.x + 14,
          control.y + 37,
        );
      }
    }

    if (control.busy)
      spinner(control.x + control.w - 20, control.y + control.h / 2);

    ctx.restore();
  }

  function drawRail(rail: Rail): void {
    const { rect } = rail;

    glass(rect.x, rect.y, rect.w, rect.h, 24);

    ctx.textAlign = "left";
    ctx.font = `600 10px ${FONT}`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.fillText(rail.label, rect.x + 18, rect.y + 20);

    ctx.save();
    ctx.beginPath();
    ctx.rect(rail.clip.x, rail.clip.y, rail.clip.w, rail.clip.h);
    ctx.clip();

    for (const control of controls) {
      if (control.rail === rail.kind && intersects(control, rail.clip)) {
        drawControl(control);
      }
    }

    ctx.restore();

    if (rail.max > 0) {
      const bar = Math.max(
        24,
        (rail.view * rail.view) / (rail.view + rail.max),
      );
      const at = (scroll[rail.kind].shown / rail.max) * (rail.view - bar);

      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";

      if (rail.axis === "y") {
        roundRect(
          { x: rect.x + rect.w - 7, y: rect.y + rail.start + at, w: 3, h: bar },
          1.5,
        );
      } else {
        roundRect(
          { x: rect.x + rail.start + at, y: rect.y + rect.h - 7, w: bar, h: 3 },
          1.5,
        );
      }

      ctx.fill();
    }
  }

  function drawHeader(): void {
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";

    if (state.focus) {
      ctx.font = `600 15px ${FONT}`;
      ctx.fillText(fit(title(state.focus), width - 118 - 70), 118, 29);
    } else {
      ctx.font = `700 24px ${FONT}`;
      ctx.fillText("Workspace", 24, 32);
    }

    if (statusNow && statusRect) {
      const tint =
        statusNow.tone === "error"
          ? "rgba(255, 95, 85, 0.28)"
          : statusNow.tone === "success"
            ? "rgba(80, 230, 160, 0.22)"
            : "rgba(120, 170, 255, 0.18)";

      glass(statusRect.x, statusRect.y, statusRect.w, statusRect.h, 18, {
        tint,
        lens: 1.03,
      });

      if (statusNow.busy) {
        spinner(statusRect.x + 20, statusRect.y + 18);
      } else {
        ctx.fillStyle =
          statusNow.tone === "error"
            ? "#ff8a80"
            : statusNow.tone === "success"
              ? "#7dffc4"
              : "#9cc2ff";
        ctx.beginPath();
        ctx.arc(statusRect.x + 20, statusRect.y + 18, 4, 0, TAU);
        ctx.fill();
      }

      ctx.font = `500 12px ${FONT}`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.textAlign = "left";
      ctx.fillText(statusText, statusRect.x + 36, statusRect.y + 18.5);
    } else {
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.fillText(
        fit(
          state.focus
            ? "Drag to spin · scroll to dive · Esc to go back"
            : "Select a thing to explore",
          width - 48,
        ),
        24,
        74,
      );
    }
  }

  function drawBody(body: Body): void {
    const { target } = body;

    const r = Math.max(0.1, body.r * body.scale);
    const hot = hovered === target.key || keyboardKey === target.key;
    const isFocus = target.role === "focus";
    const dragging =
      pointer?.key === target.key && pointer.moved && pointer.draggable;

    const src = imageSource(target.thing);
    const image = src ? imageFor(src) : null;
    const loaded = image !== null && image.complete && image.naturalWidth > 0;
    const failed = image !== null && image.complete && !loaded;

    ctx.save();
    ctx.globalAlpha = clamp(body.opacity, 0, 1);

    glass(
      body.x - r,
      body.y - r,
      r * 2,
      r * 2,
      r,
      {
        hue: body.hue,
        hot,
        ring: keyboardKey === target.key,
        lift: dragging ? 1 : isFocus ? 0.5 : 0,
        lens: isFocus ? 1.2 : 1.35,
      },
      () => {
        if (loaded && image) {
          drawCover(image, body.x, body.y, r);
          return;
        }

        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255, 255, 255, 0.97)";
        ctx.shadowColor = "rgba(0, 0, 30, 0.45)";
        ctx.shadowBlur = 8;

        if (isFocus) {
          if (r < 16) return;

          const size = clamp(r * 0.2, 13, 20);

          ctx.font = `600 ${size}px ${FONT}`;
          ctx.fillText(fit(title(target.thing), r * 1.55), body.x, body.y - 4);

          ctx.font = `600 9px ${FONT}`;
          ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
          ctx.fillText(
            failed
              ? "IMAGE UNAVAILABLE"
              : isCollection(target.thing)
                ? "COLLECTION"
                : target.thing.type.toUpperCase(),
            body.x,
            body.y + size * 0.9,
          );
        } else if (r >= 9) {
          ctx.font = `600 ${clamp(r * 0.9, 12, 30)}px ${FONT}`;
          ctx.fillText(
            isCollection(target.thing)
              ? "◎"
              : (Array.from(title(target.thing))[0] ?? "?").toUpperCase(),
            body.x,
            body.y + 1,
          );
        }
      },
    );

    if (isFocus && loaded) {
      label(
        title(target.thing),
        body.x,
        body.y + r + 22,
        16,
        layout.scene.w - 20,
      );
    } else if (target.role === "root" && r >= 20) {
      label(title(target.thing), body.x, body.y + r + 16, 12, 120);
    }

    ctx.restore();
  }

  function draw(): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.textBaseline = "middle";

    paintBackground();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(surface, 0, 0, width, height);

    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.3,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.75,
    );
    vignette.addColorStop(0, "rgba(0, 0, 12, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 12, 0.5)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    const scene = layout.scene;

    // Orbit guides and the focus halo.
    if (state.focus) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
      ctx.lineWidth = 1;

      for (const guide of guides) {
        ctx.beginPath();
        ctx.ellipse(
          scene.x + scene.w / 2,
          scene.y + scene.h / 2,
          guide.rx,
          guide.ry,
          0,
          0,
          TAU,
        );
        ctx.stroke();
      }

      for (const body of bodies.values()) {
        if (body.target.role !== "focus" || !body.visible) continue;

        const outer = Math.max(1, body.r * 3.2);
        const alpha = 0.28 * clamp(body.opacity, 0, 1);
        const halo = ctx.createRadialGradient(
          body.x,
          body.y,
          Math.max(0, body.r * 0.6),
          body.x,
          body.y,
          outer,
        );

        halo.addColorStop(0, `hsla(${body.hue}, 95%, 65%, ${alpha})`);
        halo.addColorStop(1, `hsla(${body.hue}, 95%, 65%, 0)`);
        ctx.fillStyle = halo;
        ctx.fillRect(body.x - outer, body.y - outer, outer * 2, outer * 2);
      }
    }

    drawHeader();

    if (layout.dock) {
      glass(layout.dock.x, layout.dock.y, layout.dock.w, layout.dock.h, 30);
    }

    drawn = [...bodies.values()].sort((a, b) => {
      function priority(body: Body): number {
        if (pointer?.moved && pointer.key === body.target.key) return 3;
        if (body.target.role === "focus") return 2;
        if (hovered === body.target.key) return 1;
        return 0;
      }

      return priority(a) - priority(b);
    });

    for (const body of drawn) drawBody(body);

    // Name chips for small or label-less things when pointed at.
    const active = hovered ?? keyboardKey;
    const pointed = active ? bodies.get(active) : undefined;

    if (pointed?.visible && !(pointer?.moved && pointer.key === active)) {
      const role = pointed.target.role;
      const r = pointed.r * pointed.scale;

      if (role === "child") {
        chip(title(pointed.target.thing), pointed.x, pointed.y + r + 22);
      } else if (role === "sibling") {
        chip(title(pointed.target.thing), pointed.x, pointed.y - r - 24);
      } else if (role === "root" && pointed.r < 20) {
        chip(title(pointed.target.thing), pointed.x, pointed.y + r + 22);
      }
    }

    for (const rail of rails) drawRail(rail);

    for (const control of controls) {
      if (!control.rail) drawControl(control);
    }

    if (!state.focus && !state.loading && !state.children.length) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.font = `500 14px ${FONT}`;
      ctx.fillText(
        "This workspace is empty",
        scene.x + scene.w / 2,
        scene.y + scene.h / 2,
      );
    }
  }

  // ───────────────────────── input ─────────────────────────

  function point(event: PointerEvent | WheelEvent) {
    const bounds = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - bounds.left) * width) / Math.max(1, bounds.width),
      y: ((event.clientY - bounds.top) * height) / Math.max(1, bounds.height),
    };
  }

  function inRect(x: number, y: number, rect: Rect): boolean {
    return (
      x >= rect.x && y >= rect.y && x <= rect.x + rect.w && y <= rect.y + rect.h
    );
  }

  function hit(x: number, y: number): string | null {
    for (let index = controls.length - 1; index >= 0; index--) {
      const control = controls[index]!;

      if (!inRect(x, y, control)) continue;

      if (control.rail) {
        const rail = rails.find((item) => item.kind === control.rail);
        if (!rail || !inRect(x, y, rail.clip)) continue;
      }

      return control.enabled ? control.key : null;
    }

    // Trays block clicks on things passing behind them.
    if (rails.some((rail) => inRect(x, y, rail.rect))) return null;

    for (let index = drawn.length - 1; index >= 0; index--) {
      const body = drawn[index]!;

      if (!body.visible || body.opacity < 0.2) continue;

      const min = body.target.role === "sibling" ? 9 : 16;

      if (
        Math.hypot(x - body.x, y - body.y) <= Math.max(min, body.r * body.scale)
      ) {
        return body.target.key;
      }
    }

    return null;
  }

  function activate(key: string): void {
    const control = controls.find((item) => item.key === key);

    if (control) {
      if (control.enabled) safe(control.run);
      return;
    }

    const body = bodies.get(key);

    if (body?.visible) safe(() => session.focus(body.target.thing.id));
  }

  function interactiveItems(): Array<{ key: string; label: string }> {
    return [
      ...controls
        .filter((control) => control.enabled)
        .map((control) => ({ key: control.key, label: control.label })),

      ...[...bodies.values()]
        .filter((body) => body.visible)
        .map((body) => ({
          key: body.target.key,
          label: title(body.target.thing),
        })),
    ];
  }

  function cancelPointer(): void {
    const previous = pointer;
    pointer = null;

    if (previous && canvas.hasPointerCapture(previous.id)) {
      canvas.releasePointerCapture(previous.id);
    }

    canvas.style.cursor = hovered ? "pointer" : "default";
    wake();
  }

  function pointerDown(event: PointerEvent): void {
    if (event.button !== 0 || pointer) return;

    canvas.focus({ preventScroll: true });
    keyboardKey = null;

    const p = point(event);
    const key = hit(p.x, p.y);
    const body = key ? bodies.get(key) : undefined;
    const rail = rails.find((item) => inRect(p.x, p.y, item.rect));

    mouse = p;

    pointer = {
      id: event.pointerId,
      key,
      startX: p.x,
      startY: p.y,
      x: p.x,
      y: p.y,
      lastX: p.x,
      lastY: p.y,
      offsetX: body ? p.x - body.x : 0,
      offsetY: body ? p.y - body.y : 0,
      moved: false,
      draggable: body?.visible === true,
      lastAngle: null,
      rail: rail?.kind ?? null,
    };

    canvas.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent): void {
    const p = point(event);
    mouse = p;

    if (pointer?.id === event.pointerId) {
      const wasMoved = pointer.moved;

      pointer.x = p.x;
      pointer.y = p.y;

      if (Math.hypot(p.x - pointer.startX, p.y - pointer.startY) > 6) {
        pointer.moved = true;
      }

      if (pointer.moved && pointer.rail) {
        const rail = rails.find((item) => item.kind === pointer?.rail);

        if (rail && wasMoved) {
          scrollBy(
            rail,
            rail.axis === "y" ? pointer.lastY - p.y : pointer.lastX - p.x,
          );
        }

        pointer.lastX = p.x;
        pointer.lastY = p.y;
        wake();
        return;
      }

      pointer.lastX = p.x;
      pointer.lastY = p.y;

      if (pointer.moved && pointer.draggable && pointer.key) {
        const body = bodies.get(pointer.key);

        if (body?.target.role === "child" && !reducedMotion.matches) {
          const scene = layout.scene;

          const angle = Math.atan2(
            p.y - scene.y - scene.h / 2,
            p.x - scene.x - scene.w / 2,
          );

          if (pointer.lastAngle !== null) {
            const difference = Math.atan2(
              Math.sin(angle - pointer.lastAngle),
              Math.cos(angle - pointer.lastAngle),
            );

            orbitAngle += difference * 0.3;
            orbitSpeed = clamp(orbitSpeed + difference * 2, -1.5, 1.5);
          }

          pointer.lastAngle = angle;
        }

        canvas.style.cursor = "grabbing";
        wake();
        return;
      }
    }

    const key = hit(p.x, p.y);

    if (hovered !== key) {
      hovered = key;
      canvas.style.cursor = key ? "pointer" : "default";
    }

    wake();
  }

  function pointerUp(event: PointerEvent): void {
    if (!pointer || pointer.id !== event.pointerId) return;

    const previous = pointer;
    const p = point(event);

    const clicked =
      !previous.moved &&
      Math.hypot(p.x - previous.startX, p.y - previous.startY) <= 6 &&
      previous.key !== null &&
      hit(p.x, p.y) === previous.key;

    cancelPointer();

    if (clicked && previous.key) activate(previous.key);

    if (event.pointerType === "touch") mouse = null;

    hovered = hit(p.x, p.y);
    canvas.style.cursor = hovered ? "pointer" : "default";
    wake();
  }

  function pointerCancel(event: PointerEvent): void {
    if (pointer?.id === event.pointerId) cancelPointer();
  }

  function lostPointerCapture(event: PointerEvent): void {
    if (pointer?.id === event.pointerId) {
      pointer = null;
      canvas.style.cursor = "default";
      wake();
    }
  }

  function pointerLeave(): void {
    if (pointer) return;

    hovered = null;
    mouse = null;
    canvas.style.cursor = "default";
    wake();
  }

  function wheel(event: WheelEvent): void {
    if (event.ctrlKey || pointer) return;

    event.preventDefault();

    const p = point(event);
    const unit =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;

    // Scrolling a tray scrolls the tray, never the workspace.
    const rail = rails.find((item) => inRect(p.x, p.y, item.rect));

    if (rail) {
      const delta =
        rail.axis === "y" ? event.deltaY : event.deltaX || event.deltaY;
      scrollBy(rail, delta * unit);
      return;
    }

    if (wheelTimer !== undefined) clearTimeout(wheelTimer);

    wheelTimer = setTimeout(() => {
      wheelAmount = 0;
      wheelLocked = false;
    }, 180);

    if (wheelLocked) return;

    if (controls.some((control) => !control.rail && inRect(p.x, p.y, control)))
      return;

    wheelAmount += event.deltaY * unit;

    if (Math.abs(wheelAmount) < 70) return;
    wheelLocked = true;

    if (wheelAmount > 0) {
      safe(() => session.back());
    } else {
      const key = hit(p.x, p.y);

      if (key && bodies.has(key)) activate(key);
    }
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();

      if (pointer) cancelPointer();
      else safe(() => session.back());

      return;
    }

    if (
      event.key === "ArrowRight" ||
      event.key === "ArrowDown" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowUp"
    ) {
      event.preventDefault();

      const items = interactiveItems();
      if (!items.length) return;

      const direction =
        event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const current = items.findIndex((item) => item.key === keyboardKey);

      const next =
        current === -1
          ? direction > 0
            ? 0
            : items.length - 1
          : (current + direction + items.length) % items.length;

      const selected = items[next]!;

      keyboardKey = selected.key;
      reveal(selected.key);

      canvas.setAttribute(
        "aria-label",
        `${selected.label}. Enter to activate. Escape to go back.`,
      );

      wake();
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && keyboardKey) {
      event.preventDefault();

      if (!event.repeat) activate(keyboardKey);
    }
  }

  function blur(): void {
    keyboardKey = null;
    wake();
  }

  function resize(): void {
    if (destroyed) return;

    const bounds = canvas.getBoundingClientRect();

    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    dpr = Math.max(1, window.devicePixelRatio || 1);

    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));

    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    surface.width = Math.max(8, Math.ceil(width * BG_SCALE));
    surface.height = Math.max(8, Math.ceil(height * BG_SCALE));

    rebuild();
  }

  function motionChanged(): void {
    wake();
  }

  const unsubscribe = session.subscribe(rebuild);
  const observer = new ResizeObserver(resize);

  canvas.style.touchAction = "none";

  if (canvas.tabIndex < 0) canvas.tabIndex = 0;

  canvas.setAttribute(
    "aria-label",
    "Adapt workspace. Arrow keys select items. Enter activates. Escape goes back.",
  );

  observer.observe(canvas);

  window.addEventListener("resize", resize);
  reducedMotion.addEventListener("change", motionChanged);

  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerCancel);
  canvas.addEventListener("lostpointercapture", lostPointerCapture);
  canvas.addEventListener("pointerleave", pointerLeave);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("keydown", keydown);
  canvas.addEventListener("blur", blur);

  resize();

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;

      cancelAnimationFrame(frame);
      frame = 0;

      if (wheelTimer !== undefined) clearTimeout(wheelTimer);

      cancelPointer();
      observer.disconnect();
      unsubscribe();

      window.removeEventListener("resize", resize);
      reducedMotion.removeEventListener("change", motionChanged);

      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerCancel);
      canvas.removeEventListener("lostpointercapture", lostPointerCapture);
      canvas.removeEventListener("pointerleave", pointerLeave);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("keydown", keydown);
      canvas.removeEventListener("blur", blur);

      canvas.style.cursor = originalCursor;
      canvas.style.touchAction = originalTouchAction;

      if (originalTabIndex === null) canvas.removeAttribute("tabindex");
      else canvas.setAttribute("tabindex", originalTabIndex);

      if (originalLabel === null) canvas.removeAttribute("aria-label");
      else canvas.setAttribute("aria-label", originalLabel);

      for (const image of images.values()) {
        image.onload = null;
        image.onerror = null;
      }

      images.clear();
      bodies.clear();
      pending.clear();

      controls = [];
      rails = [];
      drawn = [];
      guides = [];
    },
  };
}
