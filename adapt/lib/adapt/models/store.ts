export type NodeId = string;
export type EdgeId = string;

export interface GraphSchema {
  nodes: Record<string, unknown>;
  edges: Record<string, unknown>;
}

export type NodeKind<S extends GraphSchema> = keyof S["nodes"] & string;
export type EdgeKind<S extends GraphSchema> = keyof S["edges"] & string;

export interface GraphNode<
  S extends GraphSchema,
  K extends NodeKind<S> = NodeKind<S>,
> {
  readonly id: NodeId;
  readonly kind: K;
  readonly data: S["nodes"][K];
}

export interface GraphEdge<
  S extends GraphSchema,
  K extends EdgeKind<S> = EdgeKind<S>,
> {
  readonly id: EdgeId;
  readonly kind: K;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly data: S["edges"][K];
}

export type AnyNode<S extends GraphSchema> = {
  [K in NodeKind<S>]: GraphNode<S, K>;
}[NodeKind<S>];

export type AnyEdge<S extends GraphSchema> = {
  [K in EdgeKind<S>]: GraphEdge<S, K>;
}[EdgeKind<S>];

export type GraphChange<S extends GraphSchema> =
  | { readonly type: "node:add"; readonly node: AnyNode<S> }
  | {
      readonly type: "node:update";
      readonly node: AnyNode<S>;
      readonly previous: AnyNode<S>;
    }
  | { readonly type: "node:remove"; readonly node: AnyNode<S> }
  | { readonly type: "edge:add"; readonly edge: AnyEdge<S> }
  | {
      readonly type: "edge:update";
      readonly edge: AnyEdge<S>;
      readonly previous: AnyEdge<S>;
    }
  | { readonly type: "edge:remove"; readonly edge: AnyEdge<S> };

export interface GraphTransaction<S extends GraphSchema> {
  readonly version: number;
  readonly changes: readonly GraphChange<S>[];
}

export type GraphListener<S extends GraphSchema> = (
  transaction: GraphTransaction<S>,
) => void;

export interface GraphStoreOptions {
  readonly createId?: (prefix: "node" | "edge") => string;
}

export type Direction = "out" | "in" | "both";

type IdIndex = Map<string, Set<string>>;
type AdjacencyIndex = Map<string, Map<string, Set<string>>>;
type PairIndex = Map<string, Map<string, Map<string, Set<string>>>>;

interface EdgeEntry {
  readonly id: EdgeId;
  readonly kind: string;
  readonly from: NodeId;
  readonly to: NodeId;
}

let sequence = 0;

const defaultCreateId = (prefix: "node" | "edge"): string =>
  `${prefix === "node" ? "n" : "e"}${(++sequence).toString(36)}`;

const addToIndex = (index: IdIndex, key: string, id: string): void => {
  const ids = index.get(key);
  if (ids === undefined) index.set(key, new Set([id]));
  else ids.add(id);
};

const removeFromIndex = (index: IdIndex, key: string, id: string): void => {
  const ids = index.get(key);
  if (ids === undefined) return;
  ids.delete(id);
  if (ids.size === 0) index.delete(key);
};

const addToAdjacency = (
  index: AdjacencyIndex,
  node: NodeId,
  kind: string,
  edge: EdgeId,
): void => {
  let byKind = index.get(node);
  if (byKind === undefined) {
    byKind = new Map();
    index.set(node, byKind);
  }
  addToIndex(byKind, kind, edge);
};

const removeFromAdjacency = (
  index: AdjacencyIndex,
  node: NodeId,
  kind: string,
  edge: EdgeId,
): void => {
  const byKind = index.get(node);
  if (byKind === undefined) return;
  removeFromIndex(byKind, kind, edge);
  if (byKind.size === 0) index.delete(node);
};

const addToPairs = (index: PairIndex, edge: EdgeEntry): void => {
  let byTo = index.get(edge.from);
  if (byTo === undefined) {
    byTo = new Map();
    index.set(edge.from, byTo);
  }
  let byKind = byTo.get(edge.to);
  if (byKind === undefined) {
    byKind = new Map();
    byTo.set(edge.to, byKind);
  }
  addToIndex(byKind, edge.kind, edge.id);
};

const removeFromPairs = (index: PairIndex, edge: EdgeEntry): void => {
  const byTo = index.get(edge.from);
  if (byTo === undefined) return;
  const byKind = byTo.get(edge.to);
  if (byKind === undefined) return;
  removeFromIndex(byKind, edge.kind, edge.id);
  if (byKind.size === 0) byTo.delete(edge.to);
  if (byTo.size === 0) index.delete(edge.from);
};

export class GraphStore<S extends GraphSchema = GraphSchema> {
  private readonly nodeMap = new Map<NodeId, AnyNode<S>>();
  private readonly edgeMap = new Map<EdgeId, AnyEdge<S>>();
  private readonly nodesByKind: IdIndex = new Map();
  private readonly edgesByKind: IdIndex = new Map();
  private readonly outgoing: AdjacencyIndex = new Map();
  private readonly incoming: AdjacencyIndex = new Map();
  private readonly pairs: PairIndex = new Map();
  private readonly listeners = new Set<GraphListener<S>>();
  private readonly createId: (prefix: "node" | "edge") => string;
  private revision = 0;
  private pending: GraphChange<S>[] | null = null;

  constructor(options: GraphStoreOptions = {}) {
    this.createId = options.createId ?? defaultCreateId;
  }

  get nodeCount(): number {
    return this.nodeMap.size;
  }

  get edgeCount(): number {
    return this.edgeMap.size;
  }

  get connectionCount(): number {
    return this.edgeMap.size;
  }

  get version(): number {
    return this.revision;
  }

  hasNode(id: NodeId): boolean {
    return this.nodeMap.has(id);
  }

  getNode(id: NodeId): AnyNode<S> | undefined {
    return this.nodeMap.get(id);
  }

  requireNode(id: NodeId): AnyNode<S> {
    const node = this.nodeMap.get(id);
    if (node === undefined) throw new Error(`Unknown node: ${id}`);
    return node;
  }

  nodes(): IterableIterator<AnyNode<S>> {
    return this.nodeMap.values();
  }

  *nodesOfKind<K extends NodeKind<S>>(
    kind: K,
  ): IterableIterator<GraphNode<S, K>> {
    const ids = this.nodesByKind.get(kind);
    if (ids === undefined) return;
    for (const id of ids) {
      const node = this.nodeMap.get(id);
      if (node !== undefined) yield node as GraphNode<S, K>;
    }
  }

  addNode<K extends NodeKind<S>>(
    kind: K,
    data: S["nodes"][K],
    id?: NodeId,
  ): GraphNode<S, K> {
    const nodeId = id ?? this.nextId("node");
    const previous = this.nodeMap.get(nodeId);

    if (previous === undefined) {
      const node = { id: nodeId, kind, data } as GraphNode<S, K>;
      this.nodeMap.set(nodeId, node as AnyNode<S>);
      addToIndex(this.nodesByKind, kind, nodeId);
      this.changed({ type: "node:add", node: node as AnyNode<S> });
      return node;
    }

    if (previous.kind === kind && previous.data === data) {
      return previous as GraphNode<S, K>;
    }

    const node = { id: nodeId, kind, data } as GraphNode<S, K>;
    this.nodeMap.set(nodeId, node as AnyNode<S>);

    if (previous.kind !== kind) {
      removeFromIndex(this.nodesByKind, previous.kind, nodeId);
      addToIndex(this.nodesByKind, kind, nodeId);
    }

    this.changed({
      type: "node:update",
      node: node as AnyNode<S>,
      previous,
    });

    return node;
  }

  removeNode(id: NodeId): boolean {
    const node = this.nodeMap.get(id);
    if (node === undefined) return false;

    this.batch(() => {
      const incident = new Set<EdgeId>();

      for (const ids of this.outgoing.get(id)?.values() ?? []) {
        for (const edgeId of ids) incident.add(edgeId);
      }

      for (const ids of this.incoming.get(id)?.values() ?? []) {
        for (const edgeId of ids) incident.add(edgeId);
      }

      for (const edgeId of incident) this.removeEdge(edgeId);

      this.nodeMap.delete(id);
      removeFromIndex(this.nodesByKind, node.kind, id);
      this.outgoing.delete(id);
      this.incoming.delete(id);
      this.changed({ type: "node:remove", node });
    });

    return true;
  }

  hasEdge(id: EdgeId): boolean {
    return this.edgeMap.has(id);
  }

  getEdge(id: EdgeId): AnyEdge<S> | undefined {
    return this.edgeMap.get(id);
  }

  edges(): IterableIterator<AnyEdge<S>> {
    return this.edgeMap.values();
  }

  *edgesOfKind<K extends EdgeKind<S>>(
    kind: K,
  ): IterableIterator<GraphEdge<S, K>> {
    const ids = this.edgesByKind.get(kind);
    if (ids === undefined) return;
    for (const id of ids) {
      const edge = this.edgeMap.get(id);
      if (edge !== undefined) yield edge as GraphEdge<S, K>;
    }
  }

  connect<K extends EdgeKind<S>>(
    from: NodeId,
    to: NodeId,
    kind: K,
    data: S["edges"][K],
    id?: EdgeId,
  ): GraphEdge<S, K> {
    if (!this.nodeMap.has(from)) throw new Error(`Unknown node: ${from}`);
    if (!this.nodeMap.has(to)) throw new Error(`Unknown node: ${to}`);

    const edgeId = id ?? this.nextId("edge");
    const previous = this.edgeMap.get(edgeId) as GraphEdge<S, K> | undefined;

    if (previous === undefined) {
      const edge = { id: edgeId, kind, from, to, data } as GraphEdge<S, K>;
      this.edgeMap.set(edgeId, edge as AnyEdge<S>);
      this.indexEdge(edge);
      this.changed({ type: "edge:add", edge: edge as AnyEdge<S> });
      return edge;
    }

    if (
      previous.kind === kind &&
      previous.from === from &&
      previous.to === to &&
      previous.data === data
    ) {
      return previous;
    }

    const edge = { id: edgeId, kind, from, to, data } as GraphEdge<S, K>;
    this.edgeMap.set(edgeId, edge as AnyEdge<S>);

    if (
      previous.kind !== kind ||
      previous.from !== from ||
      previous.to !== to
    ) {
      this.unindexEdge(previous);
      this.indexEdge(edge);
    }

    this.changed({
      type: "edge:update",
      edge: edge as AnyEdge<S>,
      previous,
    });

    return edge;
  }

  removeEdge(id: EdgeId): boolean {
    const edge = this.edgeMap.get(id);
    if (edge === undefined) return false;

    this.edgeMap.delete(id);
    this.unindexEdge(edge);
    this.changed({ type: "edge:remove", edge });
    return true;
  }

  disconnect(from: NodeId, to: NodeId, kind?: EdgeKind<S>): number {
    const byKind = this.pairs.get(from)?.get(to);
    if (byKind === undefined) return 0;

    const ids: EdgeId[] = [];

    if (kind === undefined) {
      for (const set of byKind.values()) {
        for (const id of set) ids.push(id);
      }
    } else {
      const set = byKind.get(kind);
      if (set !== undefined) {
        for (const id of set) ids.push(id);
      }
    }

    if (ids.length === 0) return 0;

    this.batch(() => {
      for (const id of ids) this.removeEdge(id);
    });

    return ids.length;
  }

  *outgoingEdges(
    id: NodeId,
    kind?: EdgeKind<S>,
  ): IterableIterator<AnyEdge<S>> {
    yield* this.iterateAdjacency(this.outgoing, id, kind);
  }

  *incomingEdges(
    id: NodeId,
    kind?: EdgeKind<S>,
  ): IterableIterator<AnyEdge<S>> {
    yield* this.iterateAdjacency(this.incoming, id, kind);
  }

  *edgesBetween(
    from: NodeId,
    to: NodeId,
    kind?: EdgeKind<S>,
  ): IterableIterator<AnyEdge<S>> {
    const byKind = this.pairs.get(from)?.get(to);
    if (byKind === undefined) return;

    if (kind !== undefined) {
      const ids = byKind.get(kind);
      if (ids === undefined) return;
      for (const id of ids) {
        const edge = this.edgeMap.get(id);
        if (edge !== undefined) yield edge;
      }
      return;
    }

    for (const ids of byKind.values()) {
      for (const id of ids) {
        const edge = this.edgeMap.get(id);
        if (edge !== undefined) yield edge;
      }
    }
  }

  hasConnection(from: NodeId, to: NodeId, kind?: EdgeKind<S>): boolean {
    const byKind = this.pairs.get(from)?.get(to);
    if (byKind === undefined) return false;
    if (kind !== undefined) return (byKind.get(kind)?.size ?? 0) > 0;

    for (const ids of byKind.values()) {
      if (ids.size > 0) return true;
    }

    return false;
  }

  *neighbors(
    id: NodeId,
    direction: Direction = "out",
    kind?: EdgeKind<S>,
  ): IterableIterator<NodeId> {
    if (direction === "out") {
      for (const edge of this.outgoingEdges(id, kind)) yield edge.to;
      return;
    }

    if (direction === "in") {
      for (const edge of this.incomingEdges(id, kind)) yield edge.from;
      return;
    }

    const seen = new Set<NodeId>();

    for (const edge of this.outgoingEdges(id, kind)) {
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      yield edge.to;
    }

    for (const edge of this.incomingEdges(id, kind)) {
      if (seen.has(edge.from)) continue;
      seen.add(edge.from);
      yield edge.from;
    }
  }

  subscribe(listener: GraphListener<S>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  batch<T>(fn: () => T): T {
    if (this.pending !== null) return fn();

    this.pending = [];

    try {
      return fn();
    } finally {
      this.flush();
    }
  }

  clear(): void {
    if (this.nodeMap.size === 0 && this.edgeMap.size === 0) return;

    const edges = [...this.edgeMap.values()];
    const nodes = [...this.nodeMap.values()];

    this.edgeMap.clear();
    this.nodeMap.clear();
    this.nodesByKind.clear();
    this.edgesByKind.clear();
    this.outgoing.clear();
    this.incoming.clear();
    this.pairs.clear();

    this.batch(() => {
      for (const edge of edges) {
        this.changed({ type: "edge:remove", edge });
      }

      for (const node of nodes) {
        this.changed({ type: "node:remove", node });
      }
    });
  }

  private indexEdge(edge: AnyEdge<S>): void {
    addToIndex(this.edgesByKind, edge.kind, edge.id);
    addToAdjacency(this.outgoing, edge.from, edge.kind, edge.id);
    addToAdjacency(this.incoming, edge.to, edge.kind, edge.id);
    addToPairs(this.pairs, edge);
  }

  private unindexEdge(edge: AnyEdge<S>): void {
    removeFromIndex(this.edgesByKind, edge.kind, edge.id);
    removeFromAdjacency(this.outgoing, edge.from, edge.kind, edge.id);
    removeFromAdjacency(this.incoming, edge.to, edge.kind, edge.id);
    removeFromPairs(this.pairs, edge);
  }

  private *iterateAdjacency(
    index: AdjacencyIndex,
    id: NodeId,
    kind: string | undefined,
  ): IterableIterator<AnyEdge<S>> {
    const byKind = index.get(id);
    if (byKind === undefined) return;

    if (kind !== undefined) {
      const ids = byKind.get(kind);
      if (ids === undefined) return;
      for (const edgeId of ids) {
        const edge = this.edgeMap.get(edgeId);
        if (edge !== undefined) yield edge;
      }
      return;
    }

    for (const ids of byKind.values()) {
      for (const edgeId of ids) {
        const edge = this.edgeMap.get(edgeId);
        if (edge !== undefined) yield edge;
      }
    }
  }

  private nextId(prefix: "node" | "edge"): string {
    let id = this.createId(prefix);

    while (this.nodeMap.has(id) || this.edgeMap.has(id)) {
      id = this.createId(prefix);
    }

    return id;
  }

  private changed(change: GraphChange<S>): void {
    if (this.pending !== null) {
      this.pending.push(change);
      return;
    }

    this.pending = [change];
    this.flush();
  }

  private flush(): void {
    const changes = this.pending;
    this.pending = null;

    if (changes === null || changes.length === 0) return;

    const transaction: GraphTransaction<S> = {
      version: ++this.revision,
      changes,
    };

    for (const listener of this.listeners) listener(transaction);
  }
}

export { GraphStore as Store };