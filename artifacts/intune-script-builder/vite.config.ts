import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const DEFAULT_PRODUCTION_BASE_PATH = "/MikkelsenBrenno.Powershell.Github.io/";

export default defineConfig(async ({ command }) => {
  const isServe = command === "serve";

  let port: number | undefined;
  if (isServe) {
    const rawPort = process.env.PORT;
    if (!rawPort) {
      throw new Error(
        "PORT environment variable is required for the dev/preview server but was not provided.",
      );
    }
    const parsed = Number(rawPort);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error(`Invalid PORT value: "${rawPort}"`);
    }
    port = parsed;
  }

  let basePath = process.env.BASE_PATH;
  if (!basePath) {
    if (isServe) {
      throw new Error(
        "BASE_PATH environment variable is required for the dev/preview server but was not provided.",
      );
    }
    basePath = DEFAULT_PRODUCTION_BASE_PATH;
  }

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(
          import.meta.dirname,
          "..",
          "..",
          "attached_assets",
        ),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: isServe
      ? {
          port: port!,
          strictPort: true,
          host: "0.0.0.0",
          allowedHosts: true,
          fs: {
            strict: true,
          },
        }
      : undefined,
    preview: isServe
      ? {
          port: port!,
          host: "0.0.0.0",
          allowedHosts: true,
        }
      : undefined,
  };
});
