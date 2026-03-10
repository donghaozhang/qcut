import { describe, it, expect } from "vitest";
import {
	PlatformCapability,
	PLATFORM_CAPABILITIES,
	isPlatformCapable,
	getMissingCapabilities,
	PlatformUnsupportedError,
} from "../index.js";

describe("PlatformCapability", () => {
	it("desktop supports all capabilities", () => {
		const allCaps = Object.values(PlatformCapability);
		for (const cap of allCaps) {
			expect(isPlatformCapable("desktop", cap)).toBe(true);
		}
	});

	it("web supports a subset of capabilities", () => {
		expect(isPlatformCapable("web", PlatformCapability.Storage)).toBe(true);
		expect(isPlatformCapable("web", PlatformCapability.Theme)).toBe(true);
		expect(isPlatformCapable("web", PlatformCapability.FFmpeg)).toBe(true);
	});

	it("web does not support desktop-only capabilities", () => {
		expect(isPlatformCapable("web", PlatformCapability.Pty)).toBe(false);
		expect(isPlatformCapable("web", PlatformCapability.Updates)).toBe(false);
		expect(isPlatformCapable("web", PlatformCapability.Mcp)).toBe(false);
		expect(isPlatformCapable("web", PlatformCapability.RemotionFolder)).toBe(
			false
		);
	});

	it("ios does not support screen recording", () => {
		expect(isPlatformCapable("ios", PlatformCapability.ScreenRecording)).toBe(
			false
		);
	});
});

describe("getMissingCapabilities", () => {
	it("desktop has no missing capabilities", () => {
		expect(getMissingCapabilities("desktop")).toEqual([]);
	});

	it("web is missing PTY, updates, and others", () => {
		const missing = getMissingCapabilities("web");
		expect(missing).toContain(PlatformCapability.Pty);
		expect(missing).toContain(PlatformCapability.Updates);
		expect(missing).toContain(PlatformCapability.YouTube);
		expect(missing.length).toBeGreaterThan(0);
	});

	it("ios is missing more than web", () => {
		const webMissing = getMissingCapabilities("web");
		const iosMissing = getMissingCapabilities("ios");
		expect(iosMissing.length).toBeGreaterThanOrEqual(webMissing.length);
	});
});

describe("PlatformUnsupportedError", () => {
	it("includes capability and platform in message", () => {
		const err = new PlatformUnsupportedError(PlatformCapability.Pty, "web");
		expect(err.message).toContain("pty");
		expect(err.message).toContain("web");
		expect(err.capability).toBe(PlatformCapability.Pty);
		expect(err.platform).toBe("web");
		expect(err.name).toBe("PlatformUnsupportedError");
	});
});

describe("PLATFORM_CAPABILITIES", () => {
	it("defines all three platforms", () => {
		expect(PLATFORM_CAPABILITIES.desktop).toBeDefined();
		expect(PLATFORM_CAPABILITIES.web).toBeDefined();
		expect(PLATFORM_CAPABILITIES.ios).toBeDefined();
	});

	it("desktop has the most capabilities", () => {
		expect(PLATFORM_CAPABILITIES.desktop.size).toBeGreaterThan(
			PLATFORM_CAPABILITIES.web.size
		);
		expect(PLATFORM_CAPABILITIES.desktop.size).toBeGreaterThan(
			PLATFORM_CAPABILITIES.ios.size
		);
	});
});
