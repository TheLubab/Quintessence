import type { Patch } from "../protocol/ops";
import type { KindName, PropValue } from "../protocol/schema";
import type { Runtime } from "../engine/runtime";

export type RenderEvent = { type: "click" | "submit"; id: string };

const TAGS: Record<KindName, keyof HTMLElementTagNameMap> = {
  card: "section",
  group: "div",
  text: "p",
  button: "button",
  input: "input",
  image: "img",
};

const PREFIX = "data-p-";

type Props = Record<string, PropValue>;

function render(el: HTMLElement, kind: KindName, props: Props): void {
  const keep = new Set(Object.keys(props).map((key) => `${PREFIX}${key}`));
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith(PREFIX) && !keep.has(attr.name)) {
      el.removeAttribute(attr.name);
    }
  }
  for (const [key, value] of Object.entries(props)) {
    el.setAttribute(`${PREFIX}${key}`, String(value));
  }

  switch (kind) {
    case "text":
      el.textContent = props.content === undefined ? "" : String(props.content);
      break;
    case "button":
      el.textContent = props.label === undefined ? "" : String(props.label);
      break;
    case "input":
      (el as HTMLInputElement).placeholder =
        props.placeholder === undefined ? "" : String(props.placeholder);
      break;
    case "image": {
      const img = el as HTMLImageElement;
      if (props.src === undefined) img.removeAttribute("src");
      else img.src = String(props.src);
      if (props.alt === undefined) img.removeAttribute("alt");
      else img.alt = String(props.alt);
      break;
    }
    case "card":
    case "group":
      break;
  }
}

function elKind(el: HTMLElement): KindName {
  return el.dataset.kind as KindName;
}

export class DomRenderer {
  private readonly els = new Map<string, HTMLElement>();
  private readonly props = new Map<string, Props>();
  private readonly draftCreates = new Set<string>();
  private readonly draftRestore = new Map<string, Props>();
  private readonly off: () => void;
  private readonly root: HTMLElement;
  private readonly runtime: Runtime;
  private readonly onEvent: (event: RenderEvent) => void;
  private queue: Patch[] = [];
  private frame = 0;

  constructor(
    root: HTMLElement,
    runtime: Runtime,
    onEvent: (event: RenderEvent) => void,
  ) {
    this.root = root;
    this.runtime = runtime;
    this.onEvent = onEvent;
    this.off = runtime.subscribe((patch) => this.enqueue(patch));
    root.addEventListener("click", this.handleClick);
    root.addEventListener("input", this.handleInput);
    root.addEventListener("keydown", this.handleKeydown);
  }

  destroy(): void {
    this.off();
    this.root.removeEventListener("click", this.handleClick);
    this.root.removeEventListener("input", this.handleInput);
    this.root.removeEventListener("keydown", this.handleKeydown);
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.queue = [];
    this.els.clear();
    this.props.clear();
    this.draftCreates.clear();
    this.draftRestore.clear();
  }

  private enqueue(patch: Patch): void {
    this.queue.push(patch);
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const batch = this.queue;
      this.queue = [];
      for (const item of batch) this.apply(item);
    });
  }

  private apply(patch: Patch): void {
    switch (patch.t) {
      case "create": {
        this.removeOne(patch.id);
        const el = document.createElement(TAGS[patch.kind]);
        el.dataset.nid = patch.id;
        el.dataset.kind = patch.kind;
        const props = { ...patch.props };
        this.els.set(patch.id, el);
        this.props.set(patch.id, props);
        render(el, patch.kind, props);
        if (patch.kind === "input" && props.value !== undefined) {
          (el as HTMLInputElement).value = String(props.value);
        }
        this.insert(el, patch.parent, patch.index);
        if (patch.draft) {
          this.draftCreates.add(patch.id);
          el.classList.add("alive-draft");
        }
        return;
      }
      case "update": {
        const el = this.els.get(patch.id);
        if (!el) return;
        const kind = elKind(el);
        const current = this.props.get(patch.id) ?? {};
        if (patch.draft && !this.draftCreates.has(patch.id)) {
          if (!this.draftRestore.has(patch.id)) {
            this.draftRestore.set(patch.id, { ...current });
          }
          el.classList.add("alive-draft");
        }

        const next = { ...current };
        for (const [key, value] of Object.entries(patch.props)) {
          next[key] = value;
        }
        for (const key of patch.removed) delete next[key];
        this.props.set(patch.id, next);
        render(el, kind, next);

        if (kind === "input") {
          const input = el as HTMLInputElement;
          if ("value" in patch.props) input.value = String(patch.props.value);
          else if (patch.removed.includes("value")) input.value = "";
        }
        return;
      }
      case "move": {
        const el = this.els.get(patch.id);
        if (!el) return;
        el.remove();
        this.insert(el, patch.parent, patch.index);
        return;
      }
      case "remove":
        for (const id of patch.removed) this.removeOne(id);
        return;
      case "rule":
        return;
      case "draft_remove": {
        if (this.draftCreates.delete(patch.id)) {
          this.removeOne(patch.id);
          return;
        }
        const before = this.draftRestore.get(patch.id);
        if (!before) return;
        const el = this.els.get(patch.id);
        this.draftRestore.delete(patch.id);
        this.props.set(patch.id, before);
        if (el) {
          render(el, elKind(el), before);
          el.classList.remove("alive-draft");
        }
        return;
      }
    }
  }

  private insert(el: HTMLElement, parent: string | null, index: number): void {
    const container = parent === null ? this.root : this.els.get(parent);
    if (!container) return;
    const at = container.children[index] ?? null;
    container.insertBefore(el, at);
  }

  private removeOne(id: string): void {
    const el = this.els.get(id);
    if (!el) return;
    el.remove();
    this.els.delete(id);
    this.props.delete(id);
    this.draftCreates.delete(id);
    this.draftRestore.delete(id);
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const el = (event.target as Element | null)?.closest<HTMLElement>(
      "[data-nid]",
    );
    if (!el || !this.root.contains(el)) return;
    const id = el.dataset.nid;
    if (!id) return;
    if (!this.runtime.fire(id, "click")) return;
    this.onEvent({ type: "click", id });
  };

  private readonly handleInput = (event: Event): void => {
    const el = (event.target as Element | null)?.closest<HTMLElement>(
      "[data-nid]",
    );
    if (!el || el.dataset.kind !== "input") return;
    const id = el.dataset.nid;
    if (!id) return;
    this.runtime.setInput(id, (el as HTMLInputElement).value);
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" || event.isComposing) return;
    const el = (event.target as Element | null)?.closest<HTMLElement>(
      "[data-nid]",
    );
    if (!el || el.dataset.kind !== "input") return;
    const id = el.dataset.nid;
    if (!id) return;
    if (!this.runtime.fire(id, "submit")) return;
    event.preventDefault();
    this.onEvent({ type: "submit", id });
  };
}
