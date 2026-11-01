import { mkdirSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type PluginOption } from "vite";

import { createServer } from "./lib/adapt/server/index.ts";
import { sqliteStorage } from "./lib/adapt/storage/sqlite/index.ts";
import { catalog } from "./lib/adapt/catalog/index.ts";
import { filesystemAssets } from "./lib/adapt/assets/filesystem/index.ts";
import { sqliteDataStore } from "./lib/adapt/store.ts";

const adapt = fileURLToPath(new URL("./lib/adapt/", import.meta.url));
const adaptCanvas = fileURLToPath(
  new URL("./lib/adapt-canvas/", import.meta.url),
);
const dataDirectory = fileURLToPath(new URL("./.data/", import.meta.url));
const databaseFile = fileURLToPath(
  new URL("./.data/adapt.sqlite", import.meta.url),
);
const assetDirectory = fileURLToPath(
  new URL("./.data/assets/", import.meta.url),
);

export default defineConfig(() => {
  return {
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
          find: /^\$adapt\/catalog$/,
          replacement: `${adapt}catalog/index.ts`,
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
  };
});

function viteAdaptApiPlugin(): PluginOption {
  return {
    name: "adapt-api",
    configureServer(server) {
      mkdirSync(dataDirectory, { recursive: true });

      const report = (error: unknown) => {
        console.error(
          "Adapt server:",
          error instanceof Error ? error.message : error,
        );
      };

      const assets = filesystemAssets({ directory: assetDirectory });
      const dataStore = sqliteDataStore({ filename: databaseFile });

      const api = createServer({
        types: catalog,
        storage: sqliteStorage({ filename: databaseFile }),
        assets,
        operations: dataStore,
        scope: () => "personal",
        onError: report,
      });

      server.middlewares.use("/api/adapt/assets", (req, res, next) => {
        res.on("error", () => undefined);
        req.on("error", () => undefined);

        try {
          if (req.method !== "GET") {
            res.writeHead(405, { Allow: "GET" });
            res.end();
            return;
          }

          const id = (req.url ?? "").replace(/^\/+/, "").split(/[/?]/)[0] ??
            "";
          const asset = assets.get(id);

          if (!asset) {
            res.writeHead(404, { "Cache-Control": "no-store" });
            res.end();
            return;
          }

          res.writeHead(200, {
            "Content-Type": asset.mimeType,
            "Content-Length": String(asset.bytes.byteLength),
            "Cache-Control": "public, max-age=31536000, immutable",
          });
          res.end(Buffer.from(asset.bytes));
        } catch (error) {
          next(error);
        }
      });

      server.middlewares.use("/api/adapt", async (req, res, next) => {
        res.on("error", () => undefined);
        req.on("error", () => undefined);

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

      server.httpServer?.once("close", () => {
        void api.close();
      });
    },
  };
}
