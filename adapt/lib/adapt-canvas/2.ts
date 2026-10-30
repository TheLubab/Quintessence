import type { Thing } from "../adapt/core/contracts.ts";
import type { OfferedAction } from "../adapt/core/actions.ts";
import type { Session } from "../adapt/core/session.ts";

type Rect = { x: number; y: number; w: number; h: number };
type Role = "root" | "focus" | "child" | "sibling";
type Node = {
  thing: Thing;
  role: Role;
  x: number;
  y: number;
  r: number;
  phase: number;
};
type Body = Node & {
  px: number;
  py: number;
  size: number;
  alpha: number;
  pull: number;
  vx: number;
  vy: number;
  vr: number;
  va: number;
  alive: boolean;
  pinned: { x: number; y: number } | null;
};
type Control = Rect & {
  key: string;
  label: string;
  busy?: boolean;
  run: () => void;
};

type Drag = {
  id: number;
  key: string | null;
  body: string | null;
  sx: number;
  sy: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  moved: boolean;
  dockStart: number | null;
};

type Heading = {
  text: string;
  x: number;
  y: number;
  alpha: number;
  scale: number;
};

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const FOCUS_ZOOM_MAX = 3;
const FOCUS_FILL_START = 0.8;
const FOCUS_FILL_FULL = 1.05;
const FOCUS_UNFOCUS_LIFT = 0.08;
const DOCK_PAD = 24;
const DOCK_TOP = 20;
const DOCK_WIDTH_MAX = 560;
const DOCK_BACK = 34;
const DOCK_GAP = 10;
const DOCK_ACTIONS_X = DOCK_PAD + DOCK_BACK + DOCK_GAP;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const IMAGE_ICON_PATH =
  "M16 20H19C20.1046 20 21 19.1046 21 18V13" +
  "M16 20H8H5C3.89543 20 3 19.1046 3 18V15" +
  "M16 20C15.4421 18.8842 13.5695 17.0214 9.87201 15.9119" +
  "M21 13V8C21 6.89543 20.1046 6 19 6H16" +
  "M21 13C17.9242 12.8817 12.6653 13.4351 9.87201 15.9119" +
  "M3 15V8C3 6.89543 3.89543 6 5 6H8" +
  "M3 15C5.77637 15 8.04658 15.3641 9.87201 15.9119" +
  "M8 6L10.5858 3.41421C11.3668 2.63316 12.6332 2.63317 13.4142 3.41421L16 6H8" +
  "M7.5 9C7 9 6 9.3 6 10.5C6 11.7 7 12 7.5 12C8 12 9 11.7 9 10.5C9 9.3 8 9 7.5 9Z";

const BROKEN_IMAGE_ICON_PATH =
  "M10 3H5A2 2 0 0 0 3 5V19A2 2 0 0 0 5 21H10 " +
  "M15 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H14 " +
  "M12 2L10 9L14 13L11 22 " +
  "M4 17L8 13L11 16 " +
  "M16 13L20 17 " +
  "M9 8A1 1 0 1 1 7 8A1 1 0 1 1 9 8";

// The atmosphere is a static CSS backdrop, so no canvas pixels are spent on it.
const BACKDROP = [
  "radial-gradient(circle at 13% 17%, rgba(103,197,255,0.42), rgba(103,197,255,0.13) 52%, rgba(103,197,255,0) 66%)",
  "radial-gradient(circle at 78% 16%, rgba(194,161,255,0.42), rgba(194,161,255,0.13) 52%, rgba(194,161,255,0) 66%)",
  "radial-gradient(circle at 65% 83%, rgba(255,176,208,0.42), rgba(255,176,208,0.13) 52%, rgba(255,176,208,0) 66%)",
  "radial-gradient(circle at 12% 83%, rgba(132,245,219,0.42), rgba(132,245,219,0.13) 52%, rgba(132,245,219,0) 66%)",
  "linear-gradient(135deg, #e9f5ff 0%, #f3f0fc 45%, #e6edff 100%)",
].join(", ");

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function title(thing: Thing): string {
  const d = thing.data;
  if (typeof d === "string") return d;
  if (d && typeof d === "object") {
    if ("title" in d && typeof d.title === "string") return d.title;
    if ("text" in d && typeof d.text === "string") return d.text;
  }
  return thing.type;
}

function isContainer(thing: Thing): boolean {
  return thing.type === "collection" || thing.type === "group";
}

function source(thing: Thing): string | null {
  const d = thing.data;
  if (thing.type !== "image" || !d || typeof d !== "object" || !("src" in d))
    return null;
  return typeof d.src === "string" && d.src.trim() ? d.src : null;
}

function round(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, Math.max(0, r.w), Math.max(0, r.h), Math.max(0, rad));
}

export function canvasView(options: {
  canvas: HTMLCanvasElement;
  session: Session;
}) {
  const { canvas, session } = options;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  const ctx = context;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const oldTouch = canvas.style.touchAction;
  const oldCursor = canvas.style.cursor;
  const oldTabIndex = canvas.getAttribute("tabindex");
  const oldLabel = canvas.getAttribute("aria-label");
  const oldBackground = canvas.style.background;

  const bodies = new Map<string, Body>();
  const orbitOffsets = new Map<string, { angle: number; dist: number }>();
  const images = new Map<string, HTMLImageElement>();
  const imageIcon = new Path2D(IMAGE_ICON_PATH);
  const brokenImageIcon = new Path2D(BROKEN_IMAGE_ICON_PATH);
  const pending = new Set<string>();
  const collected = new Map<string, Map<string, Thing>>();
  const controlPulls = new Map<
    string,
    { x: number; y: number; scale: number }
  >();

  let state = session.snapshot();
  let children: Thing[] = [];
  let controls: Control[] = [];
  let drawn: Body[] = [];
  let dock: Rect | null = null;
  let siblingDock: Rect | null = null;
  let dockScroll = 0;
  let dockMaxScroll = 0;
  let dockActionsInset = DOCK_ACTIONS_X;
  let scene: Rect = { x: 20, y: 108, w: 1, h: 1 };
  let w = 1;
  let h = 1;
  let dpr = 1;
  let time = 0;
  let last = 0;
  let raf = 0;
  let destroyed = false;
  let focusKey = "";
  let hover: string | null = null;
  let keyboard: string | null = null;
  let mouse: { x: number; y: number } | null = null;
  let drag: Drag | null = null;
  let heading: Heading | null = null;
  let orbit = 0;
  let orbitVelocity = 0.075;
  let wheelAmount = 0;
  let wheelLocked = false;
  let focusZoom = 1;
  let focusTarget = 1;
  let focusPivot = { x: 0, y: 0 };
  let focusPan = { x: 0, y: 0 };
  let zoomOutUnfocus = false;
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;
  let error: string | null = null;
  let dismissed = "";
  let paging = false;
  let pagingTries = 0;
  let pageScheduled = false;

  function wake() {
    if (!raf && !destroyed) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function outline(rect: Rect, radius: number, alpha = 1) {
    ctx.save();
    round(ctx, rect, radius);
    ctx.strokeStyle = `rgba(255,255,255,${0.94 * alpha})`;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    round(
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
    round(ctx, rect, radius);
    ctx.fillStyle = `rgba(255,255,255,${opacity})`;
    ctx.fill();
    ctx.restore();
  }

  function glass(rect: Rect, radius: number, opacity = 0.58, border = 1) {
    // A flat frosted surface: no backdrop blur, shadows, or gradients.
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

    // Simple sphere shading: offset translucent disc, no gradient fill.
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

  function fit(s: string, limit: number): string {
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

  function imageFor(src: string): HTMLImageElement {
    let image = images.get(src);
    if (!image) {
      image = new Image();
      image.decoding = "async";
      image.onload = wake;
      image.onerror = wake;
      image.src = src;
      images.set(src, image);
    }
    return image;
  }

  function fail(reason: unknown) {
    error = reason instanceof Error ? reason.message : String(reason);
    dismissed = "";
    rebuild();
  }

  function safe(run: () => void) {
    try {
      run();
    } catch (e) {
      fail(e);
    }
  }

  function actionKey(contextId: string, action: OfferedAction) {
    return `action:${JSON.stringify([contextId, action.source, action.id])}`;
  }

  async function invoke(contextId: string, action: OfferedAction) {
    const key = actionKey(contextId, action);
    if (pending.has(key) || action.busy) return;
    pending.add(key);
    error = null;
    rebuild();
    try {
      await session.invoke(contextId, action.id, action.source);
      // Keep collected pages available after actions update the session.
    } catch (e) {
      if (!destroyed) error = e instanceof Error ? e.message : String(e);
    } finally {
      pending.delete(key);
      if (!destroyed) rebuild();
    }
  }

  // The session still uses paged transport. Collect its pages automatically,
  // so the canvas itself never asks the user to paginate.
  function requestNextPage() {
    if (
      destroyed ||
      paging ||
      pageScheduled ||
      pagingTries >= 80 ||
      !state.hasNext ||
      state.loading
    )
      return;
    const key = focusKey;
    pageScheduled = true;
    queueMicrotask(async () => {
      pageScheduled = false;
      if (
        destroyed ||
        focusKey !== key ||
        paging ||
        !session.snapshot().hasNext
      )
        return;
      paging = true;
      pagingTries++;
      try {
        await Promise.resolve(session.next());
      } catch (e) {
        if (!destroyed) error = e instanceof Error ? e.message : String(e);
      } finally {
        paging = false;
        if (!destroyed && key === focusKey) {
          rebuild();
        }
      }
    });
  }

  function rebuild() {
    if (destroyed) return;
    const outgoingZoom = focusZoom;
    state = session.snapshot();
    const contextKey = state.focus?.id ?? "@root";
    if (focusKey !== contextKey) {
      focusKey = contextKey;
      pagingTries = 0;
      dockScroll = 0;
      focusZoom = 1;
      focusTarget = 1;
      focusPan = { x: 0, y: 0 };
      zoomOutUnfocus = false;
      hover = keyboard = null;

      // The container title slides from its node to the center.
      const nextFocus = state.focus;
      if (nextFocus && isContainer(nextFocus)) {
        const old = bodies.get(nextFocus.id);
        heading = {
          text: title(nextFocus),
          x: old?.px ?? scene.x + scene.w / 2,
          y: old
            ? old.role === "sibling"
              ? old.py - old.size - 24
              : old.py + old.size + 19
            : scene.y + scene.h / 2,
          alpha: old ? 1 : 0,
          scale: old ? 1 : 0.8,
        };
      } else {
        heading = null;
      }
    }
    if (!collected.has(focusKey)) collected.set(focusKey, new Map());
    const page = collected.get(focusKey)!;
    for (const item of state.children) page.set(item.id, item);
    children = [...page.values()];
    if (state.hasNext && !state.loading) requestNextPage();

    const focused = state.focus;
    const focusedContainer = focused !== null && isContainer(focused);
    if (focusedContainer) {
      if (!heading)
        heading = {
          text: title(focused),
          x: scene.x + scene.w / 2,
          y: scene.y + scene.h / 2,
          alpha: 0,
          scale: 0.8,
        };
      else heading.text = title(focused);
    } else {
      heading = null;
    }
    const childIds = new Set(children.map((thing) => thing.id));
    const siblings = focused
      ? state.siblings.filter(
          (thing) => thing.id !== focused.id && !childIds.has(thing.id),
        )
      : [];

    const actions = focused
      ? [...state.actions].sort(
          (a, b) =>
            Number(b.recommendation !== undefined) -
              Number(a.recommendation !== undefined) ||
            (b.recommendation?.relevance ?? 0) -
              (a.recommendation?.relevance ?? 0),
        )
      : [];

    // The sibling shelf sits at the bottom, like a liquid-glass dock.
    siblingDock = null;
    if (focused && siblings.length) {
      const slot = clamp((w - 80) / siblings.length, 12, 56);
      const barWidth = Math.min(w - 40, siblings.length * slot + 40);
      siblingDock = {
        x: (w - barWidth) / 2,
        y: h - 88,
        w: barWidth,
        h: 64,
      };
    }

    // Actions and Back share a fixed box at the top; they never follow a node.
    const actionWidths = actions.map((action) =>
      clamp(28 + action.label.length * 7, 64, 210),
    );
    const actionsWidth =
      actionWidths.reduce((sum, cw) => sum + cw + 9, 0) - 9;
    const dockWidth = Math.min(w - 40, DOCK_WIDTH_MAX);
    const dockHeight = 60;
    dock = state.focus
      ? {
          x: (w - dockWidth) / 2,
          y: DOCK_TOP,
          w: dockWidth,
          h: dockHeight,
        }
      : null;
    const sceneTop = dock ? dock.y + dock.h + 16 : 109;
    scene = {
      x: 20,
      y: sceneTop,
      w: Math.max(1, w - 40),
      h: Math.max(1, (siblingDock?.y ?? h - 32) - sceneTop - 19),
    };

    controls = [];
    if (dock && state.focus) {
      controls.push({
        key: "back",
        label: "‹",
        x: dock.x + DOCK_PAD,
        y: dock.y,
        w: DOCK_BACK,
        h: dock.h,
        run: () => session.back(),
      });
      const available = dock.w - DOCK_ACTIONS_X - DOCK_PAD;
      dockMaxScroll = Math.max(0, actionsWidth - available);
      dockActionsInset =
        dockMaxScroll > 0 || !actions.length
          ? DOCK_ACTIONS_X
          : dock.w - DOCK_PAD - actionsWidth;
      dockScroll = clamp(dockScroll, 0, dockMaxScroll);
      let x = dock.x + dockActionsInset;
      let index = 0;
      for (const action of actions) {
        const cw = actionWidths[index++]!;
        const key = actionKey(state.focus.id, action);
        controls.push({
          key,
          label: action.label,
          busy: action.busy || pending.has(key),
          x,
          y: dock.y,
          w: cw,
          h: dock.h,
          run: () => {
            void invoke(state.focus!.id, action);
          },
        });
        x += cw + 9;
      }
    } else {
      dockActionsInset = DOCK_ACTIONS_X;
      dockMaxScroll = dockScroll = 0;
    }

    const next = new Map<string, Node>();
    const centerX = scene.x + scene.w / 2;
    const centerY = scene.y + scene.h / 2;

    function add(thing: Thing, role: Role, x: number, y: number, r: number) {
      const phase = hash(thing.id) * TAU;
      next.set(thing.id, { thing, role, x, y, r, phase });
    }

    if (!state.focus) {
      const count = children.length;
      const r = clamp(
        Math.sqrt((scene.w * scene.h) / Math.max(1, count)) * 0.24,
        13,
        57,
      );
      children.forEach((thing, i) => {
        const angle = i * GOLDEN - Math.PI / 2;
        const spread = Math.sqrt((i + 0.65) / Math.max(1, count));
        const jitter = hash(thing.id) * 0.11;
        add(
          thing,
          "root",
          centerX + Math.cos(angle) * scene.w * 0.45 * (spread + jitter),
          centerY + Math.sin(angle) * scene.h * 0.43 * (spread + jitter),
          r * lerp(0.85, 1.12, hash(thing.id + "size")),
        );
      });
    } else {
      const count = children.length;
      // Open collections are a heading, not a circle.
      if (!isContainer(state.focus)) {
        const span = Math.min(scene.w, scene.h);
        add(
          state.focus,
          "focus",
          centerX,
          centerY - 4,
          state.focus.type === "image"
            ? clamp(span * 0.3, 88, 220)
            : clamp(span * 0.16, 49, 108),
        );
      }
      const density = clamp(Math.sqrt((count + 2) / 12), 0.5, 1);
      const rx = Math.max(30, scene.w * 0.36 * density);
      const ry = Math.max(30, scene.h * 0.36 * density);
      const r = clamp(
        Math.sqrt((scene.w * scene.h) / Math.max(1, count)) * 0.19,
        13,
        47,
      );
      const ringCapacity = 8;
      const rings = Math.max(1, Math.ceil(count / ringCapacity));

      children.forEach((thing, i) => {
        const ring = Math.floor(i / ringCapacity);
        const slot = i - ring * ringCapacity;
        const inRing = Math.min(ringCapacity, count - ring * ringCapacity);
        const angle = -Math.PI / 2 + ring * 0.35 + (slot / inRing) * TAU;
        const radial =
          (rings === 1 ? 0.72 : lerp(0.62, 1, ring / (rings - 1))) +
          (hash(thing.id + "ring") - 0.5) * 0.04;

        add(
          thing,
          "child",
          centerX + Math.cos(angle) * rx * radial,
          centerY + Math.sin(angle) * ry * radial,
          r,
        );
      });
      // Siblings live in the bottom shelf instead of drifting over the scene.
      const bar = siblingDock;
      if (bar) {
        const spacing = (bar.w - 40) / Math.max(1, siblings.length);
        const radius = clamp(spacing * 0.4, 6, 19);
        siblings.forEach((thing, index) => {
          add(
            thing,
            "sibling",
            bar.x + 20 + (index + 0.5) * spacing,
            bar.y + bar.h / 2,
            radius,
          );
        });
      }
    }

    for (const body of bodies.values()) body.alive = false;
    for (const node of next.values()) {
      const old = bodies.get(node.thing.id);
      if (old) {
        if (old.role !== node.role) {
          orbitOffsets.delete(node.thing.id);
          if (old.role === "focus") old.size *= outgoingZoom;
        }
        Object.assign(old, node, { alive: true });
      } else {
        const parent = node.thing.parent
          ? bodies.get(node.thing.parent)
          : undefined;
        bodies.set(node.thing.id, {
          ...node,
          px: parent?.px ?? centerX,
          py: parent?.py ?? centerY,
          size: motion.matches ? node.r : 1,
          alpha: motion.matches ? 1 : 0,
          pull: 0,
          vx: 0,
          vy: 0,
          vr: 0,
          va: 0,
          alive: true,
          pinned: null,
        });
      }
    }
    if (drag?.body && !bodies.get(drag.body)?.alive) cancelDrag();
    wake();
  }

  function tick(now: number) {
    raf = 0;
    if (destroyed) return;
    const dt = clamp((now - last) / 1000, 0, 0.04);
    last = now;
    time += dt;
    const instant = motion.matches;
    const previousZoom = focusZoom;
    focusZoom = instant
      ? focusTarget
      : lerp(focusZoom, focusTarget, 1 - Math.exp(-dt * 14));

    const focusBody = state.focus ? bodies.get(state.focus.id) : undefined;
    const unfocusZoom =
      focusBody && state.focus?.type === "image"
        ? focusMinZoom(focusBody) + FOCUS_UNFOCUS_LIFT
        : 0;

    if (zoomOutUnfocus && focusZoom <= unfocusZoom + 0.01) {
      zoomOutUnfocus = false;
      wheelAmount = 0;
      wheelLocked = true;
      if (wheelTimer !== undefined) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelAmount = 0;
        wheelLocked = false;
      }, 180);
      safe(() => session.back());
      return;
    }

    if (focusBody && state.focus?.type === "image") {
      const span = Math.max(1, Math.min(scene.w, scene.h));
      const fill = (focusBody.size * 2.4 * focusZoom) / span;
      const anchor = clamp(
        (fill - FOCUS_FILL_START) / (FOCUS_FILL_FULL - FOCUS_FILL_START),
        0,
        1,
      );

      if (focusZoom > 1.001 && anchor > 0 && previousZoom > 0.001) {
        const ratio = focusZoom / previousZoom;
        focusPan.x +=
          (focusPivot.x - focusBody.px - focusPan.x) * (1 - ratio) * anchor;
        focusPan.y +=
          (focusPivot.y - focusBody.py - focusPan.y) * (1 - ratio) * anchor;
      } else {
        const ease = 1 - Math.exp(-dt * 12);
        focusPan.x = lerp(focusPan.x, 0, ease);
        focusPan.y = lerp(focusPan.y, 0, ease);
      }
    }

    if (heading) {
      const tx = scene.x + scene.w / 2;
      const ty = scene.y + scene.h / 2;
      if (instant) {
        heading.x = tx;
        heading.y = ty;
        heading.alpha = 1;
        heading.scale = 1;
      } else {
        const ease = 1 - Math.exp(-dt * 12);
        heading.x = lerp(heading.x, tx, ease);
        heading.y = lerp(heading.y, ty, ease);
        heading.alpha = lerp(heading.alpha, 1, 1 - Math.exp(-dt * 14));
        heading.scale = lerp(heading.scale, 1, 1 - Math.exp(-dt * 12));
      }
    }
    if (!instant && !drag?.moved) {
      orbit += orbitVelocity * dt;
      orbitVelocity = lerp(orbitVelocity, 0.075, 1 - Math.exp(-dt * 0.6));
    }

    const cx = scene.x + scene.w / 2;
    const cy = scene.y + scene.h / 2;
    const active = [...bodies.values()].filter((b) => b.alive);
    const desired = active.map((b) => {
      let x = b.x;
      let y = b.y;
      let pull = 0;
      if (mouse && !instant && !b.pinned && b.role === "sibling") {
        const near = clamp(1 - Math.abs(mouse.y - y) / 80, 0, 1);
        const reach = Math.max(0, 1 - Math.abs(mouse.x - x) / 90);
        const m = reach * reach * near;
        x += (mouse.x - x) * m * 0.2;
        y -= m * 14;
        pull = m * 0.95;
      }
      b.pull = instant ? pull : lerp(b.pull, pull, 1 - Math.exp(-dt * 14));
      if (!instant && !b.pinned && (b.role === "root" || b.role === "child")) {
        const rate =
          b.role === "child" ? 0.35 + hash(b.thing.id + "orbit") * 0.55 : 0.11;
        const override = orbitOffsets.get(b.thing.id);
        const a =
          (override ? override.angle : Math.atan2(b.y - cy, b.x - cx)) +
          orbit * rate;
        const dist = override
          ? override.dist
          : Math.hypot((b.x - cx) / (scene.w / 2), (b.y - cy) / (scene.h / 2));
        const breathing = 1 + 0.045 * Math.sin(time * 0.57 + b.phase);
        x = cx + Math.cos(a) * scene.w * 0.5 * dist * breathing;
        y = cy + Math.sin(a) * scene.h * 0.5 * dist * breathing;
        x += Math.sin(time * 0.37 + b.phase * 2) * 6;
        y += Math.cos(time * 0.44 + b.phase * 3) * 8;
      }
      if (b.pinned) {
        x = b.pinned.x + (instant ? 0 : Math.sin(time * 0.5 + b.phase) * 2);
        y = b.pinned.y + (instant ? 0 : Math.cos(time * 0.6 + b.phase) * 2);
      }
      if (drag?.moved && drag.body === b.thing.id) {
        x = drag.x - drag.dx;
        y = drag.y - drag.dy;
      }
      return { b, x, y };
    });

    // Soft collision avoidance: gravity with separation instead of a rigid grid.
    if (!instant && desired.length < 220) {
      for (let i = 0; i < desired.length; i++) {
        const a = desired[i]!;
        for (let j = i + 1; j < desired.length; j++) {
          const b = desired[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const gap =
            a.b.r +
            b.b.r +
            (a.b.role === "focus" || b.b.role === "focus" ? 34 : 13);
          if (distance >= gap) continue;
          const push = Math.min(16, (gap - distance) * 0.3);
          const ax = (dx / distance) * push;
          const ay = (dy / distance) * push;
          if (a.b.role !== "focus" && drag?.body !== a.b.thing.id) {
            a.x += ax;
            a.y += ay;
          }
          if (b.b.role !== "focus" && drag?.body !== b.b.thing.id) {
            b.x -= ax;
            b.y -= ay;
          }
        }
      }
    }

    let settling = false;
    for (const item of desired) {
      const b = item.b;
      const dragging = drag?.moved && drag.body === b.thing.id;
      const margin = b.r + 13;
      // Siblings sit in the bottom shelf, outside the scene bounds.
      const inScene = b.role !== "sibling" || b.pinned || dragging;
      const tx = inScene
        ? clamp(item.x, scene.x + margin, scene.x + scene.w - margin)
        : item.x;
      const ty = inScene
        ? clamp(item.y, scene.y + margin, scene.y + scene.h - margin)
        : item.y;
      const k = b.role === "focus" ? 9 : 5.5;
      const damping = Math.exp(-dt * 7.5);
      if (instant) {
        b.px = tx;
        b.py = ty;
        b.vx = 0;
        b.vy = 0;
        b.size = b.r;
        b.alpha = 1;
      } else if (dragging) {
        // Track the pointer directly so the thing stays under the cursor.
        b.px = tx;
        b.py = ty;
        b.vx = 0;
        b.vy = 0;
        b.size = lerp(b.size, b.r, 1 - Math.exp(-dt * 11));
        b.alpha = lerp(b.alpha, 1, 1 - Math.exp(-dt * 9));
      } else {
        b.vx = (b.vx + (tx - b.px) * k * k * dt) * damping;
        b.vy = (b.vy + (ty - b.py) * k * k * dt) * damping;
        b.px += b.vx * dt;
        b.py += b.vy * dt;
        b.size = lerp(b.size, b.r, 1 - Math.exp(-dt * 11));
        b.alpha = lerp(b.alpha, 1, 1 - Math.exp(-dt * 9));
        settling ||=
          Math.abs(b.vx) + Math.abs(b.vy) > 0.07 ||
          Math.abs(b.r - b.size) > 0.07;
      }
    }
    for (const [id, b] of bodies) {
      if (b.alive) continue;
      b.alpha = instant ? 0 : lerp(b.alpha, 0, 1 - Math.exp(-dt * 13));
      if (b.alpha < 0.01) bodies.delete(id);
      else settling = true;
    }
    const headingMoving =
      heading !== null &&
      (Math.abs(heading.x - (scene.x + scene.w / 2)) > 0.2 ||
        Math.abs(heading.y - (scene.y + scene.h / 2)) > 0.2 ||
        heading.alpha < 0.995 ||
        Math.abs(heading.scale - 1) > 0.002);

    if (dock && state.focus) {
      dock.x = (w - dock.w) / 2;
      dock.y = DOCK_TOP;
      let cxs = dock.x + dockActionsInset;
      for (const control of controls) {
        if (control.key === "back") {
          control.x = dock.x + DOCK_PAD;
          control.y = dock.y;
          continue;
        }
        if (!control.key.startsWith("action:")) continue;
        control.x = cxs;
        control.y = dock.y;
        cxs += control.w + 9;
      }
    }

    let controlsMoving = false;
    const actionKeys = new Set<string>();
    const controlEase = 1 - Math.exp(-dt * 14);
    for (const control of controls) {
      if (!control.key.startsWith("action:")) continue;
      actionKeys.add(control.key);
      const bx = control.x - dockScroll + control.w / 2;
      const by = control.y + control.h / 2;
      const reach = mouse ? clamp(1 - Math.abs(mouse.x - bx) / 120, 0, 1) : 0;
      const near = mouse ? clamp(1 - Math.abs(mouse.y - by) / 90, 0, 1) : 0;
      const pull = reach * reach * near;
      const active = hover === control.key;
      const selected = keyboard === control.key;
      const power = active ? Math.max(0.6, pull) : pull;
      const tx =
        active && mouse ? clamp((mouse.x - bx) * power * 0.15, -10, 10) : 0;
      const ty =
        active && mouse ? clamp((mouse.y - by) * power * 0.12, -7, 7) : 0;
      const ts = 1 + (active || selected ? 0.06 : 0) + pull * 0.04;
      const motion = controlPulls.get(control.key) ?? {
        x: 0,
        y: 0,
        scale: 1,
      };
      if (instant) {
        motion.x = 0;
        motion.y = 0;
        motion.scale = 1;
      } else {
        motion.x = lerp(motion.x, tx, controlEase);
        motion.y = lerp(motion.y, ty, controlEase);
        motion.scale = lerp(motion.scale, ts, controlEase);
        controlsMoving ||=
          Math.abs(motion.x - tx) > 0.05 ||
          Math.abs(motion.y - ty) > 0.05 ||
          Math.abs(motion.scale - ts) > 0.002;
      }
      controlPulls.set(control.key, motion);
    }
    for (const key of controlPulls.keys())
      if (!actionKeys.has(key)) controlPulls.delete(key);

    draw();
    if (
      !instant &&
      (bodies.size > 0 ||
        settling ||
        pending.size ||
        headingMoving ||
        controlsMoving)
    ) {
      raf = requestAnimationFrame(tick);
    }
  }

  function drawImageIcon(
    icon: Path2D,
    x: number,
    y: number,
    size: number,
    color: string,
  ) {
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(icon);
    ctx.restore();
  }

  function drawGlyph(b: Body, x: number, y: number, r: number) {
    ctx.save();
    ctx.translate(x, y);
    if (b.thing.type === "collection" || b.thing.type === "group") {
      ctx.rotate(-0.12);
      for (let i = 0; i < 3; i++) {
        const rr = r * 0.5;
        const rect = {
          x: -rr + i * r * 0.105,
          y: -rr * 0.66 + i * r * 0.075,
          w: rr * 1.55,
          h: rr * 1.18,
        };
        round(ctx, rect, r * 0.13);
        ctx.fillStyle =
          i === 2 ? "rgba(255,255,255,.83)" : "rgba(255,255,255,.45)";
        ctx.fill();
        ctx.strokeStyle = "rgba(100,119,168,.33)";
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = "rgba(62,81,128,.76)";
      ctx.font = `600 ${clamp(r * 0.59, 11, 38)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.thing.type.slice(0, 1).toUpperCase(), 0, 1);
    }
    ctx.restore();
  }

  function label(
    text: string,
    x: number,
    y: number,
    max: number,
    strength = 0,
  ) {
    const t = clamp(strength, 0, 1);
    const size = lerp(12, 15, t);
    const weight = Math.round(lerp(500, 600, t));

    ctx.save();
    ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#293653";
    ctx.fillText(fit(text, max), x, y + 0.4);
    ctx.restore();
  }

  function fittedImage(b: Body, r: number) {
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

  function focusOffset(b: Body) {
    return b.role === "focus" && b.thing.type === "image"
      ? focusPan
      : { x: 0, y: 0 };
  }

  function peerCount() {
    const parent = state.focus?.parent ?? "@root";
    const ids = new Set<string>(collected.get(parent)?.keys() ?? []);
    for (const sibling of state.siblings) ids.add(sibling.id);
    if (state.focus) ids.add(state.focus.id);
    return Math.max(1, ids.size);
  }

  function focusMinZoom(b: Body) {
    const peer = clamp(
      Math.sqrt((scene.w * scene.h) / peerCount()) * 0.19,
      13,
      47,
    );

    return clamp(peer / Math.max(1, b.size), 0.06, 0.6);
  }

  function drawBody(b: Body) {
    if (b.alpha < 0.02) return;
    const hot =
      hover === `node:${b.thing.id}` || keyboard === `node:${b.thing.id}`;
    const picked = drag?.moved && drag.body === b.thing.id;
    const isImage = b.thing.type === "image";
    const hoverScale = hot && !isImage;
    const zoom = isImage && b.role === "focus" ? focusZoom : 1;
    const r = b.size * (hoverScale || picked ? 1.085 : 1) * (1 + b.pull) * zoom;
    const fitted = isImage ? fittedImage(b, r) : null;
    const alpha = b.alpha * (b.role === "sibling" ? 0.78 : 1);
    const extent = fitted ? fitted.h / 2 : isImage ? r * 1.2 : r;
    const shift = focusOffset(b);
    const px = b.px + shift.x;
    const py = b.py + shift.y;

    ctx.save();

    if (fitted) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        fitted.image,
        px - fitted.w / 2,
        py - fitted.h / 2,
        fitted.w,
        fitted.h,
      );
      ctx.globalAlpha = b.alpha;
    } else if (isImage) {
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
    } else {
      glassOrb(px, py, r, alpha);
      ctx.globalAlpha = b.alpha;
      drawGlyph(b, px, py, r);
    }

    if (!isImage && (hot || picked || keyboard === `node:${b.thing.id}`)) {
      ctx.beginPath();
      ctx.arc(px, py, r + 5, 0, TAU);
      ctx.strokeStyle = "rgba(77,122,223,.52)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const showLabel =
      b.role === "focus" ||
      hot ||
      (b.role === "root" && children.length <= 14) ||
      (b.role === "child" && children.length <= 9);
    if (showLabel) {
      const minZoom = isImage && b.role === "focus" ? focusMinZoom(b) : 1;
      const strength =
        b.role === "focus"
          ? isImage
            ? clamp((focusZoom - minZoom) / Math.max(0.001, 1 - minZoom), 0, 1)
            : 1
          : 0;
      const max =
        b.role === "focus"
          ? isImage
            ? lerp(120, Math.min(scene.w - 20, 260), strength)
            : Math.min(scene.w - 20, 260)
          : b.role === "root"
            ? 145
            : 120;
      const gap =
        b.role === "focus" ? (isImage ? lerp(19, 25, strength) : 25) : 19;

      label(
        title(b.thing),
        px,
        b.role === "sibling" ? py - extent - 24 : py + extent + gap,
        max,
        strength,
      );
    }
    ctx.restore();
  }

  function drawControl(c: Control) {
    const isBack = c.key === "back";
    const isDock = c.key.startsWith("action:");
    const inDock = isDock || isBack;
    const x = isDock ? c.x - dockScroll : c.x;
    const rect = { x, y: c.y, w: c.w, h: c.h };
    const hot = hover === c.key || keyboard === c.key;
    const motion = isDock ? controlPulls.get(c.key) : undefined;
    const scale = isDock ? (motion?.scale ?? 1) : 1;
    const cx = x + c.w / 2 + (motion?.x ?? 0);
    const cy = c.y + c.h / 2 + (motion?.y ?? 0);
    const size = (isBack ? 22 : 12) * scale;
    if (isBack) {
      const d = Math.min(c.w, c.h) * scale;
      fill(
        { x: cx - d / 2, y: cy - d / 2, w: d, h: d },
        d / 2,
        hot ? 0.82 : 0.58,
      );
    } else if (isDock) {
      const bw = Math.max(46, c.w - 8) * scale;
      const bh = 34 * scale;
      fill(
        { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh },
        bh / 2,
        hot ? 0.82 : 0.58,
      );
    } else {
      glass(rect, 20, hot ? 0.83 : 0.6);
    }
    ctx.save();
    ctx.fillStyle = inDock && hot ? "#4d7adf" : hot ? "#182742" : "#23314c";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = `600 ${size}px system-ui`;
    ctx.globalAlpha = c.busy ? 0.6 : 1;
    const value = isDock ? fit(c.label, c.w - 20) : c.label;
    ctx.fillText(value, cx, cy);
    if (c.busy) {
      ctx.strokeStyle = "#667dcc";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + c.w - 14, c.y + c.h / 2, 5, time * 3, time * 3 + 4.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function status(): {
    text: string;
    id: string;
    bad: boolean;
    busy: boolean;
  } | null {
    if (error)
      return { text: error, id: `local:${error}`, bad: true, busy: false };
    if (state.operationErrors.length) {
      const e = state.operationErrors[state.operationErrors.length - 1]!;
      return { text: e.message, id: `op:${e.id}`, bad: true, busy: false };
    }
    let running = false;
    let latest: (typeof state.operations)[number] | undefined;
    for (const operation of state.operations) {
      if (operation.status === "running") running = true;
      if (latest === undefined) {
        latest = operation;
        continue;
      }
      const at =
        operation.status === "running"
          ? operation.startedAt
          : operation.finishedAt;
      const bt =
        latest.status === "running" ? latest.startedAt : latest.finishedAt;
      if (at > bt) latest = operation;
    }
    if (pending.size || running || state.loading) {
      return {
        text: "Making things happen…",
        id: "working",
        bad: false,
        busy: true,
      };
    }
    if (state.error)
      return {
        text: state.error,
        id: `state:${state.error}`,
        bad: true,
        busy: false,
      };
    if (latest?.status === "failed")
      return {
        text: latest.error.message,
        id: `failed:${latest.id}`,
        bad: true,
        busy: false,
      };
    return null;
  }

  function statusRect(): Rect {
    const width = Math.min(w - 40, 430);
    const topActions = dock !== null && state.focus !== null;
    return {
      x: (w - width) / 2,
      y: topActions && dock ? dock.y + dock.h + 10 : 78,
      w: width,
      h: 40,
    };
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Ambient focus halo, deliberately subtle behind the glass orbs.
    if (state.focus) {
      const cx = scene.x + scene.w / 2;
      const cy = scene.y + scene.h / 2;
      const halo = ctx.createRadialGradient(
        cx,
        cy,
        0,
        cx,
        cy,
        Math.min(scene.w, scene.h) * 0.45,
      );
      halo.addColorStop(0, "rgba(255,255,255,.35)");
      halo.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(scene.x, scene.y, scene.w, scene.h);
    }

    // Minimal iOS-like chrome: no sidebar, no heavy panels.
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#293755";
    ctx.textAlign = "left";
    ctx.font = "650 18px system-ui, -apple-system, sans-serif";
    if (!state.focus) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#526ab1";
      ctx.font = "600 20px system-ui";
      ctx.fillText("YOUR SPACE", w / 2, h / 2);
    }

    if (state.focus && children.length && !motion.matches) {
      // A few faint orbital threads, without perfect circular rails.
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,.24)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(
          scene.x + scene.w / 2,
          scene.y + scene.h / 2,
          scene.w * (0.17 + i * 0.12),
          scene.h * (0.15 + i * 0.12),
          Math.sin(time * 0.07 + i) * 0.12,
          0,
          TAU,
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    if (siblingDock) glass(siblingDock, 30, 0.48);

    const rank = (n: Body) =>
      n.role === "focus"
        ? 3
        : drag?.body === n.thing.id
          ? 4
          : hover === `node:${n.thing.id}`
            ? 2
            : n.role === "sibling"
              ? 0
              : 1;
    drawn = [...bodies.values()].sort((a, b) => rank(a) - rank(b));
    for (const b of drawn) drawBody(b);

    if (dock) {
      glass(dock, 27, 0.18, 0.6);
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        dock.x + DOCK_ACTIONS_X - 6,
        dock.y - 24,
        Math.max(0, dock.w - DOCK_ACTIONS_X - DOCK_PAD + 12),
        dock.h + 48,
      );
      ctx.clip();
      for (const c of controls)
        if (c.key.startsWith("action:")) {
          const x = c.x - dockScroll;
          if (x + c.w >= dock.x && x <= dock.x + dock.w) drawControl(c);
        }
      ctx.restore();
      if (dockMaxScroll > 0) {
        const progress = dockScroll / dockMaxScroll;
        ctx.fillStyle = "rgba(90,110,160,.27)";
        round(
          ctx,
          {
            x: dock.x + 24 + progress * (dock.w - 100),
            y: dock.y + dock.h - 4,
            w: 52,
            h: 2,
          },
          1,
        );
        ctx.fill();
      }
    }
    for (const c of controls) if (!c.key.startsWith("action:")) drawControl(c);

    if (heading && heading.alpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = heading.alpha;
      ctx.translate(heading.x, heading.y);
      ctx.scale(heading.scale, heading.scale);
      label(heading.text, 0, 0, Math.max(0, w - 360), 1);
      ctx.restore();
    }

    if (!state.focus && !children.length && !state.loading) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#42516f";
      ctx.font = "600 18px system-ui";
      ctx.fillText("A little space for everything.", w / 2, h / 2 + 40);
      ctx.font = "12px system-ui";
      ctx.fillStyle = "#8995ac";
      ctx.fillText("Your things will appear here.", w / 2, h / 2 + 70);
    }

    // Status floats above the scene, never occupies the whole width.
    const s = status();
    if (s && dismissed !== s.id) {
      const rect = statusRect();
      const mid = rect.y + rect.h / 2;
      glass(rect, 20, 0.78);
      ctx.fillStyle = s.bad ? "#b95065" : "#56699b";
      ctx.beginPath();
      ctx.arc(rect.x + 18, mid, 4, 0, TAU);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "12px system-ui";
      ctx.fillStyle = "#3f506e";
      ctx.fillText(fit(s.text, rect.w - 62), rect.x + 31, mid);
      if (!s.busy) {
        ctx.textAlign = "center";
        ctx.font = "17px system-ui";
        ctx.fillText("×", rect.x + rect.w - 20, mid);
      }
      if (s.busy) {
        ctx.strokeStyle = "#637dce";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rect.x + rect.w - 20, mid, 6, time * 3, time * 3 + 4.5);
        ctx.stroke();
      }
    }

    ctx.textAlign = "left";
    ctx.font = "13px system-ui";
    ctx.fillStyle = "rgba(77,90,129,.66)";
    if (h > 300) {
      const guides =
        dockMaxScroll > 0
          ? ["Drag to arrange", "Scroll the dock for more actions"]
          : ["Drag to arrange", "Scroll up to open", "Scroll down to go back"];
      const lineHeight = 18;
      let y = h - 14 - (guides.length - 1) * lineHeight;
      for (const guide of guides) {
        ctx.fillText(guide, 20, y);
        y += lineHeight;
      }
    }
  }

  function pos(e: PointerEvent | WheelEvent) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * w) / Math.max(1, r.width),
      y: ((e.clientY - r.top) * h) / Math.max(1, r.height),
    };
  }
  function inside(x: number, y: number, r: Rect) {
    return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
  }
  function hit(x: number, y: number): string | null {
    const s = status();
    if (s && dismissed !== s.id && inside(x, y, statusRect()))
      return "status:dismiss";
    const back = controls.find((c) => c.key === "back");
    if (back && inside(x, y, back)) return back.busy ? null : back.key;
    for (let i = controls.length - 1; i >= 0; i--) {
      const c = controls[i]!;
      const isDock = c.key.startsWith("action:");
      const box = { ...c, x: c.x - (isDock ? dockScroll : 0) };
      if (isDock && (!dock || !inside(x, y, dock))) continue;
      if (inside(x, y, box)) return c.busy ? null : c.key;
    }
    if (dock && inside(x, y, dock)) return null;
    for (let i = drawn.length - 1; i >= 0; i--) {
      const b = drawn[i]!;
      if (!b.alive || b.alpha <= 0.25) continue;

      const isImage = b.thing.type === "image";
      const zoom = isImage && b.role === "focus" ? focusZoom : 1;
      const r = b.size * (1 + b.pull) * zoom;
      const fitted = isImage ? fittedImage(b, r) : null;
      const shift = focusOffset(b);
      const px = b.px + shift.x;
      const py = b.py + shift.y;
      const within = fitted
        ? Math.abs(x - px) <= fitted.w / 2 + 9 &&
          Math.abs(y - py) <= fitted.h / 2 + 9
        : isImage
          ? Math.abs(x - px) <= r * 1.2 + 9 && Math.abs(y - py) <= r * 1.2 + 9
          : Math.hypot(x - px, y - py) <= r + 9;

      if (within) return `node:${b.thing.id}`;
    }
    return null;
  }
  function activate(key: string) {
    if (key === "status:dismiss") {
      dismissed = status()?.id ?? "";
      error = null;
      wake();
      return;
    }
    const c = controls.find((c) => c.key === key);
    if (c) {
      if (!c.busy) safe(c.run);
      return;
    }
    if (key.startsWith("node:")) {
      const b = bodies.get(key.slice(5));
      if (b?.alive && b.role !== "focus") safe(() => session.focus(b.thing.id));
    }
  }
  function cancelDrag() {
    if (drag && canvas.hasPointerCapture(drag.id))
      canvas.releasePointerCapture(drag.id);
    drag = null;
    wake();
  }
  function down(e: PointerEvent) {
    if (drag || e.button !== 0) return;
    canvas.focus({ preventScroll: true });
    keyboard = null;
    const p = pos(e);
    mouse = p;
    const key = hit(p.x, p.y);
    const b = key?.startsWith("node:") ? bodies.get(key.slice(5)) : null;
    drag = {
      id: e.pointerId,
      key,
      body: b && b.role !== "sibling" ? b.thing.id : null,
      sx: p.x,
      sy: p.y,
      x: p.x,
      y: p.y,
      dx: b ? p.x - b.px : 0,
      dy: b ? p.y - b.py : 0,
      moved: false,
      dockStart: dock && inside(p.x, p.y, dock) ? dockScroll : null,
    };
    canvas.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    const p = pos(e);
    mouse = p;
    if (drag?.id === e.pointerId) {
      drag.x = p.x;
      drag.y = p.y;
      if (drag.dockStart !== null && Math.abs(p.x - drag.sx) > 5) {
        drag.moved = true;
        dockScroll = clamp(drag.dockStart + drag.sx - p.x, 0, dockMaxScroll);
        canvas.style.cursor = "grabbing";
        wake();
        return;
      }
      if (drag.body && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 5)
        drag.moved = true;
      if (drag.moved) {
        canvas.style.cursor = "grabbing";
        wake();
        return;
      }
    }
    const next = hit(p.x, p.y);
    if (next !== hover) {
      hover = next;
      canvas.style.cursor = next ? "pointer" : "default";
      wake();
    } else if (next?.startsWith("action:")) {
      wake();
    }
  }
  function up(e: PointerEvent) {
    if (!drag || drag.id !== e.pointerId) return;
    const previous = drag;
    const p = pos(e);
    const clicked =
      !previous.moved && previous.key && hit(p.x, p.y) === previous.key;
    if (previous.moved && previous.body) {
      const b = bodies.get(previous.body);
      if (b && (b.role === "root" || b.role === "child")) {
        const cx = scene.x + scene.w / 2;
        const cy = scene.y + scene.h / 2;
        const x = p.x - previous.dx;
        const y = p.y - previous.dy;
        const rate =
          b.role === "child" ? 0.35 + hash(b.thing.id + "orbit") * 0.55 : 0.11;

        orbitOffsets.set(b.thing.id, {
          angle: Math.atan2(y - cy, x - cx) - orbit * rate,
          dist: Math.hypot((x - cx) / (scene.w / 2), (y - cy) / (scene.h / 2)),
        });
      }
    }
    cancelDrag();
    if (clicked) activate(previous.key!);
    if (e.pointerType === "touch") mouse = null;
    hover = hit(p.x, p.y);
    canvas.style.cursor = hover ? "pointer" : "default";
    wake();
  }
  function leave() {
    if (!drag) {
      hover = null;
      mouse = null;
      canvas.style.cursor = "default";
      wake();
    }
  }
  function wheel(e: WheelEvent) {
    if (e.ctrlKey || drag) return;
    e.preventDefault();
    const p = pos(e);

    // The dock keeps its horizontal scroll; the workspace never zooms.
    if (dock && inside(p.x, p.y, dock)) {
      if (dockMaxScroll > 0) {
        dockScroll = clamp(
          dockScroll +
            (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY),
          0,
          dockMaxScroll,
        );
        wake();
      }
      return;
    }

    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? h : 1;

    // Wheel over the focused image scales it: up grows, down shrinks.
    const focused = state.focus;
    const zoomed =
      Math.abs(focusTarget - 1) > 0.001 || Math.abs(focusZoom - 1) > 0.001;
    if (
      focused?.type === "image" &&
      (zoomed || hit(p.x, p.y) === `node:${focused.id}`)
    ) {
      const body = focused ? bodies.get(focused.id) : undefined;
      const minZoom = body ? focusMinZoom(body) : 0;
      const unfocusZoom = minZoom + FOCUS_UNFOCUS_LIFT;
      const factor = Math.exp(-e.deltaY * unit * 0.002);
      focusTarget = clamp(focusTarget * factor, minZoom, FOCUS_ZOOM_MAX);
      focusPivot = { x: p.x, y: p.y };

      if (e.deltaY < 0) zoomOutUnfocus = false;
      else if (focusTarget <= unfocusZoom + 0.001) zoomOutUnfocus = true;

      wheelAmount = 0;
      wake();
      return;
    }

    if (wheelTimer !== undefined) clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelAmount = 0;
      wheelLocked = false;
    }, 180);
    if (wheelLocked) return;

    for (const control of controls)
      if (!control.key.startsWith("action:") && inside(p.x, p.y, control))
        return;

    wheelAmount += e.deltaY * unit;
    if (Math.abs(wheelAmount) < 70) return;
    wheelLocked = true;

    if (wheelAmount > 0) {
      safe(() => session.back());
    } else {
      const key = hit(p.x, p.y);
      if (key?.startsWith("node:")) activate(key);
    }
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (drag) cancelDrag();
      else safe(() => session.back());
    } else if (
      ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)
    ) {
      e.preventDefault();
      const items = [
        ...controls.filter((c) => !c.busy).map((c) => c.key),
        ...[...bodies.values()]
          .filter((b) => b.alive)
          .map((b) => `node:${b.thing.id}`),
      ];
      if (!items.length) return;
      const direction = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
      const idx = items.indexOf(keyboard ?? "");
      keyboard = items[(idx + direction + items.length) % items.length]!;
      const selected = controls.find((c) => c.key === keyboard);
      if (selected?.key.startsWith("action:") && dock) {
        if (selected.x - dockScroll < dock.x + DOCK_ACTIONS_X)
          dockScroll = clamp(
            selected.x - dock.x - DOCK_ACTIONS_X,
            0,
            dockMaxScroll,
          );
        else if (
          selected.x + selected.w - dockScroll >
          dock.x + dock.w - DOCK_PAD
        )
          dockScroll = clamp(
            selected.x + selected.w - dock.x - dock.w + DOCK_PAD,
            0,
            dockMaxScroll,
          );
      }
      wake();
    } else if ((e.key === "Enter" || e.key === " ") && keyboard && !e.repeat) {
      e.preventDefault();
      activate(keyboard);
    }
  }
  function resize() {
    if (destroyed) return;
    const box = canvas.getBoundingClientRect();
    w = Math.max(1, box.width);
    h = Math.max(1, box.height);
    const native = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const budget = 8_000_000;
    dpr = Math.max(1, Math.min(native, Math.sqrt(budget / Math.max(1, w * h))));
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    rebuild();
  }

  const unsubscribe = session.subscribe(rebuild);
  const observer = new ResizeObserver(resize);
  const changeMotion = () => wake();
  const onCancel = (e: PointerEvent) => {
    if (drag?.id === e.pointerId) cancelDrag();
  };
  const onLostCapture = (e: PointerEvent) => {
    if (drag?.id === e.pointerId) {
      drag = null;
      wake();
    }
  };
  const onBlur = () => {
    keyboard = null;
    wake();
  };
  canvas.style.touchAction = "none";
  canvas.style.background = BACKDROP;
  if (canvas.tabIndex < 0) canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-label",
    "Adapt workspace. Drag to arrange. Scroll up to open, scroll down to go back. Arrow keys select, Enter opens, Escape goes back.",
  );
  observer.observe(canvas);
  window.addEventListener("resize", resize);
  motion.addEventListener("change", changeMotion);
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("lostpointercapture", onLostCapture);
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("keydown", keydown);
  canvas.addEventListener("blur", onBlur);
  resize();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      if (wheelTimer !== undefined) clearTimeout(wheelTimer);
      cancelDrag();
      observer.disconnect();
      unsubscribe();
      window.removeEventListener("resize", resize);
      motion.removeEventListener("change", changeMotion);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("lostpointercapture", onLostCapture);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("keydown", keydown);
      canvas.removeEventListener("blur", onBlur);
      canvas.style.touchAction = oldTouch;
      canvas.style.cursor = oldCursor;
      canvas.style.background = oldBackground;
      if (oldTabIndex === null) canvas.removeAttribute("tabindex");
      else canvas.setAttribute("tabindex", oldTabIndex);
      if (oldLabel === null) canvas.removeAttribute("aria-label");
      else canvas.setAttribute("aria-label", oldLabel);
      for (const image of images.values()) image.onload = image.onerror = null;
      images.clear();
      bodies.clear();
      orbitOffsets.clear();
      controlPulls.clear();
      pending.clear();
    },
  };
}
