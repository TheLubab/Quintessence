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
        find: /^\$adapt-canvas$/,
        replacement: `${adaptCanvas}index.ts`,
      },
      {
        find: /^\$adapt-canvas\//,
        replacement: adaptCanvas,
      },
      {
        find: /^\$adapt\/core$/,
        replacement: `${adapt}core/index.ts`,
      },
      {
        find: /^\$adapt\/kinds$/,
        replacement: `${adapt}kinds/index.ts`,
      },
      {
        find: /^\$adapt\/layouts$/,
        replacement: `${adapt}layouts/index.ts`,
      },
      {
        find: /^\$adapt\//,
        replacement: adapt,
      },
    ],
  },
});