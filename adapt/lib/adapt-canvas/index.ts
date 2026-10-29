import type { Thing } from "../adapt/core/contracts.ts";
import type { OfferedAction } from "../adapt/core/actions.ts";
import type { Session } from "../adapt/core/session.ts";

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type NodeRole = "root" | "focus" | "child" | "sibling";

type NodeTarget = {
  key: string;
  thing: Thing;
  role: NodeRole;
  x: number;
  y: number;
  r: number;
  angle?: number;
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
};

type Control = Rect & {
  key: string;
  label: string;
  hint?: string;
  enabled: boolean;
  busy?: boolean;
  accent?: boolean;
  run(): void;
};

type Pointer = {
  id: number;
  key: string | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
  draggable: boolean;
  lastAngle: number | null;
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
  wide: boolean;
};

const TAU = Math.PI * 2;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function title(thing: Thing): string {
  const data = thing.data;

  if (typeof data === "string") return data;

  if (data !== null && typeof data === "object") {
    if ("title" in data && typeof data.title === "string") {
      return data.title;
    }

    if ("text" in data && typeof data.text === "string") {
      return data.text;
    }
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
  let drawn: Body[] = [];

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

  let orbitAngle = 0;
  let orbitSpeed = 0.12;

  let focusId: string | null = null;
  let toolsPage = 0;
  let suggestionsPage = 0;
  let siblingsPage = 0;

  let localError: string | null = null;
  let dismissedStatus: string | null = null;

  let wheelAmount = 0;
  let wheelLocked = false;
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;

  let layout: Layout = {
    scene: { x: 20, y: 104, w: 1, h: 1 },
    tools: null,
    suggestions: null,
    wide: false,
  };

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

  function drawImageCover(image: HTMLImageElement, radius: number): void {
    const scale = Math.max(
      (radius * 2) / image.naturalWidth,
      (radius * 2) / image.naturalHeight,
    );

    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.clip();
    ctx.drawImage(image, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

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

  function computeLayout(
    tools: readonly OfferedAction[],
    suggestions: readonly OfferedAction[],
  ): Layout {
    const wide = width >= 900;
    const footer = state.focus ? 112 : 58;
    const bottom = Math.max(150, height - footer);

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
          y: bottom - 100,
          w: Math.max(1, width - 40),
          h: 96,
        };

        sceneBottom = toolPanel.y - 12;
      }
    }

    if (state.focus && suggestions.length) {
      suggestionPanel = {
        x: 20,
        y: sceneBottom - 90,
        w: Math.max(1, sceneRight - 20),
        h: 86,
      };

      sceneBottom = suggestionPanel.y - 12;
    }

    return {
      wide,
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

  function addPanel(
    panel: Rect,
    actions: readonly OfferedAction[],
    kind: "tools" | "suggestions",
  ): void {
    const focus = state.focus;
    if (!focus) return;

    const vertical = kind === "tools" && layout.wide;

    const perPage = vertical
      ? Math.max(1, Math.min(6, Math.floor((panel.h - 56) / 64)))
      : panel.w >= 560
        ? 2
        : 1;

    const pages = Math.max(1, Math.ceil(actions.length / perPage));

    let page = kind === "tools" ? toolsPage : suggestionsPage;
    page = clamp(page, 0, pages - 1);

    if (kind === "tools") toolsPage = page;
    else suggestionsPage = page;

    const visible = actions.slice(page * perPage, page * perPage + perPage);

    if (pages > 1) {
      for (const direction of [-1, 1] as const) {
        addControl({
          key: `${kind}:page:${direction}`,
          label: direction < 0 ? "‹" : "›",
          x: panel.x + panel.w - (direction < 0 ? 72 : 36),
          y: panel.y + 4,
          w: 30,
          h: 26,
          enabled: direction < 0 ? page > 0 : page < pages - 1,
          run() {
            if (kind === "tools") toolsPage += direction;
            else suggestionsPage += direction;

            rebuild();
          },
        });
      }
    }

    visible.forEach((action, index) => {
      const key = actionKey(focus.id, action);
      const busy = action.busy || pending.has(key);

      const gap = 10;
      const itemWidth = vertical
        ? panel.w - 20
        : (panel.w - 20 - gap * (visible.length - 1)) / visible.length;

      addControl({
        key,
        label: action.label,
        hint:
          action.recommendation?.reason ??
          action.description ??
          action.category ??
          "",
        x: panel.x + 10 + (vertical ? 0 : index * (itemWidth + gap)),
        y: panel.y + 36 + (vertical ? index * 64 : 0),
        w: itemWidth,
        h: 52,
        enabled: !busy,
        busy,
        accent: kind === "suggestions",
        run: () => {
          void invoke(focus.id, action);
        },
      });
    });
  }

  function buildTargets(): NodeTarget[] {
    const targets: NodeTarget[] = [];

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

    layout = computeLayout(tools, suggestions);
    controls = [];

    const scene = layout.scene;
    const cx = scene.x + scene.w / 2;
    const cy = scene.y + scene.h / 2;

    function node(
      thing: Thing,
      role: NodeRole,
      x: number,
      y: number,
      r: number,
      angle?: number,
    ): void {
      targets.push({
        key: `thing:${thing.id}`,
        thing,
        role,
        x,
        y,
        r,
        ...(angle === undefined ? {} : { angle }),
      });
    }

    if (!state.focus) {
      const count = state.children.length;

      if (count > 0) {
        const columns = Math.min(
          count,
          Math.max(1, Math.ceil(Math.sqrt((count * scene.w) / scene.h))),
        );

        const rows = Math.ceil(count / columns);
        const cellWidth = scene.w / columns;
        const cellHeight = scene.h / rows;

        const radius = clamp(Math.min(cellWidth, cellHeight) * 0.28, 12, 64);

        state.children.forEach((thing, index) => {
          const row = Math.floor(index / columns);
          const column = index % columns;
          const inRow = Math.min(columns, count - row * columns);

          node(
            thing,
            "root",
            cx + (column - (inRow - 1) / 2) * cellWidth,
            scene.y + (row + 0.5) * cellHeight,
            radius,
          );
        });
      }
    } else {
      const radius = clamp(Math.min(scene.w * 0.2, scene.h * 0.25), 20, 100);

      node(state.focus, "focus", cx, cy, radius);

      const childRadius = clamp(Math.min(scene.w, scene.h) * 0.075, 12, 34);

      const orbitX = Math.max(20, scene.w / 2 - childRadius - 16);
      const orbitY = Math.max(20, scene.h / 2 - childRadius - 26);

      state.children.forEach((thing, index, children) => {
        const angle = -Math.PI / 2 + (index * TAU) / children.length;

        node(
          thing,
          "child",
          cx + Math.cos(angle) * orbitX,
          cy + Math.sin(angle) * orbitY,
          childRadius,
          angle,
        );
      });

      addControl({
        key: "back",
        label: "← Back",
        x: 20,
        y: 14,
        w: 84,
        h: 30,
        enabled: true,
        run: () => session.back(),
      });

      const maxSiblings = Math.max(1, Math.floor((width - 130) / 76));

      const siblingPages = Math.max(
        1,
        Math.ceil(state.siblings.length / maxSiblings),
      );

      siblingsPage = clamp(siblingsPage, 0, siblingPages - 1);

      const siblings = state.siblings.slice(
        siblingsPage * maxSiblings,
        (siblingsPage + 1) * maxSiblings,
      );

      const spacing = Math.min(
        90,
        Math.max(30, (width - 130) / Math.max(1, siblings.length)),
      );

      siblings.forEach((thing, index) => {
        node(
          thing,
          "sibling",
          width / 2 + (index - (siblings.length - 1) / 2) * spacing,
          height - 76,
          clamp(spacing * 0.27, 12, 23),
        );
      });

      if (siblingPages > 1) {
        for (const direction of [-1, 1] as const) {
          addControl({
            key: `siblings:${direction}`,
            label: direction < 0 ? "‹" : "›",
            x: direction < 0 ? 20 : width - 50,
            y: height - 92,
            w: 30,
            h: 30,
            enabled:
              direction < 0
                ? siblingsPage > 0
                : siblingsPage < siblingPages - 1,
            run() {
              siblingsPage += direction;
              rebuild();
            },
          });
        }
      }
    }

    if (layout.tools) addPanel(layout.tools, tools, "tools");

    if (layout.suggestions) {
      addPanel(layout.suggestions, suggestions, "suggestions");
    }

    if (state.hasPrevious) {
      addControl({
        key: "previous-page",
        label: "‹ Previous",
        x: width / 2 - 110,
        y: height - 36,
        w: 102,
        h: 28,
        enabled: !state.loading,
        run: () => session.previous(),
      });
    }

    if (state.hasNext) {
      addControl({
        key: "next-page",
        label: "Next ›",
        x: width / 2 + 8,
        y: height - 36,
        w: 102,
        h: 28,
        enabled: !state.loading,
        run: () => session.next(),
      });
    }

    const status = currentStatus();

    if (status && !status.busy) {
      addControl({
        key: "dismiss-status",
        label: "×",
        x: width - 54,
        y: 59,
        w: 28,
        h: 28,
        enabled: true,
        run() {
          dismissedStatus = status.key;

          if (status.key.startsWith("local:")) {
            localError = null;
          }

          rebuild();
        },
      });
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
      toolsPage = 0;
      suggestionsPage = 0;
      siblingsPage = 0;
      keyboardKey = null;
      hovered = null;
    }

    for (const body of bodies.values()) {
      body.visible = false;
    }

    const targets = buildTargets();

    for (const target of targets) {
      let body = bodies.get(target.key);

      if (!body) {
        const parent = target.thing.parent
          ? bodies.get(`thing:${target.thing.parent}`)
          : undefined;

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
          phase:
            [...target.key].reduce(
              (sum, character) => sum + character.charCodeAt(0),
              0,
            ) * 0.73,
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

  function tick(time: number): void {
    frame = 0;
    if (destroyed) return;

    const dt = clamp((time - lastTime) / 1000, 0, 0.04);
    lastTime = time;

    const instant = reducedMotion.matches;
    elapsed += dt;

    const hoveringChild =
      hovered !== null && bodies.get(hovered)?.target.role === "child";

    if (!instant && !hoveringChild && !keyboardKey && !pointer?.moved) {
      orbitAngle += orbitSpeed * dt;
      orbitSpeed += (0.12 - orbitSpeed) * (1 - Math.exp(-dt * 0.7));
    }

    const scene = layout.scene;
    const cx = scene.x + scene.w / 2;
    const cy = scene.y + scene.h / 2;

    let moving = false;

    for (const [key, body] of bodies) {
      const target = body.target;
      let x = target.x;
      let y = target.y;

      const dragging =
        pointer?.key === key && pointer.moved && pointer.draggable;

      if (target.role === "child" && target.angle !== undefined) {
        const angle = target.angle + orbitAngle;

        const rx = Math.max(20, scene.w / 2 - target.r - 16);
        const ry = Math.max(20, scene.h / 2 - target.r - 26);

        x = cx + Math.cos(angle) * rx;
        y = cy + Math.sin(angle) * ry;
      } else if (!instant && target.role === "root") {
        x += Math.sin(elapsed * 0.55 + body.phase) * 3;
        y += Math.cos(elapsed * 0.65 + body.phase) * 4;
      }

      if (dragging && pointer) {
        x = pointer.x - pointer.offsetX;
        y = pointer.y - pointer.offsetY;
      }

      const hot = hovered === key || keyboardKey === key;
      const r = body.visible ? target.r : target.r * 0.8;
      const opacity = body.visible ? 1 : 0;
      const scale = dragging ? 1.12 : hot ? 1.06 : 1;

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

    const animated =
      !instant &&
      (bodies.size > 0 ||
        controls.some((control) => control.busy) ||
        currentStatus()?.busy === true);

    if (moving || animated) {
      frame = requestAnimationFrame(tick);
    }
  }

  function spinner(x: number, y: number, r = 6): void {
    ctx.save();
    ctx.strokeStyle = "#a4ebd6";
    ctx.lineWidth = 1.8;

    ctx.beginPath();

    const angle = reducedMotion.matches ? -Math.PI / 2 : elapsed * 4;

    ctx.arc(x, y, r, angle, angle + Math.PI * 1.4);
    ctx.stroke();
    ctx.restore();
  }

  function drawPanel(rect: Rect, label: string): void {
    ctx.fillStyle = "rgba(15, 31, 42, 0.86)";
    ctx.strokeStyle = "rgba(157, 191, 210, 0.12)";
    ctx.lineWidth = 1;

    roundRect(rect, 16);
    ctx.fill();
    ctx.stroke();

    ctx.font = "600 10px system-ui";
    ctx.textAlign = "left";
    ctx.fillStyle = "#91a9b9";
    ctx.fillText(label, rect.x + 14, rect.y + 19);
  }

  function drawControl(control: Control): void {
    const hot = hovered === control.key || keyboardKey === control.key;

    ctx.save();
    ctx.globalAlpha = control.enabled || control.busy ? 1 : 0.35;

    ctx.fillStyle = control.accent
      ? hot
        ? "#244c47"
        : "#193832"
      : hot
        ? "#243e50"
        : "#172b3a";

    ctx.strokeStyle =
      keyboardKey === control.key
        ? "#c7f7e8"
        : hot
          ? "#749bad"
          : control.accent
            ? "rgba(113, 209, 173, 0.3)"
            : "rgba(147, 182, 202, 0.16)";

    ctx.lineWidth = keyboardKey === control.key ? 2 : 1;

    roundRect(control, control.h <= 30 ? 8 : 11);
    ctx.fill();
    ctx.stroke();

    const compact = control.h <= 30;
    const left = control.x + 12;
    const reserve = control.busy ? 34 : 12;

    ctx.textAlign = compact ? "center" : "left";
    ctx.fillStyle = "#e4eff5";
    ctx.font = compact ? "13px system-ui" : "500 13px system-ui";

    if (compact) {
      ctx.fillText(
        fit(control.label, control.w - 12),
        control.x + control.w / 2,
        control.y + control.h / 2,
      );
    } else {
      const labelY = control.hint ? control.y + 18 : control.y + control.h / 2;

      ctx.fillText(fit(control.label, control.w - reserve - 12), left, labelY);

      if (control.hint) {
        ctx.font = "10px system-ui";
        ctx.fillStyle = "#9ab2bf";
        ctx.fillText(
          fit(
            control.busy ? "Working…" : control.hint,
            control.w - reserve - 12,
          ),
          left,
          control.y + 36,
        );
      }
    }

    if (control.busy) {
      spinner(control.x + control.w - 17, control.y + control.h / 2);
    }

    ctx.restore();
  }

  function drawBody(body: Body): void {
    const { target } = body;

    const radius = Math.max(0.1, body.r);
    const hot = hovered === target.key || keyboardKey === target.key;

    const isFocus = target.role === "focus";
    const heading = isFocus && isCollection(target.thing);

    ctx.save();
    ctx.translate(body.x, body.y);
    ctx.scale(body.scale, body.scale);
    ctx.globalAlpha = clamp(body.opacity, 0, 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (heading) {
      ctx.fillStyle = "#ecf6fb";
      ctx.font = "600 24px system-ui";

      ctx.fillText(
        fit(target.thing ? title(target.thing) : "", layout.scene.w * 0.65),
        0,
        -8,
      );

      ctx.fillStyle = "#8ba7b7";
      ctx.font = "10px system-ui";
      ctx.fillText("COLLECTION", 0, 21);

      if (keyboardKey === target.key) {
        ctx.strokeStyle = "#bbf1e2";
        ctx.strokeRect(-80, -31, 160, 66);
      }

      ctx.restore();
      return;
    }

    const gradient = ctx.createLinearGradient(-radius, -radius, radius, radius);

    gradient.addColorStop(0, isFocus ? "#365970" : "#294659");
    gradient.addColorStop(1, "#112430");

    ctx.fillStyle = gradient;
    ctx.shadowColor = "rgba(84, 166, 210, 0.24)";
    ctx.shadowBlur = isFocus ? 28 : hot ? 18 : 8;

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;

    const src = imageSource(target.thing);
    const image = src ? imageFor(src) : null;

    const loaded = image !== null && image.complete && image.naturalWidth > 0;

    if (loaded && image) {
      drawImageCover(image, radius);
    }

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.strokeStyle = hot ? "#b7f4df" : "rgba(165, 204, 224, 0.4)";
    ctx.lineWidth = keyboardKey === target.key ? 2.5 : hot ? 1.5 : 1;
    ctx.stroke();

    if (!loaded) {
      ctx.fillStyle = "#dfedf4";
      ctx.font = `${clamp(radius * 0.5, 12, 26)}px system-ui`;

      ctx.fillText(
        isCollection(target.thing)
          ? "◌"
          : target.thing.type.slice(0, 1).toUpperCase(),
        0,
        0,
      );
    }

    if (isFocus || target.role === "root" || target.role === "sibling" || hot) {
      ctx.font = isFocus ? "500 12px system-ui" : "11px system-ui";

      ctx.fillStyle = "#c8dce7";

      const maxWidth =
        target.role === "sibling"
          ? 72
          : isFocus
            ? Math.min(layout.scene.w - 20, 280)
            : 140;

      ctx.fillText(fit(title(target.thing), maxWidth), 0, radius + 17);
    }

    if (isFocus && image?.complete && !loaded) {
      ctx.font = "10px system-ui";
      ctx.fillStyle = "#d7ad9e";
      ctx.fillText("Image unavailable", 0, radius + 35);
    }

    ctx.restore();
  }

  function draw(): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.textBaseline = "middle";

    const background = ctx.createRadialGradient(
      layout.scene.x + layout.scene.w / 2,
      layout.scene.y + layout.scene.h / 2,
      0,
      width / 2,
      height / 2,
      Math.max(width, height),
    );

    background.addColorStop(0, "#142e3c");
    background.addColorStop(1, "#060c13");

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = "left";
    ctx.font = "500 13px system-ui";
    ctx.fillStyle = "#c5d9e5";

    const headingX = state.focus ? 118 : 24;

    ctx.fillText(
      fit(
        state.focus ? title(state.focus) : "Workspace",
        width - headingX - 70,
      ),
      headingX,
      29,
    );

    const status = currentStatus();

    if (status) {
      ctx.fillStyle =
        status.tone === "error"
          ? "rgba(104, 49, 47, 0.4)"
          : status.tone === "success"
            ? "rgba(41, 94, 74, 0.35)"
            : "rgba(42, 71, 91, 0.4)";

      roundRect({ x: 20, y: 56, w: Math.max(1, width - 40), h: 36 }, 10);
      ctx.fill();

      if (status.busy) spinner(37, 74);

      ctx.font = "12px system-ui";
      ctx.fillStyle = status.tone === "error" ? "#f0c1b7" : "#b9d6df";

      ctx.fillText(
        fit(status.text, width - (status.busy ? 92 : 108)),
        status.busy ? 52 : 33,
        74,
      );
    } else {
      ctx.font = "11px system-ui";
      ctx.fillStyle = "#708d9d";

      ctx.fillText(
        fit(
          state.focus
            ? "Explore things · drag to move · Esc to go back"
            : "Select a thing to explore",
          width - 48,
        ),
        24,
        74,
      );
    }

    if (state.focus && state.children.length) {
      const scene = layout.scene;
      const child = [...bodies.values()].find(
        (body) => body.visible && body.target.role === "child",
      );

      if (child) {
        ctx.strokeStyle = "rgba(137, 192, 211, 0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();

        ctx.ellipse(
          scene.x + scene.w / 2,
          scene.y + scene.h / 2,
          Math.max(20, scene.w / 2 - child.target.r - 16),
          Math.max(20, scene.h / 2 - child.target.r - 26),
          0,
          0,
          TAU,
        );

        ctx.stroke();
      }
    }

    if (state.focus && state.siblings.length) {
      ctx.strokeStyle = "rgba(157, 192, 210, 0.12)";
      ctx.beginPath();
      ctx.moveTo(20, height - 112);
      ctx.lineTo(width - 20, height - 112);
      ctx.stroke();
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

    if (layout.tools) drawPanel(layout.tools, "TOOLS");

    if (layout.suggestions) {
      drawPanel(layout.suggestions, "SUGGESTED");
    }

    for (const control of controls) {
      drawControl(control);
    }

    if (!state.focus && !state.loading && !state.children.length) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#8ea8b7";
      ctx.font = "13px system-ui";

      ctx.fillText(
        "This workspace is empty",
        layout.scene.x + layout.scene.w / 2,
        layout.scene.y + layout.scene.h / 2,
      );
    }
  }

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

      if (inRect(x, y, control)) {
        return control.enabled ? control.key : null;
      }
    }

    // Panels block clicks on animated things passing behind them.
    if (
      (layout.tools && inRect(x, y, layout.tools)) ||
      (layout.suggestions && inRect(x, y, layout.suggestions))
    ) {
      return null;
    }

    for (let index = drawn.length - 1; index >= 0; index--) {
      const body = drawn[index]!;

      if (!body.visible || body.opacity < 0.2) continue;

      if (body.target.role === "focus" && isCollection(body.target.thing)) {
        if (
          Math.abs(x - body.x) < Math.min(layout.scene.w * 0.33, 160) &&
          Math.abs(y - body.y) < 36
        ) {
          return body.target.key;
        }
      } else if (
        Math.hypot(x - body.x, y - body.y) <= Math.max(20, body.r * body.scale)
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

    if (body?.visible) {
      safe(() => session.focus(body.target.thing.id));
    }
  }

  function interactiveItems(): Array<{ key: string; label: string }> {
    return [
      ...controls
        .filter((control) => control.enabled)
        .map((control) => ({
          key: control.key,
          label: control.label,
        })),

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

    pointer = {
      id: event.pointerId,
      key,
      startX: p.x,
      startY: p.y,
      x: p.x,
      y: p.y,
      offsetX: body ? p.x - body.x : 0,
      offsetY: body ? p.y - body.y : 0,
      moved: false,
      draggable: body?.visible === true,
      lastAngle: null,
    };

    canvas.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent): void {
    const p = point(event);

    if (pointer?.id === event.pointerId) {
      pointer.x = p.x;
      pointer.y = p.y;

      if (Math.hypot(p.x - pointer.startX, p.y - pointer.startY) > 6) {
        pointer.moved = true;
      }

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
      wake();
    }
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

    if (clicked && previous.key) {
      activate(previous.key);
    }

    hovered = hit(p.x, p.y);
    canvas.style.cursor = hovered ? "pointer" : "default";
    wake();
  }

  function pointerCancel(event: PointerEvent): void {
    if (pointer?.id === event.pointerId) {
      cancelPointer();
    }
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
    canvas.style.cursor = "default";
    wake();
  }

  function wheel(event: WheelEvent): void {
    if (event.ctrlKey || pointer) return;

    event.preventDefault();

    if (wheelTimer !== undefined) {
      clearTimeout(wheelTimer);
    }

    wheelTimer = setTimeout(() => {
      wheelAmount = 0;
      wheelLocked = false;
    }, 180);

    if (wheelLocked) return;

    const p = point(event);

    // Scrolling over controls must not change workspace focus.
    if (
      controls.some((control) => inRect(p.x, p.y, control)) ||
      (layout.tools && inRect(p.x, p.y, layout.tools)) ||
      (layout.suggestions && inRect(p.x, p.y, layout.suggestions))
    ) {
      return;
    }

    const unit =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;

    wheelAmount += event.deltaY * unit;

    if (Math.abs(wheelAmount) < 70) return;
    wheelLocked = true;

    if (wheelAmount > 0) {
      safe(() => session.back());
    } else {
      const key = hit(p.x, p.y);

      if (key && bodies.has(key)) {
        activate(key);
      }
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

      canvas.setAttribute(
        "aria-label",
        `${selected.label}. Enter to activate. Escape to go back.`,
      );

      wake();
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && keyboardKey) {
      event.preventDefault();

      if (!event.repeat) {
        activate(keyboardKey);
      }
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

      if (wheelTimer !== undefined) {
        clearTimeout(wheelTimer);
      }

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
      drawn = [];
    },
  };
}
