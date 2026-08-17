import { defineConfig } from "vite";

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  // Relative assets keep the static build deployable under a GitHub Pages subpath.
  base: "./",
  // SharedArrayBuffer requires cross-origin isolation. Enable it for local dev
  // and preview; static hosts without configurable headers use the message fallback.
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
});
