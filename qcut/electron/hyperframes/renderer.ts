import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
	app,
	BrowserWindow,
	session as electronSession,
	type NativeImage,
	type Session,
} from "electron";
import { getFFmpegPath } from "../ffmpeg/paths";
import { HYPERFRAMES_PROTOCOL, registerHyperframesProtocol } from "./protocol";
import type { HyperframesSessionRegistry } from "./session-registry";
import type {
	HyperframesRenderOptions,
	HyperframesRenderProgress,
	HyperframesRenderResult,
} from "./types";
import {
	COLLECT_AUDIO_VOLUMES_SCRIPT,
	buildHyperframesBrowserEncodeArgs,
	buildHyperframesEncodeArgs as buildEncodeArgs,
	collectHyperframesAudioElements,
	parseRuntimeVolumeValues,
	prepareHyperframesAudioTracks,
	type HyperframesVolumeSample,
} from "./audio";
import { hyperframesOutputRegistry } from "./output-registry";

const MAX_RENDER_DIMENSION = 4096;
const MAX_RENDER_DURATION_SECONDS = 60 * 60;
const MAX_RENDER_FPS = 120;
const PLAYER_READY_TIMEOUT_MS = 30_000;

const renderControllers = new Map<string, AbortController>();

export function validateHyperframesRenderOptions({
	options,
}: {
	options: HyperframesRenderOptions;
}): void {
	if (
		typeof options.renderId !== "string" ||
		options.renderId.trim().length === 0 ||
		typeof options.elementId !== "string" ||
		options.elementId.trim().length === 0 ||
		typeof options.sourcePath !== "string" ||
		options.sourcePath.trim().length === 0
	) {
		throw new Error(
			"HyperFrames render ID, element ID, and source path are required."
		);
	}
	if (
		!options.variables ||
		typeof options.variables !== "object" ||
		Array.isArray(options.variables) ||
		Object.values(options.variables).some(
			(value) =>
				(typeof value !== "string" &&
					typeof value !== "number" &&
					typeof value !== "boolean") ||
				(typeof value === "number" && !Number.isFinite(value))
		)
	) {
		throw new Error("HyperFrames variables must contain scalar values.");
	}
	if (
		!Number.isInteger(options.width) ||
		!Number.isInteger(options.height) ||
		options.width <= 0 ||
		options.height <= 0 ||
		options.width > MAX_RENDER_DIMENSION ||
		options.height > MAX_RENDER_DIMENSION
	) {
		throw new Error(
			`HyperFrames output dimensions must be positive integers up to ${MAX_RENDER_DIMENSION}px.`
		);
	}
	if (
		!Number.isFinite(options.fps) ||
		options.fps <= 0 ||
		options.fps > MAX_RENDER_FPS
	) {
		throw new Error(`HyperFrames FPS must be between 1 and ${MAX_RENDER_FPS}.`);
	}
	if (
		!Number.isFinite(options.duration) ||
		options.duration <= 0 ||
		options.duration > MAX_RENDER_DURATION_SECONDS
	) {
		throw new Error(
			`HyperFrames duration must be between 0 and ${MAX_RENDER_DURATION_SECONDS} seconds.`
		);
	}
}

function throwIfAborted({ signal }: { signal: AbortSignal }): void {
	if (signal.aborted) {
		throw new Error("HyperFrames render cancelled.");
	}
}

export function resolveHyperframesRenderDuration({
	runtimeDuration,
	fallbackDuration,
}: {
	runtimeDuration: unknown;
	fallbackDuration: number;
}): number {
	const duration =
		typeof runtimeDuration === "number" &&
		Number.isFinite(runtimeDuration) &&
		runtimeDuration > 0
			? runtimeDuration
			: fallbackDuration;
	if (duration > MAX_RENDER_DURATION_SECONDS) {
		throw new Error(
			`HyperFrames runtime duration exceeds ${MAX_RENDER_DURATION_SECONDS} seconds.`
		);
	}
	return duration;
}

function normalizeCapturedImage({
	image,
	width,
	height,
}: {
	image: NativeImage;
	width: number;
	height: number;
}): NativeImage {
	const size = image.getSize();
	if (size.width === width && size.height === height) return image;
	return image.resize({ width, height, quality: "best" });
}

export function isAllowedHyperframesNavigation({
	url,
	token,
}: {
	url: string;
	token: string;
}): boolean {
	try {
		const target = new URL(url);
		return (
			target.protocol === `${HYPERFRAMES_PROTOCOL}:` &&
			target.hostname === token &&
			(target.pathname === "/" || target.pathname === "/index.html")
		);
	} catch {
		return false;
	}
}

export function buildHyperframesEncodeArgs({
	framesPattern,
	outputPath,
	fps,
	duration,
	audioTracks,
}: {
	framesPattern: string;
	outputPath: string;
	fps: number;
	duration?: number;
	audioTracks?: Parameters<typeof buildEncodeArgs>[0]["audioTracks"];
}): string[] {
	return buildEncodeArgs({
		framesPattern,
		outputPath,
		fps,
		duration,
		audioTracks,
	});
}

function runFFmpeg({
	args,
	signal,
}: {
	args: string[];
	signal: AbortSignal;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(getFFmpegPath(), args, {
			windowsHide: true,
			stdio: ["ignore", "ignore", "pipe"],
		});
		let stderr = "";
		let settled = false;
		let abortError: Error | undefined;

		const finish = ({ error }: { error?: Error }) => {
			if (settled) return;
			settled = true;
			signal.removeEventListener("abort", onAbort);
			if (error) {
				reject(error);
				return;
			}
			resolve();
		};
		const onAbort = () => {
			abortError = new Error("HyperFrames render cancelled.");
			child.kill();
		};

		signal.addEventListener("abort", onAbort, { once: true });
		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.once("error", (error) => finish({ error: abortError ?? error }));
		child.once("close", (code) => {
			if (abortError) {
				finish({ error: abortError });
				return;
			}
			if (code === 0) {
				finish({});
				return;
			}
			finish({
				error: new Error(
					`HyperFrames FFmpeg encoding failed (${code ?? "unknown"}): ${stderr.trim()}`
				),
			});
		});
		if (signal.aborted) onAbort();
	});
}

const INITIALIZE_PLAYER_SCRIPT = `(async () => {
  const timeout = new Promise((_, reject) => setTimeout(
    () => reject(new Error("Timed out waiting for HyperFrames runtime")),
    ${PLAYER_READY_TIMEOUT_MS}
  ));
  await Promise.race([
    (async () => {
      if (window.__playerReady) await window.__playerReady;
      if (!window.__player) throw new Error("HyperFrames player did not initialize");
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((image) =>
        image.complete ? Promise.resolve() : image.decode().catch(() => undefined)
      ));
      window.__player.pause();
      window.__player.enableRenderMode?.();
    })(),
    timeout,
  ]);
  return true;
})()`;

async function seekToTime({
	window,
	time,
}: {
	window: BrowserWindow;
	time: number;
}): Promise<ReturnType<typeof parseRuntimeVolumeValues>> {
	const result: unknown = await window.webContents.executeJavaScript(
		`(async () => {
      window.__player.renderSeek(${JSON.stringify(time)}, { suppressEvents: true });
      if (window.__renderReady) await window.__renderReady;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return ${COLLECT_AUDIO_VOLUMES_SCRIPT};
    })()`,
		true
	);
	return parseRuntimeVolumeValues(result);
}

/** Render a HyperFrames composition to an alpha-preserving intermediate MOV. */
export async function renderHyperframesComposition({
	options,
	registry,
	onProgress,
}: {
	options: HyperframesRenderOptions;
	registry: HyperframesSessionRegistry;
	onProgress?: (progress: HyperframesRenderProgress) => void;
}): Promise<HyperframesRenderResult> {
	validateHyperframesRenderOptions({ options });
	if (renderControllers.has(options.renderId)) {
		throw new Error(
			`HyperFrames render "${options.renderId}" is already running.`
		);
	}

	const controller = new AbortController();
	renderControllers.set(options.renderId, controller);
	const sessionId = `hyperframes-${randomUUID()}`;
	const sessionDirectory = path.join(
		app.getPath("temp"),
		"qcut-hyperframes",
		sessionId
	);
	const framesDirectory = path.join(sessionDirectory, "frames");
	const outputPath = path.join(sessionDirectory, "composition.mov");
	const browserOutputPath = path.join(sessionDirectory, "composition.webm");

	let renderWindow: BrowserWindow | null = null;
	let renderSession: Session | null = null;
	let documentToken: string | null = null;
	try {
		const documentSession = registry.register(options);
		documentToken = documentSession.token;
		const partition = `hyperframes-render-${documentSession.token}`;
		renderSession = electronSession.fromPartition(partition, {
			cache: false,
		});
		registerHyperframesProtocol({
			targetProtocol: renderSession.protocol,
			registry,
		});
		renderSession.setPermissionCheckHandler(() => false);
		renderSession.setPermissionRequestHandler(
			(_webContents, _permission, callback) => callback(false)
		);

		await fs.mkdir(framesDirectory, { recursive: true });
		throwIfAborted({ signal: controller.signal });

		renderWindow = new BrowserWindow({
			show: false,
			width: options.width,
			height: options.height,
			transparent: true,
			backgroundColor: "#00000000",
			skipTaskbar: true,
			webPreferences: {
				session: renderSession,
				backgroundThrottling: false,
				contextIsolation: true,
				sandbox: true,
				nodeIntegration: false,
				offscreen: false,
				webSecurity: true,
			},
		});
		renderWindow.setContentSize(options.width, options.height);
		renderWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		const preventExternalNavigation = (event: Electron.Event, url: string) => {
			if (
				!isAllowedHyperframesNavigation({
					url,
					token: documentSession.token,
				})
			) {
				event.preventDefault();
			}
		};
		renderWindow.webContents.on("will-navigate", preventExternalNavigation);
		renderWindow.webContents.on("will-redirect", preventExternalNavigation);

		await renderWindow.loadURL(
			`${HYPERFRAMES_PROTOCOL}://${documentSession.token}/index.html`
		);
		await renderWindow.webContents.executeJavaScript(
			INITIALIZE_PLAYER_SCRIPT,
			true
		);
		const runtimeDuration: unknown =
			await renderWindow.webContents.executeJavaScript(
				"Number(window.__player?.getDuration?.())",
				true
			);
		const renderDuration = resolveHyperframesRenderDuration({
			runtimeDuration,
			fallbackDuration: options.duration,
		});
		const audioElements = await collectHyperframesAudioElements({
			window: renderWindow,
		});
		const volumeSamplesById = new Map<string, HyperframesVolumeSample[]>();

		const totalFrames = Math.max(1, Math.ceil(renderDuration * options.fps));
		for (let frame = 0; frame < totalFrames; frame += 1) {
			throwIfAborted({ signal: controller.signal });
			const frameTime = frame / options.fps;
			const volumeValues = await seekToTime({
				window: renderWindow,
				time: frameTime,
			});
			for (const value of volumeValues) {
				const samples = volumeSamplesById.get(value.id) ?? [];
				samples.push({ time: frameTime, volume: value.volume });
				volumeSamplesById.set(value.id, samples);
			}
			const capture = await renderWindow.webContents.capturePage();
			const normalized = normalizeCapturedImage({
				image: capture,
				width: options.width,
				height: options.height,
			});
			const framePath = path.join(
				framesDirectory,
				`frame-${String(frame).padStart(8, "0")}.png`
			);
			await fs.writeFile(framePath, normalized.toPNG());
			onProgress?.({
				renderId: options.renderId,
				elementId: options.elementId,
				frame: frame + 1,
				totalFrames,
				progress: ((frame + 1) / totalFrames) * 90,
			});
		}

		throwIfAborted({ signal: controller.signal });
		const audioTracks = await prepareHyperframesAudioTracks({
			elements: audioElements,
			volumeSamplesById,
			projectPath: documentSession.projectPath,
			outputDirectory: path.join(sessionDirectory, "audio"),
		});
		await runFFmpeg({
			args: buildHyperframesEncodeArgs({
				framesPattern: path.join(framesDirectory, "frame-%08d.png"),
				outputPath,
				fps: options.fps,
				duration: renderDuration,
				audioTracks,
			}),
			signal: controller.signal,
		});
		throwIfAborted({ signal: controller.signal });
		await runFFmpeg({
			args: buildHyperframesBrowserEncodeArgs({
				framesPattern: path.join(framesDirectory, "frame-%08d.png"),
				outputPath: browserOutputPath,
				fps: options.fps,
				duration: renderDuration,
				audioTracks,
			}),
			signal: controller.signal,
		});
		throwIfAborted({ signal: controller.signal });
		await fs.rm(framesDirectory, { recursive: true, force: true });
		hyperframesOutputRegistry.register({
			session: {
				sessionId,
				outputPath,
				browserOutputPath,
				sessionDirectory,
			},
		});
		onProgress?.({
			renderId: options.renderId,
			elementId: options.elementId,
			frame: totalFrames,
			totalFrames,
			progress: 100,
		});

		return {
			success: true,
			renderId: options.renderId,
			outputPath,
			outputUrl: `${HYPERFRAMES_PROTOCOL}://${sessionId}/composition.webm`,
			sessionId,
			frameCount: totalFrames,
			duration: renderDuration,
		};
	} catch (error) {
		hyperframesOutputRegistry.release({ sessionId });
		await fs.rm(sessionDirectory, { recursive: true, force: true });
		return {
			success: false,
			renderId: options.renderId,
			error: error instanceof Error ? error.message : String(error),
		};
	} finally {
		renderControllers.delete(options.renderId);
		if (documentToken) {
			registry.release({ token: documentToken });
		}
		if (renderWindow && !renderWindow.isDestroyed()) {
			renderWindow.destroy();
		}
		if (renderSession) {
			try {
				renderSession.setPermissionCheckHandler(null);
				renderSession.setPermissionRequestHandler(null);
				renderSession.protocol.unhandle(HYPERFRAMES_PROTOCOL);
				await renderSession.clearStorageData();
				await renderSession.clearCache();
			} catch {
				// Session may already be destroyed during app shutdown.
			}
		}
	}
}

export function cancelHyperframesRender({
	renderId,
}: {
	renderId: string;
}): boolean {
	const controller = renderControllers.get(renderId);
	if (!controller) return false;
	controller.abort();
	return true;
}

export async function cleanupHyperframesRender({
	sessionId,
}: {
	sessionId: string;
}): Promise<boolean> {
	const session = hyperframesOutputRegistry.release({ sessionId });
	if (!session) return false;
	await fs.rm(session.sessionDirectory, { recursive: true, force: true });
	return true;
}
