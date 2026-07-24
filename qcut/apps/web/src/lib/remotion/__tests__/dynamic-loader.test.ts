/**
 * Dynamic Loader Tests
 *
 * Tests for the dynamic component loader that loads bundled Remotion components
 * at runtime using blob URLs.
 *
 * Note: Dynamic imports from blob URLs don't work in jsdom/vitest environment.
 * The actual blob URL loading is tested via E2E tests in the Electron environment.
 * These tests focus on the setup and cache management functions.
 *
 * @module lib/remotion/__tests__/dynamic-loader.test
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	getCachedComponent,
	clearComponentCache,
	isComponentCached,
	removeCachedComponent,
	getCacheStats,
	setupGlobalsForDynamicImport,
	wrapBundledCode,
} from "../dynamic-loader";

// ============================================================================
// Test Setup
// ============================================================================

beforeEach(() => {
	clearComponentCache();
});

afterEach(() => {
	clearComponentCache();
});

// ============================================================================
// setupGlobalsForDynamicImport Tests
// ============================================================================

describe("setupGlobalsForDynamicImport", () => {
	it("should set up React global", () => {
		setupGlobalsForDynamicImport();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((window as any).React).toBeDefined();
	});

	it("should set up ReactJSXRuntime global", () => {
		setupGlobalsForDynamicImport();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((window as any).ReactJSXRuntime).toBeDefined();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((window as any).ReactJSXRuntime.jsx).toBeDefined();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((window as any).ReactJSXRuntime.jsxs).toBeDefined();
	});

	it("should set up Remotion global", () => {
		setupGlobalsForDynamicImport();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((window as any).Remotion).toBeDefined();
	});

	it("should be idempotent (can be called multiple times)", () => {
		setupGlobalsForDynamicImport();
		setupGlobalsForDynamicImport();
		setupGlobalsForDynamicImport();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((window as any).React).toBeDefined();
	});

	it("should provide common React hooks via global", () => {
		setupGlobalsForDynamicImport();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const React = (window as any).React;
		expect(React.useState).toBeDefined();
		expect(React.useEffect).toBeDefined();
		expect(React.useCallback).toBeDefined();
		expect(React.useMemo).toBeDefined();
		expect(React.useRef).toBeDefined();
		expect(React.createElement).toBeDefined();
	});

	it("should provide Remotion hooks via global", () => {
		setupGlobalsForDynamicImport();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const Remotion = (window as any).Remotion;
		expect(Remotion.useCurrentFrame).toBeDefined();
		expect(Remotion.useVideoConfig).toBeDefined();
		expect(Remotion.AbsoluteFill).toBeDefined();
		expect(Remotion.Sequence).toBeDefined();
		expect(Remotion.interpolate).toBeDefined();
		expect(Remotion.spring).toBeDefined();
	});
});

// ============================================================================
// Cache Management Tests (these don't require blob URL loading)
// ============================================================================

describe("cache management", () => {
	it("getCacheStats should return empty stats initially", () => {
		const stats = getCacheStats();
		expect(stats.size).toBe(0);
		expect(stats.componentIds).toEqual([]);
	});

	it("isComponentCached should return false for non-existent components", () => {
		expect(isComponentCached("non-existent")).toBe(false);
	});

	it("getCachedComponent should return undefined for non-existent components", () => {
		expect(getCachedComponent("non-existent")).toBeUndefined();
	});

	it("removeCachedComponent should not throw for non-existent components", () => {
		expect(() => removeCachedComponent("non-existent")).not.toThrow();
	});

	it("clearComponentCache should not throw when cache is empty", () => {
		expect(() => clearComponentCache()).not.toThrow();
	});
});

describe("wrapBundledCode", () => {
	it.each([
		"@remotion/zod-types",
		"@remotion/zod-types-v3",
	])("injects Zod 3-compatible aliases for %s imports", (packageName) => {
		const bundledCode = `import { zColor as colorSchema } from "${packageName}";`;
		const wrappedCode = wrapBundledCode(bundledCode);

		expect(wrappedCode).not.toContain(`from "${packageName}"`);
		expect(wrappedCode).toContain("const colorSchema = zColor;");
	});
});

// ============================================================================
// Note: Blob URL dynamic import tests
// ============================================================================
// The following functionality is tested via E2E tests in Electron:
// - loadBundledComponent() with actual blob URLs
// - Component caching after successful loads
//
// jsdom/vitest cannot properly execute dynamic imports from blob: URLs
// because it lacks browser-level module resolution capabilities.
//
// See: apps/web/src/test/e2e/remotion-folder-import.e2e.ts
