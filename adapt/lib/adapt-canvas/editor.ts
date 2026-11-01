import { beginRoundedRectPath, type Rect } from "./paint.ts";

export type EditorRequest = {
  text: string;
  label: string;
  rect: Rect;
  multiline: boolean;
  keepOnEscape?: boolean;
  onCommit: (text: string | null, submit: boolean) => void;
};

type State = EditorRequest & {
  caret: number;
  scroll: number;
};

export function createTextEditor(options: {
  ctx: CanvasRenderingContext2D;
  onChange: () => void;
}) {
  const { ctx } = options;
  let state: State | null = null;

  function open(request: EditorRequest): void {
    state = {
      ...request,
      caret: request.text.length,
      scroll: 0,
    };
    options.onChange();
  }

  function close(text: string | null, submit: boolean): void {
    const current = state;
    if (!current) return;
    state = null;
    options.onChange();
    current.onCommit(text, submit);
  }

  function wrap(text: string, width: number, size: number): string[] {
    ctx.save();
    ctx.font = `500 ${size}px system-ui, -apple-system, sans-serif`;
    const lines: string[] = [];
    let line = "";

    for (const char of text) {
      if (char === "\n") {
        lines.push(line);
        line = "";
        continue;
      }
      if (line && ctx.measureText(line + char).width > width) {
        lines.push(line);
        line = "";
      }
      line += char;
    }

    lines.push(line);
    ctx.restore();
    return lines;
  }

  function draw(time: number): void {
    const current = state;
    if (!current) return;

    const rect = current.rect;
    const size = 15;
    const pad = 12;
    const lines = wrap(current.text, Math.max(30, rect.w - pad * 2), size);
    const lineHeight = size * 1.5;
    const visible = Math.max(
      1,
      Math.floor((rect.h - pad * 2) / lineHeight),
    );

    const caretLine = (() => {
      let offset = 0;
      for (let index = 0; index < lines.length; index++) {
        offset += lines[index]!.length + 1;
        if (current.caret <= offset) return index;
      }
      return lines.length - 1;
    })();

    const maxScroll = Math.max(0, lines.length - visible);
    current.scroll = Math.max(0, Math.min(maxScroll, caretLine - visible + 2));

    ctx.save();
    beginRoundedRectPath(ctx, rect, 16);
    ctx.fillStyle = "rgba(252,253,255,.97)";
    ctx.fill();
    ctx.strokeStyle = "rgba(77,122,223,.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.clip();

    ctx.fillStyle = "rgba(90,108,145,.72)";
    ctx.font = "600 10px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(current.label.toUpperCase(), rect.x + pad, rect.y + pad + 2);

    ctx.fillStyle = "#293653";
    ctx.font = `500 ${size}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "top";

    const startY = rect.y + pad + 22;
    let row = 0;
    let caretX = rect.x + pad;
    let caretY = startY;
    let consumed = 0;

    for (let index = current.scroll; index < lines.length; index++) {
      const line = lines[index]!;
      if (row >= visible) break;
      const y = startY + row * lineHeight;

      if (current.caret >= consumed && current.caret <= consumed + line.length) {
        const prefix = line.slice(0, current.caret - consumed);
        caretX = rect.x + pad + ctx.measureText(prefix).width;
        caretY = y;
      }

      if (
        current.caret === consumed + line.length + 1 &&
        index + 1 < lines.length
      ) {
        caretX = rect.x + pad;
        caretY = y + lineHeight;
      }

      ctx.fillText(line, rect.x + pad, y);
      consumed += line.length + 1;
      row++;
    }

    if (Math.floor(time * 2) % 2 === 0) {
      ctx.fillStyle = "rgba(59,95,174,.9)";
      ctx.fillRect(caretX, caretY, 1.5, size + 3);
    }

    ctx.fillStyle = "rgba(110,125,153,.7)";
    ctx.font = "10px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      current.multiline
        ? "Enter saves · Esc cancels"
        : "Enter saves · Esc cancels",
      rect.x + pad,
      rect.y + rect.h - pad - 4,
    );

    ctx.restore();
  }

  function insert(text: string): void {
    const current = state;
    if (!current) return;
    current.text =
      current.text.slice(0, current.caret) +
      text +
      current.text.slice(current.caret);
    current.caret += text.length;
    options.onChange();
  }

  function key(event: KeyboardEvent): boolean {
    const current = state;
    if (!current) return false;

    if (event.key === "Escape") {
      event.preventDefault();
      close(
        current.keepOnEscape && current.text.trim()
          ? current.text.trim()
          : null,
        false,
      );
      return true;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (current.multiline && event.shiftKey) {
        close(current.text.trim(), true);
      } else {
        close(current.text.trim(), false);
      }
      return true;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      if (current.caret > 0) {
        current.text =
          current.text.slice(0, current.caret - 1) +
          current.text.slice(current.caret);
        current.caret--;
        options.onChange();
      }
      return true;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      if (current.caret < current.text.length) {
        current.text =
          current.text.slice(0, current.caret) +
          current.text.slice(current.caret + 1);
        options.onChange();
      }
      return true;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      current.caret = Math.max(0, current.caret - 1);
      options.onChange();
      return true;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      current.caret = Math.min(current.text.length, current.caret + 1);
      options.onChange();
      return true;
    }

    if (event.key === "Home") {
      event.preventDefault();
      current.caret = 0;
      options.onChange();
      return true;
    }

    if (event.key === "End") {
      event.preventDefault();
      current.caret = current.text.length;
      options.onChange();
      return true;
    }

    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      insert(event.key);
      return true;
    }

    return false;
  }

  return {
    get active(): boolean {
      return state !== null;
    },

    open,
    key,
    draw,

    cancel(): void {
      if (state) close(null, false);
    },
  };
}