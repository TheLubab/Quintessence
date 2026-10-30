import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, PluginOption } from "vite";

import { createServer } from "./lib/adapt/server/index.ts";
import { memoryStorage } from "./lib/adapt/storage/memory/index.ts";
import { image, collection } from "./lib/adapt/examples/contracts.ts";

const adapt = fileURLToPath(new URL("./lib/adapt/", import.meta.url));
const adaptCanvas = fileURLToPath(
  new URL("./lib/adapt-canvas/", import.meta.url),
);
const adaptPixijs = fileURLToPath(
  new URL("./lib/adapt-pixijs/", import.meta.url),
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
        find: /^\$adapt-pixijs$/,
        replacement: `${adaptPixijs}index.ts`,
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
  plugins: [viteAdaptApiPlugin(), viteDevProxyPlugin()],
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

      api.capability("thing.delete", {
        supports: ({ targets }) => targets.length === 1,

        async run({ space, targets }) {
          await space.remove(targets[0]!.id, { recursive: true });

          return {
            things: [],
          };
        },
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

const skippedProxyHeaders = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function viteDevProxyPlugin(): PluginOption {
  return {
    name: "dev-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__proxy", async (req, res, next) => {
        if (req.method !== "GET") {
          res.writeHead(405, { Allow: "GET" });
          res.end();
          return;
        }

        let target: URL;
        try {
          const raw = new URL(req.url ?? "", "http://localhost").searchParams;
          target = new URL(raw.get("url") ?? "");
        } catch {
          res.writeHead(400).end("Expected ?url=<absolute http(s) URL>");
          return;
        }

        if (target.protocol !== "http:" && target.protocol !== "https:") {
          res.writeHead(400).end("Only http(s) URLs are supported");
          return;
        }

        try {
          const response = await fetch(target, {
            headers: {
              ...(req.headers.accept === undefined
                ? {}
                : { accept: req.headers.accept }),
              ...(req.headers["accept-language"] === undefined
                ? {}
                : { "accept-language": req.headers["accept-language"] }),
              ...(req.headers["user-agent"] === undefined
                ? {}
                : { "user-agent": req.headers["user-agent"] }),
            },
          });

          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            if (!skippedProxyHeaders.has(key)) res.setHeader(key, value);
          });

          if (response.headers.get("content-type")?.startsWith("image/")) {
            res.setHeader("cache-control", "public, max-age=31536000, immutable");
          }

          if (response.body === null) {
            res.end();
            return;
          }

          Readable.fromWeb(
            response.body as WebReadableStream<Uint8Array>,
          ).pipe(res);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
