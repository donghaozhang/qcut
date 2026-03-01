/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const webRoot = path.resolve(__dirname, "apps/web");

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
		globalSetup: path.resolve(webRoot, "src/test/global-setup.ts"),
		setupFiles: [
			path.resolve(webRoot, "src/test/preload-polyfills.ts"),
			path.resolve(webRoot, "src/test/setup-radix-patches.ts"),
			path.resolve(webRoot, "src/test/setup.ts"),
		],
		include: [
			"apps/web/**/*.{test,spec}.?(c|m)[jt]s?(x)",
			"electron/__tests__/**/*.{test,spec}.?(c|m)[jt]s?(x)",
			"electron/claude/__tests__/**/*.{test,spec}.?(c|m)[jt]s?(x)",
		],
		exclude: ["**/node_modules/**", "**/dist/**", "**/tests/e2e/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov", "json"],
			reportsDirectory: path.resolve(webRoot, "coverage"),
			exclude: [
				"apps/web/src/test/",
				"*.config.*",
				"**/*.d.ts",
				"apps/web/src/routeTree.gen.ts",
			],
		},
		environmentMatchGlobs: [["**/electron/**", "node"]],
		isolate: true,
		pool: "forks",
		testTimeout: 5000,
		hookTimeout: 5000,
		server: {
			deps: {
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
			"@": path.resolve(webRoot, "src"),
		},
	},
});
