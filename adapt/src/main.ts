import {
  createSpace,
  node,
  canvasRenderer,
  text,
  image,
  group,
  cluster,
  orbit,
  createActionRegistry,
} from "./test";
import type { Node } from "./test";

const canvas = document.querySelector<HTMLCanvasElement>("#app-canvas");

if (!canvas) throw new Error("Canvas not found");

const actions = createActionRegistry();

const labelOf = (target: Node) => {
  const data = target.props.data;
  if (data && typeof data === "object")
    return data.label ?? data.name ?? target.props.id;
  if (typeof data === "string" && !/^https?:/.test(data)) return data;
  return target.props.id;
};

actions.register("flag", ({ targets }) => {
  alert(`Flagged: ${labelOf(targets[0])}`);
});

const space = createSpace(canvasRenderer(canvas), {
  budget: 12,
  layout: cluster({ gap: 18 }),
  actions,
});

actions.register("share", ({ targets }) => {
  return navigator.share({ url: targets[0].props.data });
});

space.render([
  node(image, {
    id: "sunset",
    data: "https://th.wallhaven.cc/small/k8/k82d26.jpg",
    actions: [{ id: "share", label: "Share" }],
  }),

  node(
    group,
    {
      id: "trip",
      data: { label: "Summer trip" },
      layout: orbit(),
      actions: [{ id: "flag", label: "Flag" }],
    },
    [
      node(image, {
        id: "coast",
        data: "https://th.wallhaven.cc/lg/gw/gw1rqe.jpg",
      }),

      node(text, {
        id: "plans",
        data: "Take the slow train. Stay for the sunset.",
      }),
    ],
  ),
]);
