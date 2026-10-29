import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const adapt = fileURLToPath(new URL("./lib/adapt/", import.meta.url));
const adaptCanvas = fileURLToPath(
  new URL("./lib/adapt-canvas/", import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^\$adapt$/,
        replacement: `${adapt}index.ts`,
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
});