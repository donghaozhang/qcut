/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	plugins: [react()],
	test: {
		globals: true,
		environment: "jsdom",
		environmentOptions: {
			jsdom: {
				url: "http://localhost:3000",
			},
		},
		globalSetup: path.resolve(rootDir, "src/test/global-setup.ts"),
		setupFiles: [
			path.resolve(rootDir, "src/test/preload-polyfills.ts"),
			path.resolve(rootDir, "src/test/setup-radix-patches.ts"),
			path.resolve(rootDir, "src/test/setup.ts"),
		],
		include: [
			"**/*.{test,spec}.?(c|m)[jt]s?(x)",
			"../../electron/__tests__/**/*.{test,spec}.?(c|m)[jt]s?(x)",
			"../../electron/claude/__tests__/**/*.{test,spec}.?(c|m)[jt]s?(x)",
		],
		exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov", "json"],
			reportsDirectory: "./coverage",
			exclude: ["src/test/", "*.config.*", "**/*.d.ts", "src/routeTree.gen.ts"],
		},
		environmentMatchGlobs: [["**/electron/**", "node"]],
		isolate: true,
		pool: "forks",
		// Windows CI runners are roughly an order of magnitude slower than the
		// macOS/Linux ones here — a suite that finishes in ~480 ms locally has
		// been seen crossing 5 s there. Give that platform headroom rather than
		// scattering per-test timeouts, and keep the tight budget everywhere
		// else so a genuine hang still fails fast.
		testTimeout: process.platform === "win32" ? 30_000 : 5000,
		hookTimeout: process.platform === "win32" ? 30_000 : 5000,
		server: {
			deps: {
				// Ensure Node built-in modules resolve correctly in jsdom environment
				// (fixes Windows CI where node:fs, node:child_process, crypto resolve
				// as file:///@id/__vite-browser-external:... instead of real modules)
				inline: [
					/^node:/,
					"crypto",
					"fs",
					"path",
					"child_process",
					"os",
					"util",
					"stream",
					"events",
					"http",
					"https",
					"net",
					"tls",
					"zlib",
					"buffer",
					"url",
					"querystring",
					"string_decoder",
					"assert",
					"tty",
					"dgram",
					"dns",
					"readline",
				],
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(rootDir, "./src"),
		},
	},
});
