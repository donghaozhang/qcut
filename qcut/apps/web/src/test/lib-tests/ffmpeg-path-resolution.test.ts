import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packageJsonPath = join(__dirname, "../../../../../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	build?: {
		files?: Array<string | Record<string, unknown>>;
		extraResources?: Array<Record<string, unknown>>;
		asarUnpack?: string[];
	};
};

describe("FFmpeg staged packaging contract", () => {
	it("includes ffmpeg staging script", () => {
		const scriptPath = join(
			__dirname,
			"../../../../../scripts/stage-ffmpeg-binaries.ts"
		);
		expect(existsSync(scriptPath)).toBe(true);
		expect(
			existsSync(join(__dirname, "../../../../../scripts/ffmpeg-binaries.json"))
		).toBe(true);
	});

	it("pins every desktop target in the binary manifest", () => {
		const manifestPath = join(
			__dirname,
			"../../../../../scripts/ffmpeg-binaries.json"
		);
		const manifestContent = readFileSync(manifestPath, "utf8");
		expect(manifestContent).toContain('"darwin-arm64"');
		expect(manifestContent).toContain('"darwin-x64"');
		expect(manifestContent).toContain('"win32-x64"');
		expect(manifestContent).toContain('"linux-x64"');
	});

	it("copies staged ffmpeg resources via extraResources", () => {
		const extraResources = packageJson.build?.extraResources ?? [];
		const ffmpegEntry = extraResources.find(
			(entry) =>
				entry.from === "electron/resources/ffmpeg" && entry.to === "ffmpeg"
		);
		expect(ffmpegEntry).toBeDefined();
	});

	it("does not package ffmpeg-static and ffprobe-static node_modules binaries", () => {
		const files = packageJson.build?.files ?? [];
		expect(files).not.toContain("node_modules/ffmpeg-static/**/*");
		expect(files).not.toContain("node_modules/ffprobe-static/**/*");
	});

	it("does not unpack ffmpeg-static and ffprobe-static from ASAR", () => {
		const asarUnpack = packageJson.build?.asarUnpack ?? [];
		expect(asarUnpack).not.toContain("**/node_modules/ffmpeg-static/**/*");
		expect(asarUnpack).not.toContain("**/node_modules/ffprobe-static/**/*");
	});

	it("uses a direct archive extractor instead of package metadata", () => {
		expect(packageJson.devDependencies?.["extract-zip"]).toBeDefined();
		expect(packageJson.devDependencies?.["7zip-bin"]).toBeDefined();
		const scriptPath = join(
			__dirname,
			"../../../../../scripts/stage-ffmpeg-binaries.ts"
		);
		const scriptContent = readFileSync(scriptPath, "utf8");
		expect(scriptContent).toContain("loadFFmpegManifest");
		expect(scriptContent).not.toContain("ffmpeg-ffprobe-static");
	});

	it("keeps FFmpeg.wasm out of Vite dependency pre-bundling", () => {
		const viteConfigPath = join(__dirname, "../../../vite.config.ts");
		const viteConfig = readFileSync(viteConfigPath, "utf8");
		expect(viteConfig).toContain('"@ffmpeg/ffmpeg"');
		expect(viteConfig).toContain("optimizeDeps");
	});

	it("has no shared libraries in electron/resources root", () => {
		const resourcesDir = join(
			__dirname,
			"../../../../../../electron/resources"
		);

		if (!existsSync(resourcesDir)) {
			return;
		}

		const entries = readdirSync(resourcesDir);
		const sharedLibraries = entries.filter(
			(entry) =>
				entry.endsWith(".dll") ||
				entry.endsWith(".dylib") ||
				/\.so(\.|$)/.test(entry)
		);
		expect(sharedLibraries).toEqual([]);
	});
});
