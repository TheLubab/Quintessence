/**
 * Workspace behavior stays together here; stateless drawing primitives and
 * visual assets live in paint.ts. Types, tuning, and shared helpers come first.
 * Inside canvasView, sections cover state, type presentations, image resources,
 * session updates, layout, animation, geometry/drawing, input, and lifecycle.
 *
 * rebuild() turns session snapshots into layout targets; tick() animates bodies
 * toward them and draws the frame. Input updates view state or calls the session.
 * Add type visuals in the presentation table; add gestures in the input section.
 * Geometry uses CSS pixels; only the canvas backing store is scaled by dpr.
 */
import type { Thing } from "../adapt/core/contracts.ts";
import type { OfferedAction } from "../adapt/core/actions.ts";
import type { Session, SessionSnapshot } from "../adapt/core/session.ts";
import {
  BACKDROP,
  IMAGE_ICON_PATH,
  BROKEN_IMAGE_ICON_PATH,
  beginRoundedRectPath,
  createCanvasPaint,
  type Rect,
} from "./paint.ts";

// --- Types ---

type Role = "root" | "focus" | "child" | "sibling";
// Node stores layout targets. Body adds the current animated position and size.
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
  alive: boolean;
  pinned: { x: number; y: number } | null;
};
type Control = Rect & {
  key: string;
  label: string;
  busy?: boolean;
  place?: "top" | "side";
  run: () => void;
};

type PointerGesture = {
  id: number;
  key: string | null;
  body: string | null;
  sx: number;
  sy: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  phase: "pressed" | "dragging-thing" | "scrolling-dock";
  dockStart: number | null;
};

type Point = { x: number; y: number };
type FocusState = {
  key: string;
  zoom: number;
  target: number;
  pivot: Point;
  pan: Point;
  unfocusOnZoomOut: boolean;
};
type InputState = {
  hover: string | null;
  keyboard: string | null;
  mouse: Point | null;
  // null is idle; a press becomes a drag only after crossing its threshold.
  gesture: PointerGesture | null;
};
type ImageFit = { image: HTMLImageElement; w: number; h: number };
type BodyGeometry = {
  x: number;
  y: number;
  radius: number;
  halfWidth: number;
  halfHeight: number;
  shape: "circle" | "rect";
  fitted: ImageFit | null;
};
type ThingPresentation = {
  heading: boolean;
  zoomable: boolean;
  hoverScale: boolean;
  focusRadius: (span: number) => number;
  measure: (
    body: Body,
    radius: number,
  ) => Pick<BodyGeometry, "halfWidth" | "halfHeight" | "shape" | "fitted">;
  draw: (body: Body, geometry: BodyGeometry, alpha: number) => void;
};

type Heading = {
  text: string;
  x: number;
  y: number;
  alpha: number;
  scale: number;
};

// --- Behavior and layout tuning ---

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const FOCUS_ZOOM_MAX = 3;
const FOCUS_FILL_START = 0.8;
const FOCUS_FILL_FULL = 1.05;
const FOCUS_UNFOCUS_LIFT = 0.08;
const DOCK_PAD = 24;
const DOCK_TOP = 20;
const DOCK_WIDTH_MAX = 560;
const BACK_SIZE = 34;
const DECK_PAD = 14;
const DECK_GAP = 10;
const DECK_RIGHT = 20;
const SIDE_PAD = 12;
const SIDE_GAP = 8;
const SIDE_BUTTON = 34;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// --- Shared helpers ---

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

function source(thing: Thing): string | null {
  const d = thing.data;
  if (thing.type !== "image" || !d || typeof d !== "object" || !("src" in d))
    return null;
  return typeof d.src === "string" && d.src.trim() ? d.src : null;
}

export function canvasView(options: {
  canvas: HTMLCanvasElement;
  session: Session;
  /** Action categories shown in the top bar. Omit to show all there. */
  topBar?: readonly string[];
  /** Action categories shown in the vertical dock beside the focus. */
  sideBar?: readonly string[];
}) {
  // --- View state and resources ---

  const { canvas, session } = options;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  const ctx = context;
  const { fill, glass, glassOrb, fitText } = createCanvasPaint(ctx);
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
  const data = {
    pending: new Set<string>(),
    collected: new Map<string, Map<string, Thing>>(),
    paging: false,
    pagingTries: 0,
    pageScheduled: false,
    error: null as string | null,
    dismissed: "",
  };
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
  let sideDock: Rect | null = null;
  let dockScroll = 0;
  let dockMaxScroll = 0;
  let dockActionsInset = DOCK_PAD;
  let sideScroll = 0;
  let sideMaxScroll = 0;
  let scene: Rect = { x: 20, y: 108, w: 1, h: 1 };
  let w = 1;
  let h = 1;
  let dpr = 1;
  let time = 0;
  let last = 0;
  let raf = 0;
  let destroyed = false;
  const focus: FocusState = {
    key: "",
    zoom: 1,
    target: 1,
    pivot: { x: 0, y: 0 },
    pan: { x: 0, y: 0 },
    unfocusOnZoomOut: false,
  };
  const input: InputState = {
    hover: null,
    keyboard: null,
    mouse: null,
    gesture: null,
  };
  let heading: Heading | null = null;
  let orbit = 0;
  let orbitVelocity = 0.075;
  const wheelGesture = {
    amount: 0,
    locked: false,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  };

  // --- Type presentations ---
  // Selection, gestures, and animation stay shared across types.
  const fallbackPresentation: ThingPresentation = {
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
  const containerPresentation: ThingPresentation = {
    ...fallbackPresentation,
    heading: true,
    draw: (body, geometry, alpha) =>
      drawOrb(body, geometry, alpha, drawContainerGlyph),
  };
  const imagePresentation: ThingPresentation = {
    heading: false,
    zoomable: true,
    hoverScale: false,
    focusRadius: (span) => clamp(span * 0.3, 88, 220),
    measure: (body, radius) => {
      const fitted = fittedImage(body, radius);
      return {
        halfWidth: fitted ? fitted.w / 2 : radius * 1.2,
        halfHeight: fitted ? fitted.h / 2 : radius * 1.2,
        shape: "rect",
        fitted,
      };
    },
    draw: drawImageBody,
  };
  const presentations = new Map<string, ThingPresentation>([
    ["image", imagePresentation],
    ["collection", containerPresentation],
    ["group", containerPresentation],
  ]);

  function presentationFor(thing: Thing): ThingPresentation {
    return presentations.get(thing.type) ?? fallbackPresentation;
  }

  // --- Image resources ---

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

  // --- Session updates, actions, and page collection ---

  function fail(reason: unknown) {
    data.error = reason instanceof Error ? reason.message : String(reason);
    data.dismissed = "";
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
    if (data.pending.has(key) || action.busy) return;
    data.pending.add(key);
    data.error = null;
    rebuild();
    try {
      await session.invoke(contextId, action.id, action.source);
      // Keep collected pages available after actions update the session.
    } catch (e) {
      if (!destroyed) data.error = e instanceof Error ? e.message : String(e);
    } finally {
      data.pending.delete(key);
      if (!destroyed) rebuild();
    }
  }

  // The session still uses paged transport. Collect its pages automatically,
  // so the canvas itself never asks the user to paginate.
  function requestNextPage() {
    if (
      destroyed ||
      data.paging ||
      data.pageScheduled ||
      data.pagingTries >= 80 ||
      !state.hasNext ||
      state.loading
    )
      return;
    const key = focus.key;
    data.pageScheduled = true;
    queueMicrotask(async () => {
      data.pageScheduled = false;
      if (
        destroyed ||
        focus.key !== key ||
        data.paging ||
        !session.snapshot().hasNext
      )
        return;
      data.paging = true;
      data.pagingTries++;
      try {
        await Promise.resolve(session.next());
      } catch (e) {
        if (!destroyed) data.error = e instanceof Error ? e.message : String(e);
      } finally {
        data.paging = false;
        if (!destroyed && key === focus.key) {
          rebuild();
        }
      }
    });
  }

  function rebuild() {
    if (destroyed) return;
    const outgoingZoom = focus.zoom;
    state = session.snapshot();
    synchronizeFocus(state.focus);
    collectChildren();
    synchronizeHeading(state.focus);
    const siblings = visibleSiblings(state, children);
    const { topActions, sideActions } = groupActionsForDocks(state);
    const { actionWidths, actionsWidth } = layoutDocks(
      state.focus,
      siblings,
      topActions,
      sideActions,
    );
    rebuildControls(topActions, sideActions, actionWidths, actionsWidth);
    const next = layoutNodes(state, children, siblings, scene, siblingDock);
    reconcileBodies(next, outgoingZoom);
    wake();
  }

  function synchronizeFocus(nextFocus: Thing | null) {
    const contextKey = nextFocus?.id ?? "@root";
    if (focus.key !== contextKey) {
      focus.key = contextKey;
      data.pagingTries = 0;
      dockScroll = 0;
      sideScroll = 0;
      focus.zoom = 1;
      focus.target = 1;
      focus.pan = { x: 0, y: 0 };
      focus.unfocusOnZoomOut = false;
      input.hover = input.keyboard = null;

      // The container title slides from its node to the center.
      if (nextFocus && presentationFor(nextFocus).heading) {
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
  }

  function collectChildren() {
    // A snapshot exposes the current page; retain earlier pages per focus.
    if (!data.collected.has(focus.key))
      data.collected.set(focus.key, new Map());
    const page = data.collected.get(focus.key)!;
    for (const item of state.children) page.set(item.id, item);
    children = [...page.values()];
    if (state.hasNext && !state.loading) requestNextPage();
  }

  function synchronizeHeading(focused: Thing | null) {
    const focusedContainer =
      focused !== null && presentationFor(focused).heading;
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
  }

  function visibleSiblings(state: SessionSnapshot, children: readonly Thing[]) {
    const focused = state.focus;
    const childIds = new Set(children.map((thing) => thing.id));
    return focused
      ? state.siblings.filter(
          (thing) => thing.id !== focused.id && !childIds.has(thing.id),
        )
      : [];
  }

  function groupActionsForDocks(state: SessionSnapshot) {
    const actions = state.focus
      ? [...state.actions].sort(
          (a, b) =>
            Number(b.recommendation !== undefined) -
              Number(a.recommendation !== undefined) ||
            (b.recommendation?.relevance ?? 0) -
              (a.recommendation?.relevance ?? 0),
        )
      : [];

    const grouped =
      options.topBar !== undefined || options.sideBar !== undefined;
    const topActions = grouped
      ? actions.filter((action) =>
          (options.topBar ?? []).includes(action.category ?? ""),
        )
      : actions;
    const sideActions = grouped
      ? actions.filter(
          (action) =>
            !topActions.includes(action) &&
            (options.sideBar ?? []).includes(action.category ?? ""),
        )
      : [];

    return { topActions, sideActions };
  }

  // --- Layout targets and body reconciliation ---

  function layoutDocks(
    focused: Thing | null,
    siblings: readonly Thing[],
    topActions: readonly OfferedAction[],
    sideActions: readonly OfferedAction[],
  ) {
    // The bottom deck holds Back at its far left and siblings beside it.
    siblingDock = null;
    if (focused) {
      const deckHeight = 64;
      if (siblings.length) {
        const reserve = DECK_PAD + BACK_SIZE + DECK_GAP;
        const slot = clamp(
          (w - 40 - reserve - DECK_RIGHT) / siblings.length,
          12,
          56,
        );
        const barWidth = Math.min(
          w - 40,
          reserve + siblings.length * slot + DECK_RIGHT,
        );
        siblingDock = {
          x: (w - barWidth) / 2,
          y: h - 88,
          w: barWidth,
          h: deckHeight,
        };
      } else {
        const barWidth = DECK_PAD * 2 + BACK_SIZE;
        siblingDock = {
          x: (w - barWidth) / 2,
          y: h - 88,
          w: barWidth,
          h: deckHeight,
        };
      }
    }

    // Actions keep their fixed box at the top; Back lives in the bottom deck.
    const actionWidths = topActions.map((action) =>
      clamp(28 + action.label.length * 7, 64, 210),
    );
    const actionsWidth = actionWidths.reduce((sum, cw) => sum + cw + 9, 0) - 9;
    const dockWidth = Math.min(w - 40, DOCK_WIDTH_MAX);
    const dockHeight = 60;
    dock =
      focused && topActions.length
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

    const sideWidths = sideActions.map((action) =>
      clamp(28 + action.label.length * 7, 64, 210),
    );
    const sideWidth = Math.min(
      w - 40,
      (sideWidths.length ? Math.max(...sideWidths) : 0) + SIDE_PAD * 2,
    );
    const sideContentHeight =
      sideActions.length * SIDE_BUTTON +
      Math.max(0, sideActions.length - 1) * SIDE_GAP;
    const sideTop = scene.y + 4;
    const sideBottom = (siblingDock?.y ?? h - 32) - 8;
    const sideSpace = Math.max(SIDE_BUTTON, sideBottom - sideTop);
    sideDock = sideActions.length
      ? {
          x: 0,
          y: sideTop,
          w: sideWidth,
          h: Math.min(sideSpace, sideContentHeight + SIDE_PAD * 2),
        }
      : null;
    sideMaxScroll = sideDock
      ? Math.max(0, sideContentHeight + SIDE_PAD * 2 - sideDock.h)
      : 0;
    sideScroll = clamp(sideScroll, 0, sideMaxScroll);
    return { actionWidths, actionsWidth };
  }

  function rebuildControls(
    topActions: readonly OfferedAction[],
    sideActions: readonly OfferedAction[],
    actionWidths: readonly number[],
    actionsWidth: number,
  ) {
    controls = [];
    if (siblingDock) {
      controls.push({
        key: "back",
        label: "‹",
        x: siblingDock.x + DECK_PAD,
        y: siblingDock.y,
        w: BACK_SIZE,
        h: siblingDock.h,
        run: () => session.back(),
      });
    }
    if (dock && state.focus) {
      const available = dock.w - DOCK_PAD * 2;
      dockMaxScroll = Math.max(0, actionsWidth - available);
      dockActionsInset =
        dockMaxScroll > 0 || !topActions.length
          ? DOCK_PAD
          : dock.w - DOCK_PAD - actionsWidth;
      dockScroll = clamp(dockScroll, 0, dockMaxScroll);
      let x = dock.x + dockActionsInset;
      let index = 0;
      for (const action of topActions) {
        const cw = actionWidths[index++]!;
        const key = actionKey(state.focus.id, action);
        controls.push({
          key,
          label: action.label,
          busy: action.busy || data.pending.has(key),
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
      dockActionsInset = DOCK_PAD;
      dockMaxScroll = dockScroll = 0;
    }
    if (sideDock && state.focus) {
      const inner = sideDock.w - SIDE_PAD * 2;
      let y = sideDock.y + SIDE_PAD - sideScroll;
      for (const action of sideActions) {
        const key = actionKey(state.focus.id, action);
        controls.push({
          key,
          label: action.label,
          busy: action.busy || data.pending.has(key),
          place: "side",
          x: sideDock.x + SIDE_PAD,
          y,
          w: inner,
          h: SIDE_BUTTON,
          run: () => {
            void invoke(state.focus!.id, action);
          },
        });
        y += SIDE_BUTTON + SIDE_GAP;
      }
    }
  }

  function layoutNodes(
    state: SessionSnapshot,
    children: readonly Thing[],
    siblings: readonly Thing[],
    scene: Rect,
    siblingDock: Rect | null,
  ): Map<string, Node> {
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
      if (!presentationFor(state.focus).heading) {
        const span = Math.min(scene.w, scene.h);
        add(
          state.focus,
          "focus",
          centerX,
          centerY - 4,
          presentationFor(state.focus).focusRadius(span),
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
      // Siblings share the bottom deck with Back, to the right of it.
      const bar = siblingDock;
      if (bar && siblings.length) {
        const start = bar.x + DECK_PAD + BACK_SIZE + DECK_GAP;
        const spacing = (bar.x + bar.w - DECK_RIGHT - start) / siblings.length;
        const radius = clamp(spacing * 0.4, 6, 19);
        siblings.forEach((thing, index) => {
          add(
            thing,
            "sibling",
            start + (index + 0.5) * spacing,
            bar.y + bar.h / 2,
            radius,
          );
        });
      }
    }

    return next;
  }

  // Keep existing motion when targets change; departing bodies remain to fade out.
  function reconcileBodies(
    next: ReadonlyMap<string, Node>,
    outgoingZoom: number,
  ) {
    const centerX = scene.x + scene.w / 2;
    const centerY = scene.y + scene.h / 2;
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
          alive: true,
          pinned: null,
        });
      }
    }
    if (input.gesture?.body && !bodies.get(input.gesture.body)?.alive)
      cancelPointerGesture();
  }

  // --- Frame scheduling and animation ---

  function wake() {
    if (!raf && !destroyed) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function tick(now: number) {
    raf = 0;
    if (destroyed) return;
    const dt = clamp((now - last) / 1000, 0, 0.04);
    last = now;
    time += dt;
    const instant = motion.matches;
    if (animateFocus(dt, instant)) return;
    const headingMoving = animateHeading(dt, instant);
    const settling = animateBodies(dt, instant);
    const controlsMoving = animateControls(dt, instant);
    placeSideDock();
    draw();
    if (
      !instant &&
      (bodies.size > 0 ||
        settling ||
        data.pending.size ||
        headingMoving ||
        controlsMoving)
    ) {
      raf = requestAnimationFrame(tick);
    }
  }

  // Returns true after navigating back, so tick stops processing the old scene.
  function animateFocus(dt: number, instant: boolean): boolean {
    const previousZoom = focus.zoom;
    focus.zoom = instant
      ? focus.target
      : lerp(focus.zoom, focus.target, 1 - Math.exp(-dt * 14));

    const focusBody = state.focus ? bodies.get(state.focus.id) : undefined;
    const unfocusZoom =
      focusBody && state.focus && presentationFor(state.focus).zoomable
        ? focusMinZoom(focusBody) + FOCUS_UNFOCUS_LIFT
        : 0;

    if (focus.unfocusOnZoomOut && focus.zoom <= unfocusZoom + 0.01) {
      focus.unfocusOnZoomOut = false;
      wheelGesture.amount = 0;
      wheelGesture.locked = true;
      resetWheelAfterPause();
      safe(() => session.back());
      return true;
    }

    if (focusBody && state.focus && presentationFor(state.focus).zoomable) {
      const span = Math.max(1, Math.min(scene.w, scene.h));
      const fill = (focusBody.size * 2.4 * focus.zoom) / span;
      const anchor = clamp(
        (fill - FOCUS_FILL_START) / (FOCUS_FILL_FULL - FOCUS_FILL_START),
        0,
        1,
      );

      if (focus.zoom > 1.001 && anchor > 0 && previousZoom > 0.001) {
        const ratio = focus.zoom / previousZoom;
        focus.pan.x +=
          (focus.pivot.x - focusBody.px - focus.pan.x) * (1 - ratio) * anchor;
        focus.pan.y +=
          (focus.pivot.y - focusBody.py - focus.pan.y) * (1 - ratio) * anchor;
      } else {
        const ease = 1 - Math.exp(-dt * 12);
        focus.pan.x = lerp(focus.pan.x, 0, ease);
        focus.pan.y = lerp(focus.pan.y, 0, ease);
      }
    }
    return false;
  }

  function animateHeading(dt: number, instant: boolean): boolean {
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
    return (
      heading !== null &&
      (Math.abs(heading.x - (scene.x + scene.w / 2)) > 0.2 ||
        Math.abs(heading.y - (scene.y + scene.h / 2)) > 0.2 ||
        heading.alpha < 0.995 ||
        Math.abs(heading.scale - 1) > 0.002)
    );
  }

  function animateBodies(dt: number, instant: boolean): boolean {
    const drag = input.gesture;
    const { mouse } = input;
    if (!instant && !gestureMoved(drag)) {
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
      if (drag && gestureMoved(drag) && drag.body === b.thing.id) {
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
      const dragging =
        drag !== null && gestureMoved(drag) && drag.body === b.thing.id;
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
    return settling;
  }

  function animateControls(dt: number, instant: boolean): boolean {
    const { mouse, hover, keyboard } = input;
    if (dock && state.focus) {
      dock.x = (w - dock.w) / 2;
      dock.y = DOCK_TOP;
      let cxs = dock.x + dockActionsInset;
      for (const control of controls) {
        if (control.place === "side") continue;
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
      if (control.place === "side") continue;
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

    return controlsMoving;
  }

  // --- Thing geometry and drawing ---

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

  function drawContainerGlyph(_b: Body, x: number, y: number, r: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.12);
    for (let i = 0; i < 3; i++) {
      const rr = r * 0.5;
      const rect = {
        x: -rr + i * r * 0.105,
        y: -rr * 0.66 + i * r * 0.075,
        w: rr * 1.55,
        h: rr * 1.18,
      };
      beginRoundedRectPath(ctx, rect, r * 0.13);
      ctx.fillStyle =
        i === 2 ? "rgba(255,255,255,.83)" : "rgba(255,255,255,.45)";
      ctx.fill();
      ctx.strokeStyle = "rgba(100,119,168,.33)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTypeGlyph(b: Body, x: number, y: number, r: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(62,81,128,.76)";
    ctx.font = `600 ${clamp(r * 0.59, 11, 38)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.thing.type.slice(0, 1).toUpperCase(), 0, 1);
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
    ctx.fillText(fitText(text, max), x, y + 0.4);
    ctx.restore();
  }

  function fittedImage(b: Body, r: number): ImageFit | null {
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

  // All consumers share type geometry and focus transforms. Paint includes the
  // existing hover/drag emphasis; hit areas omit it, and docks omit pull too.
  function bodyGeometry(
    b: Body,
    purpose: "paint" | "hit" | "dock",
  ): BodyGeometry {
    const presentation = presentationFor(b.thing);
    const focused = b.role === "focus" && presentation.zoomable;
    const zoom = focused ? focus.zoom : 1;
    const hot =
      input.hover === `node:${b.thing.id}` ||
      input.keyboard === `node:${b.thing.id}`;
    const picked =
      gestureMoved(input.gesture) && input.gesture?.body === b.thing.id;
    const emphasis =
      purpose === "paint" && ((hot && presentation.hoverScale) || picked);
    const radius =
      purpose === "dock"
        ? b.size * zoom
        : b.size * (emphasis ? 1.085 : 1) * (1 + b.pull) * zoom;
    return {
      x: b.px + (focused ? focus.pan.x : 0),
      y: b.py + (focused ? focus.pan.y : 0),
      radius,
      ...presentation.measure(b, radius),
    };
  }

  function containsBody(geometry: BodyGeometry, x: number, y: number): boolean {
    return geometry.shape === "rect"
      ? Math.abs(x - geometry.x) <= geometry.halfWidth + 9 &&
          Math.abs(y - geometry.y) <= geometry.halfHeight + 9
      : Math.hypot(x - geometry.x, y - geometry.y) <= geometry.radius + 9;
  }

  function placeSideDock() {
    if (!sideDock || !state.focus) return;

    const body = bodies.get(state.focus.id);

    let px: number;
    let py: number;
    let half: number;

    if (body) {
      const geometry = bodyGeometry(body, "dock");
      px = geometry.x;
      py = geometry.y;
      half = geometry.halfWidth;
    } else {
      px = scene.x + scene.w / 2;
      py = scene.y + scene.h / 2;
      half = 70;
    }

    const gap = 18;
    let x = px + half + gap;

    if (x + sideDock.w > w - 20) {
      x = px - half - gap - sideDock.w;
    }

    x = clamp(x, 20, Math.max(20, w - 20 - sideDock.w));

    const top = scene.y + 4;
    const bottom = (siblingDock?.y ?? h - 32) - 8;
    const maxY = Math.max(top, bottom - sideDock.h);
    const y = clamp(py - sideDock.h / 2, top, maxY);

    sideDock.x = x;
    sideDock.y = y;

    let sy = y + SIDE_PAD - sideScroll;

    for (const control of controls) {
      if (control.place !== "side") continue;
      control.x = x + SIDE_PAD;
      control.y = sy;
      sy += control.h + SIDE_GAP;
    }
  }

  function peerCount() {
    const parent = state.focus?.parent ?? "@root";
    const ids = new Set<string>(data.collected.get(parent)?.keys() ?? []);
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

  function drawImageBody(b: Body, geometry: BodyGeometry, alpha: number) {
    const { x: px, y: py, radius: r, fitted } = geometry;
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

  function drawOrb(
    b: Body,
    geometry: BodyGeometry,
    alpha: number,
    glyph: (body: Body, x: number, y: number, radius: number) => void,
  ) {
    glassOrb(geometry.x, geometry.y, geometry.radius, alpha);
    ctx.globalAlpha = b.alpha;
    glyph(b, geometry.x, geometry.y, geometry.radius);
  }

  function drawBody(b: Body) {
    if (b.alpha < 0.02) return;
    const hot =
      input.hover === `node:${b.thing.id}` ||
      input.keyboard === `node:${b.thing.id}`;
    const picked =
      gestureMoved(input.gesture) && input.gesture?.body === b.thing.id;
    const presentation = presentationFor(b.thing);
    const geometry = bodyGeometry(b, "paint");
    const { x: px, y: py, radius: r, halfHeight: extent } = geometry;
    const alpha = b.alpha * (b.role === "sibling" ? 0.78 : 1);

    ctx.save();
    presentation.draw(b, geometry, alpha);

    if (presentation.hoverScale && (hot || picked)) {
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
      const minZoom =
        presentation.zoomable && b.role === "focus" ? focusMinZoom(b) : 1;
      const strength =
        b.role === "focus"
          ? presentation.zoomable
            ? clamp((focus.zoom - minZoom) / Math.max(0.001, 1 - minZoom), 0, 1)
            : 1
          : 0;
      const max =
        b.role === "focus"
          ? presentation.zoomable
            ? lerp(120, Math.min(scene.w - 20, 260), strength)
            : Math.min(scene.w - 20, 260)
          : b.role === "root"
            ? 145
            : 120;
      const gap =
        b.role === "focus"
          ? presentation.zoomable
            ? lerp(19, 25, strength)
            : 25
          : 19;

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

  // --- Controls, status, and frame composition ---

  function drawControl(c: Control) {
    const isBack = c.key === "back";
    const isDock = c.key.startsWith("action:");
    const isSide = c.place === "side";
    const inDock = isDock || isBack;
    const x = isDock && !isSide ? c.x - dockScroll : c.x;
    const rect = { x, y: c.y, w: c.w, h: c.h };
    const hot = input.hover === c.key || input.keyboard === c.key;
    const motion = isDock && !isSide ? controlPulls.get(c.key) : undefined;
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
    const value = isDock ? fitText(c.label, c.w - 20) : c.label;
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
    if (data.error)
      return {
        text: data.error,
        id: `local:${data.error}`,
        bad: true,
        busy: false,
      };
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
    if (data.pending.size || running || state.loading) {
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
        : input.gesture?.body === n.thing.id
          ? 4
          : input.hover === `node:${n.thing.id}`
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
        dock.x + DOCK_PAD - 6,
        dock.y - 24,
        Math.max(0, dock.w - DOCK_PAD * 2 + 12),
        dock.h + 48,
      );
      ctx.clip();
      for (const c of controls)
        if (c.key.startsWith("action:") && c.place !== "side") {
          const x = c.x - dockScroll;
          if (x + c.w >= dock.x && x <= dock.x + dock.w) drawControl(c);
        }
      ctx.restore();
      if (dockMaxScroll > 0) {
        const progress = dockScroll / dockMaxScroll;
        ctx.fillStyle = "rgba(90,110,160,.27)";
        beginRoundedRectPath(
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
    if (sideDock) {
      glass(sideDock, 24, 0.18, 0.6);
      ctx.save();
      ctx.beginPath();
      ctx.rect(sideDock.x + 4, sideDock.y + 4, sideDock.w - 8, sideDock.h - 8);
      ctx.clip();
      for (const c of controls) if (c.place === "side") drawControl(c);
      ctx.restore();
      if (sideMaxScroll > 0) {
        const progress = sideScroll / sideMaxScroll;
        ctx.fillStyle = "rgba(90,110,160,.27)";
        beginRoundedRectPath(
          ctx,
          {
            x: sideDock.x + sideDock.w - 6,
            y: sideDock.y + 16 + progress * (sideDock.h - 60),
            w: 2,
            h: 44,
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
    if (s && data.dismissed !== s.id) {
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
      ctx.fillText(fitText(s.text, rect.w - 62), rect.x + 31, mid);
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
        dockMaxScroll > 0 || sideMaxScroll > 0
          ? ["Drag to arrange", "Scroll a dock for more actions"]
          : ["Drag to arrange", "Scroll up to open", "Scroll down to go back"];
      const lineHeight = 18;
      let y = h - 14 - (guides.length - 1) * lineHeight;
      for (const guide of guides) {
        ctx.fillText(guide, 20, y);
        y += lineHeight;
      }
    }
  }

  // --- Hit testing and input ---

  function canvasPoint(e: PointerEvent | WheelEvent) {
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
    if (s && data.dismissed !== s.id && inside(x, y, statusRect()))
      return "status:dismiss";
    const back = controls.find((c) => c.key === "back");
    if (back && inside(x, y, back)) return back.busy ? null : back.key;
    for (let i = controls.length - 1; i >= 0; i--) {
      const c = controls[i]!;
      const isDock = c.key.startsWith("action:");
      const isSide = c.place === "side";
      const box = { ...c, x: c.x - (isDock && !isSide ? dockScroll : 0) };
      if (isSide) {
        if (!sideDock || !inside(x, y, sideDock)) continue;
      } else if (isDock && (!dock || !inside(x, y, dock))) continue;
      if (inside(x, y, box)) return c.busy ? null : c.key;
    }
    if (dock && inside(x, y, dock)) return null;
    if (sideDock && inside(x, y, sideDock)) return null;
    for (let i = drawn.length - 1; i >= 0; i--) {
      const b = drawn[i]!;
      if (!b.alive || b.alpha <= 0.25) continue;

      if (containsBody(bodyGeometry(b, "hit"), x, y))
        return `node:${b.thing.id}`;
    }
    return null;
  }
  function activate(key: string) {
    if (key === "status:dismiss") {
      data.dismissed = status()?.id ?? "";
      data.error = null;
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
  function cancelPointerGesture() {
    const drag = input.gesture;
    if (drag && canvas.hasPointerCapture(drag.id))
      canvas.releasePointerCapture(drag.id);
    input.gesture = null;
    wake();
  }

  function gestureMoved(gesture: PointerGesture | null): boolean {
    return gesture !== null && gesture.phase !== "pressed";
  }

  function advanceGesture(gesture: PointerGesture, p: Point): boolean {
    gesture.x = p.x;
    gesture.y = p.y;
    if (gesture.dockStart !== null && Math.abs(p.x - gesture.sx) > 5) {
      gesture.phase = "scrolling-dock";
      dockScroll = clamp(
        gesture.dockStart + gesture.sx - p.x,
        0,
        dockMaxScroll,
      );
      return true;
    }
    if (gesture.body && Math.hypot(p.x - gesture.sx, p.y - gesture.sy) > 5)
      gesture.phase = "dragging-thing";
    return gestureMoved(gesture);
  }

  function down(e: PointerEvent) {
    if (input.gesture || e.button !== 0) return;
    canvas.focus({ preventScroll: true });
    input.keyboard = null;
    const p = canvasPoint(e);
    input.mouse = p;
    const key = hit(p.x, p.y);
    const b = key?.startsWith("node:") ? bodies.get(key.slice(5)) : null;
    input.gesture = {
      id: e.pointerId,
      key,
      body: b && b.role !== "sibling" ? b.thing.id : null,
      sx: p.x,
      sy: p.y,
      x: p.x,
      y: p.y,
      dx: b ? p.x - b.px : 0,
      dy: b ? p.y - b.py : 0,
      phase: "pressed",
      dockStart: dock && inside(p.x, p.y, dock) ? dockScroll : null,
    };
    canvas.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    const p = canvasPoint(e);
    input.mouse = p;
    if (input.gesture?.id === e.pointerId && advanceGesture(input.gesture, p)) {
      canvas.style.cursor = "grabbing";
      wake();
      return;
    }
    const next = hit(p.x, p.y);
    if (next !== input.hover) {
      input.hover = next;
      canvas.style.cursor = next ? "pointer" : "default";
      wake();
    } else if (next?.startsWith("action:")) {
      wake();
    }
  }
  function up(e: PointerEvent) {
    if (!input.gesture || input.gesture.id !== e.pointerId) return;
    const previous = input.gesture;
    const p = canvasPoint(e);
    const clicked =
      !gestureMoved(previous) && previous.key && hit(p.x, p.y) === previous.key;
    storeOrbitPlacement(previous, p);
    cancelPointerGesture();
    if (clicked) activate(previous.key!);
    if (e.pointerType === "touch") input.mouse = null;
    input.hover = hit(p.x, p.y);
    canvas.style.cursor = input.hover ? "pointer" : "default";
    wake();
  }

  function storeOrbitPlacement(previous: PointerGesture, p: Point) {
    if (gestureMoved(previous) && previous.body) {
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
  }
  function leave() {
    if (!input.gesture) {
      input.hover = null;
      input.mouse = null;
      canvas.style.cursor = "default";
      wake();
    }
  }
  function wheel(e: WheelEvent) {
    if (e.ctrlKey || input.gesture) return;
    e.preventDefault();
    const p = canvasPoint(e);
    if (scrollDock(e, p)) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? h : 1;
    if (zoomFocusedThing(e, p, unit)) return;

    resetWheelAfterPause();
    if (wheelGesture.locked) return;

    for (const control of controls)
      if (!control.key.startsWith("action:") && inside(p.x, p.y, control))
        return;

    wheelGesture.amount += e.deltaY * unit;
    if (Math.abs(wheelGesture.amount) < 70) return;
    wheelGesture.locked = true;

    if (wheelGesture.amount > 0) {
      safe(() => session.back());
    } else {
      const key = hit(p.x, p.y);
      if (key?.startsWith("node:")) activate(key);
    }
  }

  function scrollDock(e: WheelEvent, p: Point): boolean {
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
      return true;
    }

    if (sideDock && inside(p.x, p.y, sideDock)) {
      if (sideMaxScroll > 0) {
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? h : 1;
        sideScroll = clamp(sideScroll + e.deltaY * unit, 0, sideMaxScroll);
        wake();
      }
      return true;
    }
    return false;
  }

  function zoomFocusedThing(e: WheelEvent, p: Point, unit: number): boolean {
    // Wheel over the focused image scales it: up grows, down shrinks.
    const focused = state.focus;
    const zoomed =
      Math.abs(focus.target - 1) > 0.001 || Math.abs(focus.zoom - 1) > 0.001;
    if (
      focused &&
      presentationFor(focused).zoomable &&
      (zoomed || hit(p.x, p.y) === `node:${focused.id}`)
    ) {
      const body = focused ? bodies.get(focused.id) : undefined;
      const minZoom = body ? focusMinZoom(body) : 0;
      const unfocusZoom = minZoom + FOCUS_UNFOCUS_LIFT;
      const factor = Math.exp(-e.deltaY * unit * 0.002);
      focus.target = clamp(focus.target * factor, minZoom, FOCUS_ZOOM_MAX);
      focus.pivot = { x: p.x, y: p.y };

      if (e.deltaY < 0) focus.unfocusOnZoomOut = false;
      else if (focus.target <= unfocusZoom + 0.001)
        focus.unfocusOnZoomOut = true;

      wheelGesture.amount = 0;
      wake();
      return true;
    }
    return false;
  }

  function resetWheelAfterPause() {
    if (wheelGesture.timer !== undefined) clearTimeout(wheelGesture.timer);
    wheelGesture.timer = setTimeout(() => {
      wheelGesture.amount = 0;
      wheelGesture.locked = false;
    }, 180);
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (input.gesture) cancelPointerGesture();
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
      const idx = items.indexOf(input.keyboard ?? "");
      input.keyboard = items[(idx + direction + items.length) % items.length]!;
      const selected = controls.find((c) => c.key === input.keyboard);
      if (selected?.place === "side" && sideDock) {
        const top = sideDock.y + SIDE_PAD;
        const bottom = sideDock.y + sideDock.h - SIDE_PAD;
        if (selected.y < top)
          sideScroll = clamp(sideScroll - (top - selected.y), 0, sideMaxScroll);
        else if (selected.y + selected.h > bottom)
          sideScroll = clamp(
            sideScroll + selected.y + selected.h - bottom,
            0,
            sideMaxScroll,
          );
      } else if (selected?.key.startsWith("action:") && dock) {
        if (selected.x - dockScroll < dock.x + DOCK_PAD)
          dockScroll = clamp(selected.x - dock.x - DOCK_PAD, 0, dockMaxScroll);
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
    } else if (
      (e.key === "Enter" || e.key === " ") &&
      input.keyboard &&
      !e.repeat
    ) {
      e.preventDefault();
      activate(input.keyboard);
    }
  }
  // --- Resize, event wiring, and teardown ---

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
    if (input.gesture?.id === e.pointerId) cancelPointerGesture();
  };
  const onLostCapture = (e: PointerEvent) => {
    if (input.gesture?.id === e.pointerId) {
      input.gesture = null;
      wake();
    }
  };
  const onBlur = () => {
    input.keyboard = null;
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
      if (wheelGesture.timer !== undefined) clearTimeout(wheelGesture.timer);
      cancelPointerGesture();
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
      data.pending.clear();
    },
  };
}
