import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EffectParameters } from "@/types/effects";
import { applyEffectsToCanvas } from "../effects-utils";

/**
 * `applyEffectsToCanvas` runs once per element per frame on the canvas export
 * path, so its tracing must stay silent unless debug mode is explicitly on.
 * These tests pin both halves of that contract: silence by default, and the
 * unchanged canvas result either way.
 */

const DEBUG_KEY = "qcut_debug_mode";

function fakeContext(): CanvasRenderingContext2D {
	return { filter: "none" } as unknown as CanvasRenderingContext2D;
}

/**
 * The suite setup replaces localStorage with inert `vi.fn()` stubs that store
 * nothing, so the debug flag has to be driven through the mock rather than by
 * writing a value.
 */
function setDebugFlag(value: string | null): void {
	vi.mocked(window.localStorage.getItem).mockImplementation((key: string) =>
		key === DEBUG_KEY ? value : null
	);
}

const parameters: EffectParameters = {
	brightness: 12,
	contrast: 8,
	saturation: 20,
};

describe("applyEffectsToCanvas frame logging", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;
	let warnSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		setDebugFlag(null);
		logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		logSpy.mockRestore();
		warnSpy.mockRestore();
		errorSpy.mockRestore();
		setDebugFlag(null);
	});

	it("logs nothing by default", () => {
		const ctx = fakeContext();
		applyEffectsToCanvas(ctx, parameters);
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("stays silent across a frame's worth of calls", () => {
		const ctx = fakeContext();
		for (let frame = 0; frame < 120; frame += 1) {
			applyEffectsToCanvas(ctx, parameters);
		}
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("still applies the filter when silent", () => {
		const ctx = fakeContext();
		applyEffectsToCanvas(ctx, parameters);
		expect(ctx.filter).toBe("brightness(1.12) contrast(1.08) saturate(1.2)");
	});

	it("sets 'none' when there is nothing to apply", () => {
		const ctx = fakeContext();
		applyEffectsToCanvas(ctx, {});
		expect(ctx.filter).toBe("none");
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("restores the full trace when debug mode is enabled", () => {
		setDebugFlag("true");
		const ctx = fakeContext();
		applyEffectsToCanvas(ctx, parameters);
		expect(logSpy).toHaveBeenCalledTimes(5);
		const messages = logSpy.mock.calls.map((call: unknown[]) =>
			String(call[0])
		);
		expect(messages[0]).toContain("CANVAS EFFECTS");
		expect(messages.at(-1)).toContain("Canvas filter after");
	});

	it("produces the same canvas filter whether or not debug mode is on", () => {
		const silent = fakeContext();
		applyEffectsToCanvas(silent, parameters);

		setDebugFlag("true");
		const verbose = fakeContext();
		applyEffectsToCanvas(verbose, parameters);

		expect(verbose.filter).toBe(silent.filter);
	});

	it("does not suppress warnings or errors raised elsewhere", () => {
		const ctx = fakeContext();
		applyEffectsToCanvas(ctx, parameters);
		// The gate must only cover this function's own tracing; nothing here
		// should have swallowed another module's diagnostics.
		console.warn("downstream warning");
		console.error("downstream error");
		expect(warnSpy).toHaveBeenCalledWith("downstream warning");
		expect(errorSpy).toHaveBeenCalledWith("downstream error");
	});
});
