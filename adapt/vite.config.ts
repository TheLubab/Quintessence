import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      $adapt: fileURLToPath(new URL("./lib/adapt", import.meta.url)),
    },
  },
});