import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  base: "./", // Critical for Electron file:// protocol
  publicDir: "public", // Ensure public directory is properly copied
  plugins: [
    tsconfigPaths(), // Support for TypeScript path mapping
    TanStackRouterVite({
      routesDirectory: "src/routes",
      generatedRouteTree: "src/routeTree.gen.ts",
    }),
    react(),
    visualizer({
      filename: "dist/bundle-analysis.html",
      open: false, // Set to true to auto-open in browser after build
      gzipSize: true,
      brotliSize: true,
      template: "treemap", // Options: sunburst, treemap, network
    }),
  ],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    // Include WASM files as assets
    assetsInclude: ["**/*.wasm"],
    // Ensure all assets use relative paths
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        manualChunks: {
          // Core vendor libraries
          "vendor-react": ["react", "react-dom"],
          "vendor-router": ["@tanstack/react-router"],
          
          // UI component libraries
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu", 
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "lucide-react"
          ],
          
          // Media processing (heavy dependencies)
          "media-processing": [
            "@ffmpeg/ffmpeg",
            "@ffmpeg/core", 
            "@ffmpeg/util"
          ],
          
          // Editor core stores and logic
          "editor-core": [
            "./src/stores/editor-store",
            "./src/stores/timeline-store", 
            "./src/stores/playback-store",
            "./src/stores/panel-store"
          ],
          
          // Stickers feature
          "stickers": [
            "./src/stores/stickers-store",
            "./src/stores/stickers-overlay-store"
          ],
          
          // Project management
          "projects": [
            "./src/stores/project-store"
          ]
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
