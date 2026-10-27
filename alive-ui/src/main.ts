import { Runtime } from "./v0/engine/runtime";
import { Session } from "./v0/model/session";
import { DomRenderer } from "./v0/render/dom";
import "./page.css";

const app = document.getElementById("app")!;
const askForm = document.getElementById("ask") as HTMLFormElement;
const askInput = document.getElementById("ask-input") as HTMLInputElement;

const runtime = new Runtime();
const session = new Session(runtime);

new DomRenderer(app, runtime, (event) => {
  void session.send({ type: event.type, id: event.id });
});

askForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = askInput.value.trim();
  if (!prompt) return;
  askInput.value = "";
  const focus = runtime.outline().at(-1)?.id;
  void session.send({
    type: "ask",
    prompt,
    ...(focus ? { focus } : {}),
  });
});

const boot = async (): Promise<void> => {
  await runtime.load();
  if (runtime.outline().length === 0) {
    await session.send({ type: "start" });
  }
  askInput.focus();
};

void boot();