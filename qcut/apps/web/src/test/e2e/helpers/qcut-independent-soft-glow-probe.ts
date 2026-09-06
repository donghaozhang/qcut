import { createHash } from "node:crypto";
import { expect, type ElectronApplication, type Page } from "@playwright/test";

type RenderObservation = {
	phase: string;
	resourceId: string;
	provider: string;
	intensity: number;
	width: number;
	height: number;
};

type ProviderProbe = {
	phase: string;
	renders: RenderObservation[];
	nativeAttempts: string[];
	failures: { phase: string; intensity: number; message: string }[];
};

type PixelObservation = RenderObservation & {
	inputBase64: string;
	outputBase64: string;
};

export async function installProviderProbe({
	app,
}: {
	app: ElectronApplication;
}) {
	await app.evaluate(({ ipcMain }) => {
		const handlers = (
			ipcMain as unknown as {
				_invokeHandlers?: Map<string, (...args: unknown[]) => unknown>;
			}
		)._invokeHandlers;
		const channel = "qcut-independent-filter:render";
		const original = handlers?.get(channel);
		if (!handlers || !original)
			throw new Error("Independent render IPC handler is unavailable");
		const probe: ProviderProbe = {
			phase: "setup",
			renders: [],
			nativeAttempts: [],
			failures: [],
		};
		(
			globalThis as unknown as { __softGlowProbe: ProviderProbe }
		).__softGlowProbe = probe;
		handlers.set(channel, async (...args: unknown[]) => {
			const phase = probe.phase;
			const request = args[1] as {
				resourceId: string;
				intensity: number;
				width: number;
				height: number;
				rgba: Uint8Array;
			};
			let result: { provider: string; rgba: Uint8Array };
			try {
				result = (await original(...args)) as typeof result;
			} catch (error) {
				probe.failures.push({
					phase,
					intensity: request.intensity,
					message: error instanceof Error ? error.message : String(error),
				});
				throw error;
			}
			const observation = {
				phase,
				resourceId: request.resourceId,
				provider: result.provider,
				intensity: request.intensity,
				width: request.width,
				height: request.height,
			};
			probe.renders.push(observation);
			if (!phase.startsWith("export-")) {
				(
					globalThis as unknown as { __softGlowPixels: PixelObservation }
				).__softGlowPixels = {
					...observation,
					inputBase64: Buffer.from(request.rgba).toString("base64"),
					outputBase64: Buffer.from(result.rgba).toString("base64"),
				};
			}
			return result;
		});
		for (const nativeChannel of [
			"jianying-filter-lab:render-local-effect",
			"jianying-filter-lab:render-local-portrait",
		]) {
			ipcMain.removeHandler(nativeChannel);
			ipcMain.handle(nativeChannel, () => {
				probe.nativeAttempts.push(nativeChannel);
				throw new Error("Native filter fallback is forbidden in CPU E2E");
			});
		}
	});
}

export async function setPhase({
	app,
	phase,
}: {
	app: ElectronApplication;
	phase: string;
}) {
	await app.evaluate((_, value) => {
		(
			globalThis as unknown as { __softGlowProbe: ProviderProbe }
		).__softGlowProbe.phase = value;
	}, phase);
}

export async function readProbe({ app }: { app: ElectronApplication }) {
	return app.evaluate(
		() =>
			(globalThis as unknown as { __softGlowProbe: ProviderProbe })
				.__softGlowProbe
	);
}

export async function previewPixelHash({
	page,
	width,
	height,
}: {
	page: Page;
	width: number;
	height: number;
}) {
	const pixels = await page.evaluate(
		({ width, height }) => {
			const surface = document.querySelector(
				'[data-testid="preview-capture-surface"]'
			);
			const painted = surface?.querySelector<HTMLCanvasElement>(
				'[data-testid="color-preview-canvas"]'
			);
			if (painted) {
				const context = painted.getContext("2d");
				if (!context || painted.width !== width || painted.height !== height)
					return null;
				return Array.from(context.getImageData(0, 0, width, height).data);
			}
			const video = surface?.querySelector("video");
			if (!video || video.readyState < 2 || !video.paused) return null;
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext("2d");
			if (!context) return null;
			const scale = Math.min(
				width / video.videoWidth,
				height / video.videoHeight
			);
			const drawWidth = video.videoWidth * scale;
			const drawHeight = video.videoHeight * scale;
			context.drawImage(
				video,
				(width - drawWidth) / 2,
				(height - drawHeight) / 2,
				drawWidth,
				drawHeight
			);
			return Array.from(context.getImageData(0, 0, width, height).data);
		},
		{ width, height }
	);
	return pixels
		? createHash("sha256").update(Buffer.from(pixels)).digest("hex")
		: null;
}

export async function expectPaintedCpu({
	app,
	page,
	intensity,
}: {
	app: ElectronApplication;
	page: Page;
	intensity: number;
}) {
	const paused = await page.evaluate(() => {
		const video = document.querySelector<HTMLVideoElement>(
			'[data-testid="preview-capture-surface"] video'
		);
		return video?.paused ?? false;
	});
	expect(paused).toBe(true);
	const latest = await app.evaluate(
		() =>
			(globalThis as unknown as { __softGlowPixels?: PixelObservation })
				.__softGlowPixels
	);
	if (!latest || latest.intensity !== intensity)
		throw new Error("Expected CPU pixel response is missing");
	const inputSha256 = createHash("sha256")
		.update(Buffer.from(latest.inputBase64, "base64"))
		.digest("hex");
	const outputSha256 = createHash("sha256")
		.update(Buffer.from(latest.outputBase64, "base64"))
		.digest("hex");
	await expect
		.poll(
			() =>
				previewPixelHash({ page, width: latest.width, height: latest.height }),
			{ timeout: 45_000 }
		)
		.toBe(outputSha256);
	expect(outputSha256).not.toBe(inputSha256);
	return {
		phase: latest.phase,
		intensity,
		width: latest.width,
		height: latest.height,
		inputSha256,
		outputSha256,
		canvasSha256: outputSha256,
		paused,
	};
}
