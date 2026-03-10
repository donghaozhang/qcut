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

	describe("desktop-only stubs", () => {
		it("pty.spawn rejects with PlatformUnsupportedError", async () => {
			await expect(adapter.pty.spawn()).rejects.toThrow(
				PlatformUnsupportedError
			);
		});

		it("skills.list rejects with PlatformUnsupportedError", async () => {
			await expect(adapter.skills.list("proj")).rejects.toThrow(
				PlatformUnsupportedError
			);
		});

		it("updates.checkForUpdates rejects with PlatformUnsupportedError", async () => {
			await expect(adapter.updates.checkForUpdates()).rejects.toThrow(
				PlatformUnsupportedError
			);
		});

		it("moyin.parseScript rejects with PlatformUnsupportedError", async () => {
			await expect(adapter.moyin.parseScript({})).rejects.toThrow(
				PlatformUnsupportedError
			);
		});

		it("remotionFolder.select rejects with PlatformUnsupportedError", async () => {
			await expect(adapter.remotionFolder.select()).rejects.toThrow(
				PlatformUnsupportedError
			);
		});
	});
});
