import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// base: "./" makes the build use relative asset paths, so it works
// whether the site is served at the root of a custom domain or at
// https://<username>.github.io/<repo-name>/
export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      assets: path.resolve(__dirname, "src/assets"),
      components: path.resolve(__dirname, "src/components"),
      context: path.resolve(__dirname, "src/context"),
      examples: path.resolve(__dirname, "src/examples"),
      layouts: path.resolve(__dirname, "src/layouts"),
      lib: path.resolve(__dirname, "src/lib"),
      routes: path.resolve(__dirname, "src/routes.jsx"),
    },
  },
});
