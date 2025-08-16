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
    // Increase chunk size warning limit from 500kB to 1MB
    // Note: This suppresses warnings but doesn't fix performance
    chunkSizeWarningLimit: 1000,
    // Include WASM files as assets
    assetsInclude: ["**/*.wasm"],
    // Ensure all assets use relative paths
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        manualChunks: (id) => {
          // Core React ecosystem - keep together to avoid context issues
          if (id.includes('react') || id.includes('react-dom') || 
              id.includes('@radix-ui') || id.includes('@tanstack/react-router')) {
            return 'vendor-react';
          }

          // UI utilities and styling libraries (non-React dependent)
          if (id.includes('lucide-react') || 
              id.includes('class-variance-authority') ||
              id.includes('clsx') || id.includes('tailwind-merge')) {
            return 'vendor-ui';
          }

          // Video/Media processing kept in main bundle to avoid dependency issues
          // if (id.includes('@ffmpeg') || id.includes('ffmpeg')) {
          //   return 'video-processing';
          // }

          // AI Features kept in main bundle to avoid dependency issues
          // if (id.includes('fal-ai-client') || id.includes('text2image-store') ||
          //     id.includes('/ai.tsx') || id.includes('ai-client')) {
          //   return 'ai-features';
          // }

          // Export functionality kept in main bundle to avoid React component issues
          // if (id.includes('export-engine') || id.includes('export-dialog') ||
          //     id.includes('/lib/export-')) {
          //   return 'export-engine';
          // }

          // Media processing utilities kept in main bundle to avoid dependency issues
          // if (id.includes('media-processing') || id.includes('image-utils') ||
          //     id.includes('media-store-loader')) {
          //   return 'media-processing';
          // }

          // Stickers stores kept in main bundle to avoid dependency issues
          // if (id.includes('stickers-store') || id.includes('stickers-overlay-store')) {
          //   return 'stickers';
          // }

          // Sounds functionality kept in main bundle to avoid dependency issues
          // if (id.includes('sounds-store') || id.includes('sound-search') ||
          //     id.includes('/sounds/')) {
          //   return 'sounds';
          // }

          // Editor core stores kept in main bundle to avoid dependency issues
          // if (id.includes('timeline-store') || id.includes('playback-store') ||
          //     id.includes('project-store') || id.includes('editor-store') ||
          //     id.includes('panel-store')) {
          //   return 'editor-core';
          // }

          // Form and validation libraries
          if (id.includes('react-hook-form') || id.includes('zod') ||
              id.includes('@hookform')) {
            return 'vendor-forms';
          }

          // Charts and data visualization
          if (id.includes('recharts') || id.includes('embla-carousel')) {
            return 'vendor-charts';
          }

          // Motion and animation libraries
          if (id.includes('framer-motion') || id.includes('motion') || 
              id.includes('@hello-pangea/dnd')) {
            return 'vendor-motion';
          }

          // Markdown processing libraries
          if (id.includes('react-markdown') || id.includes('rehype') || 
              id.includes('unified') || id.includes('remark')) {
            return 'vendor-markdown';
          }

          // Authentication and database
          if (id.includes('better-auth') || id.includes('drizzle') ||
              id.includes('@opencut/auth') || id.includes('@opencut/db')) {
            return 'vendor-auth';
          }

          // Everything else stays in main chunk
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
