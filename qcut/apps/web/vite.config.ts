import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  base: './', // Critical for Electron file:// protocol
  plugins: [
    tsconfigPaths(), // Support for TypeScript path mapping
    TanStackRouterVite({
      routesDirectory: 'src/routes',
      generatedRouteTree: 'src/routeTree.gen.ts',
    }),
    react()
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Ensure all assets use relative paths
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'ffmpeg': ['@ffmpeg/ffmpeg'],
          'editor': ['./src/stores/editor-store', './src/stores/timeline-store'],
          'ui-components': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
          'tanstack': ['@tanstack/react-router', '@tanstack/router-devtools']
        }
      }
    }
  },
  server: {
    port: 5173,
    host: true
  }
})