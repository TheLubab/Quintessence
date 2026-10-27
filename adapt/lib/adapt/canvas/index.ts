import { Adapt, type Scene } from "$adapt/core";

export type CanvasRoot = {
  render(scene: Scene): void;
};

export function createRoot(canvas: HTMLCanvasElement): CanvasRoot {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to get CanvasRenderingContext2D");
  }

  let currentScene: Scene = null;

  function drawNode(scene: Scene): void {
    if (scene == null || typeof scene === "boolean") return;

    if (!Adapt.isValidScene(scene)) return;

    for (const node of scene) {
      const { type, props } = node;
      ctx.save();
      try {
        switch (type) {
          case "group":
            ctx.translate(props.x ?? 0, props.y ?? 0);
            drawNode(props.children);
            break;

          case "rect":
            ctx.fillStyle = props.fill ?? "black";
            ctx.fillRect(
              props.x ?? 0,
              props.y ?? 0,
              props.width ?? 0,
              props.height ?? 0,
            );
            break;

          case "circle":
            ctx.beginPath();
            ctx.arc(
              props.x ?? 0,
              props.y ?? 0,
              props.radius ?? 0,
              0,
              Math.PI * 2,
            );
            ctx.fillStyle = props.fill ?? "black";
            ctx.fill();
            break;
        }
      } finally {
        ctx.restore();
      }
    }
  }

  function redraw() {
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawNode(currentScene);
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);

    redraw();
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  return {
    render(scene: Scene) {
      currentScene = scene;
      redraw();
    },
  };
}
