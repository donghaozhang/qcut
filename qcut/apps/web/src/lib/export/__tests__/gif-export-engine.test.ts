import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock gif.js before importing the engine
vi.mock("gif.js", () => {
	class MockGIF {
		options: Record<string, unknown>;
		listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
		running = false;

		constructor(options: Record<string, unknown>) {
			this.options = options;
		}
		addFrame(_el: unknown, _opts?: unknown) {}
		on(event: string, cb: (...args: unknown[]) => void) {
			this.listeners[event] = this.listeners[event] || [];
			this.listeners[event].push(cb);
			return this;
		}
		render() {
			this.running = true;
			// Simulate async completion
			setTimeout(() => {
				const finishedCbs = this.listeners.finished || [];
				for (const cb of finishedCbs) cb(new Blob(["GIF"]));
			}, 0);
		}
		abort() {
			this.running = false;
		}
	}
	return { default: MockGIF };
});

import { GifExportEngine } from "../gif-export-engine";

function getInternalGif(engine: GifExportEngine) {
	return (engine as unknown as { gif: { options: Record<string, unknown> } })
		.gif;
}

describe("GifExportEngine", () => {
	const originalHardwareConcurrency =
		Object.getOwnPropertyDescriptor(navigator, "hardwareConcurrency") ??
		undefined;

	beforeEach(() => {
		vi.restoreAllMocks();
		// Provide hardwareConcurrency
		Object.defineProperty(navigator, "hardwareConcurrency", {
			value: 16,
			configurable: true,
		});
	});

	afterEach(() => {
		if (originalHardwareConcurrency) {
			Object.defineProperty(
				navigator,
				"hardwareConcurrency",
				originalHardwareConcurrency
			);
		}
	});

	it("calculates frameDelay from fps (20fps = 50ms)", () => {
		const engine = new GifExportEngine({
			width: 640,
			height: 480,
			frameRate: 20,
			loop: true,
			quality: 10,
		});
		expect(engine.delay).toBe(50);
	});

	it("calculates frameDelay for 30fps = 33ms", () => {
		const engine = new GifExportEngine({
			width: 640,
			height: 480,
			frameRate: 30,
			loop: true,
			quality: 10,
		});
		expect(engine.delay).toBe(33);
	});

	it("caps worker count at 8", () => {
		// hardwareConcurrency is mocked to 16
		const engine = new GifExportEngine({
			width: 640,
			height: 480,
			frameRate: 20,
			loop: true,
			quality: 10,
		});
		// Access the underlying GIF instance options
		const gif = getInternalGif(engine);
		expect(gif.options.workers).toBe(8);
	});

	it("maps loop=true to repeat=0 (infinite)", () => {
		const engine = new GifExportEngine({
			width: 640,
			height: 480,
			frameRate: 20,
			loop: true,
			quality: 10,
		});
		const gif = getInternalGif(engine);
		expect(gif.options.repeat).toBe(0);
	});

	it("maps loop=false to repeat=-1 (play once)", () => {
		const engine = new GifExportEngine({
			width: 640,
			height: 480,
			frameRate: 20,
			loop: false,
			quality: 10,
		});
		const gif = getInternalGif(engine);
		expect(gif.options.repeat).toBe(-1);
	});

	it("render() resolves with a blob", async () => {
		const engine = new GifExportEngine({
			width: 640,
			height: 480,
			frameRate: 20,
			loop: true,
			quality: 10,
		});
		const blob = await engine.render();
		expect(blob).toBeInstanceOf(Blob);
	});

	it("abort() does not throw", () => {
		const engine = new GifExportEngine({
			width: 640,
			height: 480,
			frameRate: 20,
			loop: true,
			quality: 10,
		});
		expect(() => engine.abort()).not.toThrow();
	});
});
