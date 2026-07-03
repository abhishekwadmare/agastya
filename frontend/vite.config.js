import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes the build use relative asset paths, so it works
// whether the site is served at the root of a custom domain or at
// https://<username>.github.io/<repo-name>/
export default defineConfig({
  plugins: [react()],
  base: "./",
});
