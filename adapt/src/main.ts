import type { Scene } from "$adapt/core";
import { createRoot } from "../lib/adapt/canvas";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

const root = createRoot(canvas);

const scene: Scene = [
  {
    type: "rect",
    props: {
      x: 10,
      y: 20,
      height: 400,
      width: 550,
    },
  },
];

root.render(scene);
