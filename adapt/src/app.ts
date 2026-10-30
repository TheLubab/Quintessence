import { createSession, type ActionDescriptor } from "$adapt";
import { connect } from "$adapt/client";
import { canvasView } from "$adapt-canvas";

import { proxyUrl } from "./proxy";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
if (!canvas) throw new Error("Missing #canvas");

const adapt = connect({ endpoint: "/api/adapt" });

const existing = (await adapt.spaces.list({ limit: 1 })).items[0];

const space = existing
  ? await adapt.spaces.open(existing.id)
  : await adapt.spaces.create({ title: "Gallery" });

const categoryConfigs = [
  { name: "Nature", query: "nature", categories: "100" },
  { name: "Architecture", query: "architecture", categories: "100" },
  { name: "Anime", query: "anime", categories: "010" },
  { name: "Abstract", query: "abstract", categories: "100" },
] as const;

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

const categories = new Map<string, string>();

for (const { name } of categoryConfigs) {
  const id =
    (await findCollection(galleryId, name)) ??
    (await space.add({
      type: "collection",
      parent: galleryId,
      data: { title: name },
    }));

  categories.set(name, id);
}

const session = createSession(space, {
  types: [{ name: "image" }, { name: "collection", contains: true }],
});

type Wallpaper = { id: string; path: string };

const seedLimit = 6;

async function seedCategory(
  category: (typeof categoryConfigs)[number],
  categoryId: string,
): Promise<void> {
  let after: string | undefined;

  do {
    const page = await space.list({
      parent: categoryId,
      limit: 200,
      ...(after === undefined ? {} : { after }),
    });

    if (page.items.some((thing) => thing.type === "image")) return;

    after = page.next ?? undefined;
  } while (after !== undefined);

  const params = new URLSearchParams({
    q: category.query,
    categories: category.categories,
    purity: "100",
    sorting: "random",
    atleast: "1920x1080",
  });

  const response = await fetch(
    proxyUrl(`https://wallhaven.cc/api/v1/search?${params}`),
  );

  if (!response.ok)
    throw new Error(`Wallhaven returned an error (${response.status}).`);

  const payload = (await response.json()) as { data?: Wallpaper[] };

  const wallpapers = (payload.data ?? [])
    .filter(
      (wallpaper) =>
        wallpaper !== null &&
        typeof wallpaper === "object" &&
        typeof wallpaper.id === "string" &&
        typeof wallpaper.path === "string",
    )
    .slice(0, seedLimit);

  for (const wallpaper of wallpapers) {
    await space.add({
      type: "image",
      parent: categoryId,
      data: {
        title: `${category.name} · ${wallpaper.id}`,
        src: wallpaper.path,
        assetId: wallpaper.id,
      },
    });
  }
}

const actionSource = "wallhaven-app";
let previousFocus: string | null = null;

function updateActions(): void {
  const { focus } = session.snapshot();
  const nextFocus = focus?.id ?? null;

  if (nextFocus === previousFocus) return;

  const oldFocus = previousFocus;
  previousFocus = nextFocus;

  // Set navigation state before notifying through actions.replace().
  if (oldFocus !== null) {
    session.actions.replace(oldFocus, actionSource, []);
  }

  if (!focus) return;

  const actions: ActionDescriptor[] = [];

  if (focus.type === "image") {
    actions.push({
      id: "duplicate",
      label: "Duplicate image",
      description: "Create another copy in this collection.",
      category: "management",
      capability: "image.duplicate",
      targets: [focus.id],
    });
  }

  actions.push({
    id: "delete",
    label: focus.type === "collection" ? "Delete collection" : "Delete image",
    description: "Remove this thing from the space.",
    category: "management",
    capability: "thing.delete",
    targets: [focus.id],
  });

  session.actions.replace(focus.id, actionSource, actions);
}

const unsubscribeActions = session.subscribe(updateActions);
const view = canvasView({ canvas, session });

const seeded = await Promise.allSettled(
  categoryConfigs.map((category) => {
    const categoryId = categories.get(category.name);
    if (categoryId === undefined) return Promise.resolve();

    return seedCategory(category, categoryId);
  }),
);

for (const result of seeded) {
  if (result.status === "rejected")
    console.error("Could not seed wallpapers:", result.reason);
}

await session.refresh();

// The collection is already in the client cache.
session.focus(galleryId);

// Cleanup:
// unsubscribeActions();
// view.destroy();
// session.destroy();
// adapt.close();