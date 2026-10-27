import { GraphStore } from "$adapt/models/store";
import type { GraphEdge, GraphNode } from "$adapt/models/store";

type AppSchema = {
  nodes: {
    board: { title: string };
    card: { title: string; done: boolean };
    label: { name: string; color: string };
  };
  edges: {
    contains: { position: number };
    labeled: undefined;
    dependsOn: { reason: string };
  };
};

const store = new GraphStore<AppSchema>();

const board = store.addNode("board", { title: "Launch" }, "board:launch");
const docs = store.addNode(
  "card",
  { title: "Write docs", done: false },
  "card:docs",
);
const ship = store.addNode(
  "card",
  { title: "Ship", done: false },
  "card:ship",
);
const urgent = store.addNode("label", {
  name: "urgent",
  color: "#e11d48",
});

store.connect(board.id, docs.id, "contains", { position: 0 });
store.connect(board.id, ship.id, "contains", { position: 1 });
store.connect(docs.id, ship.id, "dependsOn", { reason: "docs land first" });
store.connect(urgent.id, docs.id, "labeled", undefined);

const cards: GraphNode<AppSchema, "card">[] = [...store.nodesOfKind("card")];
const contains: GraphEdge<AppSchema, "contains">[] = [
  ...store.edgesOfKind("contains"),
];

for (const card of cards) {
  const labels = [...store.neighbors(card.id, "in", "labeled")];
  console.log(card.id, card.data.title, labels);
}

for (const edge of contains) {
  console.log(edge.from, "->", edge.to, edge.data.position);
}

if (store.hasConnection(board.id, docs.id, "contains")) {
  const [link] = [...store.edgesBetween(board.id, docs.id, "contains")];
  console.log(link?.id);
}

const stop = store.subscribe(({ version, changes }) => {
  console.log("version", version, changes.map((change) => change.type));
});

store.batch(() => {
  store.addNode("card", { title: "Review", done: false }, "card:review");
  store.connect(board.id, "card:review", "contains", { position: 2 });
  store.addNode("card", { title: "Ship", done: true }, "card:ship");
});

stop();

store.removeNode(docs.id);
console.log(store.nodeCount, store.edgeCount);

export { store };