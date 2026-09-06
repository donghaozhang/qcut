/**
 * Effects frame-logging export gate.
 *
 * Runs a real export of a clip carrying effects and counts the renderer's own
 * console output, so the per-frame logging burst is measured where it actually
 * happens rather than in a replica.
 *
 * The counter is installed inside the page. Counting via a host-side
 * Playwright listener would work too, but attaching one changes the cost being
 * measured, so the count and the timing stay on the renderer side.
 */

import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import {
	createTestProject,
	importTestVideo,
	stubExportSaveDialog,
	test,
} from "./helpers/electron-helpers";
import {
	installConsoleCounter,
	readConsoleCounter,
	resetConsoleCounter,
} from "./helpers/effects-logging-probe";

const EVIDENCE_DIR = path.resolve("output/playwright/effects-frame-logging");
const CLIP_SECONDS = 2;
const FPS = 30;

interface EffectScenario {
	name: string;
	effects: Array<{ name: string; parameters: Record<string, number> }>;
}

const SCENARIOS: EffectScenario[] = [
	{
		effects: [{ name: "Brighten", parameters: { brightness: 20 } }],
		name: "single-effect",
	},
	{
		effects: [
			{ name: "Brighten", parameters: { brightness: 20 } },
			{ name: "High Contrast", parameters: { contrast: 25 } },
			{ name: "Saturate", parameters: { saturation: 30 } },
		],
		name: "three-stacked-effects",
	},
];

test.use({ captureScreenshotVideo: false });
test.setTimeout(900_000);

/** Hashes the decoded video frames so two builds can be compared exactly. */
function hashFrames({ filePath }: { filePath: string }): string {
	const raw = execFileSync(
		"ffmpeg",
		["-v", "error", "-i", filePath, "-map", "v:0", "-f", "rawvideo", "-"],
		{ encoding: "buffer", maxBuffer: 1024 * 1024 * 1024 }
	);
	return createHash("sha256").update(raw).digest("hex");
}

function probeVideo({ filePath }: { filePath: string }): {
	width: number;
	height: number;
	frames: number;
	duration: number;
} {
	const raw = execFileSync(
		"ffprobe",
		[
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-count_frames",
			"-show_entries",
			"stream=width,height,nb_read_frames:format=duration",
			"-of",
			"json",
			filePath,
		],
		{ encoding: "utf8" }
	);
	const parsed = JSON.parse(raw) as {
		streams?: Array<{
			width?: number;
			height?: number;
			nb_read_frames?: string;
		}>;
		format?: { duration?: string };
	};
	const stream = parsed.streams?.[0];
	return {
		duration: Number(parsed.format?.duration ?? 0),
		frames: Number(stream?.nb_read_frames ?? 0),
		height: stream?.height ?? 0,
		width: stream?.width ?? 0,
	};
}

test.describe("effects frame logging export", () => {
	test("keeps the effects path quiet during a real export", async ({
		electronApp,
		page,
	}) => {
		await mkdir(EVIDENCE_DIR, { recursive: true });
		await createTestProject(page, "Effects Frame Logging");
		await importTestVideo(page);

		const results: Array<{
			scenario: string;
			bursts: number;
			logs: number;
			warnings: number;
			errors: number;
			installed: boolean;
			framesHash: string;
			probe: {
				width: number;
				height: number;
				frames: number;
				duration: number;
			};
		}> = [];

		// Use the canvas per-frame engine: the default CLI engine builds an
		// FFmpeg filter graph and never calls applyEffectsToCanvas.
		await page.evaluate(() => {
			localStorage.setItem("qcut_force_regular_engine", "true");
		});

		for (const scenario of SCENARIOS) {
			const placed = await page.evaluate(
				async (input) => {
					const harness = window as unknown as {
						__timelineStore: { getState: () => any };
						__mediaStore: { getState: () => any };
						__playbackStore: { getState: () => { seek: (t: number) => void } };
					};
					const timeline = harness.__timelineStore.getState();
					const media = harness.__mediaStore.getState();
					const video = media.mediaItems.find(
						(item: { type: string }) => item.type === "video"
					);
					if (!video) throw new Error("No video media item was imported");

					for (const track of [...timeline.tracks]) {
						for (const element of [...track.elements]) {
							timeline.removeElementFromTrack(track.id, element.id);
						}
					}
					const state = harness.__timelineStore.getState();
					const trackId =
						state.tracks.find(
							(track: { isMain?: boolean; type: string }) =>
								track.isMain || track.type === "media"
						)?.id ?? state.addTrack("media");

					harness.__timelineStore.getState().addElementToTrack(
						trackId,
						{
							duration: input.clipSeconds,
							effects: input.effects.map((effect, index) => ({
								duration: input.clipSeconds,
								effectType: "filter",
								enabled: true,
								id: `bench-effect-${index}`,
								name: effect.name,
								parameters: effect.parameters,
							})),
							mediaId: video.id,
							name: "effects-bench-clip",
							startTime: 0,
							trimEnd: 0,
							trimStart: 0,
							type: "media",
						},
						{ pushHistory: false, selectElement: false }
					);
					harness.__playbackStore.getState().seek(0);
					const after = harness.__timelineStore.getState();
					const element = after.tracks
						.flatMap((track: { elements: unknown[] }) => track.elements)
						.find(
							(item: { name?: string }) => item.name === "effects-bench-clip"
						);
					return element?.effects?.length ?? 0;
				},
				{ clipSeconds: CLIP_SECONDS, effects: scenario.effects }
			);
			expect(placed).toBe(scenario.effects.length);

			const outputPath = path.join(EVIDENCE_DIR, `${scenario.name}.mp4`);
			await stubExportSaveDialog({ electronApp, outputPath });
			await ensureExportActions({ page });
			await installConsoleCounter({ page });
			await resetConsoleCounter({ page });

			const startedAt = Date.now();
			await page.evaluate(async (target) => {
				const actions = (
					window as unknown as {
						__exportActions?: {
							exportLocalVideo: (
								options: Record<string, unknown>
							) => Promise<unknown>;
						};
					}
				).__exportActions;
				if (!actions) throw new Error("Export actions are not registered");
				await actions.exportLocalVideo({
					engine: "muxer",
					filename: "effects-bench.mp4",
					format: "mp4",
					frameRate: 30,
					height: 720,
					outputPath: target,
					quality: "720p",
					width: 1280,
				});
			}, outputPath);
			const exportWallMs = Date.now() - startedAt;

			await expect
				.poll(() => existsSync(outputPath), { timeout: 300_000 })
				.toBe(true);

			const counts = await readConsoleCounter({ page });
			const probe = probeVideo({ filePath: outputPath });
			const framesHash = hashFrames({ filePath: outputPath });

			console.log(
				`[effects-export] ${scenario.name.padEnd(22)} ` +
					`effectsBursts=${String(counts.effectsBursts).padStart(4)} ` +
					`totalLogs=${String(counts.log).padStart(5)} ` +
					`warn=${counts.warn} error=${counts.error} ` +
					`wallMs=${exportWallMs} frames=${probe.frames}`
			);
			console.log(
				`[effects-export] ${scenario.name} FRAMES_SHA256=${framesHash} ` +
					`geometry=${probe.width}x${probe.height} duration=${probe.duration.toFixed(3)}`
			);

			results.push({
				bursts: counts.effectsBursts,
				errors: counts.error,
				framesHash,
				installed: counts.installed,
				logs: counts.log,
				probe,
				scenario: scenario.name,
				warnings: counts.warn,
			});
		}

		// Assertions run after every scenario has been measured, so a baseline
		// build still reports both scenarios before the gate fails it.
		for (const entry of results) {
			expect(entry.installed).toBe(true);
			// Output invariants: the gate must not touch what is rendered.
			expect(entry.probe.width).toBe(1280);
			expect(entry.probe.height).toBe(720);
			expect(entry.probe.frames).toBeGreaterThanOrEqual(CLIP_SECONDS * FPS - 2);
			expect(entry.probe.frames).toBeLessThanOrEqual(CLIP_SECONDS * FPS + 2);
			// The point of the change: no per-frame effect tracing in normal mode.
			expect(entry.bursts).toBe(0);
		}
	});
});

/** Opens the export panel so `__exportActions` is registered. */
async function ensureExportActions({
	page,
}: {
	page: import("@playwright/test").Page;
}): Promise<void> {
	const registered = await page.evaluate(() =>
		Boolean(
			(window as unknown as { __exportActions?: unknown }).__exportActions
		)
	);
	if (registered) return;
	await page.locator('[data-testid="export-button"]').click();
	await expect
		.poll(
			() =>
				page.evaluate(() =>
					Boolean(
						(window as unknown as { __exportActions?: unknown }).__exportActions
					)
				),
			{ timeout: 60_000 }
		)
		.toBe(true);
}
