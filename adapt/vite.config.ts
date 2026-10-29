import { fileURLToPath, URL } from "node:url";
import { defineConfig, PluginOption } from "vite";

import { createServer } from "./lib/adapt/server/index.ts";
import { memoryStorage } from "./lib/adapt/storage/memory/index.ts";
import { image, collection } from "./lib/adapt/examples/contracts.ts";

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
