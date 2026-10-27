import { Store } from "./vProto/state/store";
import { DomRenderer } from "./vProto/render/dom";
import { Session } from "./llm/session";

const store = new Store();
const session = new Session(store);

new DomRenderer(document.getElementById("app")!, store, (ev) =>
  session.send(ev),
);

session.send("@start");
