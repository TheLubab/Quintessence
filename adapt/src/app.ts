import { createSession } from "$adapt";
import { connect } from "$adapt/client";
import { canvasView } from "$adapt-canvas";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
if (!canvas) throw new Error("Missing #canvas");

const adapt = connect({ endpoint: "/api/adapt" });

const existing = (await adapt.spaces.list({ limit: 1 })).items[0];

const space = existing
  ? await adapt.spaces.open(existing.id)
  : await adapt.spaces.create({ title: "Gallery" });

const categoryNames = ["Nature", "Architecture", "Anime", "Abstract"] as const;

// Find existing collections instead of recreating the gallery.
async function findCollection(
  parent: string | null,
  name: string,
): Promise<string | undefined> {
  let after: string | undefined;

  do {
    const page = await space.list({
      parent,
      limit: 200,
      ...(after === undefined ? {} : { after }),
    });

    const found = page.items.find((thing) => {
      const data = thing.data;

      return (
        thing.type === "collection" &&
        data !== null &&
        typeof data === "object" &&
        "title" in data &&
        data.title === name
      );
    });

    if (found) return found.id;

    after = page.next ?? undefined;
  } while (after !== undefined);

  return undefined;
}

const galleryId =
  (await findCollection(null, "Wallhaven")) ??
  (await space.add({
    type: "collection",
    data: { title: "Wallhaven" },
  }));

const categories = new Set<string>();

for (const name of categoryNames) {
  const id =
    (await findCollection(galleryId, name)) ??
    (await space.add({
      type: "collection",
      parent: galleryId,
      data: { title: name },
    }));

  categories.add(id);
}

const session = createSession(space, {
  types: [{ name: "image" }, { name: "collection", contains: true }],
});

const actionSource = "wallhaven-app";
const lastAutomaticLoad = new Map<string, number>();

let previousFocus: string | null = null;
let activeCategory: string | null = null;

function updateActions(): void {
  const { focus } = session.snapshot();
  const nextFocus = focus?.id ?? null;

  if (nextFocus === previousFocus) return;

  const oldFocus = previousFocus;
  previousFocus = nextFocus;

  // Opening an image and returning to its category counts as
  // staying in that category, so it doesn't fetch another batch.
  const nextCategory =
    focus && categories.has(focus.id)
      ? focus.id
      : focus?.parent && categories.has(focus.parent)
        ? focus.parent
        : null;

  const enteredCategory =
    focus !== null &&
    categories.has(focus.id) &&
    nextCategory !== activeCategory;

  activeCategory = nextCategory;

  // Set navigation state before notifying through actions.replace().
  if (oldFocus !== null) {
    session.actions.replace(oldFocus, actionSource, []);
  }

  if (!focus) return;

  if (categories.has(focus.id)) {
    const categoryId = focus.id;

    session.actions.replace(categoryId, actionSource, [
      {
        id: "random-wallpapers",
        label: "More random wallpapers",
        description: "Load a random batch. Requests are cached for one minute.",
        category: "exploration",
        capability: "wallhaven.random",
        targets: [categoryId],
      },
    ]);

    const lastLoad = lastAutomaticLoad.get(categoryId);
    const cooledDown =
      lastLoad === undefined || Date.now() - lastLoad >= 60_000;

    if (enteredCategory && cooledDown) {
      // Let the focus notification finish before invoking.
      queueMicrotask(() => {
        if (session.snapshot().focus?.id !== categoryId) return;

        lastAutomaticLoad.set(categoryId, Date.now());

        void session
          .invoke(categoryId, "random-wallpapers", actionSource)
          .catch((error: unknown) => {
            lastAutomaticLoad.delete(categoryId);
            console.error("Could not start wallpaper loading:", error);
          });
      });
    }

    return;
  }

  if (focus.type === "image") {
    session.actions.replace(focus.id, actionSource, [
      {
        id: "duplicate",
        label: "Duplicate image",
        description: "Create another copy in this collection.",
        category: "management",
        capability: "image.duplicate",
        targets: [focus.id],
      },
    ]);
  }
}

const unsubscribeActions = session.subscribe(updateActions);
const view = canvasView({ canvas, session });

await session.refresh();

// The collection is already in the client cache.
session.focus(galleryId);

// Cleanup:
// unsubscribeActions();
// view.destroy();
// session.destroy();
// adapt.close();
