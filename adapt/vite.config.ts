import { fileURLToPath, URL } from "node:url";
import { defineConfig, PluginOption } from "vite";

import { createServer } from "./lib/adapt/server/index.ts";
import { memoryStorage } from "./lib/adapt/storage/memory/index.ts";
import { image, collection } from "./lib/adapt/examples/contracts.ts";
import { AdaptError } from "./lib/adapt/core/errors.ts";

const adapt = fileURLToPath(new URL("./lib/adapt/", import.meta.url));
const adaptCanvas = fileURLToPath(
  new URL("./lib/adapt-canvas/", import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^\$adapt$/,
        replacement: `${adapt}core/index.ts`,
      },
      {
        find: /^\$adapt-canvas$/,
        replacement: `${adaptCanvas}index.ts`,
      },
      {
        find: /^\$adapt\/server$/,
        replacement: `${adapt}server/index.ts`,
      },
      {
        find: /^\$adapt\/things$/,
        replacement: `${adapt}things/index.ts`,
      },
      {
        find: /^\$adapt\/storage\/sqlite$/,
        replacement: `${adapt}storage/sqlite/index.ts`,
      },
      {
        find: /^\$adapt\/assets\/filesystem$/,
        replacement: `${adapt}assets/filesystem/index.ts`,
      },
      {
        find: /^\$adapt\/client$/,
        replacement: `${adapt}client/index.ts`,
      },
    ],
  },
  plugins: [viteAdaptApiPlugin()],
  server: {
    proxy: {
      "/wallhaven": {
        target: "https://wallhaven.cc",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wallhaven/, ""),
      },
    },
  },
});

function viteAdaptApiPlugin(): PluginOption {
  return {
    name: "adapt-api",
    configureServer(server) {
      const api = createServer({
        types: [image, collection],
        storage: memoryStorage(),
        scope: () => "personal",
      });

      api.capability("image.duplicate", {
        supports: ({ targets }) =>
          targets.length === 1 && targets[0]!.type === "image",

        async run({ space, targets }) {
          const original = targets[0]!;

          const id = await space.add({
            type: original.type,
            parent: original.parent,
            data: original.data,
          });

          return {
            things: [id],
          };
        },
      });

      registerWallhaven(api);

      server.middlewares.use("/api/adapt", async (req, res, next) => {
        try {
          if (req.method !== "POST") {
            res.writeHead(405, { Allow: "POST" });
            res.end();
            return;
          }

          req.setEncoding("utf8");
          let body = "";
          for await (const chunk of req) body += chunk;

          const response = await api.handle(
            new Request("http://localhost/api/adapt", {
              method: "POST",
              headers: {
                "Content-Type": req.headers["content-type"] ?? "",
              },
              body,
            }),
          );

          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) {
          next(error);
        }
      });

      server.httpServer?.once("close", () => void api.close());
    },
  };
}

function registerWallhaven(api: ReturnType<typeof createServer>): void {
  const categoryConfigs = [
    { title: "Nature", query: "nature", categories: "100" },
    { title: "Architecture", query: "architecture", categories: "100" },
    { title: "Anime", query: "anime", categories: "010" },
    { title: "Abstract", query: "abstract", categories: "100" },
  ];

  type Wallpaper = {
    id: string;
    path: string;
  };

  type Batch = {
    loadedAt: number;
    things: string[];
  };

  const batches = new Map<string, Batch>();

  // Serialize loads and leave a gap between upstream requests.
  let queue: Promise<void> = Promise.resolve();
  let nextRequestAt = 0;

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const task = queue.then(work);

    queue = task.then(
      () => undefined,
      () => undefined,
    );

    return task;
  }

  function categoryTitle(data: unknown): string | null {
    if (
      data !== null &&
      typeof data === "object" &&
      "title" in data &&
      typeof data.title === "string"
    ) {
      return data.title;
    }

    return null;
  }

  api.capability("wallhaven.random", {
    supports: ({ targets }) => {
      const target = targets[0];

      return (
        targets.length === 1 &&
        target?.type === "collection" &&
        categoryConfigs.some(
          (config) => config.title === categoryTitle(target.data),
        )
      );
    },

    async run({ space, targets, signal }) {
      const category = targets[0]!;
      const config = categoryConfigs.find(
        (item) => item.title === categoryTitle(category.data),
      )!;

      return enqueue(async () => {
        if (signal.aborted) {
          throw new Error("Server is shutting down");
        }

        const cacheKey = JSON.stringify([space.id, category.id]);
        const cached = batches.get(cacheKey);

        // Repeated invocations reuse the last batch.
        if (cached && Date.now() - cached.loadedAt < 60_000) {
          const existing = await Promise.all(
            cached.things.map((id) => space.get(id)),
          );

          if (existing.every((thing) => thing !== undefined)) {
            return { things: [...cached.things] };
          }
        }

        const delay = Math.max(0, nextRequestAt - Date.now());

        if (delay > 0) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delay);
          });
        }

        if (signal.aborted) {
          throw new Error("Server is shutting down");
        }

        nextRequestAt = Date.now() + 2_000;

        const params = new URLSearchParams({
          q: config.query,
          categories: config.categories,
          purity: "100",
          sorting: "random",
          atleast: "1920x1080",
        });

        let response: Response;

        try {
          response = await fetch(
            `https://wallhaven.cc/api/v1/search?${params}`,
            { signal },
          );
        } catch {
          throw new AdaptError(
            "CONFLICT",
            "Could not reach Wallhaven. Please try again shortly.",
          );
        }

        if (response.status === 429) {
          // Back off globally after an upstream rate-limit response.
          nextRequestAt = Date.now() + 60_000;

          throw new AdaptError(
            "CONFLICT",
            "Wallhaven is limiting requests. Please wait a minute.",
          );
        }

        if (!response.ok) {
          throw new AdaptError(
            "CONFLICT",
            `Wallhaven returned an error (${response.status}).`,
          );
        }

        const payload = (await response.json()) as {
          data?: Wallpaper[];
        };

        if (!Array.isArray(payload.data)) {
          throw new AdaptError(
            "CONFLICT",
            "Wallhaven returned an unexpected response.",
          );
        }

        const wallpapers = payload.data
          .filter(
            (wallpaper) =>
              wallpaper !== null &&
              typeof wallpaper === "object" &&
              typeof wallpaper.id === "string" &&
              typeof wallpaper.path === "string",
          )
          .slice(0, 8);

        if (wallpapers.length === 0) {
          throw new AdaptError(
            "CONFLICT",
            "No wallpapers found for this category.",
          );
        }

        // Reuse wallpapers already present in this collection.
        const existingImages = new Map<string, string>();
        let after: string | undefined;

        do {
          const page = await space.list({
            parent: category.id,
            limit: 200,
            ...(after === undefined ? {} : { after }),
          });

          for (const thing of page.items) {
            const data = thing.data;

            if (
              thing.type === "image" &&
              data !== null &&
              typeof data === "object" &&
              "assetId" in data &&
              typeof data.assetId === "string"
            ) {
              existingImages.set(data.assetId, thing.id);
            }
          }

          after = page.next ?? undefined;
        } while (after !== undefined);

        const results = new Set<string>();

        for (const wallpaper of wallpapers) {
          let id = existingImages.get(wallpaper.id);

          if (id === undefined) {
            id = await space.add({
              type: "image",
              parent: category.id,
              data: {
                title: `${config.title} · ${wallpaper.id}`,
                src: wallpaper.path,
                assetId: wallpaper.id,
              },
            });

            existingImages.set(wallpaper.id, id);
          }

          results.add(id);
        }

        const things = [...results];

        batches.set(cacheKey, {
          loadedAt: Date.now(),
          things,
        });

        return { things };
      });
    },
  });
}
