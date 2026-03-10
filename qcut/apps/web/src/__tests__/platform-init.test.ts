import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for platform initialization module.
 * Verifies environment detection and adapter loading.
 */

describe("platform-init", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("setupPlatform function exists and is callable", async () => {
		const mod = await import("../platform-init");
		expect(typeof mod.setupPlatform).toBe("function");
	});

	it("detects non-Electron environment in test context", async () => {
		// In test context (jsdom), window.electronAPI is not defined
		// so setupPlatform should load the web adapter
		const mod = await import("../platform-init");
		await mod.setupPlatform();

		const { platform } = await import("@qcut/platform-core");
		const p = platform();
		expect(p.platform).toBe("web");
		expect(p.isElectron).toBe(false);
	});

	it("platform is accessible after initialization", async () => {
		const mod = await import("../platform-init");
		await mod.setupPlatform();

		const { platform } = await import("@qcut/platform-core");
		const p = platform();
		expect(p).toBeDefined();
		expect(typeof p.hasCapability).toBe("function");
		expect(typeof p.storage).toBe("object");
	});
});
