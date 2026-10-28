// adapt.ts — v0.3 — spatial primitives, one-file prototype

// ───────── model ─────────

export type Density = "glance" | "summary" | "focused";
export type Size = { w: number; h: number };

export type Paint =
  | { op: "text"; value: string; size?: number; dy?: number; color?: string }
  | { op: "image"; src: string; fit?: "cover" | "contain" }
  | { op: "rect"; fill: string; w?: number; h?: number; radius?: number };

export type InputSchema =
  | { type: "string" | "number" | "boolean" }
  | { type: "array"; items?: InputSchema }
  | {
      type: "object";
      properties?: Record<string, InputSchema>;
      required?: string[];
    };

export type ActionDescriptor = {
  id: string;
  label: string;
  description?: string;
  targets?: "self" | "node" | "nodes";
  input?: InputSchema;
  confirm?: boolean;
};

export type ViewContext = {
  density: Density;
  box: Size;
  children: number;
};

export interface Kind<P = any> {
  name: string;
  view(props: P, ctx: ViewContext): Paint[];
  actions?(props: P): ActionDescriptor[];
}

export type NodeProps = {
  id: string;
  data?: any;
  role?: "focus";
  weight?: number;
  layout?: Layout;
  actions?: ActionDescriptor[] | ((self: Node) => ActionDescriptor[]);
  [key: string]: any;
};

export type Node = {
  kind: Kind;
  props: NodeProps;
  children?: Node[];
};

export const node = (
  kind: Kind,
  props: NodeProps,
  children?: Node[],
): Node => ({ kind, props, children });

export const actionsOf = (self: Node): ActionDescriptor[] => {
  const fromKind = self.kind.actions?.(self.props) ?? [];
  const own =
    typeof self.props.actions === "function"
      ? self.props.actions(self)
      : (self.props.actions ?? []);
  const merged = new Map<string, ActionDescriptor>();
  for (const action of fromKind) merged.set(action.id, action);
  for (const action of own) merged.set(action.id, action);
  return [...merged.values()];
};

export function validateInput(
  schema: InputSchema,
  value: unknown,
): string | null {
  if (schema.type === "string")
    return typeof value === "string" ? null : "expected string";
  if (schema.type === "number")
    return typeof value === "number" ? null : "expected number";
  if (schema.type === "boolean")
    return typeof value === "boolean" ? null : "expected boolean";

  if (schema.type === "array") {
    if (!Array.isArray(value)) return "expected array";
    if (!schema.items) return null;
    for (let index = 0; index < value.length; index++) {
      const reason = validateInput(schema.items, value[index]);
      if (reason) return `[${index}]: ${reason}`;
    }
    return null;
  }

  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return "expected object";
    for (const key of schema.required ?? [])
      if (!(key in value)) return `missing ${key}`;
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (!(key in value)) continue;
      const reason = validateInput(
        child,
        (value as Record<string, unknown>)[key],
      );
      if (reason) return `${key}: ${reason}`;
    }
    return null;
  }

  return "unsupported schema";
}

// ───────── layouts ─────────

export type LayoutItem = { id: string; weight: number; index: number };

export type LayoutContext = {
  items: LayoutItem[];
  budget: number;
  box: Size;
  inner: number;
  outer: number;
  child: number;
  gap: number;
  time: number;
};

export type LayoutResult = {
  positions: Record<string, { x: number; y: number }>;
  more?: { x: number; y: number; count: number };
};

export interface Layout {
  name: string;
  place(ctx: LayoutContext): LayoutResult;
}

const pack = (items: LayoutItem[], budget: number) => {
  if (items.length <= budget) return { shown: items, hidden: 0 };
  const keep = Math.max(0, budget - 1);
  return { shown: items.slice(0, keep), hidden: items.length - keep };
};

export const orbit = (opts: { spin?: number } = {}): Layout => ({
  name: "orbit",
  place({ items, budget, box, inner, child, gap, outer, time }) {
    const { shown, hidden } = pack(items, budget);
    const slots = shown.map((item) => item.id);
    if (hidden > 0) slots.push("$more");

    const limit = Math.min(box.w, box.h) / 2 - child - 8;
    const radius = Math.max(
      child + gap,
      Math.min(inner + child * 3.2 + gap, Math.min(outer, limit)),
    );
    const start = -Math.PI / 2 + (opts.spin ?? 0) * time;

    const positions: LayoutResult["positions"] = {};
    let more: LayoutResult["more"];

    slots.forEach((id, index) => {
      const angle = start + (index / Math.max(1, slots.length)) * Math.PI * 2;
      const point = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
      if (id === "$more") more = { ...point, count: hidden };
      else positions[id] = point;
    });

    return { positions, more };
  },
});

export const cluster = (opts: { gap?: number } = {}): Layout => ({
  name: "cluster",
  place({ items, budget, box, inner, child, gap, time }) {
    const spacing = opts.gap ?? gap;
    const { shown, hidden } = pack(items, budget);
    const slots = shown.map((item) => item.id);
    if (hidden > 0) slots.push("$more");

    const step = child * 2 + spacing;
    const limit = Math.min(box.w, box.h) / 2 - child - 8;

    const positions: LayoutResult["positions"] = {};
    let more: LayoutResult["more"];
    let index = 0;
    let ring = 0;
    let radius = Math.max(child + spacing, inner + child + spacing);

    while (index < slots.length && ring < 24) {
      const capacity = Math.max(1, Math.floor((Math.PI * 2 * radius) / step));
      const offset = ring * 0.55 + time * 0.03;
      for (let k = 0; k < capacity && index < slots.length; k++, index++) {
        const angle = -Math.PI / 2 + offset + (k / capacity) * Math.PI * 2;
        const point = {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        };
        if (slots[index] === "$more") more = { ...point, count: hidden };
        else positions[slots[index]] = point;
      }
      radius = Math.min(limit, radius + step);
      ring++;
    }

    const placed = Object.keys(positions).length;
    if (placed < items.length) {
      more = more ?? { x: 0, y: 0, count: 0 };
      more.count = items.length - placed;
    }

    return { positions, more };
  },
});

export const flex = (opts: { gap?: number } = {}): Layout => ({
  name: "flex",
  place({ items, budget, box, child, gap }) {
    const spacing = opts.gap ?? gap;
    const { shown, hidden } = pack(items, budget);
    const slots = shown.map((item) => item.id);
    if (hidden > 0) slots.push("$more");

    const cell = child * 2 + spacing;
    const span = Math.min(box.w, box.h) * 0.82;
    const columns = Math.max(1, Math.floor(span / cell));
    const rows = Math.ceil(slots.length / columns);

    const positions: LayoutResult["positions"] = {};
    let more: LayoutResult["more"];

    slots.forEach((id, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const inRow = Math.min(columns, slots.length - row * columns);
      const point = {
        x: (column - (inRow - 1) / 2) * cell,
        y: (row - (rows - 1) / 2) * cell,
      };
      if (id === "$more") more = { ...point, count: hidden };
      else positions[id] = point;
    });

    return { positions, more };
  },
});

// ───────── built-in kinds ─────────

export const text: Kind = {
  name: "text",
  view: (props, ctx) => {
    const value = String(props.data ?? "");
    if (ctx.density === "glance")
      return [{ op: "text", value: value.slice(0, 24), size: 11 }];
    if (ctx.density === "summary")
      return [{ op: "text", value: value.slice(0, 90), size: 12 }];
    return [{ op: "text", value, size: 15 }];
  },
};

export const image: Kind = {
  name: "image",
  view: (props) => [
    { op: "image", src: String(props.data ?? ""), fit: "cover" },
  ],
};

export const file: Kind = {
  name: "file",
  view: (props, ctx) => {
    const name = String(props.data?.name ?? "file");
    if (ctx.density === "glance")
      return [
        {
          op: "text",
          value: (name.split(".").pop() ?? "").toUpperCase(),
          size: 14,
        },
      ];
    return [
      { op: "text", value: name, size: 13, dy: -8 },
      {
        op: "text",
        value: String(props.data?.size ?? ""),
        size: 11,
        dy: 12,
        color: "#888",
      },
    ];
  },
};

export const group: Kind = {
  name: "group",
  view: (props, ctx) => {
    const label = String(props.data?.label ?? props.id);
    if (ctx.density === "glance")
      return [{ op: "text", value: label, size: 12 }];
    return [
      {
        op: "text",
        value: label,
        size: ctx.density === "focused" ? 16 : 13,
        dy: -9,
      },
      {
        op: "text",
        value: `${ctx.children} item${ctx.children === 1 ? "" : "s"}`,
        size: 11,
        dy: 11,
        color: "#888",
      },
    ];
  },
};

const moreKind: Kind = {
  name: "more",
  view: (props, ctx) => [
    {
      op: "text",
      value: `+${props.data?.count ?? 0}`,
      size: ctx.density === "glance" ? 14 : 12,
    },
  ],
};

// ───────── operations ─────────

export type Intent =
  | { op: "focus"; target: string; approved?: boolean }
  | { op: "move"; from: string; to: string | null; approved?: boolean }
  | {
      op: "action";
      action: string;
      targets: string[];
      input?: unknown;
      approved?: boolean;
    };

export type Command = {
  op: "move";
  from: string;
  to: string | null;
};

export type InvokeResult =
  | { ok: true; command?: Command; result?: unknown }
  | { ok: false; reason: string };

export type ActionContext = {
  intent: Extract<Intent, { op: "action" }>;
  ids: string[];
  targets: Node[];
  input?: unknown;
  space: Space;
};

export type ActionHandler = (ctx: ActionContext) => unknown | Promise<unknown>;

export type ActionRegistry = {
  register(id: string, handler: ActionHandler): () => void;
  get(id: string): ActionHandler | undefined;
};

export const createActionRegistry = (): ActionRegistry => {
  const handlers = new Map<string, ActionHandler>();
  return {
    register: (id, handler) => {
      handlers.set(id, handler);
      return () => {
        if (handlers.get(id) === handler) handlers.delete(id);
      };
    },
    get: (id) => handlers.get(id),
  };
};

const rootsOf = (root: Node | Node[]): Node[] =>
  Array.isArray(root) ? root : [root];

const findNode = (nodes: Node[], id: string): Node | undefined => {
  for (const item of nodes) {
    if (item.props.id === id) return item;
    const found = item.children ? findNode(item.children, id) : undefined;
    if (found) return found;
  }
  return undefined;
};

const isDescendant = (item: Node, id: string): boolean =>
  (item.children ?? []).some(
    (child) => child.props.id === id || isDescendant(child, id),
  );

const cloneTree = (nodes: Node[]): Node[] =>
  nodes.map((item) => ({
    ...item,
    props: { ...item.props },
    children: item.children ? cloneTree(item.children) : undefined,
  }));

export function validateCommand(
  root: Node | Node[],
  command: Command,
): string | null {
  const roots = rootsOf(root);
  const from = findNode(roots, command.from);
  if (!from) return `unknown source: ${command.from}`;
  if (command.to === null) return null;
  if (command.to === command.from) return "source and target are the same";
  const to = findNode(roots, command.to);
  if (!to) return `unknown target: ${command.to}`;
  if (isDescendant(from, command.to))
    return "cannot move a node into its own descendant";
  return null;
}

export function applyCommand(
  root: Node | Node[],
  command: Command,
): { ok: true; root: Node[] } | { ok: false; reason: string } {
  const reason = validateCommand(root, command);
  if (reason) return { ok: false, reason };

  const roots = cloneTree(rootsOf(root));
  const from = findNode(roots, command.from);
  if (!from) return { ok: false, reason: `unknown source: ${command.from}` };

  const detach = (nodes: Node[], id: string): Node[] | null => {
    const index = nodes.findIndex((item) => item.props.id === id);
    if (index >= 0) {
      nodes.splice(index, 1);
      return nodes;
    }
    for (const item of nodes) {
      if (!item.children) continue;
      const found = detach(item.children, id);
      if (found) return found;
    }
    return null;
  };

  if (!detach(roots, command.from))
    return { ok: false, reason: `unknown source: ${command.from}` };

  if (command.to === null) {
    roots.push(from);
  } else {
    const target = findNode(roots, command.to);
    if (!target) return { ok: false, reason: `unknown target: ${command.to}` };
    (target.children ??= []).push(from);
  }

  return { ok: true, root: roots };
}

const isCommand = (value: unknown): value is Command =>
  typeof value === "object" &&
  value !== null &&
  (value as { op?: unknown }).op === "move";

// ───────── engine contracts ─────────

export type Input =
  | { type: "down" | "move" | "up" | "leave"; x: number; y: number }
  | { type: "zoom"; x: number; y: number; d: 1 | -1 };

export type Item = {
  id: string;
  role: "node" | "more" | "action";
  x: number;
  y: number;
  r: number;
  hot: boolean;
  focused: boolean;
  busy: boolean;
  paints: Paint[];
};

export type Frame = { items: Item[] };

export interface Renderer {
  size(): Size;
  draw(frame: Frame): void;
  input(cb: (event: Input) => void): () => void;
  frames?(cb: (dt: number) => void): () => void;
  ask?(label: string): Promise<string | null>;
  destroy?(): void;
}

export type Body = {
  id: string;
  role: "node" | "more" | "action";
  node?: Node;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  tx: number;
  ty: number;
  tr: number;
  vis: boolean;
  lp: string;
  pinned?: boolean;
  action?: ActionDescriptor;
  idx: number;
  n: number;
  busy?: boolean;
};

type Drag = {
  body?: Body;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  moved: boolean;
};

type State = {
  roots: Node[];
  nodes: Map<string, Node>;
  owner: Map<string, string>;
  bodies: Map<string, Body>;
  listeners: Record<string, ((event: any) => void)[]>;
  focusId: string | null;
  initialized: boolean;
  hotId: string | null;
  expanded: Set<string>;
  time: number;
  ring: number;
  ptr: { x: number; y: number };
  down: Drag | null;
};

export interface Space {
  render(root: Node | Node[]): void;
  focus(id: string | null): void;
  invoke(intent: Intent): Promise<InvokeResult>;
  on(
    event: "focus" | "action" | "intent" | "command",
    cb: (event: any) => void,
  ): void;
  step(dt: number): void;
  destroy(): void;
}

const K = {
  dtMax: 1 / 30,
  focusRadius: 0.15,
  childRadius: 0.045,
  contextRadius: 0.035,
  rootRadius: 0.06,
  actionRadiusMin: 20,
  actionRadiusMax: 30,
  actionRadiusRatio: 0.05,
  actionOrbit: 1.55,
  actionHotScale: 1.2,
  hotScale: 1.15,
  focusSpring: 90,
  childSpring: 120,
  contextSpring: 60,
  actionSpring: 140,
  dragSpring: 400,
  damping: 9,
  dragDamping: 26,
  collisionPad: 8,
  collisionSpring: 30,
  nearDistance: 90,
  nearPull: 0.25,
  edgePad: 6,
  edgeSpring: 60,
  ringSpeed: 0.15,
  dragSlop: 6,
  hitSlop: 4,
  actionPriority: 1000,
  radiusEase: 12,
  actionEase: 14,
} as const;

const spring = (body: Body, tx: number, ty: number, k: number, dt: number) => {
  body.vx += (tx - body.x) * k * dt;
  body.vy += (ty - body.y) * k * dt;
};

// ───────── space ─────────

export function createSpace(
  renderer: Renderer,
  opts: {
    budget?: number;
    layout?: Layout;
    childLayout?: Layout;
    actions?: ActionRegistry;
  } = {},
): Space {
  const budget = Math.max(2, opts.budget ?? 12);
  const rootLayout = opts.layout ?? cluster();
  const childLayout = opts.childLayout ?? orbit({ spin: 0.06 });
  const registry = opts.actions;

  const state: State = {
    roots: [],
    nodes: new Map(),
    owner: new Map(),
    bodies: new Map(),
    listeners: {},
    focusId: null,
    initialized: false,
    hotId: null,
    expanded: new Set(),
    time: 0,
    ring: 0,
    ptr: { x: -9999, y: -9999 },
    down: null,
  };

  const emit = (
    event: "focus" | "action" | "intent" | "command",
    payload?: any,
  ) => {
    for (const listener of state.listeners[event] ?? []) listener(payload);
  };

  const bodyOf = (id: string | null | undefined) =>
    id ? state.bodies.get(id) : undefined;

  const nodeOf = (id: string | null | undefined) =>
    id ? state.nodes.get(id) : undefined;

  const ensureBody = (next: Node): Body => {
    const id = next.props.id;
    let body = state.bodies.get(id);
    if (!body || body.role !== "node") {
      body = {
        id,
        role: "node",
        node: next,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 2,
        tx: 0,
        ty: 0,
        tr: 2,
        vis: false,
        lp: "",
        idx: 0,
        n: 0,
      };
      state.bodies.set(id, body);
    }
    body.node = next;
    return body;
  };

  const ensureMore = (id: string, count: number, key: string): Body => {
    let body = state.bodies.get(id);
    const origin = bodyOf(key);
    const { w, h } = renderer.size();
    if (!body || body.role !== "more") {
      body = {
        id,
        role: "more",
        x: origin?.x ?? w / 2,
        y: origin?.y ?? h / 2,
        vx: 0,
        vy: 0,
        r: 2,
        tx: 0,
        ty: 0,
        tr: 2,
        vis: false,
        lp: key,
        idx: 0,
        n: 0,
      };
      state.bodies.set(id, body);
    }
    body.node = { kind: moreKind, props: { id, data: { count } } };
    body.lp = key;
    return body;
  };

  function layout() {
    const { w, h } = renderer.size();
    const base = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const gap = Math.max(12, base * 0.02);
    const focusR = base * K.focusRadius;
    const childR = base * K.childRadius;
    const contextR = base * K.contextRadius;
    const rootR = base * K.rootRadius;
    const outer = base * 0.47;

    for (const body of state.bodies.values()) {
      if (body.role === "node" || body.role === "more") body.vis = false;
    }

    const focusBody = bodyOf(state.focusId);
    const focusNode = nodeOf(state.focusId);

    const runLayout = (
      key: string,
      items: Node[],
      layoutDef: Layout,
      inner: number,
      child: number,
    ) => {
      const sorted = items
        .map((item, index) => ({
          id: item.props.id,
          weight: item.props.weight ?? 0,
          index,
        }))
        .sort((a, b) => b.weight - a.weight || a.index - b.index);

      const expanded = state.expanded.has(key);
      const result = layoutDef.place({
        items: sorted,
        budget: expanded ? sorted.length : budget,
        box: { w, h },
        inner,
        outer,
        child,
        gap,
        time: state.time,
      });

      for (const [id, point] of Object.entries(result.positions)) {
        const body = bodyOf(id);
        if (!body) continue;
        body.vis = true;
        body.lp = key;
        body.tx = cx + point.x;
        body.ty = cy + point.y;
        body.tr = child;
      }

      const moreId = `more:${key}`;
      if (result.more && result.more.count > 0) {
        const more = ensureMore(moreId, result.more.count, key);
        more.vis = true;
        more.tx = cx + result.more.x;
        more.ty = cy + result.more.y;
        more.tr = child;
      } else {
        const more = state.bodies.get(moreId);
        if (more) more.vis = false;
      }
    };

    if (!focusNode) {
      runLayout("", state.roots, rootLayout, 0, rootR);
      return;
    }

    const focusIsRoot = (state.owner.get(focusNode.props.id) ?? "") === "";
    const context = focusIsRoot
      ? state.roots.filter((item) => item !== focusNode)
      : state.roots;
    const contextInner = focusR + childR * 3.2 + gap + childR + contextR + gap;

    runLayout("", context, rootLayout, contextInner, contextR);

    if ((focusNode.children?.length ?? 0) > 0) {
      runLayout(
        focusNode.props.id,
        focusNode.children ?? [],
        focusNode.props.layout ?? childLayout,
        focusR,
        childR,
      );
    }

    if (focusBody) {
      focusBody.vis = true;
      focusBody.lp = "";
      focusBody.pinned = true;
      focusBody.tx = cx;
      focusBody.ty = cy;
      focusBody.tr = focusR;
    }
  }

  function refreshActions() {
    const focusNode = nodeOf(state.focusId);
    const list = focusNode ? actionsOf(focusNode) : [];
    const keep = new Set<string>();
    const focusBody = bodyOf(state.focusId);

    list.forEach((action, index) => {
      if (!focusBody) return;
      const id = `action:${focusBody.id}:${action.id}`;
      keep.add(id);

      let body = state.bodies.get(id);
      if (!body || body.role !== "action") {
        body = {
          id,
          role: "action",
          x: focusBody.x,
          y: focusBody.y,
          vx: 0,
          vy: 0,
          r: 6,
          tx: focusBody.x,
          ty: focusBody.y,
          tr: 6,
          vis: true,
          lp: focusBody.id,
          action,
          idx: index,
          n: list.length,
        };
        state.bodies.set(id, body);
      }

      body.action = action;
      body.idx = index;
      body.n = list.length;
      body.lp = focusBody.id;
    });

    for (const [id, body] of state.bodies) {
      if (body.role === "action" && !keep.has(id)) state.bodies.delete(id);
    }
  }

  async function invoke(intent: Intent): Promise<InvokeResult> {
    if (intent.op === "focus") {
      if (!state.nodes.has(intent.target))
        return { ok: false, reason: `unknown target: ${intent.target}` };
      focus(intent.target);
      return { ok: true };
    }

    if (intent.op === "move") {
      const command: Command = {
        op: "move",
        from: intent.from,
        to: intent.to,
      };
      const reason = validateCommand(state.roots, command);
      if (reason) return { ok: false, reason };
      emit("command", command);
      return { ok: true, command };
    }

    const ids = intent.targets;
    const targetNodes = ids.map((id) => nodeOf(id));
    if (targetNodes.some((item) => !item))
      return { ok: false, reason: "unknown action target" };
    const nodes = targetNodes as Node[];

    let descriptor: ActionDescriptor | undefined;
    for (const item of nodes) {
      descriptor = actionsOf(item).find(
        (action) => action.id === intent.action,
      );
      if (descriptor) break;
    }
    if (!descriptor)
      return { ok: false, reason: `unknown action: ${intent.action}` };

    if (ids.length === 0)
      return { ok: false, reason: "action expects a target" };
    if (descriptor.targets !== "nodes" && ids.length !== 1)
      return { ok: false, reason: "action expects one target" };

    if (descriptor.input) {
      const reason = validateInput(descriptor.input, intent.input);
      if (reason) return { ok: false, reason: `invalid input: ${reason}` };
    }

    if (descriptor.confirm && !intent.approved) {
      emit("intent", { intent, status: "pending" });
      return { ok: false, reason: "approval-required" };
    }

    const handler = registry?.get(descriptor.id);
    if (!handler)
      return { ok: false, reason: `no handler for action: ${descriptor.id}` };

    const result = await handler({
      intent,
      ids,
      targets: nodes,
      input: intent.input,
      space: api,
    });

    const publish = (value: unknown) => {
      if (!isCommand(value)) return;
      if (validateCommand(state.roots, value)) return;
      emit("command", value);
    };

    if (Array.isArray(result)) for (const item of result) publish(item);
    else publish(result);

    emit("action", {
      action: descriptor.id,
      ids,
      label: descriptor.label,
      result,
    });

    return { ok: true, result };
  }

  async function runAction(body: Body) {
    if (body.busy || !body.action) return;
    const action = body.action;
    const target = state.focusId;
    if (!target) return;
    body.busy = true;

    try {
      let input: unknown;
      if (action.input) {
        const value = await (renderer.ask?.(action.label) ??
          Promise.resolve(null));
        if (value == null) return;
        input = value;
      }

      await invoke({
        op: "action",
        action: action.id,
        targets: [target],
        input,
      });
    } finally {
      body.busy = false;
      refreshActions();
    }
  }

  function focus(id: string | null) {
    if (id !== null && !state.nodes.has(id)) return;
    if (state.initialized && id === state.focusId) return;
    state.initialized = true;
    state.focusId = id;
    state.ring = 0;
    emit("focus", { id });
    refreshActions();
  }

  function render(root: Node | Node[]) {
    state.roots = Array.isArray(root) ? [...root] : [root];
    state.nodes.clear();
    state.owner.clear();

    let initialFocus: string | null = null;

    const walk = (item: Node, owner: string) => {
      const id = item.props.id;
      if (!id) throw new Error("adapt: every node needs an id");
      if (state.nodes.has(id)) throw new Error(`adapt: duplicate id ${id}`);
      state.nodes.set(id, item);
      state.owner.set(id, owner);
      if (item.props.role === "focus" && initialFocus === null)
        initialFocus = id;
      ensureBody(item);
      for (const child of item.children ?? []) walk(child, id);
    };

    for (const item of state.roots) walk(item, "");

    for (const [id, body] of state.bodies) {
      if (body.role === "node" && !state.nodes.has(id)) state.bodies.delete(id);
      if (body.role === "more" && body.lp !== "" && !state.nodes.has(body.lp))
        state.bodies.delete(id);
    }

    if (!state.initialized) {
      state.initialized = true;
      state.focusId = initialFocus;
      emit("focus", { id: state.focusId });
    } else if (state.focusId && !state.nodes.has(state.focusId)) {
      state.focusId = null;
      emit("focus", { id: null });
    }

    refreshActions();
  }

  const hit = (x: number, y: number, skip?: string) => {
    let best: Body | undefined;
    let bestScore = Infinity;

    for (const body of state.bodies.values()) {
      if (!body.vis || body.id === skip) continue;
      const distance = Math.hypot(x - body.x, y - body.y) - body.r;
      const score = distance - (body.role === "action" ? K.actionPriority : 0);
      if (distance <= K.hitSlop && score < bestScore) {
        best = body;
        bestScore = score;
      }
    }

    return best;
  };

  function toggleExpanded(key: string) {
    if (state.expanded.has(key)) state.expanded.delete(key);
    else state.expanded.add(key);
  }

  function zoomOut() {
    if (!state.focusId) return;
    const parent = state.owner.get(state.focusId) ?? "";
    focus(parent || null);
  }

  function zoomIn() {
    const hot = bodyOf(state.hotId);
    if (hot?.role === "node") {
      focus(hot.id);
      return;
    }
    if (hot?.role === "more") {
      toggleExpanded(hot.lp);
      return;
    }
    if (state.focusId) {
      const child = nodeOf(state.focusId)?.children?.[0];
      if (child) focus(child.props.id);
      return;
    }
    const first = state.roots[0];
    if (first) focus(first.props.id);
  }

  function placeActions(dt: number) {
    const focusBody = bodyOf(state.focusId);
    const { w, h } = renderer.size();
    const actionR = Math.max(
      K.actionRadiusMin,
      Math.min(K.actionRadiusMax, Math.min(w, h) * K.actionRadiusRatio),
    );

    for (const body of state.bodies.values()) {
      if (body.role !== "action") continue;
      if (!focusBody || !focusBody.vis) {
        body.vis = false;
        continue;
      }

      body.vis = true;
      const hot = body.id === state.hotId;
      const targetR = hot ? actionR * K.actionHotScale : actionR;
      body.r += (targetR - body.r) * (1 - Math.exp(-K.actionEase * dt));

      const angle =
        -Math.PI / 2 +
        state.ring +
        (body.idx / Math.max(1, body.n)) * Math.PI * 2;
      const radius = focusBody.r + actionR * K.actionOrbit;
      let tx = focusBody.x + Math.cos(angle) * radius;
      let ty = focusBody.y + Math.sin(angle) * radius;

      const near = Math.max(
        0,
        1 - Math.hypot(state.ptr.x - tx, state.ptr.y - ty) / K.nearDistance,
      );
      tx += (state.ptr.x - tx) * near * K.nearPull;
      ty += (state.ptr.y - ty) * near * K.nearPull;

      spring(body, tx, ty, K.actionSpring, dt);
    }

    if (state.hotId === null) state.ring += dt * K.ringSpeed;
  }

  function placeNodes(dt: number) {
    const focusId = state.focusId;
    const drag = state.down;
    const { w, h } = renderer.size();

    for (const body of state.bodies.values()) {
      if (!body.vis || body.role === "action") continue;

      const focused = body.id === focusId;
      const hot = body.id === state.hotId;
      const target = focused ? body.tr : hot ? body.tr * K.hotScale : body.tr;
      body.r += (target - body.r) * (1 - Math.exp(-K.radiusEase * dt));
      body.pinned = focused;

      const springK = focused
        ? K.focusSpring
        : body.lp === focusId
          ? K.childSpring
          : K.contextSpring;
      spring(body, body.tx, body.ty, springK, dt);

      if (drag?.moved && drag.body === body) {
        spring(
          body,
          state.ptr.x - drag.ox,
          state.ptr.y - drag.oy,
          K.dragSpring,
          dt,
        );
      }

      const margin = body.r + K.edgePad;
      if (body.x < margin) body.vx += (margin - body.x) * K.edgeSpring * dt;
      if (body.x > w - margin)
        body.vx -= (body.x - (w - margin)) * K.edgeSpring * dt;
      if (body.y < margin) body.vy += (margin - body.y) * K.edgeSpring * dt;
      if (body.y > h - margin)
        body.vy -= (body.y - (h - margin)) * K.edgeSpring * dt;
    }
  }

  function resolveCollisions(dt: number, all: Body[]) {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.01;
        const minimum = a.r + b.r + K.collisionPad;

        if (distance < minimum) {
          const force = (minimum - distance) * K.collisionSpring * dt;
          const nx = dx / distance;
          const ny = dy / distance;
          if (!a.pinned) {
            a.vx -= nx * force;
            a.vy -= ny * force;
          }
          if (!b.pinned) {
            b.vx += nx * force;
            b.vy += ny * force;
          }
        }
      }
    }
  }

  function integrate(dt: number, all: Body[]) {
    const drag = state.down;

    for (const body of all) {
      const damping = Math.exp(
        -(drag?.moved && drag.body === body ? K.dragDamping : K.damping) * dt,
      );
      body.vx *= damping;
      body.vy *= damping;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
    }
  }

  function collect(all: Body[]): Frame {
    const items: Item[] = [];

    for (const body of all) {
      if (body.role === "action") {
        if (!body.action) continue;
        items.push({
          id: body.id,
          role: "action",
          x: body.x,
          y: body.y,
          r: body.r,
          hot: body.id === state.hotId,
          focused: false,
          busy: !!body.busy,
          paints: [
            {
              op: "text",
              value: body.action.label + (body.busy ? "…" : ""),
              size: 11,
            },
          ],
        });
        continue;
      }

      if (!body.node) continue;
      const focused = body.id === state.focusId;
      const hot = body.id === state.hotId;
      const density: Density = focused
        ? "focused"
        : hot
          ? "summary"
          : state.focusId && body.lp === state.focusId
            ? "summary"
            : "glance";

      items.push({
        id: body.id,
        role: body.role === "more" ? "more" : "node",
        x: body.x,
        y: body.y,
        r: body.r,
        hot,
        focused,
        busy: false,
        paints: body.node.kind.view(body.node.props, {
          density,
          box: { w: body.r * 2, h: body.r * 2 },
          children: body.node.children?.length ?? 0,
        }),
      });
    }

    const rank = (item: Item) =>
      item.role === "action"
        ? 3
        : state.down?.moved && state.down.body?.id === item.id
          ? 2
          : item.focused
            ? 1
            : 0;

    items.sort((a, b) => rank(a) - rank(b));
    return { items };
  }

  function step(dt0 = 1 / 60) {
    const dt = Math.min(Math.max(dt0, 0), K.dtMax);
    state.time += dt;

    layout();
    placeActions(dt);
    placeNodes(dt);

    const all = [...state.bodies.values()].filter((body) => body.vis);
    resolveCollisions(dt, all);
    integrate(dt, all);

    renderer.draw(collect(all));
  }

  const offInput = renderer.input((event) => {
    state.ptr = { x: event.x, y: event.y };

    if (event.type === "zoom") {
      if (event.d > 0) zoomIn();
      else zoomOut();
      return;
    }

    if (event.type === "leave") {
      state.hotId = null;
      state.down = null;
      return;
    }

    if (event.type === "move") {
      const drag = state.down;
      if (drag) {
        if (
          !drag.moved &&
          Math.hypot(event.x - drag.sx, event.y - drag.sy) > K.dragSlop
        )
          drag.moved = true;
      } else {
        state.hotId = hit(event.x, event.y)?.id ?? null;
      }
      return;
    }

    if (event.type === "down") {
      const body = hit(event.x, event.y);
      state.down = {
        body,
        sx: event.x,
        sy: event.y,
        ox: body ? event.x - body.x : 0,
        oy: body ? event.y - body.y : 0,
        moved: false,
      };
      return;
    }

    const drag = state.down;
    state.down = null;
    if (!drag) return;

    if (drag.moved) {
      if (drag.body?.role === "node") {
        const over = hit(event.x, event.y, drag.body.id);
        if (over?.role === "node")
          void invoke({
            op: "move",
            from: drag.body.id,
            to: over.id,
          });
      }
      return;
    }

    if (!drag.body) {
      zoomOut();
      return;
    }

    if (drag.body.role === "action") void runAction(drag.body);
    else if (drag.body.role === "more") toggleExpanded(drag.body.lp);
    else focus(drag.body.id);
  });

  const stopFrames = renderer.frames?.(step);

  const api: Space = {
    render,
    focus,
    invoke,
    on: (event, cb) => {
      (state.listeners[event] ??= []).push(cb);
    },
    step,
    destroy: () => {
      stopFrames?.();
      offInput();
      renderer.destroy?.();
    },
  };

  return api;
}

// ───────── canvas renderer ─────────

export type Theme = {
  background: string;
  ink: string;
  muted: string;
  surface: string;
  line: string;
  accent: string;
  onAccent: string;
  font: string;
};

export function canvasRenderer(
  canvas: HTMLCanvasElement,
  theme: Partial<Theme> = {},
): Renderer {
  const T: Theme = {
    background: "#ffffff",
    ink: "#1f1f1f",
    muted: "#6b6b6b",
    surface: "#ffffff",
    line: "#c9c9c9",
    accent: "#2f6fed",
    onAccent: "#ffffff",
    font: "system-ui, sans-serif",
    ...theme,
  };

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("adapt: 2d context unavailable");

  let w = 0;
  let h = 0;

  const fit = () => {
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  fit();
  const resize = new ResizeObserver(fit);
  resize.observe(canvas);
  canvas.style.touchAction = "none";

  const images = new Map<string, HTMLImageElement>();
  const imageFor = (src: string) => {
    let img = images.get(src);
    if (!img) {
      img = new Image();
      img.src = src;
      images.set(src, img);
    }
    return img;
  };

  const ellipsize = (value: string, maxWidth: number) => {
    if (ctx.measureText(value).width <= maxWidth) return value;
    let out = value;
    while (out.length > 0 && ctx.measureText(`${out}…`).width > maxWidth)
      out = out.slice(0, -1);
    return `${out}…`;
  };

  const wrap = (value: string, maxWidth: number, maxLines: number) => {
    const words = value.split(/\s+/);
    const lines: string[] = [];
    let line = "";

    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(next).width <= maxWidth) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }

    if (line) lines.push(line);

    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[kept.length - 1] = ellipsize(
        `${kept[kept.length - 1]} ${lines.slice(maxLines).join(" ")}`,
        maxWidth,
      );
      return kept;
    }

    return lines.map((item) => ellipsize(item, maxWidth));
  };

  const paintText = (
    op: Extract<Paint, { op: "text" }>,
    box: Size,
    color: string,
  ) => {
    const size = op.size ?? 13;
    const maxWidth = box.w * 0.8;
    const lineHeight = size * 1.25;
    const maxLines = Math.max(1, Math.floor((box.h * 0.72) / lineHeight));

    ctx.fillStyle = op.color ?? color;
    ctx.font = `${size}px ${T.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const lines = wrap(op.value, maxWidth, maxLines);
    const total = lines.length * lineHeight;
    let y = (op.dy ?? 0) - total / 2 + lineHeight / 2;

    for (const line of lines) {
      ctx.fillText(line, 0, y);
      y += lineHeight;
    }
  };

  const paint = (op: Paint, box: Size, color: string) => {
    if (op.op === "text") {
      paintText(op, box, color);
      return;
    }

    if (op.op === "rect") {
      const rw = op.w ?? box.w;
      const rh = op.h ?? box.h;
      const radius = Math.min(op.radius ?? 0, rw / 2, rh / 2);
      const x = -rw / 2;
      const y = -rh / 2;
      ctx.fillStyle = op.fill;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + rw, y, x + rw, y + rh, radius);
      ctx.arcTo(x + rw, y + rh, x, y + rh, radius);
      ctx.arcTo(x, y + rh, x, y, radius);
      ctx.arcTo(x, y, x + rw, y, radius);
      ctx.closePath();
      ctx.fill();
      return;
    }

    const img = imageFor(op.src);
    if (!img.complete || !img.naturalWidth) return;

    const scale = (op.fit === "contain" ? Math.min : Math.max)(
      box.w / img.naturalWidth,
      box.h / img.naturalHeight,
    );
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  };

  return {
    size: () => ({ w, h }),

    draw(frame) {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = T.background;
      ctx.fillRect(0, 0, w, h);

      for (const item of frame.items) {
        const isAction = item.role === "action";
        const accent = isAction && item.hot;

        ctx.save();
        ctx.translate(item.x, item.y);

        ctx.beginPath();
        ctx.arc(0, 0, item.r, 0, Math.PI * 2);
        ctx.fillStyle = accent ? T.accent : T.surface;
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, item.r, 0, Math.PI * 2);
        ctx.clip();
        const color = accent ? T.onAccent : T.ink;
        for (const op of item.paints)
          paint(op, { w: item.r * 2, h: item.r * 2 }, color);
        ctx.restore();

        ctx.beginPath();
        ctx.arc(0, 0, item.r, 0, Math.PI * 2);
        ctx.strokeStyle = item.hot || item.focused ? T.accent : T.line;
        ctx.lineWidth = item.hot || item.focused ? 2 : 1;
        ctx.stroke();

        ctx.restore();
      }
    },

    input(cb) {
      const pos = (event: { clientX: number; clientY: number }) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      };

      const pointers = new Map<number, { x: number; y: number }>();
      let pinchGap = 1;
      let wheelAccum = 0;
      let lastWheel = 0;

      const handlers: [string, EventListener][] = [
        [
          "pointerdown",
          (event) => {
            const pointer = event as PointerEvent;
            canvas.setPointerCapture(pointer.pointerId);
            pointers.set(pointer.pointerId, pos(pointer));

            if (pointers.size === 2) {
              const [a, b] = [...pointers.values()];
              pinchGap = Math.hypot(a.x - b.x, a.y - b.y) || 1;
              cb({ type: "leave", x: -9999, y: -9999 });
              return;
            }

            if (pointers.size === 1) cb({ type: "down", ...pos(pointer) });
          },
        ],
        [
          "pointermove",
          (event) => {
            const pointer = event as PointerEvent;
            if (pointers.has(pointer.pointerId))
              pointers.set(pointer.pointerId, pos(pointer));

            if (pointers.size >= 2) {
              const [a, b] = [...pointers.values()];
              const gap = Math.hypot(a.x - b.x, a.y - b.y) || 1;
              const ratio = gap / pinchGap;
              if (ratio > 1.3 || ratio < 0.77) {
                cb({
                  type: "zoom",
                  ...pos(pointer),
                  d: ratio > 1 ? 1 : -1,
                });
                pinchGap = gap;
              }
              return;
            }

            cb({ type: "move", ...pos(pointer) });
          },
        ],
        [
          "pointerup",
          (event) => {
            const pointer = event as PointerEvent;
            const wasPinching = pointers.size >= 2;
            pointers.delete(pointer.pointerId);
            if (wasPinching) return;
            cb({ type: "up", ...pos(pointer) });
          },
        ],
        [
          "pointerleave",
          (event) => {
            const pointer = event as PointerEvent;
            if (!pointers.has(pointer.pointerId))
              cb({ type: "leave", x: -9999, y: -9999 });
          },
        ],
        [
          "pointercancel",
          (event) => {
            const pointer = event as PointerEvent;
            pointers.delete(pointer.pointerId);
            cb({ type: "leave", x: -9999, y: -9999 });
          },
        ],
        [
          "wheel",
          (event) => {
            const wheel = event as WheelEvent;
            wheel.preventDefault();
            const now = performance.now();
            if (now - lastWheel > 250) wheelAccum = 0;
            lastWheel = now;
            wheelAccum += wheel.deltaY;

            if (Math.abs(wheelAccum) > 60) {
              cb({
                type: "zoom",
                ...pos(wheel),
                d: wheelAccum < 0 ? 1 : -1,
              });
              wheelAccum = 0;
            }
          },
        ],
      ];

      for (const [name, handler] of handlers)
        canvas.addEventListener(name, handler, { passive: false });

      return () => {
        for (const [name, handler] of handlers)
          canvas.removeEventListener(name, handler);
      };
    },

    frames(cb) {
      let raf = 0;
      let last = 0;

      const loop = (time: number) => {
        const dt = last ? (time - last) / 1000 : 1 / 60;
        last = time;
        cb(dt);
        raf = requestAnimationFrame(loop);
      };

      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    },

    ask: async (label) => window.prompt(label),

    destroy: () => {
      resize.disconnect();
    },
  };
}
