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

type Wallpaper = {
  id: string;
  path: string;
  url: string;
  resolution: string;
  thumbs: {
    large: string;
  };
};

async function fetchWallpapers(
  query: string,
  categories = "100",
  limit = 12,
): Promise<Wallpaper[]> {
  const params = new URLSearchParams({
    q: query,
    categories,
    purity: "100",
    sorting: "random",
    atleast: "1920x1080",
  });

  const response = await fetch(`/wallhaven/api/v1/search?${params}`);

  if (!response.ok) {
    throw new Error(`Wallhaven API error: ${response.status}`);
  }

  const result: { data: Wallpaper[] } = await response.json();
  return result.data.slice(0, limit);
}

const roots = await space.list({ parent: null, limit: 1 });

if (roots.items.length === 0) {
  const gallery = await space.add({
    type: "collection",
    data: { title: "Wallhaven" },
  });

  const collections = [
    { title: "Nature", query: "nature", categories: "100" },
    { title: "Architecture", query: "architecture", categories: "100" },
    { title: "Anime", query: "anime", categories: "010" },
    { title: "Abstract", query: "abstract", categories: "100" },
  ];

  for (const config of collections) {
    const collection = await space.add({
      type: "collection",
      parent: gallery,
      data: { title: config.title },
    });

    try {
      const wallpapers = await fetchWallpapers(config.query, config.categories);

      for (const wallpaper of wallpapers) {
        await space.add({
          type: "image",
          parent: collection,
          data: {
            title: `${config.title} · ${wallpaper.id}`,
            src: wallpaper.path,
            assetId: wallpaper.id,
          },
          actions: [
            {
              id: "image.similar",
              label: "View Similar",
              description: "Find visually similar wallpapers",
            },
          ],
        });
      }
    } catch (error) {
      throw new Error(`Failed to load ${config.title}: ${error}`);
    }
  }
}

const session = createSession(space, {
  types: [{ name: "image" }, { name: "collection", contains: true }],
});

const view = canvasView({ canvas, session });

await session.refresh();

// Cleanup:
// view.destroy();
// session.destroy();
// adapt.close();
