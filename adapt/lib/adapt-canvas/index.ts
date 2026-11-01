import { createImportView } from "./import-view.ts";
import { createRenderers } from "./renderers/index.ts";
import type { BodyGeometry } from "./renderers/types.ts";
/**
 * Workspace behavior stays together here; stateless drawing primitives and
 * visual assets live in paint.ts. Types, tuning, and shared helpers come first.
 * Inside canvasView, sections cover state, type presentations, image resources,
 * session updates, layout, animation, geometry/drawing, input, and lifecycle.
 *
 * rebuild() turns session snapshots into layout targets; tick() animates bodies
 * toward them and draws the frame. Input updates view state or calls the session.
 * Add type visuals in renderers/; add gestures in the input section.
 * Geometry uses CSS pixels; only the canvas backing store is scaled by dpr.
 */
import type { Thing } from "../adapt/core/contracts.ts";
import type { OfferedAction } from "../adapt/core/actions.ts";
import type { Session, SessionSnapshot } from "../adapt/core/session.ts";
import { createTextEditor } from "./editor.ts";
import {
  BACKDROP,
  BROKEN_IMAGE_ICON_PATH,
  FILE_ICON_PATH,
  IMAGE_ICON_PATH,
  beginRoundedRectPath,
  createCanvasPaint,
  type Rect,
} from "./paint.ts";
import {
  createImports,
  type ImportDestination,
  type ImportFile,
  type PendingImport,
} from "./imports.ts";

export type { ImportContext, ImportFile } from "./imports.ts";

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
  detail?: string;
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
type DropCandidate =
  | {
      sourceId: string;
      targetId: string;
      kind: "move" | "group";
    }
  | {
      sourceId: string;
      targetId: null;
      kind: "out";
    };
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
const BACK_SIZE = 48;
const DECK_BOTTOM = 24;
const DECK_PAD = 14;
const DECK_GAP = 10;
const DECK_RIGHT = 20;
const SIDE_PAD = 12;
const SIDE_GAP = 8;
const SIDE_BUTTON = 34;
const PINCH_STEP = 40;
const TRASH_RADIUS = 40;
const DROP_INSIDE_SCALE = 0.55;
const DROP_OUT_SCALE = 0.6;
const DEFAULT_BACKGROUND_BLUR = 48;
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

export function canvasView(options: {
  canvas: HTMLCanvasElement;
  session: Session;
  /** Action categories shown in the top bar. Omit to show all there. */
  topBar?: readonly string[];
  /** Action categories shown in the vertical dock beside the focus. */
  sideBar?: readonly string[];
  /** Store a chosen or dropped file and return the thing it became. */
  importFile?: ImportFile;
  /** File types offered by the native picker. */
  importAccept?: string;
  /** Image drawn behind the workspace, such as "/bg.jpg". */
  backgroundImage?: string;
  /** Blur radius for the background image, in CSS pixels. Defaults to 48. */
  backgroundBlur?: number;
  /** Intercept an action before it is invoked; return true when handled locally. */
  onAction?: (contextId: string, action: OfferedAction) => boolean;
  /** Commit a direct text draft at a canvas location. */
  onTextDraft?: (input: {
    text: string;
    submit: boolean;
    point: Point;
    parent: string | null;
  }) => void;
  /** Delete a thing dropped on the trash target while arranging things. */
  onDelete?: (thing: Thing) => void | Promise<void>;
  /** Move a dragged thing into an existing collection, or group two things. */
  onDropThing?: (input: {
    thing: Thing;
    target: Thing;
    kind: "move" | "group";
  }) => void | Promise<void>;
  /** Move a dragged child out of the focused collection, beside its siblings. */
  onMoveOut?: (input: {
    thing: Thing;
    parent: string | null;
  }) => void | Promise<void>;
}) {
  // --- View state and resources ---

  const { canvas, session } = options;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  const ctx = context;
  const {
    fill,
    glass,
    glassOrb,
    fitText,
    dropZone,
    progressRing,
    pendingCard,
    roundedImage,
  } = createCanvasPaint(ctx);
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const oldTouch = canvas.style.touchAction;
  const oldCursor = canvas.style.cursor;
  const oldTabIndex = canvas.getAttribute("tabindex");
  const oldLabel = canvas.getAttribute("aria-label");
  const oldBackground = canvas.style.background;

  const bodies = new Map<string, Body>();
  const orbitOffsets = new Map<string, { angle: number; dist: number }>();
  const images = new Map<string, HTMLImageElement>();
  const backgroundSource = options.backgroundImage;
  const backgroundBlur = Math.max(
    0,
    options.backgroundBlur ?? DEFAULT_BACKGROUND_BLUR,
  );
  const backgroundImage = backgroundSource ? new Image() : null;
  let backgroundImageReady = false;
  let backgroundCache: HTMLCanvasElement | null = null;
  let backgroundCacheKey = "";
  let draftPoint: Point | null = null;

  const imageIcon = new Path2D(IMAGE_ICON_PATH);
  const brokenImageIcon = new Path2D(BROKEN_IMAGE_ICON_PATH);
  const fileIcon = new Path2D(FILE_ICON_PATH);
  const data = {
    pending: new Set<string>(),
    collected: new Map<string, Map<string, Thing>>(),
    deleted: new Set<string>(),
    hidden: new Set<string>(),
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
  let siblingSpacing = 0;
  let backDock: Rect | null = null;
  let addDock: Rect | null = null;
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
  const trash = {
    presence: 0,
    x: 0,
    y: 0,
    radius: TRASH_RADIUS,
    hot: false,
  };
  const drop = { presence: 0 };
  let dropCandidate: DropCandidate | null = null;
  let heading: Heading | null = null;
  let importer: ReturnType<typeof createImports> | null = null;
  let importDrag: ImportDestination | null = null;
  let orbit = 0;
  let orbitVelocity = 0.075;
  const wheelGesture = {
    amount: 0,
    locked: false,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  };
  const touches = new Map<number, Point>();
  let pinch: {
    distance: number;
    amount: number;
    navigated: boolean;
  } | null = null;
  let ignoreTouch = false;

  const importView = createImportView({
    ctx, paint: { fill, glass, fitText, dropZone, progressRing, pendingCard, roundedImage },
    imageFor, drawImageIcon, fileIcon, label,
  });

  const textEditor = createTextEditor({ ctx, onChange: () => wake() });

  // --- Type presentations ---
  // Selection, gestures, and animation stay shared across types.
  const presentationFor = createRenderers({
    ctx,
    glassOrb,
    pendingCard,
    imageFor,
    drawImageIcon,
    imageIcon,
    brokenImageIcon,
    fileIcon,
  });

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

  function parentDestination(): string | null {
    const focused = state.focus;
    if (!focused) return null;
    return session.contains(focused) ? focused.id : focused.parent;
  }

  function openDraft(initial: string, point: Point): void {
    const width = Math.min(560, Math.max(260, w - 60));
    const height = 158;
    textEditor.open({
      text: initial,
      label: "Text file",
      rect: {
        x: clamp(point.x - width / 2, 20, Math.max(20, w - width - 20)),
        y: clamp(point.y - height - 16, 80, Math.max(80, h - height - 30)),
        w: width,
        h: height,
      },
      multiline: true,
      keepOnEscape: true,
      onCommit(text, submit) {
        if (!text) return;
        options.onTextDraft?.({
          text,
          submit,
          point: draftPoint ?? point,
          parent: parentDestination(),
        });
        draftPoint = null;
      },
    });
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
    if (options.onAction?.(contextId, action)) return;

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

  function deleteThing(id: string) {
    const body = bodies.get(id);
    const remove = options.onDelete;
    if (
      !body ||
      (body.role !== "root" && body.role !== "child") ||
      !remove
    )
      return;

    body.alive = false;
    orbitOffsets.delete(id);
    data.deleted.add(id);
    if (state.selectedIds.includes(id)) session.clearSelection();
    wake();

    void (async () => {
      try {
        await remove(body.thing);
      } catch (error) {
        if (!destroyed) {
          data.deleted.delete(id);
          fail(error);
        }
      }
    })();
  }

  function runDrop(
    ids: readonly string[],
    listKey: string,
    run: () => Promise<void>,
  ) {
    for (const id of ids) {
      data.hidden.add(id);
      orbitOffsets.delete(id);
    }
    rebuild();
    wake();

    void (async () => {
      try {
        await run();
        const page = data.collected.get(listKey);
        if (page) for (const id of ids) page.delete(id);
      } catch (error) {
        if (!destroyed) fail(error);
      } finally {
        if (!destroyed) {
          for (const id of ids) data.hidden.delete(id);
          rebuild();
        }
      }
    })();
  }

  function dropOnThing(
    source: Body,
    target: Body,
    kind: "move" | "group",
  ) {
    const handler = options.onDropThing;
    if (!handler) return;

    runDrop(
      kind === "group"
        ? [source.thing.id, target.thing.id]
        : [source.thing.id],
      focus.key,
      async () => {
        await handler({ thing: source.thing, target: target.thing, kind });
      },
    );
  }

  function moveOutOfCollection(source: Body) {
    const handler = options.onMoveOut;
    const focused = state.focus;
    if (!handler || !focused) return;

    runDrop([source.thing.id], focus.key, async () => {
      await handler({ thing: source.thing, parent: focused.parent });
    });
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
    syncImports();
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
    children = [...page.values()].filter(
      (item) => !data.deleted.has(item.id) && !data.hidden.has(item.id),
    );
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

  // --- Import destinations and pending previews ---

  function currentDestination(): ImportDestination {
    const focused = state.focus;

    if (!focused) return { parent: null, label: "your space" };

    if (session.contains(focused))
      return { parent: focused.id, label: title(focused) };

    return {
      parent: focused.parent,
      label: state.parent ? title(state.parent) : "your space",
    };
  }

  function syncImports(): void {
    if (!importer) return;
    const rect = canvas.getBoundingClientRect();
    importView.sync(importer.items, {
      scene, canvas: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
      width: w, height: h,
    }, motion.matches);
    if (input.keyboard?.startsWith("import:") && input.keyboard !== "import:add" &&
        !importView.keys().includes(input.keyboard)) input.keyboard = null;
    wake();
  }

  function adoptImportedThing(item: PendingImport, thing: Thing): void {
    const pending = importView.get(item.id);
    const visibleParent = state.focus
      ? session.contains(state.focus)
        ? state.focus.id
        : state.focus.parent
      : null;

    if (pending && thing.parent === visibleParent) {
      bodies.set(thing.id, {
        thing,
        role: state.focus ? "child" : "root",
        x: pending.x,
        y: pending.y,
        r: pending.r,
        phase: pending.phase,
        px: pending.px,
        py: pending.py,
        size: pending.size,
        alpha: pending.alpha,
        pull: 0,
        vx: pending.vx,
        vy: pending.vy,
        alive: true,
        pinned: null,
      });
    }

    session.integrate(thing);
    safe(() => session.focus(thing.id));
  }

  // --- Layout targets and body reconciliation ---

  function layoutDocks(
    focused: Thing | null,
    siblings: readonly Thing[],
    topActions: readonly OfferedAction[],
    sideActions: readonly OfferedAction[],
  ) {
    // Back, the action dock, and Add share the top row; siblings stay at the bottom.
    const topHeight = 60;
    const buttonY = DOCK_TOP + (topHeight - BACK_SIZE) / 2;
    const leftReserve = focused ? BACK_SIZE + DECK_GAP : 0;
    const rightReserve = options.importFile ? BACK_SIZE + DECK_GAP : 0;

    siblingDock = null;
    const topSpace = Math.max(1, w - 40 - leftReserve - rightReserve);
    const dockWidth = Math.min(DOCK_WIDTH_MAX, topSpace);
    const hasDock = focused !== null && topActions.length > 0;
    const rowWidth = leftReserve + (hasDock ? dockWidth : 0) + rightReserve;
    const rowX = (w - rowWidth) / 2;

    backDock = focused
      ? { x: rowX, y: buttonY, w: BACK_SIZE, h: BACK_SIZE }
      : null;
    addDock = options.importFile
      ? {
          x: rowX + leftReserve + (hasDock ? dockWidth + DECK_GAP : 0),
          y: buttonY,
          w: BACK_SIZE,
          h: BACK_SIZE,
        }
      : null;
    dock = hasDock
      ? { x: rowX + leftReserve, y: DOCK_TOP, w: dockWidth, h: topHeight }
      : null;

    if (focused && siblings.length) {
      const available = Math.max(1, w - 40);
      const slot = clamp(
        (available - DECK_PAD - DECK_RIGHT) / siblings.length,
        12,
        96,
      );
      const barWidth = Math.min(
        available,
        DECK_PAD + siblings.length * slot + DECK_RIGHT,
      );
      siblingDock = {
        x: (w - barWidth) / 2,
        y: h - DECK_BOTTOM - BACK_SIZE,
        w: barWidth,
        h: BACK_SIZE,
      };
    }

    const topBottom = Math.max(DOCK_TOP + topHeight, buttonY + BACK_SIZE);
    const sceneTop = backDock || addDock || dock ? topBottom + 16 : 109;
    const sceneBottom = siblingDock?.y ?? h - 32;
    scene = {
      x: 20,
      y: sceneTop,
      w: Math.max(1, w - 40),
      h: Math.max(1, sceneBottom - sceneTop - 19),
    };

    const actionWidths = topActions.map((action) =>
      clamp(28 + action.label.length * 7, 64, 210),
    );
    const actionsWidth = actionWidths.reduce((sum, cw) => sum + cw + 9, 0) - 9;

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
    if (backDock) {
      controls.push({
        key: "back",
        label: "‹",
        ...backDock,
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
          ...(action.description === undefined
            ? {}
            : { detail: action.description }),
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
          ...(action.description === undefined
            ? {}
            : { detail: action.description }),
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
      // Siblings occupy their own dock to the right of Back.
      const bar = siblingDock;
      siblingSpacing = 0;
      if (bar && siblings.length) {
        const start = bar.x + DECK_PAD;
        const spacing = (bar.x + bar.w - DECK_RIGHT - start) / siblings.length;
        siblingSpacing = spacing;
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
    const trashMoving = animateTrash(dt, instant);
    dropCandidate = findDropCandidate();
    const dropMoving = animateDrop(dt, instant);
    const settling = animateBodies(dt, instant);
    const pendingMoving = importView.animate(dt, instant);
    const controlsMoving = animateControls(dt, instant);
    placeSideDock();
    draw();
    if (
      !instant &&
      (bodies.size > 0 ||
        settling ||
        importView.size > 0 ||
        pendingMoving ||
        data.pending.size ||
        headingMoving ||
        trashMoving ||
        dropMoving ||
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
      if (pinch) pinch.navigated = true;
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
    const dropTargetId = dropCandidate?.targetId ?? null;
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
        if (dropCandidate?.sourceId === b.thing.id) {
          if (dropCandidate.kind === "out") {
            const dock = outDock();
            if (dock) {
              y = lerp(y, dock.y + dock.h / 2, 0.28 * drop.presence);
            }
          } else {
            const target = bodies.get(dropCandidate.targetId);
            if (target?.alive) {
              const pull =
                (dropCandidate.kind === "move" ? 0.35 : 0.12) * drop.presence;
              x = lerp(x, target.px, pull);
              y = lerp(y, target.py, pull);
            }
          }
        }
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
          if (
            a.b.role !== "focus" &&
            a.b.role !== "sibling" &&
            drag?.body !== a.b.thing.id &&
            a.b.thing.id !== dropTargetId
          ) {
            a.x += ax;
            a.y += ay;
          }
          if (
            b.b.role !== "focus" &&
            b.b.role !== "sibling" &&
            drag?.body !== b.b.thing.id &&
            b.b.thing.id !== dropTargetId
          ) {
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
      const dropScale =
        dropCandidate?.sourceId === b.thing.id
          ? dropCandidate.kind === "move"
            ? DROP_INSIDE_SCALE
            : dropCandidate.kind === "out"
              ? DROP_OUT_SCALE
              : 1
          : 1;
      const dropOut =
        dropCandidate?.sourceId === b.thing.id &&
        dropCandidate.kind === "out";
      const margin = (dropOut ? b.r * DROP_OUT_SCALE : b.r) + 13;
      // Siblings sit in the bottom shelf, outside the scene bounds.
      const inScene = b.role !== "sibling" || b.pinned || dragging;
      const draggedItem =
        dragging && (b.role === "root" || b.role === "child");
      const tx = inScene
        ? clamp(item.x, scene.x + margin, scene.x + scene.w - margin)
        : item.x;
      const ty = inScene
        ? clamp(
            item.y,
            draggedItem ? 0 : scene.y + margin,
            dropOut ? h - margin : scene.y + scene.h - margin,
          )
        : item.y;
      const k = b.role === "focus" ? 9 : 5.5;
      const damping = Math.exp(-dt * 7.5);
      if (instant) {
        b.px = tx;
        b.py = ty;
        b.vx = 0;
        b.vy = 0;
        b.size = b.r * dropScale;
        b.alpha = 1;
      } else if (dragging) {
        // Track the pointer directly so the thing stays under the cursor.
        b.px = tx;
        b.py = ty;
        b.vx = 0;
        b.vy = 0;
        b.size = lerp(b.size, b.r * dropScale, 1 - Math.exp(-dt * 11));
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

  function animateTrash(dt: number, instant: boolean): boolean {
    const target = trashTarget();
    if (target) {
      trash.x = target.x;
      trash.y = target.y;
      trash.radius = target.radius;
      const gesture = input.gesture;
      trash.hot =
        gesture !== null &&
        Math.hypot(gesture.x - target.x, gesture.y - target.y) <=
          target.radius + 8;
    } else {
      trash.hot = false;
    }

    const wanted = target ? 1 : 0;
    trash.presence = instant
      ? wanted
      : lerp(trash.presence, wanted, 1 - Math.exp(-dt * 18));
    return Math.abs(trash.presence - wanted) > 0.005;
  }

  function animateDrop(dt: number, instant: boolean): boolean {
    const wanted = dropCandidate ? 1 : 0;
    drop.presence = instant
      ? wanted
      : lerp(drop.presence, wanted, 1 - Math.exp(-dt * 16));
    return Math.abs(drop.presence - wanted) > 0.005;
  }

  function animateControls(dt: number, instant: boolean): boolean {
    const { mouse, hover, keyboard } = input;
    if (dock && state.focus) {
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

  function label(
    text: string,
    x: number,
    y: number,
    max: number,
    strength = 0,
    wrap = false,
  ) {
    const t = clamp(strength, 0, 1);
    const size = lerp(12, 15, t);
    const weight = Math.round(lerp(500, 600, t));

    ctx.save();
    ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#293653";
    if (wrap) {
      const lines: string[] = [];
      let line = "";
      for (const character of text) {
        if (line && ctx.measureText(line + character).width > Math.max(1, max)) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
      if (line) lines.push(line);
      lines.forEach((value, index) => ctx.fillText(value, x, y + 0.4 + index * size * 1.4));
    } else {
      ctx.fillText(fitText(text, max), x, y + 0.4);
    }
    ctx.restore();
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

  function trashTarget(): { x: number; y: number; radius: number } | null {
    if (!options.onDelete) return null;

    const gesture = input.gesture;
    if (!gesture || gesture.phase !== "dragging-thing" || !gesture.body)
      return null;

    const body = bodies.get(gesture.body);
    if (
      !body ||
      (body.role !== "root" && body.role !== "child") ||
      !body.alive
    )
      return null;

    return {
      x: w / 2,
      y: DOCK_TOP + 30,
      radius: TRASH_RADIUS,
    };
  }

  function overTrash(point: Point): boolean {
    const target = trashTarget();
    return (
      target !== null &&
      Math.hypot(point.x - target.x, point.y - target.y) <= target.radius + 8
    );
  }

  function outDock(): Rect | null {
    if (!state.focus) return null;
    if (siblingDock) return siblingDock;

    const width = Math.min(220, Math.max(140, w - 40));
    return {
      x: (w - width) / 2,
      y: h - DECK_BOTTOM - BACK_SIZE,
      w: width,
      h: BACK_SIZE,
    };
  }

  function overOutDock(point: Point): boolean {
    const dock = outDock();
    if (!dock) return false;

    const pad = 14;
    return inside(point.x, point.y, {
      x: dock.x - pad,
      y: dock.y - pad,
      w: dock.w + pad * 2,
      h: dock.h + pad * 2,
    });
  }

  function findDropCandidate(point?: Point): DropCandidate | null {
    const gesture = input.gesture;
    if (
      (!options.onDropThing && !options.onMoveOut) ||
      !gesture ||
      gesture.phase !== "dragging-thing" ||
      !gesture.body
    )
      return null;

    const source = bodies.get(gesture.body);
    if (!source || !source.alive) return null;
    if (source.role !== "root" && source.role !== "child") return null;

    const pointer = point ?? { x: gesture.x, y: gesture.y };
    if (trashTarget() && overTrash(pointer)) return null;

    if (
      options.onMoveOut &&
      source.role === "child" &&
      overOutDock(pointer)
    ) {
      return { sourceId: source.thing.id, targetId: null, kind: "out" };
    }

    if (!options.onDropThing) return null;

    let best: { target: Body; distance: number } | null = null;

    for (const target of bodies.values()) {
      if (!target.alive || target.thing.id === source.thing.id) continue;
      if (target.role !== "root" && target.role !== "child") continue;
      if (target.alpha < 0.3) continue;

      const geometry = bodyGeometry(target, "hit");
      const distance = Math.hypot(
        source.px - geometry.x,
        source.py - geometry.y,
      );
      const reach =
        geometry.shape === "rect"
          ? Math.max(geometry.halfWidth, geometry.halfHeight)
          : geometry.radius;

      if (distance > reach + source.size * 0.7 + 6) continue;
      if (!best || distance < best.distance) best = { target, distance };
    }

    if (!best) return null;

    return {
      sourceId: source.thing.id,
      targetId: best.target.thing.id,
      kind: session.contains(best.target.thing) ? "move" : "group",
    };
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
    presentation.draw(b, geometry, alpha, { time, reducedMotion: motion.matches });

    if (presentation.hoverScale && (hot || picked)) {
      ctx.beginPath();
      ctx.arc(px, py, r + 5, 0, TAU);
      ctx.strokeStyle = "rgba(77,122,223,.52)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const showLabel =
      b.thing.type !== "image" ||
      (presentation.labelWidth !== undefined && b.role !== "sibling") ||
      (presentation.dockLabel && b.role === "sibling") ||
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
            : b.role === "sibling"
              ? Math.max(
                  24,
                  Math.min(
                    siblingSpacing - 6,
                    presentation.labelWidth ?? 120,
                    scene.w - 20,
                  ),
                )
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
        b.role === "sibling" ? py - extent - 14 : py + extent + gap,
        b.role === "focus" && presentation.labelWidth !== undefined
          ? Math.max(1, Math.min(440, scene.w - 20))
          : b.role === "sibling"
            ? Math.min(max, presentation.labelWidth ?? max)
            : Math.min(scene.w - 20, presentation.labelWidth ?? max),
        strength,
        b.role === "focus" && presentation.labelWidth !== undefined,
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
    const size = (isBack ? 19 : 12) * scale;
    if (isBack) {
      const d = Math.min(c.w, c.h) * scale;
      glass(
        { x: cx - d / 2, y: cy - d / 2, w: d, h: d },
        22,
        hot ? 0.72 : 0.48,
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

  function drawTrashIcon(x: number, y: number, size: number) {
    const s = size;

    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "rgba(255,255,255,.96)";
    ctx.lineWidth = Math.max(2, s * 0.15);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(-s * 0.6, -s * 0.34);
    ctx.lineTo(s * 0.6, -s * 0.34);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-s * 0.18, -s * 0.34);
    ctx.lineTo(-s * 0.14, -s * 0.55);
    ctx.lineTo(s * 0.14, -s * 0.55);
    ctx.lineTo(s * 0.18, -s * 0.34);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-s * 0.46, -s * 0.2);
    ctx.lineTo(-s * 0.38, s * 0.52);
    ctx.quadraticCurveTo(-s * 0.36, s * 0.64, -s * 0.24, s * 0.64);
    ctx.lineTo(s * 0.24, s * 0.64);
    ctx.quadraticCurveTo(s * 0.36, s * 0.64, s * 0.38, s * 0.52);
    ctx.lineTo(s * 0.46, -s * 0.2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-s * 0.16, -s * 0.06);
    ctx.lineTo(-s * 0.12, s * 0.42);
    ctx.moveTo(0, -s * 0.06);
    ctx.lineTo(0, s * 0.42);
    ctx.moveTo(s * 0.16, -s * 0.06);
    ctx.lineTo(s * 0.12, s * 0.42);
    ctx.stroke();
    ctx.restore();
  }

  function drawCollectionGlyph(x: number, y: number, size: number) {
    ctx.save();
    ctx.translate(x, y);
    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.translate(
        (i === 0 ? -0.12 : 0.12) * size,
        (i === 0 ? -0.16 : 0.16) * size,
      );
      ctx.rotate(i === 0 ? -0.08 : 0.04);
      beginRoundedRectPath(
        ctx,
        {
          x: -size * 0.9,
          y: -size * 0.65,
          w: size * 1.8,
          h: size * 1.3,
        },
        size * 0.18,
      );
      ctx.fillStyle =
        i === 0 ? "rgba(235,235,235,.48)" : "rgba(255,255,255,.82)";
      ctx.fill();
      ctx.strokeStyle = "rgba(77,122,223,.62)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawDropPreview() {
    const candidate = dropCandidate;
    if (!candidate || drop.presence < 0.01) return;

    const source = bodies.get(candidate.sourceId);
    if (!source?.alive) return;

    if (candidate.kind === "out") {
      const dock = outDock();
      if (!dock) return;

      ctx.save();
      ctx.globalAlpha = clamp(drop.presence, 0, 1);
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -time * 22;
      beginRoundedRectPath(
        ctx,
        {
          x: dock.x - 10,
          y: dock.y - 10,
          w: dock.w + 20,
          h: dock.h + 20,
        },
        26,
      );
      ctx.fillStyle = "rgba(77,122,223,.1)";
      ctx.fill();
      ctx.strokeStyle = "rgba(77,122,223,.7)";
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.setLineDash([]);

      const label = "Move out";
      ctx.font = "600 11px system-ui";
      const width = ctx.measureText(label).width + 20;
      const pill = {
        x: dock.x + dock.w / 2 - width / 2,
        y: dock.y - 32,
        w: width,
        h: 21,
      };
      beginRoundedRectPath(ctx, pill, 10.5);
      ctx.fillStyle = "rgba(77,122,223,.9)";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, pill.x + pill.w / 2, pill.y + pill.h / 2 + 0.5);
      ctx.restore();
      return;
    }

    const target = bodies.get(candidate.targetId);
    if (!target?.alive) return;

    const s = bodyGeometry(source, "paint");
    const t = bodyGeometry(target, "paint");

    ctx.save();
    ctx.globalAlpha = clamp(drop.presence, 0, 1);
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -time * 22;

    if (candidate.kind === "move") {
      const pad = 12;
      if (t.shape === "rect") {
        beginRoundedRectPath(
          ctx,
          {
            x: t.x - t.halfWidth - pad,
            y: t.y - t.halfHeight - pad,
            w: t.halfWidth * 2 + pad * 2,
            h: t.halfHeight * 2 + pad * 2,
          },
          24,
        );
      } else {
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius + pad, 0, TAU);
      }
      ctx.fillStyle = "rgba(77,122,223,.09)";
      ctx.fill();
      ctx.strokeStyle = "rgba(77,122,223,.7)";
      ctx.lineWidth = 2.4;
      ctx.stroke();
    } else {
      const pad = 18;
      const left = Math.min(s.x - s.halfWidth, t.x - t.halfWidth) - pad;
      const right = Math.max(s.x + s.halfWidth, t.x + t.halfWidth) + pad;
      const top = Math.min(s.y - s.halfHeight, t.y - t.halfHeight) - pad;
      const bottom = Math.max(s.y + s.halfHeight, t.y + t.halfHeight) + pad;

      beginRoundedRectPath(
        ctx,
        { x: left, y: top, w: right - left, h: bottom - top },
        30,
      );
      ctx.fillStyle = "rgba(255,255,255,.18)";
      ctx.fill();
      ctx.strokeStyle = "rgba(77,122,223,.62)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      for (const geometry of [s, t]) {
        if (geometry.shape === "rect") {
          beginRoundedRectPath(
            ctx,
            {
              x: geometry.x - geometry.halfWidth - 6,
              y: geometry.y - geometry.halfHeight - 6,
              w: geometry.halfWidth * 2 + 12,
              h: geometry.halfHeight * 2 + 12,
            },
            12,
          );
        } else {
          ctx.beginPath();
          ctx.arc(geometry.x, geometry.y, geometry.radius + 6, 0, TAU);
        }
        ctx.strokeStyle = "rgba(77,122,223,.4)";
        ctx.lineWidth = 1.7;
        ctx.stroke();
      }

      drawCollectionGlyph((left + right) / 2, top + 13, 10);
    }

    ctx.restore();
  }

  function drawTrash() {
    if (trash.presence < 0.01) return;

    const presence = clamp(trash.presence, 0, 1);
    const radius =
      trash.radius * (0.72 + presence * 0.28) * (trash.hot ? 1.08 : 1);
    const { x, y } = trash;

    ctx.save();
    ctx.globalAlpha = presence;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    const body = ctx.createRadialGradient(
      x - radius * 0.25,
      y - radius * 0.3,
      radius * 0.1,
      x,
      y,
      radius,
    );
    body.addColorStop(0, "#f27783");
    body.addColorStop(1, "#cf3f54");
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.92)";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if (trash.hot) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 7, 0, TAU);
      ctx.strokeStyle = "rgba(207,63,84,.42)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    drawTrashIcon(x, y, radius * 0.56);
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
    let runningOperation: (typeof state.operations)[number] | undefined;
    let latest: (typeof state.operations)[number] | undefined;
    for (const operation of state.operations) {
      if (
        operation.status === "running" &&
        (runningOperation === undefined ||
          operation.startedAt > runningOperation.startedAt)
      ) {
        runningOperation = operation;
      }
      if (latest === undefined) {
        latest = operation;
        continue;
      }
      const at =
        operation.status === "running"
          ? operation.startedAt
          : operation.finishedAt;
      const bt =
        latest.status === "running"
          ? latest.startedAt
          : latest.finishedAt;
      if (at > bt) latest = operation;
    }
    if (data.pending.size || runningOperation || state.loading) {
      const text =
        runningOperation?.progress?.detail ??
        runningOperation?.progress?.stage ??
        (state.loading ? "Loading…" : "Working…");
      return {
        text,
        id: runningOperation ? `run:${runningOperation.id}` : "working",
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

  function addPromptRect(): Rect | null {
    return importer ? addDock : null;
  }

  function backgroundLayer(): HTMLCanvasElement | null {
    const image = backgroundImage;
    if (!image || !backgroundImageReady) return null;

    const width = canvas.width;
    const height = canvas.height;
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;
    if (!width || !height || !imageWidth || !imageHeight) return null;

    const key = `${width}x${height}`;
    if (backgroundCache && backgroundCacheKey === key) return backgroundCache;

    const layer = backgroundCache ?? document.createElement("canvas");
    layer.width = width;
    layer.height = height;
    const layerContext = layer.getContext("2d");
    if (!layerContext) return null;

    // The bleed keeps the blurred image from fading at the canvas edges.
    const bleed = backgroundBlur * dpr * 3;
    const scale = Math.max(
      (width + bleed * 2) / imageWidth,
      (height + bleed * 2) / imageHeight,
    );
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;

    layerContext.clearRect(0, 0, width, height);
    if (backgroundBlur > 0) {
      layerContext.filter = `blur(${backgroundBlur * dpr}px)`;
    }
    layerContext.drawImage(
      image,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    layerContext.filter = "none";

    backgroundCache = layer;
    backgroundCacheKey = key;
    return layer;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const background = backgroundLayer();
    if (background) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(background, 0, 0);
      ctx.restore();
    }

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

    if (state.focus && children.length && !motion.matches) {
      // A few faint orbital threads.
      const centerX = scene.x + scene.w / 2;
      const centerY = scene.y + scene.h / 2;
      const unit = Math.min(scene.w, scene.h);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,.24)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, unit * (0.17 + i * 0.12), 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    importView.drawBackground(importDrag);

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

    if (state.selectedIds.length) {
      ctx.save();
      for (const id of state.selectedIds) {
        const body = bodies.get(id);
        if (!body?.alive) continue;
        const geometry = bodyGeometry(body, "paint");
        if (geometry.shape === "rect") {
          beginRoundedRectPath(
            ctx,
            {
              x: geometry.x - geometry.halfWidth - 5,
              y: geometry.y - geometry.halfHeight - 5,
              w: geometry.halfWidth * 2 + 10,
              h: geometry.halfHeight * 2 + 10,
            },
            12,
          );
        } else {
          ctx.beginPath();
          ctx.arc(geometry.x, geometry.y, geometry.radius + 5, 0, TAU);
        }
        ctx.strokeStyle = "rgba(77,122,223,.68)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }

    drawDropPreview();

    importView.draw(time, input, importDrag);

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
    for (const c of controls)
      if (
        !c.key.startsWith("action:") &&
        !(c.key === "back" && trash.presence >= 0.05)
      )
        drawControl(c);

    if (!state.focus && !children.length && !state.loading) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#42516f";
      ctx.font = "600 18px system-ui";
      ctx.fillText("A little space for everything.", w / 2, h / 2 + 40);
      ctx.font = "12px system-ui";
      ctx.fillStyle = "#8995ac";
      ctx.fillText("Your things will appear here.", w / 2, h / 2 + 70);
    }

    const prompt = addPromptRect();
    if (prompt && !importDrag && trash.presence < 0.05) {
      const hot =
        input.hover === "import:add" || input.keyboard === "import:add";
      glass(prompt, 22, hot ? 0.72 : 0.48);
      ctx.fillStyle = hot ? "#4d7adf" : "#23314c";
      ctx.font = "600 18px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        "+",
        prompt.x + prompt.w / 2,
        prompt.y + prompt.h / 2 + 0.4,
      );
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

    drawTrash();

    const hoveredControl = controls.find(
      (control) =>
        (control.key === input.hover || control.key === input.keyboard) &&
        control.detail !== undefined,
    );

    if (hoveredControl?.detail) {
      const width = Math.min(w - 40, 520);
      const rect = { x: 20, y: h - 38, w: width, h: 26 };
      glass(rect, 13, 0.72);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "11px system-ui";
      ctx.fillStyle = "#485b7e";
      ctx.fillText(
        fitText(hoveredControl.detail, rect.w - 20),
        rect.x + 10,
        rect.y + rect.h / 2,
      );
    }

    ctx.textAlign = "left";
    ctx.font = "13px system-ui";
    ctx.fillStyle = "rgba(77,90,129,.66)";
    if (w > 640 && h > 300 && !hoveredControl?.detail) {
      const guides =
        dockMaxScroll > 0 || sideMaxScroll > 0
          ? ["Drag to arrange", "Shift-click selects", "Scroll a dock for more actions"]
          : [
              "Drag to arrange",
              "Shift-click selects",
              "Type on empty space for a text file",
              "Scroll down to go back",
            ];
      const lineHeight = 18;
      let y = h - 14 - (guides.length - 1) * lineHeight;
      for (const guide of guides) {
        ctx.fillText(guide, 20, y);
        y += lineHeight;
      }
    }

    textEditor.draw(time);
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

    const prompt = addPromptRect();
    if (prompt && inside(x, y, prompt)) return "import:add";

    const importHit = importView.hitTest(x, y);
    if (importHit) return importHit;

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
    if (key === "import:add") {
      safe(() => importer?.openPicker());
      return;
    }
    if (key.startsWith("import:")) {
      const [, action, id] = /^import:(retry|remove):(.+)$/.exec(key) ?? [];
      const body = id ? importView.get(id) : undefined;

      if (!body || !action) return;

      if (action === "retry") safe(() => importer?.retry(body.item));
      else safe(() => importer?.remove(body.item));

      return;
    }
    const c = controls.find((c) => c.key === key);
    if (c) {
      if (!c.busy) safe(c.run);
      return;
    }
    if (key.startsWith("node:")) {
      const b = bodies.get(key.slice(5));
      if (!b?.alive) return;
      if (b.role !== "focus") {
        safe(() => session.focus(b.thing.id));
      }
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
    if (gesture.body && Math.hypot(p.x - gesture.sx, p.y - gesture.sy) > 5) {
      gesture.phase = "dragging-thing";
    }
    return gestureMoved(gesture);
  }

  function pinchMetrics() {
    if (touches.size < 2) return null;
    const [a, b] = [...touches.values()];
    return {
      distance: Math.hypot(b!.x - a!.x, b!.y - a!.y),
      center: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 },
    };
  }

  function updatePinch() {
    if (!pinch) return;
    const metrics = pinchMetrics();
    if (!metrics) return;
    const delta = metrics.distance - pinch.distance;
    const ratio = pinch.distance > 0 ? metrics.distance / pinch.distance : 1;
    pinch.distance = metrics.distance;
    const { center } = metrics;
    if (dock && inside(center.x, center.y, dock)) {
      pinch.amount = 0;
      return;
    }
    if (sideDock && inside(center.x, center.y, sideDock)) {
      pinch.amount = 0;
      return;
    }
    if (pinch.navigated) return;

    const focused = state.focus;
    const body = focused ? bodies.get(focused.id) : undefined;
    if (focused && body && presentationFor(focused).zoomable) {
      pinch.amount = 0;
      const minZoom = focusMinZoom(body);
      const unfocusZoom = minZoom + FOCUS_UNFOCUS_LIFT;
      focus.target = clamp(focus.target * ratio, minZoom, FOCUS_ZOOM_MAX);
      focus.pivot = center;

      if (ratio >= 1) focus.unfocusOnZoomOut = false;
      else if (focus.target <= unfocusZoom + 0.001)
        focus.unfocusOnZoomOut = true;

      wheelGesture.amount = 0;
      wake();
      return;
    }

    pinch.amount = Math.min(0, pinch.amount + delta);
    if (pinch.amount > -PINCH_STEP) return;
    pinch.amount = 0;
    pinch.navigated = true;
    safe(() => session.back());
  }

  function down(e: PointerEvent) {
    const p = canvasPoint(e);
    if (e.pointerType === "touch") {
      if (touches.size === 0) ignoreTouch = false;
      touches.set(e.pointerId, p);
      if (touches.size >= 2) {
        ignoreTouch = true;
        const metrics = pinchMetrics();
        pinch = metrics
          ? { distance: metrics.distance, amount: 0, navigated: false }
          : null;
        input.gesture = null;
        input.keyboard = null;
        input.hover = null;
        input.mouse = null;
        canvas.style.cursor = "default";
        canvas.setPointerCapture(e.pointerId);
        wake();
        return;
      }
      if (ignoreTouch) return;
    }
    if (input.gesture || e.button !== 0) return;
    canvas.focus({ preventScroll: true });
    input.keyboard = null;
    input.mouse = p;
    const key = hit(p.x, p.y);
    const b = key?.startsWith("node:") ? bodies.get(key.slice(5)) : null;

    if (b && (e.shiftKey || e.ctrlKey || e.metaKey) && !e.altKey) {
      safe(() => session.select(b.thing.id, "toggle"));
      wake();
      return;
    }

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
    if (e.pointerType === "touch" && touches.has(e.pointerId)) {
      touches.set(e.pointerId, p);
      if (pinch) {
        if (touches.size >= 2) updatePinch();
        return;
      }
      if (ignoreTouch) return;
    }
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
    if (e.pointerType === "touch" && touches.has(e.pointerId)) {
      const wasPinching = pinch !== null;
      touches.delete(e.pointerId);
      if (wasPinching || ignoreTouch) {
        pinch = null;
        ignoreTouch = touches.size > 0;
        input.mouse = null;
        input.hover = null;
        canvas.style.cursor = "default";
        wake();
        return;
      }
    }
    if (!input.gesture || input.gesture.id !== e.pointerId) return;
    const previous = input.gesture;
    const p = canvasPoint(e);

    if (
      previous.phase === "dragging-thing" &&
      previous.body !== null &&
      overTrash(p)
    ) {
      const id = previous.body;
      cancelPointerGesture();
      deleteThing(id);
      if (e.pointerType === "touch") input.mouse = null;
      input.hover = null;
      canvas.style.cursor = "default";
      wake();
      return;
    }

    const candidate = findDropCandidate(p);
    if (
      previous.phase === "dragging-thing" &&
      previous.body !== null &&
      candidate?.sourceId === previous.body
    ) {
      const source = bodies.get(previous.body);

      if (source && candidate.kind === "out") {
        cancelPointerGesture();
        moveOutOfCollection(source);
        if (e.pointerType === "touch") input.mouse = null;
        input.hover = null;
        canvas.style.cursor = "default";
        wake();
        return;
      }

      if (source && candidate.kind !== "out") {
        const target = bodies.get(candidate.targetId);

        if (target) {
          cancelPointerGesture();
          dropOnThing(source, target, candidate.kind);
          if (e.pointerType === "touch") input.mouse = null;
          input.hover = null;
          canvas.style.cursor = "default";
          wake();
          return;
        }
      }
    }

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
    if (input.gesture) return;
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
    if (textEditor.active) {
      textEditor.key(e);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      if (input.gesture) {
        cancelPointerGesture();
      } else if (session.snapshot().selectedIds.length) {
        session.clearSelection();
      } else {
        safe(() => session.back());
      }
      return;
    }

    if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      const point = input.mouse ?? {
        x: scene.x + scene.w / 2,
        y: scene.y + scene.h / 2,
      };
      draftPoint = point;
      openDraft(e.key, point);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      if (input.gesture) cancelPointerGesture();
      else safe(() => session.back());
    } else if (
      ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)
    ) {
      e.preventDefault();
      const importKeys: string[] = [];
      const prompt = addPromptRect();

      if (prompt) importKeys.push("import:add");

      importKeys.push(...importView.keys());

      const items = [
        ...importKeys,
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
    if (e.pointerType === "touch") {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
      ignoreTouch = touches.size > 0;
    }
    if (input.gesture?.id === e.pointerId) cancelPointerGesture();
  };
  const onLostCapture = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
      ignoreTouch = touches.size > 0;
    }
    if (input.gesture?.id === e.pointerId) {
      input.gesture = null;
      wake();
    }
  };
  const onBlur = () => {
    input.keyboard = null;
    wake();
  };
  const preventPageGesture = (e: Event) => e.preventDefault();
  const preventMultiTouch = (e: TouchEvent) => {
    if (e.touches.length > 1) e.preventDefault();
  };
  canvas.style.touchAction = "none";
  canvas.style.background = BACKDROP;
  if (backgroundImage && backgroundSource) {
    backgroundImage.decoding = "async";
    backgroundImage.onload = () => {
      backgroundImageReady = true;
      backgroundCacheKey = "";
      wake();
    };
    backgroundImage.onerror = () => {
      backgroundImageReady = false;
    };
    backgroundImage.src = backgroundSource;
  }
  if (canvas.tabIndex < 0) canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-label",
    "Adapt workspace. Type on empty space to create a text file. Shift-click selects. Drag to arrange. Arrow keys navigate, Enter opens, Escape releases or goes back.",
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
  canvas.addEventListener("touchmove", preventMultiTouch, { passive: false });
  canvas.addEventListener("gesturestart", preventPageGesture, { passive: false });
  canvas.addEventListener("gesturechange", preventPageGesture, { passive: false });
  canvas.addEventListener("keydown", keydown);
  canvas.addEventListener("blur", onBlur);

  const importFile = options.importFile;

  if (importFile) {
    importer = createImports({
      host: canvas.parentElement ?? document.body,
      canvas,
      ...(options.importAccept === undefined
        ? {}
        : { accept: options.importAccept }),
      destination: currentDestination,
      importFile,
      onChange: syncImports,
      onComplete: adoptImportedThing,
      onDragChange(destination) {
        importDrag = destination;
        wake();
      },
    });
  }

  resize();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      if (wheelGesture.timer !== undefined) clearTimeout(wheelGesture.timer);
      cancelPointerGesture();
      touches.clear();
      pinch = null;
      ignoreTouch = false;
      importer?.destroy();
      importer = null;
      importView.clear();
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
      canvas.removeEventListener("touchmove", preventMultiTouch);
      canvas.removeEventListener("gesturestart", preventPageGesture);
      canvas.removeEventListener("gesturechange", preventPageGesture);
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
      if (backgroundImage) backgroundImage.onload = backgroundImage.onerror = null;
      backgroundCache = null;
      images.clear();
      bodies.clear();
      orbitOffsets.clear();
      controlPulls.clear();
      data.pending.clear();
      data.deleted.clear();
      data.hidden.clear();
    },
  };
}
