import { Runtime } from "./v0/engine/runtime";
import { Log } from "./v0/engine/log";
import { Splitter } from "./v0/parser/splitter";
import type { Statement } from "./v0/parser/splitter";
import { parse } from "./v0/parser/parse";
import { DomRenderer } from "./v0/render/dom";
import type { RenderEvent } from "./v0/render/dom";
import "./style.css";

const DEFAULT = `+card demo layer=main title="Playground"
+text demo.title in=demo attention=3 content="Alive playground"
+group demo.form in=demo layout=stack
+text demo.blurb in=demo.form content="Each run executes the script once."
+input demo.query in=demo.form placeholder="Try typing here"
+button demo.go in=demo.form label="Fire click"
+group demo.extra in=demo layout=row
+text demo.note in=demo.extra content=<<END
Heredoc bodies stream in as drafts.
The final text commits when END arrives.
END
+on demo.go click -> prompt "Do something useful"
+on demo.query submit -> prompt "Use the submitted query"`;

const source = document.getElementById("source") as HTMLTextAreaElement;
const runButton = document.getElementById("run") as HTMLButtonElement;
const preview = document.getElementById("preview") as HTMLElement;
const log = document.getElementById("log") as HTMLElement;

source.value = DEFAULT;

const write = (text: string): void => {
  log.textContent += `${text}\n`;
};

const onEvent = (event: RenderEvent): void => {
  write(`EVENT ${event.type} ${event.id}`);
};

const make = () => {
  const runtime = new Runtime(new Log({ persist: false }));
  const renderer = new DomRenderer(preview, runtime, onEvent);
  return { runtime, renderer };
};

let current = make();

const stmtText = (stmt: Statement): string => {
  if (stmt.body === undefined) return stmt.head;
  const tag = /<<([A-Z_]+)\s*$/.exec(stmt.head)?.[1];
  return tag
    ? `${stmt.head}\n${stmt.body}\n${tag}`
    : `${stmt.head}\n${stmt.body}`;
};

let running = false;

async function run(): Promise<void> {
  if (running) return;
  running = true;
  runButton.disabled = true;

  try {
    current.renderer.destroy();
    preview.replaceChildren();
    log.textContent = "";

    const next = make();
    current = next;
    const { runtime } = next;
    runtime.beginTurn();

    const splitter = new Splitter((event) => {
      if (event.type === "preview") {
        const parsed = parse(event.stmt);
        if (
          parsed.ok &&
          (parsed.op.t === "create" || parsed.op.t === "update")
        ) {
          runtime.preview(parsed.op);
        }
        return;
      }

      if (event.type === "discard") {
        write(`ERROR ${event.head} :: ${event.reason}`);
        return;
      }

      const line = stmtText(event.stmt);
      const parsed = parse(event.stmt);
      if (!parsed.ok) {
        write(`ERROR ${line} :: ${parsed.reason}`);
        return;
      }

      const result = runtime.submit(parsed.op);
      if (!result.ok) {
        write(`ERROR ${line} :: ${result.reason}`);
        return;
      }
      for (const issue of result.issues) write(`WARN ${line} :: ${issue}`);
    });

    const text = source.value;
    const size = 16;
    for (let i = 0; i < text.length; i += size) {
      splitter.push(text.slice(i, i + size));
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
    splitter.end();
    runtime.endTurn();
  } finally {
    running = false;
    runButton.disabled = false;
  }
}

runButton.addEventListener("click", () => {
  void run();
});

source.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    void run();
  }
});