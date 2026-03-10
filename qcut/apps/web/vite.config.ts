import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const buildTarget = env.VITE_BUILD_TARGET ?? "electron";
	const isWebBuild = buildTarget === "web";

	return {
		base: isWebBuild ? "/" : "./", // "/" for web hosting, "./" for Electron file://
		publicDir: "public", // Ensure public directory is properly copied
		define: {
			// Required for React scheduler in Electron production builds
			global: "globalThis",
			// Required for @babel/types and other Node.js modules in browser
			"process.env.NODE_ENV": JSON.stringify(
				process.env.NODE_ENV || "development"
			),
			// Expose build target for runtime checks
			"__QCUT_BUILD_TARGET__": JSON.stringify(buildTarget),
		},
		resolve: {
			alias: {
				// Ensure single React version to prevent conflicts with Remotion
				// Use root node_modules in monorepo
				"react": path.resolve(__dirname, "../../node_modules/react"),
				"react-dom": path.resolve(__dirname, "../../node_modules/react-dom"),
				"react-dom/client": path.resolve(
					__dirname,
					"../../node_modules/react-dom/client"
				),
				"scheduler": path.resolve(__dirname, "../../node_modules/scheduler"),
				"react/jsx-runtime": path.resolve(
					__dirname,
					"../../node_modules/react/jsx-runtime"
				),
				"react/jsx-dev-runtime": path.resolve(
					__dirname,
					"../../node_modules/react/jsx-dev-runtime"
				),
			},
			dedupe: ["react", "react-dom", "scheduler", "react/jsx-runtime"],
		},
		optimizeDeps: {
			include: ["react", "react-dom", "react-dom/client", "scheduler"],
			// Force Remotion to use the same React
			esbuildOptions: {
				define: {
					global: "globalThis",
				},
			},
			// Exclude remotion packages from optimization to prevent double bundling
			// Exclude @fal-ai/client to prevent initialization issues in Electron
			exclude: [
				"remotion",
				"@remotion/player",
				"@remotion/renderer",
				"@fal-ai/client",
			],
		},
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
			// Enable source maps for better debugging
			sourcemap: true,
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
						// Include scheduler to prevent Remotion conflicts
						// Note: @tanstack/react-router is NOT included here to avoid TDZ errors
						// The router needs to be in the same chunk as the route tree for proper initialization
						if (
							id.includes("node_modules/react/") ||
							id.includes("node_modules/react-dom/") ||
							id.includes("node_modules/scheduler/") ||
							id.includes("@radix-ui")
						) {
							return "vendor-react";
						}

						// UI utilities and styling libraries (non-React dependent)
						if (
							id.includes("lucide-react") ||
							id.includes("class-variance-authority") ||
							id.includes("clsx") ||
							id.includes("tailwind-merge")
						) {
							return "vendor-ui";
						}

						// Video/Media processing - FFmpeg WASM modules (node_modules only)
						if (
							id.includes("node_modules/@ffmpeg/") ||
							id.includes("node_modules/ffmpeg")
						) {
							return "vendor-ffmpeg";
						}

						// AI Features - FAL.ai client (node_modules only)
						if (
							id.includes("node_modules/@fal-ai/client") ||
							id.includes("node_modules/fal-ai")
						) {
							return "vendor-ai";
						}

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
						if (
							id.includes("react-hook-form") ||
							id.includes("zod") ||
							id.includes("@hookform")
						) {
							return "vendor-forms";
						}

						// Charts and data visualization
						if (id.includes("recharts") || id.includes("embla-carousel")) {
							return "vendor-charts";
						}

						// Motion and animation libraries
						if (id.includes("node_modules/motion")) {
							return "vendor-motion";
						}

						// Markdown processing libraries
						if (
							id.includes("react-markdown") ||
							id.includes("rehype") ||
							id.includes("unified") ||
							id.includes("remark")
						) {
							return "vendor-markdown";
						}

						// Authentication and database
						if (
							id.includes("better-auth") ||
							id.includes("drizzle") ||
							id.includes("@qcut/auth") ||
							id.includes("@qcut/db")
						) {
							return "vendor-auth";
						}

						// Everything else stays in main chunk
						return;
					},
				},
			},
		},
		server: {
			port: 5173,
			host: true,
		},
	};
});
