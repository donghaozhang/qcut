import { describe, expect, it, vi } from "vitest";
import type { ExportSettingsWithAudio } from "@/types/export";
import { ExportFormat, ExportQuality } from "@/types/export";

vi.mock("@qcut/platform-core", () => ({
	platform: () => ({
		ffmpeg: {
			exportVideoCLI: vi.fn(),
		},
	}),
}));

vi.mock("@/lib/ffmpeg/ffmpeg-video-recorder", () => ({
	FFmpegVideoRecorder: class {},
	isFFmpegExportEnabled: () => false,
}));

import { CLIExportEngine } from "../export-engine-cli";

class InspectableCLIExportEngine extends CLIExportEngine {
	get lifecycle(): {
		isExporting: boolean;
		signal: AbortSignal | undefined;
	} {
		return {
			isExporting: this.isExporting,
			signal: this.abortController?.signal,
		};
	}
}

function createCanvas(): HTMLCanvasElement {
	const context = {
		imageSmoothingEnabled: true,
		imageSmoothingQuality: "high",
	} as unknown as CanvasRenderingContext2D;
	return {
		width: 0,
		height: 0,
		getContext: () => context,
	} as unknown as HTMLCanvasElement;
}

function createSettings(): ExportSettingsWithAudio {
	return {
		format: ExportFormat.MP4,
		quality: ExportQuality.HIGH,
		filename: "output",
		width: 1920,
		height: 1080,
		frameRate: 30,
		includeAudio: false,
	};
}

describe("CLIExportEngine lifecycle", () => {
	it("keeps cancellation live, rejects re-entry, and resets state after settling", async () => {
		const engine = new InspectableCLIExportEngine(
			createCanvas(),
			createSettings(),
			[],
			[],
			1
		);
		Object.defineProperty(engine, "runExport", {
			configurable: true,
			value: () => {
				const signal = engine.lifecycle.signal;
				if (!signal) throw new Error("Missing CLI export abort signal");
				return new Promise<Blob>((_resolve, reject) => {
					signal.addEventListener(
						"abort",
						() => reject(new Error("Export cancelled by user")),
						{ once: true }
					);
				});
			},
		});

		const firstExport = engine.export();
		expect(engine.lifecycle.isExporting).toBe(true);
		expect(engine.lifecycle.signal?.aborted).toBe(false);
		await expect(engine.export()).rejects.toThrow("Export already in progress");

		engine.cancel();
		expect(engine.lifecycle.signal?.aborted).toBe(true);
		expect(engine.lifecycle.isExporting).toBe(true);
		await expect(engine.export()).rejects.toThrow("Export already in progress");
		await expect(firstExport).rejects.toThrow("Export cancelled by user");

		expect(engine.lifecycle).toEqual({
			isExporting: false,
			signal: undefined,
		});
		Object.defineProperty(engine, "runExport", {
			configurable: true,
			value: async () => new Blob(),
		});
		await expect(engine.export()).resolves.toBeInstanceOf(Blob);
		expect(engine.lifecycle.isExporting).toBe(false);
	});
});
