//@ts-nocheck
import { createSpace } from "adapt";
import { image, collection } from "adapt/things";
import { canvasView } from "adapt-canvas";

// Application capabilities — ordinary functions, outside Adapt.
import { suggestEdits, warmImage } from "./image-tools";

const space = createSpace({
  types: [image, collection],
});

// 1. Things are data with stable identities.

const trip = space.add({
  type: "collection",
  data: { title: "Summer trip" },
});

const photo = space.add({
  type: "image",
  data: {
    title: "Evening at the lake",
    src: "/photos/lake.jpg",
  },
  parent: trip,
  actions: [],
});

// 2. Register what an operation actually does.

space.registerAction("image.warm", {
  accepts: ["image"],

  async run({ target, signal }) {
    const src = await warmImage(target.data.src, { signal });

    // Produce another thing. The source remains available.
    return space.add({
      type: "image",
      data: {
        title: "Warmer evening",
        src,
      },
      parent: target.parent,
      actions: [],
    });
  },
});

// 3. Background code can discover and attach possibilities.

async function discoverActions(id: string) {
  const thing = space.get(id);

  // Could use an LLM, local analysis, or predefined rules.
  const suggestions = await suggestEdits(thing);

  // Suggestions reference registered operations.
  // e.g. [{ id: "image.warm", label: "Warm the evening light" }]
  space.update(id, { actions: suggestions });
}

void discoverActions(photo);

// 4. Attention belongs to a session using the workspace.

const session = space.session();

session.focus(photo);

// A user interface can invoke an available action.
const operation = session.invoke(photo, "image.warm");

// 5. Connect a presentation.

canvasView({
  session,
  canvas: document.querySelector("#canvas")!,
});

// 6. Mutations

space.add({ type: "image", data: { src: "/new.jpg" } });

space.update(photo, {
  data: {
    title: "A better title",
    src: "/photos/lake.jpg",
  },
});

space.move(photo, { parent: null }); // Move to workspace root.

space.remove(photo);
