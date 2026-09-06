/**
 * Overlay sticker render benchmark.
 *
 * Architecture facts this spec encodes (traced, not assumed):
 *  - The timeline StickerElement is the owner of record; the overlay store is
 *    a derived mirror plus a field-level fallback for the renderers.
 *  - In a normal project every sticker is timeline-backed, so the export
 *    renderer's per-frame overlay pass excludes them all and draws nothing —
 *    but still pays for a store projection, two full track walks and a sort
 *    per frame before discovering that.
 *  - Preview and export read the same store pair, so scenarios built here
 *    exercise both paths from one source.
 *
 * Scenarios: no sticker, one static overlay sticker, three overlapping, one
 * animated. Every sticker is created the normal way (overlay entry + timeline
 * element), and the exported frames are gated on sticker-region pixels so
 * "reached the export" is proven rather than inferred from store state.
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

const EVIDENCE_DIR = path.resolve("output/playwright/overlay-sticker");
const FIXTURE_DIR = path.join(tmpdir(), "qcut-overlay-sticker-fixtures");
const CLIP_SECONDS = 2;
const FPS = 30;
const EXPORT_WIDTH = 640;
const EXPORT_HEIGHT = 360;

function generateBackdrop(): string {
	mkdirSync(FIXTURE_DIR, { recursive: true });
	const filePath = path.join(FIXTURE_DIR, "overlay-backdrop.mp4");
	if (existsSync(filePath)) return filePath;
	// A flat dark backdrop makes the sticker region's pixel delta unambiguous.
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-f",
			"lavfi",
			"-i",
			`color=c=0x202020:size=640x360:rate=${FPS}:duration=${CLIP_SECONDS}`,
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-pix_fmt",
			"yuv420p",
			"-movflags",
			"+faststart",
			filePath,
		],
		{ stdio: "pipe" }
	);
	return filePath;
}

function generateStickerImage(): string {
	mkdirSync(FIXTURE_DIR, { recursive: true });
	const filePath = path.join(FIXTURE_DIR, "overlay-sticker.png");
	if (existsSync(filePath)) return filePath;
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-f",
			"lavfi",
			"-i",
			"color=c=0xff8800:size=96x96,format=rgba",
			"-frames:v",
			"1",
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

/** Mean RGB inside and outside a centre region for chosen frames. */
function regionStats({
	filePath,
	frameIndexes,
}: {
	filePath: string;
	frameIndexes: readonly number[];
}): Array<{
	frame: number;
	insideMean: number;
	outsideMean: number;
	frameHash: string;
}> {
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
	const results: Array<{
		frame: number;
		insideMean: number;
		outsideMean: number;
		frameHash: string;
	}> = [];
	// The sticker sits at canvas centre with size ~15%; sample a small window
	// around the centre for "inside" and the top-left corner for "outside".
	const cx = Math.floor(probe.width / 2);
	const cy = Math.floor(probe.height / 2);
	const half = 20;
	for (const frame of frameIndexes) {
		const offset = frame * frameBytes;
		if (offset + frameBytes > raw.length) continue;
		let insideSum = 0;
		let insideCount = 0;
		let outsideSum = 0;
		let outsideCount = 0;
		for (let y = cy - half; y < cy + half; y += 1) {
			for (let x = cx - half; x < cx + half; x += 1) {
				const p = offset + (y * probe.width + x) * 3;
				insideSum += raw[p] + raw[p + 1] + raw[p + 2];
				insideCount += 3;
			}
		}
		for (let y = 4; y < 44; y += 1) {
			for (let x = 4; x < 44; x += 1) {
				const p = offset + (y * probe.width + x) * 3;
				outsideSum += raw[p] + raw[p + 1] + raw[p + 2];
				outsideCount += 3;
			}
		}
		results.push({
			frame,
			frameHash: createHash("sha256")
				.update(raw.subarray(offset, offset + frameBytes))
				.digest("hex")
				.slice(0, 16),
			insideMean: insideSum / Math.max(1, insideCount),
			outsideMean: outsideSum / Math.max(1, outsideCount),
		});
	}
	return results;
}

/**
 * Mean absolute per-channel difference between two frames over a centre crop
 * that covers the sticker and its edge. Whole-frame hashes are perturbed by
 * encoder noise, so animation is proven by this tolerant metric instead.
 */
function centreCropMad({
	filePath,
	frameA,
	frameB,
	cropHalf = 75,
}: {
	filePath: string;
	frameA: number;
	frameB: number;
	cropHalf?: number;
}): number {
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
	const cx = Math.floor(probe.width / 2);
	const cy = Math.floor(probe.height / 2);
	let sum = 0;
	let count = 0;
	for (let y = cy - cropHalf; y < cy + cropHalf; y += 1) {
		for (let x = cx - cropHalf; x < cx + cropHalf; x += 1) {
			const base = (y * probe.width + x) * 3;
			const pa = frameA * frameBytes + base;
			const pb = frameB * frameBytes + base;
			for (let c = 0; c < 3; c += 1) {
				sum += Math.abs(raw[pa + c] - raw[pb + c]);
				count += 1;
			}
		}
	}
	return count > 0 ? sum / count : 0;
}

interface Scenario {
	label: string;
	stickers: number;
	animated: boolean;
}

const SCENARIOS: Scenario[] = [
	{ animated: false, label: "no-sticker", stickers: 0 },
	{ animated: false, label: "single-sticker", stickers: 1 },
	{ animated: false, label: "three-overlapping", stickers: 3 },
	{ animated: true, label: "animated-sticker", stickers: 1 },
];

test.use({ captureScreenshotVideo: false });
test.setTimeout(900_000);

test.describe("overlay sticker rendering", () => {
	test("benchmarks preview and export across sticker scenarios", async ({
		electronApp,
		page,
	}) => {
		await mkdir(EVIDENCE_DIR, { recursive: true });
		await createTestProject(page, "Overlay Sticker Benchmark");
		await uploadTestMedia(page, generateBackdrop());
		await uploadTestMedia(page, generateStickerImage());

		// Canvas per-frame engine, where the overlay pass under test runs.
		await page.evaluate(() => {
			localStorage.setItem("qcut_force_regular_engine", "true");
		});

		const results: Array<{
			label: string;
			exportWallMs: number;
			visibleCallUs: number;
			probe: ReturnType<typeof probeVideo>;
			stats: ReturnType<typeof regionStats>;
			storeCount: number;
			timelineCount: number;
		}> = [];

		for (const scenario of SCENARIOS) {
			const counts = await page.evaluate(
				async (input) => {
					const harness = window as unknown as {
						stickerTest: { getStores: () => Record<string, any> };
						stickerTestReady: Promise<void>;
						__timelineStore: { getState: () => any };
						__mediaStore: { getState: () => any };
						__playbackStore: { getState: () => { seek: (t: number) => void } };
					};
					await harness.stickerTestReady;
					const stores = harness.stickerTest.getStores();
					const timeline = harness.__timelineStore.getState();
					const media = harness.__mediaStore.getState();

					for (const track of [...timeline.tracks]) {
						for (const element of [...track.elements]) {
							timeline.removeElementFromTrack(track.id, element.id);
						}
					}
					for (const sticker of [...stores.stickers.overlayStickers.keys()]) {
						stores.stickers.removeOverlaySticker(sticker);
					}

					const backdrop = media.mediaItems.find((item: { name: string }) =>
						item.name.includes("overlay-backdrop")
					);
					const stickerImage = media.mediaItems.find((item: { name: string }) =>
						item.name.includes("overlay-sticker")
					);
					if (!backdrop || !stickerImage) {
						throw new Error("Benchmark media missing");
					}

					const state = harness.__timelineStore.getState();
					const mediaTrackId =
						state.tracks.find(
							(track: { isMain?: boolean; type: string }) =>
								track.isMain || track.type === "media"
						)?.id ?? state.addTrack("media");
					harness.__timelineStore.getState().addElementToTrack(
						mediaTrackId,
						{
							duration: input.clipSeconds,
							mediaId: backdrop.id,
							name: "backdrop",
							startTime: 0,
							trimEnd: 0,
							trimStart: 0,
							type: "media",
						},
						{ pushHistory: false, selectElement: false }
					);

					// Stickers the normal way: overlay entry + timeline element,
					// overlapping at canvas centre.
					for (let index = 0; index < input.stickers; index += 1) {
						const stickerId = stores.stickers.addOverlaySticker(
							stickerImage.id,
							{
								maintainAspectRatio: true,
								opacity: 1,
								position: { x: 50, y: 50 },
								rotation: 0,
								size: { height: 15, width: 15 },
							}
						);
						const stickerTrackId = harness.__timelineStore
							.getState()
							.insertTrackAt("sticker", 0);
						harness.__timelineStore.getState().addElementToTrack(
							stickerTrackId,
							{
								duration: input.clipSeconds,
								height: 15,
								maintainAspectRatio: true,
								mediaId: stickerImage.id,
								name: `overlay-${index}`,
								opacity: 1,
								rotation: 0,
								startTime: 0,
								stickerId,
								trimEnd: 0,
								trimStart: 0,
								type: "sticker",
								width: 15,
								x: 50,
								y: 50,
								zIndex: 1 + index,
								...(input.animated
									? { animationLoopIntensity: 50, animationLoopType: "pulse" }
									: {}),
							},
							{ pushHistory: false, selectElement: false }
						);
					}
					harness.__playbackStore.getState().seek(0);

					const after = harness.stickerTest.getStores();
					const timelineCount = harness.__timelineStore
						.getState()
						.tracks.flatMap((track: { elements: unknown[] }) => track.elements)
						.filter(
							(element: { type: string }) => element.type === "sticker"
						).length;
					return {
						storeCount: after.stickers.overlayStickers.size,
						timelineCount,
					};
				},
				{
					animated: scenario.animated,
					clipSeconds: CLIP_SECONDS,
					stickers: scenario.stickers,
				}
			);
			expect(counts.storeCount, `${scenario.label} store entries`).toBe(
				scenario.stickers
			);
			expect(counts.timelineCount, `${scenario.label} timeline elements`).toBe(
				scenario.stickers
			);

			// Per-frame overlay-pass cost, measured directly: this is what every
			// exported frame pays before the exclude filter empties the list.
			const visibleCallUs = await page.evaluate(() => {
				const stores = (
					window as unknown as {
						stickerTest: { getStores: () => Record<string, any> };
					}
				).stickerTest.getStores();
				const iterations = 2000;
				const startedAt = performance.now();
				for (let index = 0; index < iterations; index += 1) {
					stores.stickers.getVisibleStickersAtTime(1);
				}
				return Number(
					(((performance.now() - startedAt) / iterations) * 1000).toFixed(2)
				);
			});

			const outputPath = path.join(EVIDENCE_DIR, `${scenario.label}.mp4`);
			await stubExportSaveDialog({ electronApp, outputPath });
			await ensureExportActions({ page });
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
					filename: "overlay.mp4",
					format: "mp4",
					frameRate: 30,
					height: 360,
					outputPath: target,
					quality: "480p",
					width: 640,
				});
			}, outputPath);
			const exportWallMs = Date.now() - startedAt;
			await expect
				.poll(() => existsSync(outputPath), { timeout: 300_000 })
				.toBe(true);

			const probe = probeVideo({ filePath: outputPath });
			const stats = regionStats({
				filePath: outputPath,
				frameIndexes: [5, 30, 55],
			});
			console.log(
				`[overlay-bench] ${scenario.label.padEnd(20)} exportWallMs=${exportWallMs} ` +
					`visibleCallUs=${visibleCallUs} frames=${probe.frames} ` +
					`inside=${stats.map((s) => s.insideMean.toFixed(1)).join("/")} ` +
					`outside=${stats.map((s) => s.outsideMean.toFixed(1)).join("/")} ` +
					`hashes=${stats.map((s) => s.frameHash).join(",")}`
			);

			results.push({
				exportWallMs,
				label: scenario.label,
				probe,
				stats,
				storeCount: counts.storeCount,
				timelineCount: counts.timelineCount,
				visibleCallUs,
			});
		}

		const byLabel = new Map(results.map((entry) => [entry.label, entry]));
		const none = byLabel.get("no-sticker");
		const single = byLabel.get("single-sticker");
		const three = byLabel.get("three-overlapping");
		const animated = byLabel.get("animated-sticker");
		if (!none || !single || !three || !animated) {
			throw new Error("Missing scenario");
		}

		const BACKDROP_MEAN = 0x20; // flat 0x202020 backdrop, per-channel mean
		for (const entry of [single, three, animated]) {
			for (const stat of entry.stats) {
				// The sticker must actually be in the exported pixels: the centre
				// region must be far brighter than the backdrop...
				expect(
					stat.insideMean,
					`${entry.label} frame ${stat.frame} sticker region`
				).toBeGreaterThan(BACKDROP_MEAN + 60);
				// ...while pixels outside the sticker stay backdrop-coloured.
				expect(
					Math.abs(stat.outsideMean - BACKDROP_MEAN),
					`${entry.label} frame ${stat.frame} outside region`
				).toBeLessThan(12);
			}
			expect(entry.probe.frames).toBeGreaterThanOrEqual(CLIP_SECONDS * FPS - 2);
		}
		for (const stat of none.stats) {
			expect(Math.abs(stat.insideMean - BACKDROP_MEAN)).toBeLessThan(12);
		}
		// Animation evidence with an encoder-noise-tolerant metric: the animated
		// sticker's centre crop must change across frames far more than the
		// static sticker's does.
		const staticMad = centreCropMad({
			filePath: path.join(EVIDENCE_DIR, "single-sticker.mp4"),
			frameA: 5,
			frameB: 30,
		});
		const animatedMad = centreCropMad({
			filePath: path.join(EVIDENCE_DIR, "animated-sticker.mp4"),
			frameA: 5,
			frameB: 30,
		});
		console.log(
			`[overlay-bench] MAD static=${staticMad.toFixed(3)} animated=${animatedMad.toFixed(3)}`
		);
		expect(staticMad, "static sticker must not move").toBeLessThan(2);
		expect(
			animatedMad,
			"animated sticker must visibly animate"
		).toBeGreaterThan(staticMad * 3 + 1);

		// --- Reopen gate: the timeline is the owner of record ------------------
		await page.reload();
		await page.waitForLoadState("domcontentloaded");
		// The harness globals are registered asynchronously after reload, so poll
		// for them rather than awaiting a promise that may not exist yet.
		await expect
			.poll(
				() =>
					page.evaluate(() =>
						Boolean(
							(window as unknown as { stickerTest?: unknown }).stickerTest &&
								(window as unknown as { __timelineStore?: unknown })
									.__timelineStore
						)
					),
				{ timeout: 60_000 }
			)
			.toBe(true);
		await page.evaluate(async () => {
			await (window as unknown as { stickerTestReady?: Promise<void> })
				.stickerTestReady;
		});
		// Wait for the reopened project's timeline to actually carry elements.
		await expect
			.poll(
				() =>
					page.evaluate(
						() =>
							(
								window as unknown as {
									__timelineStore: { getState: () => { tracks: unknown[] } };
								}
							).__timelineStore.getState().tracks.length
					),
				{ timeout: 60_000 }
			)
			.toBeGreaterThan(0);
		console.log(`[overlay-bench] REOPEN_URL=${page.url()}`);
		// Project data loads after the harness globals appear; wait for the
		// sticker element itself rather than a fixed delay.
		await expect
			.poll(
				() =>
					page.evaluate(
						() =>
							(
								window as unknown as {
									__timelineStore: {
										getState: () => {
											tracks: Array<{ elements: Array<{ type: string }> }>;
										};
									};
								}
							).__timelineStore
								.getState()
								.tracks.flatMap((track) => track.elements)
								.filter((element) => element.type === "sticker").length
					),
				{ timeout: 60_000 }
			)
			.toBeGreaterThan(0);
		const reopened = await page.evaluate(() => {
			const harness = window as unknown as {
				stickerTest: { getStores: () => Record<string, any> };
				__timelineStore: { getState: () => any };
			};
			const stores = harness.stickerTest.getStores();
			const stickerElements = harness.__timelineStore
				.getState()
				.tracks.flatMap((track: { elements: unknown[] }) => track.elements)
				.filter((element: { type: string }) => element.type === "sticker");
			return {
				projectId: (
					window as unknown as {
						__projectStore: {
							getState: () => { activeProject?: { id: string } };
						};
					}
				).__projectStore.getState().activeProject?.id,
				storeCount: stores.stickers.overlayStickers.size,
				timelineCount: stickerElements.length,
				trackCount: (
					window as unknown as {
						__timelineStore: { getState: () => { tracks: unknown[] } };
					}
				).__timelineStore.getState().tracks.length,
				x: stickerElements[0]?.x,
				y: stickerElements[0]?.y,
			};
		});
		console.log(`[overlay-bench] REOPEN=${JSON.stringify(reopened)}`);
		// The last scenario (animated, one sticker) must survive reopen with its
		// geometry intact, in both the timeline and the mirrored overlay store.
		expect(reopened.timelineCount).toBe(1);
		expect(reopened.storeCount).toBe(1);
		expect(reopened.x).toBe(50);
		expect(reopened.y).toBe(50);

		console.log(
			`[overlay-bench] SUMMARY ${JSON.stringify(
				results.map((entry) => ({
					exportWallMs: entry.exportWallMs,
					label: entry.label,
					visibleCallUs: entry.visibleCallUs,
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
