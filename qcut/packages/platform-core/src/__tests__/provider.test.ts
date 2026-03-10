import { describe, it, expect, beforeEach } from "vitest";
import { initPlatform, platform } from "../provider";
import { PlatformCapability } from "../types/base";
import type { PlatformAPI } from "../types/platform";

function createMockAdapter(): PlatformAPI {
	return {
		platform: "desktop",
		isElectron: true,
		hasCapability: (cap: PlatformCapability) =>
			cap === PlatformCapability.Storage,
		getPathForFile: (_file: File) => "/mock/path",
		analyzeFillers: async () => ({ filteredWordIds: [] }),
		files: {} as any,
		storage: {
			save: async () => true,
			load: async () => null,
			remove: async () => true,
			list: async () => [],
			clear: async () => true,
		},
		theme: {} as any,
		shell: {} as any,
		apiKeys: {} as any,
		license: {} as any,
		sounds: {} as any,
		audio: {} as any,
		video: {} as any,
		screenshot: {} as any,
		screenRecording: {} as any,
		ffmpeg: {} as any,
		transcription: {} as any,
		fal: {} as any,
		geminiChat: {} as any,
		github: {} as any,
		youtube: {} as any,
		pty: {} as any,
		mcp: {} as any,
		skills: {} as any,
		aiPipeline: {} as any,
		mediaImport: {} as any,
		projectFolder: {} as any,
		projectJson: {} as any,
		remotionFolder: {} as any,
		moyin: {} as any,
		updates: {} as any,
		claude: undefined,
	};
}

describe("platform provider", () => {
	beforeEach(() => {
		// Reset internal state by re-initializing
		initPlatform(createMockAdapter());
	});

	it("returns adapter after init", () => {
		const p = platform();
		expect(p.platform).toBe("desktop");
		expect(p.isElectron).toBe(true);
	});

	it("hasCapability delegates correctly", () => {
		const p = platform();
		expect(p.hasCapability(PlatformCapability.Storage)).toBe(true);
		expect(p.hasCapability(PlatformCapability.Pty)).toBe(false);
	});

	it("storage namespace works", async () => {
		const p = platform();
		expect(await p.storage.save("key", "value")).toBe(true);
		expect(await p.storage.load("key")).toBeNull();
	});
});
