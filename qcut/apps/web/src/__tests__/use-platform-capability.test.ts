import { describe, it, expect, beforeAll } from "vitest";
import { PlatformCapability } from "@qcut/platform-core";

/**
 * Tests for platform capability hooks.
 * Verifies the hook module exports and enum completeness.
 */

describe("use-platform-capability", () => {
	beforeAll(async () => {
		// Initialize platform for test context
		const { setupPlatform } = await import("../platform-init");
		await setupPlatform();
	});

	it("exports usePlatformCapability hook", async () => {
		const mod = await import("../hooks/use-platform-capability");
		expect(typeof mod.usePlatformCapability).toBe("function");
	});

	it("exports useIsDesktop hook", async () => {
		const mod = await import("../hooks/use-platform-capability");
		expect(typeof mod.useIsDesktop).toBe("function");
	});

	it("exports usePlatformId hook", async () => {
		const mod = await import("../hooks/use-platform-capability");
		expect(typeof mod.usePlatformId).toBe("function");
	});

	it("re-exports PlatformCapability enum", async () => {
		const mod = await import("../hooks/use-platform-capability");
		expect(mod.PlatformCapability).toBeDefined();
		expect(mod.PlatformCapability.Storage).toBe(PlatformCapability.Storage);
	});

	it("PlatformCapability has expected web-compatible capabilities", () => {
		expect(PlatformCapability.Storage).toBeDefined();
		expect(PlatformCapability.Theme).toBeDefined();
		expect(PlatformCapability.Shell).toBeDefined();
		expect(PlatformCapability.ApiKeys).toBeDefined();
	});

	it("PlatformCapability has expected desktop-only capabilities", () => {
		expect(PlatformCapability.Pty).toBeDefined();
		expect(PlatformCapability.FFmpeg).toBeDefined();
		expect(PlatformCapability.ScreenRecording).toBeDefined();
		expect(PlatformCapability.Updates).toBeDefined();
	});
});
