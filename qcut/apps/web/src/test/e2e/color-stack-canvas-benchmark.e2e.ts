/**
 * Colour-stack canvas allocation benchmark.
 *
 * `drawColorGradedSourceStack` renders each media element through an
 * intermediate "grade" canvas. This spec measures how many canvases a real
 * export allocates across four scenarios, and pins the exported frames so a
 * pooling change can be proven output-identical.
 *
 * Two of the scenarios exist specifically to protect the pixel semantics: the
 * intermediate canvas is sized `Math.round(width/height)` but blitted at the
 * element's fractional bounds, so integer-bounds and fractional-bounds cases
 * can diverge independently and both are hashed.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect } from "@playwright/test";
import {
	createTestProject,
	stubExportSaveDialog,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";
import {
	formatAllocationStats,
	installCanvasCounter,
	readCanvasCounter,
	readHeapMb,
	resetCanvasCounter,
} from "./helpers/canvas-allocation-probe";

const EVIDENCE_DIR = path.resolve("output/playwright/color-stack");
const FIXTURE_DIR = path.join(tmpdir(), "qcut-color-stack-fixtures");
const CLIP_SECONDS = 2;
const FPS = 30;
const EXPORT_WIDTH = 640;
const EXPORT_HEIGHT = 360;

/**
 * 16:9 media lands on integer bounds in a 640x360 frame; the 1000x1080 source
 * is scaled by 360/1080 giving a fractional width of 333.33, which is the
 * rounding-sensitive case.
 */
const SOURCES = {
	fractional: { height: 1080, name: "color-src-fractional", width: 1000 },
	integer: { height: 1080, name: "color-src-integer", width: 1920 },
} as const;

function generateClip({
	name,
	width,
	height,
}: {
	name: string;
	width: number;
	height: number;
}): string {
	mkdirSync(FIXTURE_DIR, { recursive: true });
	const filePath = path.join(FIXTURE_DIR, `${name}.mp4`);
	if (existsSync(filePath)) return filePath;
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-f",
			"lavfi",
			"-i",
			`testsrc2=size=${width}x${height}:rate=${FPS}:duration=${CLIP_SECONDS}`,
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-pix_fmt",
			"yuv420p",
			"-g",
			String(FPS),
			"-movflags",
			"+faststart",
			filePath,
		],
		{ stdio: "pipe" }
	);
	return filePath;
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

/** SHA-256 over every decoded frame, plus per-frame hashes. */
function hashFrames({ filePath }: { filePath: string }): {
	whole: string;
	perFrame: string[];
} {
	const raw = execFileSync(
		"ffmpeg",
		[
			"-v",
			"error",
			"-i",
			filePath,
			"-map",
			"v:0",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgb24",
			"-",
		],
		{ encoding: "buffer", maxBuffer: 1024 * 1024 * 1024 }
	);
	const probe = probeVideo({ filePath });
	const frameBytes = probe.width * probe.height * 3;
	const perFrame: string[] = [];
	for (
		let offset = 0;
		offset + frameBytes <= raw.length;
		offset += frameBytes
	) {
		perFrame.push(
			createHash("sha256")
				.update(raw.subarray(offset, offset + frameBytes))
				.digest("hex")
				.slice(0, 16)
		);
	}
	return {
		perFrame,
		whole: createHash("sha256").update(raw).digest("hex"),
	};
}

interface Scenario {
	label: string;
	source: keyof typeof SOURCES;
	clips: number;
	colorEdit: boolean;
}

const SCENARIOS: Scenario[] = [
	{ clips: 1, colorEdit: false, label: "no-color-edits", source: "integer" },
	{ clips: 1, colorEdit: true, label: "single-color-edit", source: "integer" },
	{ clips: 3, colorEdit: false, label: "three-clips", source: "integer" },
	{
		clips: 1,
		colorEdit: false,
		label: "fractional-bounds",
		source: "fractional",
	},
];

test.use({ captureScreenshotVideo: false });
test.setTimeout(900_000);

test.describe("colour stack canvas allocation", () => {
	test("measures canvas churn and pins exported frames", async ({
		electronApp,
		page,
	}) => {
		await mkdir(EVIDENCE_DIR, { recursive: true });
		const clipPaths = Object.values(SOURCES).map((source) =>
			generateClip(source)
		);

		await createTestProject(page, "Colour Stack Canvas");
		for (const clipPath of clipPaths) {
			await uploadTestMedia(page, clipPath);
		}

		// Canvas per-frame engine: the CLI engine builds an FFmpeg filter graph
		// and never calls drawColorGradedSourceStack.
		await page.evaluate(() => {
			localStorage.setItem("qcut_force_regular_engine", "true");
		});
		await installCanvasCounter({ page });

		const results: Array<{
			label: string;
			canvases: number;
			perElementFrame: number;
			wallMs: number;
			heapMb: number;
			whole: string;
			perFrame: string[];
			probe: ReturnType<typeof probeVideo>;
			bounds: { width: number; height: number };
		}> = [];

		for (const scenario of SCENARIOS) {
			const source = SOURCES[scenario.source];
			const bounds = await page.evaluate(
				async (input) => {
					const harness = window as unknown as {
						__timelineStore: { getState: () => any };
						__mediaStore: { getState: () => any };
						__playbackStore: { getState: () => { seek: (t: number) => void } };
					};
					const timeline = harness.__timelineStore.getState();
					const media = harness.__mediaStore.getState();
					for (const track of [...timeline.tracks]) {
						for (const element of [...track.elements]) {
							timeline.removeElementFromTrack(track.id, element.id);
						}
					}
					const item = media.mediaItems.find((candidate: { name: string }) =>
						candidate.name.includes(input.sourceName)
					);
					if (!item) throw new Error(`Missing media ${input.sourceName}`);

					const state = harness.__timelineStore.getState();
					const trackId =
						state.tracks.find(
							(track: { isMain?: boolean; type: string }) =>
								track.isMain || track.type === "media"
						)?.id ?? state.addTrack("media");

					for (let index = 0; index < input.clips; index += 1) {
						harness.__timelineStore.getState().addElementToTrack(
							trackId,
							{
								duration: input.clipSeconds,
								mediaId: item.id,
								name: `color-clip-${index}`,
								startTime: index * input.clipSeconds,
								trimEnd: 0,
								trimStart: 0,
								type: "media",
								...(input.colorEdit
									? {
											color: {
												basic: { brightness: 45, enabled: true },
												enabled: true,
											},
										}
									: {}),
							},
							{ pushHistory: false, selectElement: false }
						);
					}
					harness.__playbackStore.getState().seek(0);
					// Report the scaled element size so the fractional case is proven
					// fractional rather than assumed.
					const scale = Math.min(
						input.exportWidth / (item.width ?? 1),
						input.exportHeight / (item.height ?? 1)
					);
					return {
						height: (item.height ?? 0) * scale,
						width: (item.width ?? 0) * scale,
					};
				},
				{
					clipSeconds: CLIP_SECONDS,
					clips: scenario.clips,
					colorEdit: scenario.colorEdit,
					exportHeight: EXPORT_HEIGHT,
					exportWidth: EXPORT_WIDTH,
					sourceName: source.name,
				}
			);

			const outputPath = path.join(EVIDENCE_DIR, `${scenario.label}.mp4`);
			await stubExportSaveDialog({ electronApp, outputPath });
			await ensureExportActions({ page });
			await resetCanvasCounter({ page });

			const startedAt = Date.now();
			await page.evaluate(
				async (input) => {
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
						filename: "color-stack.mp4",
						format: "mp4",
						frameRate: 30,
						height: input.height,
						outputPath: input.target,
						quality: "480p",
						width: input.width,
					});
				},
				{
					height: EXPORT_HEIGHT,
					target: outputPath,
					width: EXPORT_WIDTH,
				}
			);
			const wallMs = Date.now() - startedAt;

			await expect
				.poll(() => existsSync(outputPath), { timeout: 300_000 })
				.toBe(true);

			const stats = await readCanvasCounter({ page });
			const heapMb = await readHeapMb({ page });
			const probe = probeVideo({ filePath: outputPath });
			const hashes = hashFrames({ filePath: outputPath });
			const elements = scenario.clips;

			console.log(
				formatAllocationStats({
					elements,
					frames: probe.frames,
					label: scenario.label,
					stats,
				})
			);
			console.log(
				`[color-alloc] ${scenario.label} wallMs=${wallMs} heapMb=${heapMb} ` +
					`frames=${probe.frames} bounds=${bounds.width.toFixed(3)}x${bounds.height.toFixed(3)} ` +
					`WHOLE_SHA=${hashes.whole}`
			);
			const dominant = Object.entries(stats.bySize).sort(
				(a, b) => b[1] - a[1]
			)[0];
			if (dominant) {
				console.log(
					`[color-alloc] ${scenario.label} dominantBucket=${dominant[0]}x${dominant[1]} ` +
						`allocatedBy=${stats.stackBySize[dominant[0]] ?? "(no stack)"}`
				);
			}

			results.push({
				bounds,
				canvases: stats.total,
				heapMb,
				label: scenario.label,
				perElementFrame:
					probe.frames > 0 ? stats.total / (probe.frames * elements) : 0,
				perFrame: hashes.perFrame,
				probe,
				wallMs,
				whole: hashes.whole,
			});
		}

		const byLabel = new Map(results.map((entry) => [entry.label, entry]));
		const noEdits = byLabel.get("no-color-edits");
		const singleEdit = byLabel.get("single-color-edit");
		const fractional = byLabel.get("fractional-bounds");
		if (!noEdits || !singleEdit || !fractional) {
			throw new Error("Missing scenario result");
		}

		// The colour edit must actually have taken effect, otherwise the
		// "edited" scenario is a duplicate of the unedited one.
		expect(
			singleEdit.whole,
			"colour edit must change the exported frames"
		).not.toBe(noEdits.whole);

		// The fractional scenario must really be fractional.
		expect(
			Number.isInteger(fractional.bounds.width) &&
				Number.isInteger(fractional.bounds.height),
			`fractional bounds were ${fractional.bounds.width}x${fractional.bounds.height}`
		).toBe(false);
		expect(
			Number.isInteger(noEdits.bounds.width) &&
				Number.isInteger(noEdits.bounds.height),
			`integer bounds were ${noEdits.bounds.width}x${noEdits.bounds.height}`
		).toBe(true);

		for (const entry of results) {
			expect(entry.probe.width).toBe(EXPORT_WIDTH);
			expect(entry.probe.height).toBe(EXPORT_HEIGHT);
			expect(entry.perFrame.length).toBeGreaterThan(0);
		}

		console.log(
			`[color-alloc] SUMMARY ${JSON.stringify(
				results.map((entry) => ({
					canvases: entry.canvases,
					label: entry.label,
					perElementFrame: Number(entry.perElementFrame.toFixed(2)),
					whole: entry.whole.slice(0, 16),
				}))
			)}`
		);
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
