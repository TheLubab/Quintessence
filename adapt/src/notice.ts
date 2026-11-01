export function createNotice() {
  const node = document.createElement("div");
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  node.style.cssText = [
    "position:fixed",
    "right:18px",
    "bottom:18px",
    "z-index:40",
    "max-width:min(360px,calc(100vw - 36px))",
    "padding:11px 14px 11px 32px",
    "border-radius:14px",
    "border:1px solid rgba(255,255,255,.55)",
    "background:rgba(252,253,255,.9)",
    "box-shadow:0 10px 30px rgba(16,33,55,.16)",
    "color:#3f506e",
    "font:12px/1.45 system-ui,-apple-system,sans-serif",
    "display:none",
  ].join(";");

  const dot = document.createElement("span");
  dot.style.cssText = [
    "position:absolute",
    "left:13px",
    "top:15px",
    "width:7px",
    "height:7px",
    "border-radius:50%",
    "background:#c08a3e",
  ].join(";");

  const text = document.createElement("span");
  node.append(dot, text);
  document.body.append(node);

  let current: string | null = null;

  return {
    set(message: string | null): void {
      if (!message) {
        current = null;
        node.style.display = "none";
        text.textContent = "";
        return;
      }

      current = message;
      text.textContent = message;
      node.style.display = "block";
    },

    get(): string | null {
      return current;
    },

    destroy(): void {
      node.remove();
    },
  };
}