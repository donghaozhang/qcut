import { describe, it, expect } from "vitest";
import { createWebAdapter } from "../index";
import {
	PlatformCapability,
	PlatformUnsupportedError,
} from "@qcut/platform-core";

describe("createWebAdapter", () => {
	const adapter = createWebAdapter();

	it("reports platform as web", () => {
		expect(adapter.platform).toBe("web");
		expect(adapter.isElectron).toBe(false);
	});

	it("has storage capability", () => {
		expect(adapter.hasCapability(PlatformCapability.Storage)).toBe(true);
	});

	it("has theme capability", () => {
		expect(adapter.hasCapability(PlatformCapability.Theme)).toBe(true);
	});

	it("has shell capability", () => {
		expect(adapter.hasCapability(PlatformCapability.Shell)).toBe(true);
	});

	it("has license capability", () => {
		expect(adapter.hasCapability(PlatformCapability.License)).toBe(true);
	});

	it("does not have PTY capability", () => {
		expect(adapter.hasCapability(PlatformCapability.Pty)).toBe(false);
	});

	it("does not have Claude capability", () => {
		expect(adapter.hasCapability(PlatformCapability.Claude)).toBe(false);
		expect(adapter.claude).toBeUndefined();
	});

	it("does not have Updates capability", () => {
		expect(adapter.hasCapability(PlatformCapability.Updates)).toBe(false);
	});

	it("does not have Skills capability", () => {
		expect(adapter.hasCapability(PlatformCapability.Skills)).toBe(false);
	});

	describe("storage interface", () => {
		it("save returns boolean", async () => {
			const result = await adapter.storage.save("test", { data: true });
			expect(typeof result).toBe("boolean");
		});

		it("load returns value or null", async () => {
			const result = await adapter.storage.load("nonexistent-key-12345");
			expect(result === null || result === undefined).toBe(true);
		});

		it("list returns array", async () => {
			const keys = await adapter.storage.list();
			expect(Array.isArray(keys)).toBe(true);
		});

		it("remove returns boolean", async () => {
			const result = await adapter.storage.remove("some-key");
			expect(typeof result).toBe("boolean");
		});

		it("clear returns boolean", async () => {
			const result = await adapter.storage.clear();
			expect(typeof result).toBe("boolean");
		});
	});

	describe("theme interface", () => {
		it("get returns a theme source", async () => {
			const theme = await adapter.theme.get();
			expect(["system", "light", "dark"]).toContain(theme);
		});

		it("isDark returns boolean", async () => {
			const result = await adapter.theme.isDark();
			expect(typeof result).toBe("boolean");
		});
	});

	describe("shell", () => {
		it("openExternal does not throw", async () => {
			await expect(
				adapter.shell.openExternal("https://example.com")
			).resolves.not.toThrow();
		});

		it("showItemInFolder does not throw (no-op)", async () => {
			await expect(
				adapter.shell.showItemInFolder("/some/path")
			).resolves.not.toThrow();
		});
	});

	describe("files interface", () => {
		it("readFile returns null for web", async () => {
			const result = await adapter.files.readFile("/any/path");
			expect(result).toBeNull();
		});

		it("writeFile returns false for web", async () => {
			const result = await adapter.files.writeFile("/path", "data");
			expect(result).toBe(false);
		});

		it("getFileInfo returns null for web", async () => {
			const result = await adapter.files.getFileInfo("/path");
			expect(result).toBeNull();
		});
	});

	describe("license interface", () => {
		it("check returns free plan", async () => {
			const info = await adapter.license.check();
			expect(info.plan).toBe("free");
			expect(info.status).toBe("active");
		});

		it("activate returns false", async () => {
			const result = await adapter.license.activate("token");
			expect(result).toBe(false);
		});

		it("emailLogin returns error", async () => {
			const result = await adapter.license.emailLogin("a@b.c", "pass");
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});

		it("onActivationToken is undefined", () => {
			expect(adapter.license.onActivationToken).toBeUndefined();
		});
	});

	describe("github interface", () => {
		it("fetchStars returns a number", async () => {
			const result = await adapter.github.fetchStars();
			expect(typeof result.stars).toBe("number");
		});
	});

	describe("aiPipeline interface", () => {
		it("check returns unavailable", async () => {
			const result = await adapter.aiPipeline.check();
			expect(result.available).toBe(false);
		});

		it("status returns unavailable source", async () => {
			const result = await adapter.aiPipeline.status();
			expect(result.source).toBe("unavailable");
		});

		it("onProgress returns cleanup function", () => {
			const cleanup = adapter.aiPipeline.onProgress(() => {});
			expect(typeof cleanup).toBe("function");
		});
	});

	describe("graceful stubs (web-capable, not yet implemented)", () => {
		it("sounds methods return null instead of throwing", async () => {
			const result = await adapter.sounds.search({ query: "test" });
			expect(result).toBeNull();
		});

		it("ffmpeg methods return null instead of throwing", async () => {
			const result = await adapter.ffmpeg.createExportSession();
			expect(result).toBeNull();
		});

		it("geminiChat event listeners are no-ops", () => {
			expect(() => {
				adapter.geminiChat.onStreamChunk(() => {});
			}).not.toThrow();
		});

		it("geminiChat removeListeners is no-op", () => {
			expect(() => {
				adapter.geminiChat.removeListeners();
			}).not.toThrow();
		});

		it("video methods return null", async () => {
			const result = await adapter.video.verifyFile("/path");
			expect(result).toBeNull();
		});

		it("transcription methods return null", async () => {
			const result = await adapter.transcription.cancel("id");
			expect(result).toBeNull();
		});

		it("mediaImport methods return null", async () => {
			const result = await adapter.mediaImport.checkSymlinkSupport();
			expect(result).toBeNull();
		});
	});

	describe("desktop-only stubs", () => {
		it("pty.spawn throws PlatformUnsupportedError", () => {
			expect(() => adapter.pty.spawn()).toThrow(PlatformUnsupportedError);
		});

		it("skills.list throws PlatformUnsupportedError", () => {
			expect(() => adapter.skills.list("proj")).toThrow(
				PlatformUnsupportedError
			);
		});

		it("updates.checkForUpdates throws PlatformUnsupportedError", () => {
			expect(() => adapter.updates.checkForUpdates()).toThrow(
				PlatformUnsupportedError
			);
		});

		it("moyin.parseScript throws PlatformUnsupportedError", () => {
			expect(() => adapter.moyin.parseScript({})).toThrow(
				PlatformUnsupportedError
			);
		});

		it("remotionFolder.select throws PlatformUnsupportedError", () => {
			expect(() => adapter.remotionFolder.select()).toThrow(
				PlatformUnsupportedError
			);
		});
	});

	describe("getPathForFile", () => {
		it("returns a blob URL for a File object", () => {
			const file = new File(["test"], "test.txt", { type: "text/plain" });
			const url = adapter.getPathForFile(file);
			expect(url).toContain("blob:");
		});
	});

	describe("analyzeFillers", () => {
		it("returns empty filteredWordIds", async () => {
			const result = await adapter.analyzeFillers({
				words: [],
				languageCode: "en",
			} as any);
			expect(result).toEqual({ filteredWordIds: [] });
		});
	});
});
