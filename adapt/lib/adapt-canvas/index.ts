import type { ActionDescriptor, Thing } from "../adapt/core/contracts";
import type { Session } from "../adapt/core/session";

type Role =
  | "root"
  | "focus"
  | "child"
  | "sibling"
  | "parent"
  | "action"
  | "control";

type Target = {
  key: string;
  role: Role;
  thing: Thing | null;
  label: string;
  x: number;
  y: number;
  r: number;
  enabled: boolean;
  run(): void;
};

type Body = {
  target: Target;
  x: number;
  y: number;
  r: number;
  opacity: number;
  vx: number;
  vy: number;
  vr: number;
  vo: number;
  visible: boolean;
  phase: number;
  scale: number;
  vs: number;
};

type Drag = {
  id: number;
  key: string;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
  moved: boolean;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const hypot = Math.hypot;

function title(thing: Thing): string {
  const data = thing.data;
  if (typeof data === "string") return data;
  if (data !== null && typeof data === "object") {
    if ("title" in data && typeof data.title === "string") return data.title;
    if ("text" in data && typeof data.text === "string") return data.text;
  }
  return thing.type;
}

// Damped spring with an analytic integration step: remains stable after frame drops.
function spring(
  value: number,
  velocity: number,
  destination: number,
  dt: number,
  frequency = 15,
  damping = 0.83,
): [number, number] {
  const omega = frequency;
  const decay = Math.exp(-damping * omega * dt);
  const displacement = value - destination;
  let position: number;
  let nextVelocity: number;

  if (damping < 1) {
    const wd = omega * Math.sqrt(1 - damping * damping);
    const cos = Math.cos(wd * dt);
    const sin = Math.sin(wd * dt);
    const b = (velocity + damping * omega * displacement) / wd;
    position = destination + decay * (displacement * cos + b * sin);
    nextVelocity =
      decay *
      (velocity * cos -
        ((damping * omega * velocity + omega * omega * displacement) * sin) /
          wd);
  } else {
    const b = velocity + omega * displacement;
    position = destination + Math.exp(-omega * dt) * (displacement + b * dt);
    nextVelocity = Math.exp(-omega * dt) * (velocity - omega * b * dt);
  }
  if (Math.abs(position - destination) < 0.015 && Math.abs(nextVelocity) < 0.05)
    return [destination, 0];
  return [position, nextVelocity];
}

export function canvasView(options: {
  canvas: HTMLCanvasElement;
  session: Session;
  onAction?(thing: Thing, action: ActionDescriptor): void;
}) {
  const { canvas, session, onAction } = options;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  const ctx = context;
  const bodies = new Map<string, Body>();
  const images = new Map<string, HTMLImageElement>();

  function imageSource(thing: Thing | null): string | null {
    if (!thing || thing.type !== "image") return null;
    const data = thing.data;
    if (!data || typeof data !== "object" || !("src" in data)) return null;
    return typeof data.src === "string" && data.src.trim() ? data.src : null;
  }

  function imageFor(src: string): HTMLImageElement {
    let image = images.get(src);
    if (image) return image;
    image = new Image();
    images.set(src, image);
    image.onload = wake;
    image.onerror = wake;
    image.src = src;
    return image;
  }

  function drawImageCover(image: HTMLImageElement, radius: number): void {
    const side = radius * 2;
    const scale = Math.max(
      side / image.naturalWidth,
      side / image.naturalHeight,
    );
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  let state = session.snapshot();
  let drawn: Body[] = [];
  let width = 1;
  let height = 1;
  let dpr = 1;
  let frame = 0;
  let lastTime = 0;
  let destroyed = false;
  let hovered: string | null = null;
  let drag: Drag | null = null;
  let suppressClick = false;
  let orbitAngle = 0;
  let orbitSpeed = 0.16; // radians per second; drag the orbit to spin it
  let elapsed = 0;
  let lastDragAngle: number | null = null;
  let actionPage = 0;
  let previousFocus: string | null = null;
  let wheelAmount = 0;
  let wheelLocked = false;
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;
  const originalCursor = canvas.style.cursor;
  const originalTouchAction = canvas.style.touchAction;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  function fit(text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let result = text;
    while (result.length > 0 && ctx.measureText(`${result}…`).width > maxWidth)
      result = result.slice(0, -1);
    return `${result}…`;
  }

  function wake(): void {
    if (destroyed || frame) return;
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  }

  // Preserve existing focus/child/sibling/action layout and hierarchy.
  function targets(): Target[] {
    const result: Target[] = [];

    function node(
      thing: Thing,
      role: Role,
      x: number,
      y: number,
      r: number,
    ): void {
      result.push({
        key: `thing:${thing.id}`,
        role,
        thing,
        label: title(thing),
        x,
        y,
        r,
        enabled: true,
        run: () => session.focus(thing.id),
      });
    }

    function control(
      key: string,
      label: string,
      x: number,
      y: number,
      run: () => void,
    ): void {
      result.push({
        key,
        role: "control",
        thing: null,
        label,
        x,
        y,
        r: 20,
        enabled: true,
        run,
      });
    }

    const focus = state.focus;
    if (!focus) {
      const count = state.children.length;
      if (count > 0) {
        const areaHeight = Math.max(180, height - 150);
        const columns = Math.min(
          count,
          Math.max(1, Math.ceil(Math.sqrt((count * width) / areaHeight))),
        );
        const rows = Math.ceil(count / columns);
        const cellWidth = (width - 40) / columns;
        const cellHeight = areaHeight / rows;
        const radius = clamp(Math.min(cellWidth, cellHeight) * 0.25, 22, 56);
        state.children.forEach((thing, index) => {
          const row = Math.floor(index / columns);
          const column = index % columns;
          const inRow = Math.min(columns, count - row * columns);
          const stagger = columns > 1 ? Math.sin(index * 2.4) * 8 : 0;
          node(
            thing,
            "root",
            width / 2 + (column - (inRow - 1) / 2) * cellWidth,
            75 + (row + 0.5) * cellHeight + stagger,
            radius,
          );
        });
      }
    } else {
      const centerX = width / 2;
      const areaHeight = Math.max(180, height - 180);
      const centerY = 65 + areaHeight / 2;
      const radius = clamp(Math.min(width * 0.16, areaHeight * 0.22), 42, 88);
      node(focus, "focus", centerX, centerY, radius);

      if (state.parent) node(state.parent, "parent", 36, 36, 20);
      else control("back", "←", 32, 36, () => session.back());

      const childRadius = clamp(width * 0.05, 19, 32);
      const orbitX = Math.max(
        radius + 50,
        Math.min(width / 2 - 42, radius + 170),
      );
      const orbitY = Math.min(areaHeight * 0.43, radius + 170);
      state.children.forEach((thing, index, children) => {
        const angle =
          -Math.PI / 2 + ((index + 0.5) * Math.PI * 2) / children.length;
        node(
          thing,
          "child",
          centerX + Math.cos(angle) * orbitX,
          centerY + Math.sin(angle) * orbitY,
          childRadius,
        );
      });

      const siblings = state.siblings;
      if (siblings.length > 0) {
        const spacing = Math.min(88, (width - 32) / siblings.length);
        const siblingRadius = clamp(spacing * 0.3, 16, 26);
        siblings.forEach((thing, index) => {
          node(
            thing,
            "sibling",
            width / 2 + (index - (siblings.length - 1) / 2) * spacing,
            height - 44,
            siblingRadius,
          );
        });
      }

      const actions = focus.actions;
      const paged = actions.length > 6;
      const visibleActions = paged
        ? actions.slice(actionPage * 5, actionPage * 5 + 5)
        : actions;
      const slots = visibleActions.length + (paged ? 1 : 0);
      const actionRadius = radius + 47;
      visibleActions.forEach((action, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / slots;
        result.push({
          key: `action:${focus.id}:${action.id}`,
          role: "action",
          thing: null,
          label: action.label,
          x: centerX + Math.cos(angle) * actionRadius,
          y: centerY + Math.sin(angle) * actionRadius,
          r: 17,
          enabled: Boolean(onAction),
          run: () => onAction?.(focus, action),
        });
      });
      if (paged) {
        const angle = -Math.PI / 2 + ((slots - 1) * Math.PI * 2) / slots;
        result.push({
          key: "more-actions",
          role: "action",
          thing: null,
          label: "More",
          x: centerX + Math.cos(angle) * actionRadius,
          y: centerY + Math.sin(angle) * actionRadius,
          r: 17,
          enabled: true,
          run() {
            actionPage = (actionPage + 1) % Math.ceil(actions.length / 5);
            rebuild();
          },
        });
      }
    }

    const pageY = state.focus ? height - 106 : height - 32;
    if (state.hasPrevious)
      control("previous", "‹", width / 2 - 35, pageY, () => session.previous());
    if (state.hasNext)
      control("next", "›", width / 2 + 35, pageY, () => session.next());
    if (state.error)
      control("retry", "↻", width - 32, 36, () => void session.refresh());
    return result;
  }

  function rebuild(): void {
    if (destroyed) return;
    state = session.snapshot();
    const focusedId = state.focus?.id ?? null;
    if (focusedId !== previousFocus) {
      actionPage = 0;
      previousFocus = focusedId;
    }
    for (const body of bodies.values()) body.visible = false;
    for (const target of targets()) {
      let body = bodies.get(target.key);
      if (!body) {
        // New children emerge from the existing parent; new actions emerge from focus.
        const parent = target.thing?.parent
          ? bodies.get(`thing:${target.thing.parent}`)
          : undefined;
        const focusBody =
          target.role === "action"
            ? bodies.get(`thing:${state.focus?.id}`)
            : undefined;
        const origin = parent ?? focusBody;
        body = {
          target,
          x: origin?.x ?? target.x,
          y: origin?.y ?? target.y,
          r: 0,
          opacity: 0,
          vx: 0,
          vy: 0,
          vr: 0,
          vo: 0,
          visible: true,
          phase:
            [...target.key].reduce((sum, c) => sum + c.charCodeAt(0), 0) * 0.7,
          scale: 0.9,
          vs: 0,
        };
        bodies.set(target.key, body);
      }
      body.target = target;
      body.visible = true;
    }
    wake();
  }

  function tick(time: number): void {
    frame = 0;
    const dt = Math.min(Math.max((time - lastTime) / 1000, 0), 0.04);
    lastTime = time;
    let moving = false;
    const instant = reducedMotion?.matches === true;

    if (!instant) {
      elapsed += dt;
      orbitAngle += orbitSpeed * dt;
      // After flicking the orbit, its speed gently returns to a leisurely pace.
      orbitSpeed += (0.16 - orbitSpeed) * (1 - Math.exp(-0.7 * dt));
    }

    const focusCenterX = width / 2;
    const focusCenterY = 65 + Math.max(180, height - 180) / 2;
    for (const [key, body] of bodies) {
      const target = body.target;
      const activeDrag = drag?.key === key && drag.moved;
      let tx = target.x;
      let ty = target.y;

      // Rotate the existing elliptical child layout; never change the Session
      // hierarchy or stored Thing positions.
      if (target.role === "child" && state.focus) {
        const rx = target.x - focusCenterX;
        const ry = target.y - focusCenterY;
        const c = Math.cos(orbitAngle);
        const si = Math.sin(orbitAngle);
        // Rotate in normalized ellipse space to keep children inside the canvas.
        // Use the actual layout radii recovered from target coordinates.
        const layoutRadius = clamp(
          Math.min(width * 0.16, Math.max(180, height - 180) * 0.22),
          42,
          88,
        );
        const ax = Math.max(
          layoutRadius + 50,
          Math.min(width / 2 - 42, layoutRadius + 170),
        );
        const ay = Math.min(
          Math.max(180, height - 180) * 0.43,
          layoutRadius + 170,
        );
        tx = focusCenterX + ((rx / ax) * c - (ry / ay) * si) * ax;
        ty = focusCenterY + ((rx / ax) * si + (ry / ay) * c) * ay;
      } else if (target.role === "root" || target.role === "sibling") {
        // Tiny breathing motion: enough to feel alive, not enough to be distracting.
        tx += Math.sin(elapsed * 0.65 + body.phase) * 5;
        ty += Math.cos(elapsed * 0.8 + body.phase) * 7;
      }
      if (activeDrag && drag) {
        tx = drag.x - drag.offsetX;
        ty = drag.y - drag.offsetY;
      }
      const hot = hovered === key && target.enabled;
      const tr = body.visible ? target.r : target.r * 0.72;
      const opacity = body.visible ? 1 : 0;
      const scale = activeDrag ? 1.18 : hot ? 1.12 : 1;
      if (instant) {
        body.x = tx;
        body.y = ty;
        body.r = tr;
        body.opacity = opacity;
        body.scale = scale;
        body.vx = body.vy = body.vr = body.vo = body.vs = 0;
      } else {
        [body.x, body.vx] = spring(
          body.x,
          body.vx,
          tx,
          dt,
          activeDrag ? 24 : 13.5,
          activeDrag ? 0.98 : 0.82,
        );
        [body.y, body.vy] = spring(
          body.y,
          body.vy,
          ty,
          dt,
          activeDrag ? 24 : 13.5,
          activeDrag ? 0.98 : 0.82,
        );
        [body.r, body.vr] = spring(body.r, body.vr, tr, dt, 16, 0.88);
        [body.opacity, body.vo] = spring(
          body.opacity,
          body.vo,
          opacity,
          dt,
          18,
          1,
        );
        [body.scale, body.vs] = spring(
          body.scale,
          body.vs,
          scale,
          dt,
          19,
          0.76,
        );
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
    if ((moving || (!instant && bodies.size > 0)) && !destroyed)
      frame = requestAnimationFrame(tick);
  }

  function draw(): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const background = ctx.createRadialGradient(
      width / 2,
      height * 0.45,
      0,
      width / 2,
      height * 0.45,
      Math.max(width, height) * 0.7,
    );
    background.addColorStop(0, "#132b36");
    background.addColorStop(1, "#060d14");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = "13px system-ui";
    ctx.fillStyle = "#90a8b7";
    if (!state.focus) ctx.fillText("Workspace", 24, 32);
    else if (!state.parent) ctx.fillText("Workspace", 62, 36);

    if (state.focus && state.siblings.length) {
      ctx.strokeStyle = "rgba(173, 207, 220, 0.12)";
      ctx.beginPath();
      ctx.moveTo(28, height - 82);
      ctx.lineTo(width - 28, height - 82);
      ctx.stroke();
    }

    const focusedBody = state.focus
      ? bodies.get(`thing:${state.focus.id}`)
      : undefined;
    if (
      focusedBody &&
      state.focus?.actions.length &&
      state.focus.type !== "collection" &&
      state.focus.type !== "group"
    ) {
      ctx.strokeStyle = `rgba(113, 221, 196, ${0.12 * clamp(focusedBody.opacity, 0, 1)})`;
      ctx.beginPath();
      ctx.arc(
        focusedBody.x,
        focusedBody.y,
        Math.max(1, focusedBody.r * focusedBody.scale + 47),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    drawn = [...bodies.values()].sort((a, b) => {
      const priority = (body: Body) =>
        drag?.moved && drag.key === body.target.key
          ? 3
          : body.target.role === "focus"
            ? 2
            : hovered === body.target.key
              ? 1
              : 0;
      return priority(a) - priority(b) || a.r - b.r;
    });
    for (const body of drawn) drawBody(body);

    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.font = "12px system-ui";
    if (state.loading) {
      ctx.fillStyle = "#90a8b7";
      ctx.fillText("Loading…", width / 2, 28);
    } else if (state.error) {
      ctx.fillStyle = "#efb1a5";
      ctx.fillText(fit(state.error, width * 0.6), width / 2, 28);
    } else if (!state.focus && state.children.length === 0) {
      ctx.fillStyle = "#90a8b7";
      ctx.fillText("This workspace is empty", width / 2, height / 2);
    }
  }

  function drawBody(body: Body): void {
    const target = body.target;
    const radius = Math.max(0.1, body.r);
    const hot = hovered === target.key;
    const isAction = target.role === "action";
    const isFocus = target.role === "focus";
    const isControl = target.role === "control";

    ctx.save();
    ctx.translate(body.x, body.y);
    ctx.scale(body.scale, body.scale);
    ctx.globalAlpha = clamp(body.opacity, 0, 1) * (target.enabled ? 1 : 0.45);
    const isOpenedGroup =
      isFocus &&
      (target.thing?.type === "collection" || target.thing?.type === "group");
    const src = imageSource(target.thing);
    const image = src ? imageFor(src) : null;
    const loaded = image?.complete && image.naturalWidth > 0;

    if (isOpenedGroup) {
      // Open collections are headings, not giant circular nodes.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "600 26px system-ui";
      ctx.fillStyle = "#eef8fc";
      ctx.fillText(fit(target.label, Math.min(width * 0.65, 420)), 0, -8);
      ctx.font = "12px system-ui";
      ctx.fillStyle = "#90a8b7";
      ctx.fillText("COLLECTION", 0, 23);
      ctx.restore();
      return;
    }

    if (!isControl) {
      const fill = ctx.createLinearGradient(-radius, -radius, radius, radius);
      fill.addColorStop(
        0,
        isAction ? "#27594f" : isFocus ? "#31556a" : "#203d50",
      );
      fill.addColorStop(1, "#10212e");
      ctx.fillStyle = fill;
      ctx.shadowColor = isAction
        ? "rgba(103, 223, 188, 0.22)"
        : "rgba(90, 175, 222, 0.20)";
      ctx.shadowBlur = isFocus ? 28 : hot ? 20 : 10;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (loaded && image) drawImageCover(image, radius);
      ctx.strokeStyle = hot
        ? "#b9f4e7"
        : isAction
          ? "rgba(122, 223, 192, 0.6)"
          : "rgba(165, 207, 232, 0.35)";
      ctx.lineWidth = hot ? 1.5 : 1;
      ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e1edf3";
    if (isControl) {
      ctx.font = "26px system-ui";
      ctx.fillText(target.label, 0, 0);
    } else if (loaded && isFocus) {
      // Keep focused photos unobstructed; show their title below the image.
      ctx.font = "12px system-ui";
      ctx.fillStyle = "#d8e8f0";
      ctx.fillText(
        fit(target.label, Math.max(120, radius * 2.6)),
        0,
        radius + 22,
      );
    } else if (isFocus) {
      ctx.font = "10px system-ui";
      ctx.fillStyle = "#9fbac9";
      ctx.fillText(target.thing!.type.toUpperCase(), 0, -radius * 0.3);
      ctx.font = "500 16px system-ui";
      ctx.fillStyle = "#eef8fc";
      ctx.fillText(fit(target.label, radius * 1.65), 0, 8);
    } else if (loaded && target.role !== "parent") {
      if (target.role !== "child" || hot) {
        ctx.font = "11px system-ui";
        ctx.fillStyle = "#c1d5df";
        ctx.fillText(
          fit(
            target.label,
            target.role === "sibling" ? Math.max(40, radius * 2.7) : 130,
          ),
          0,
          radius + 15,
        );
      }
    } else {
      ctx.font = isAction
        ? "16px system-ui"
        : `${clamp(radius * 0.55, 12, 25)}px system-ui`;
      const symbol =
        target.role === "parent"
          ? "←"
          : isAction
            ? target.key === "more-actions"
              ? "…"
              : "·"
            : target.thing!.type.slice(0, 1).toUpperCase();
      ctx.fillText(symbol, 0, 0);
      ctx.font = "11px system-ui";
      ctx.fillStyle = "#c1d5df";
      if (target.role === "parent") {
        ctx.textAlign = "left";
        ctx.fillText(
          fit(target.label, Math.max(60, width * 0.3)),
          radius + 12,
          0,
        );
      } else if (target.role !== "child" || hot) {
        const labelWidth =
          target.role === "sibling"
            ? Math.max(40, radius * 2.7)
            : isAction
              ? 100
              : 130;
        ctx.fillText(fit(target.label, labelWidth), 0, radius + 15);
      }
    }
    ctx.restore();
  }

  function point(event: MouseEvent | PointerEvent | WheelEvent) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function hit(x: number, y: number): Body | undefined {
    for (let index = drawn.length - 1; index >= 0; index--) {
      const body = drawn[index]!;
      if (!body.visible || !body.target.enabled || body.opacity < 0.2) continue;
      const heading =
        body.target.role === "focus" &&
        (body.target.thing?.type === "collection" ||
          body.target.thing?.type === "group");
      if (heading) {
        if (
          Math.abs(x - body.x) <= Math.min(width * 0.33, 210) &&
          Math.abs(y - body.y + 8) <= 38
        )
          return body;
      } else if (
        hypot(x - body.x, y - body.y) <= Math.max(22, body.r * body.scale)
      )
        return body;
    }
    return undefined;
  }

  function pointerDown(event: PointerEvent): void {
    if (event.button !== 0 || drag) return;
    const position = point(event);
    const body = hit(position.x, position.y);
    if (!body || !body.target.thing || body.target.role === "parent") return;
    drag = {
      id: event.pointerId,
      key: body.target.key,
      startX: position.x,
      startY: position.y,
      offsetX: position.x - body.x,
      offsetY: position.y - body.y,
      x: position.x,
      y: position.y,
      moved: false,
    };
    lastDragAngle = null;
  }

  function pointerMove(event: PointerEvent): void {
    const position = point(event);
    if (drag && drag.id === event.pointerId) {
      drag.x = position.x;
      drag.y = position.y;
      if (
        !drag.moved &&
        hypot(drag.x - drag.startX, drag.y - drag.startY) > 6
      ) {
        drag.moved = true;
        canvas.setPointerCapture(event.pointerId);
      }
      if (drag.moved) {
        const dragged = bodies.get(drag.key);
        if (dragged?.target.role === "child") {
          const cx = width / 2;
          const cy = 65 + Math.max(180, height - 180) / 2;
          const angle = Math.atan2(position.y - cy, position.x - cx);
          if (lastDragAngle !== null) {
            const difference = Math.atan2(
              Math.sin(angle - lastDragAngle),
              Math.cos(angle - lastDragAngle),
            );
            orbitAngle += difference * 0.32;
            orbitSpeed = clamp(orbitSpeed + difference * 3, -2, 2);
          }
          lastDragAngle = angle;
        }
        canvas.style.cursor = "grabbing";
        wake();
        return;
      }
    }
    const key = hit(position.x, position.y)?.target.key ?? null;
    if (key !== hovered) {
      hovered = key;
      canvas.style.cursor = key ? "pointer" : "default";
      wake();
    }
  }

  function pointerUp(event: PointerEvent): void {
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.moved) {
      suppressClick = true;
      // Dragging here is a visual interaction only; persistence/containment
      // remains owned by the Session and is never mutated by the renderer.
    }
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    drag = null;
    lastDragAngle = null;
    const p = point(event);
    hovered = hit(p.x, p.y)?.target.key ?? null;
    canvas.style.cursor = hovered ? "pointer" : "default";
    wake();
  }

  function pointerLeave(): void {
    if (drag?.moved) return;
    hovered = null;
    canvas.style.cursor = "default";
    wake();
  }

  function click(event: MouseEvent): void {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    canvas.focus({ preventScroll: true });
    const position = point(event);
    hit(position.x, position.y)?.target.run();
  }

  function wheel(event: WheelEvent): void {
    if (event.ctrlKey) return;
    event.preventDefault();
    if (wheelTimer !== undefined) clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelAmount = 0;
      wheelLocked = false;
    }, 180);
    if (wheelLocked) return;
    const unit =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    wheelAmount += event.deltaY * unit;
    if (Math.abs(wheelAmount) < 60) return;
    wheelLocked = true;
    if (wheelAmount > 0) {
      session.back();
      return;
    }
    const position = point(event);
    const thing = hit(position.x, position.y)?.target.thing;
    if (thing) session.focus(thing.id);
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      session.back();
    }
  }

  function resize(): void {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    const nextDpr = window.devicePixelRatio || 1;
    const nextWidth = Math.round(width * nextDpr);
    const nextHeight = Math.round(height * nextDpr);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    dpr = nextDpr;
    rebuild();
  }

  const unsubscribe = session.subscribe(rebuild);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener("resize", resize);
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("pointerleave", pointerLeave);
  canvas.addEventListener("click", click);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("keydown", keydown);
  resize();

  return {
    destroy(): void {
      destroyed = true;
      cancelAnimationFrame(frame);
      if (wheelTimer !== undefined) clearTimeout(wheelTimer);
      observer.disconnect();
      unsubscribe();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("pointerleave", pointerLeave);
      canvas.removeEventListener("click", click);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("keydown", keydown);
      canvas.style.cursor = originalCursor;
      canvas.style.touchAction = originalTouchAction;
      for (const image of images.values()) {
        image.onload = null;
        image.onerror = null;
      }
      images.clear();
      bodies.clear();
      drawn = [];
    },
  };
}
