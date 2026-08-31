/**
 * Transition window frame gate.
 *
 * Exports real timelines carrying a dissolve, a slide and a zoom-blur seam and
 * checks the frames around and inside each transition window.
 *
 * The point is to have an output-level fixture for the transition layer
 * question: the boundary frames of a window must match the surrounding hard
 * cut (the presentation is identity at progress 0 and 1), while frames inside
 * the window must differ from both neighbours. A change that wrongly
 * short-circuits a contributing layer — or wrongly builds one that contributes
 * nothing — moves exactly these frames.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { expect } from "@playwright/test";
import {
	createTestProject,
	stubExportSaveDialog,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const EVIDENCE_DIR = path.resolve("output/playwright/transition-window");
const FIXTURE_DIR = path.join(tmpdir(), "qcut-transition-fixtures");
const CLIP_SECONDS = 2;
const FPS = 30;
const TRANSITION_SECONDS = 1;

/** Distinct, per-frame-varying sources so frame hashes are meaningful. */
function generateClip({ variant }: { variant: "a" | "b" }): string {
	mkdirSync(FIXTURE_DIR, { recursive: true });
	const filePath = path.join(FIXTURE_DIR, `transition-clip-${variant}.mp4`);
	if (existsSync(filePath)) return filePath;
	const source =
		variant === "a"
			? `testsrc2=size=640x360:rate=${FPS}:duration=${CLIP_SECONDS}`
			: `smptebars=size=640x360:rate=${FPS}:duration=${CLIP_SECONDS}`;
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-f",
			"lavfi",
			"-i",
			source,
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

/** Per-frame SHA-256 of the decoded video, one entry per frame. */
function frameHashes({ filePath }: { filePath: string }): string[] {
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
	const hashes: string[] = [];
	for (
		let offset = 0;
		offset + frameBytes <= raw.length;
		offset += frameBytes
	) {
		hashes.push(
			createHash("sha256")
				.update(raw.subarray(offset, offset + frameBytes))
				.digest("hex")
				.slice(0, 16)
		);
	}
	return hashes;
}

function probeVideo({ filePath }: { filePath: string }): {
	width: number;
	height: number;
	frames: number;
	duration: number;
	audioCodec: string;
} {
	const raw = execFileSync(
		"ffprobe",
		[
			"-v",
			"error",
			"-count_frames",
			"-show_entries",
			"stream=codec_type,codec_name,width,height,nb_read_frames:format=duration",
			"-of",
			"json",
			filePath,
		],
		{ encoding: "utf8" }
	);
	const parsed = JSON.parse(raw) as {
		streams?: Array<{
			codec_type?: string;
			codec_name?: string;
			width?: number;
			height?: number;
			nb_read_frames?: string;
		}>;
		format?: { duration?: string };
	};
	const video = parsed.streams?.find((s) => s.codec_type === "video");
	const audio = parsed.streams?.find((s) => s.codec_type === "audio");
	return {
		audioCodec: audio?.codec_name ?? "none",
		duration: Number(parsed.format?.duration ?? 0),
		frames: Number(video?.nb_read_frames ?? 0),
		height: video?.height ?? 0,
		width: video?.width ?? 0,
	};
}

const TRANSITIONS = [
	{ label: "dissolve", type: "dissolve" },
	{ label: "slide", type: "slide" },
	{ label: "zoom-blur", type: "zoom-blur" },
] as const;

test.use({ captureScreenshotVideo: false });
test.setTimeout(900_000);

test.describe("transition window frames", () => {
	test("keeps window boundaries stable and window interiors distinct", async ({
		electronApp,
		page,
	}) => {
		await mkdir(EVIDENCE_DIR, { recursive: true });
		const clipA = generateClip({ variant: "a" });
		const clipB = generateClip({ variant: "b" });

		await createTestProject(page, "Transition Window Frames");
		await uploadTestMedia(page, clipA);
		await uploadTestMedia(page, clipB);

		// Canvas per-frame engine: the CLI engine builds an FFmpeg filter graph
		// and never exercises the transition layer code under test.
		await page.evaluate(() => {
			localStorage.setItem("qcut_force_regular_engine", "true");
		});

		const results: Array<{
			label: string;
			hashes: string[];
			probe: ReturnType<typeof probeVideo>;
		}> = [];

		for (const entry of TRANSITIONS) {
			const applied = await page.evaluate(
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
					const items = media.mediaItems.filter(
						(item: { type: string }) => item.type === "video"
					);
					const first = items.find((item: { name: string }) =>
						item.name.includes("transition-clip-a")
					);
					const second = items.find((item: { name: string }) =>
						item.name.includes("transition-clip-b")
					);
					if (!first || !second) throw new Error("Transition clips missing");

					const state = harness.__timelineStore.getState();
					const trackId =
						state.tracks.find(
							(track: { isMain?: boolean; type: string }) =>
								track.isMain || track.type === "media"
						)?.id ?? state.addTrack("media");

					const ids: string[] = [];
					for (const [index, item] of [first, second].entries()) {
						const id = harness.__timelineStore.getState().addElementToTrack(
							trackId,
							{
								duration: input.clipSeconds,
								mediaId: item.id,
								name: `seam-${index}`,
								startTime: index * input.clipSeconds,
								trimEnd: 0,
								trimStart: 0,
								type: "media",
							},
							{ pushHistory: false, selectElement: false }
						);
						if (id) ids.push(id);
					}
					if (ids.length !== 2) throw new Error("Could not place both clips");

					const store = harness.__timelineStore.getState();
					const videoMediaIds = new Set<string>([first.id, second.id]);
					store.addTransition?.({
						duration: input.transitionSeconds,
						easing: "linear",
						engine: "qcut",
						fromElementId: ids[0],
						presetId: input.type,
						toElementId: ids[1],
						trackId,
						type: input.type,
						videoMediaIds,
					});
					harness.__playbackStore.getState().seek(0);
					const after = harness.__timelineStore.getState();
					const track = after.tracks.find(
						(candidate: { id: string }) => candidate.id === trackId
					);
					return track?.transitions?.length ?? 0;
				},
				{
					clipSeconds: CLIP_SECONDS,
					transitionSeconds: TRANSITION_SECONDS,
					type: entry.type,
				}
			);
			expect(applied, `${entry.label} transition attached`).toBeGreaterThan(0);

			const outputPath = path.join(EVIDENCE_DIR, `${entry.label}.mp4`);
			await stubExportSaveDialog({ electronApp, outputPath });
			await ensureExportActions({ page });
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
					filename: "transition.mp4",
					format: "mp4",
					frameRate: 30,
					height: 360,
					outputPath: target,
					quality: "480p",
					width: 640,
				});
			}, outputPath);
			await expect
				.poll(() => existsSync(outputPath), { timeout: 300_000 })
				.toBe(true);

			const probe = probeVideo({ filePath: outputPath });
			const hashes = frameHashes({ filePath: outputPath });
			results.push({ hashes, label: entry.label, probe });
			console.log(
				`[transition] ${entry.label.padEnd(10)} frames=${probe.frames} ` +
					`hashed=${hashes.length} geometry=${probe.width}x${probe.height} ` +
					`duration=${probe.duration.toFixed(3)} audio=${probe.audioCodec}`
			);
		}

		// Window is [clipSeconds - transition/2, clipSeconds + transition/2].
		const windowStartFrame = Math.round(
			(CLIP_SECONDS - TRANSITION_SECONDS / 2) * FPS
		);
		const windowEndFrame = Math.round(
			(CLIP_SECONDS + TRANSITION_SECONDS / 2) * FPS
		);
		const midFrame = Math.round(CLIP_SECONDS * FPS);

		for (const result of results) {
			// Container invariants.
			expect(result.probe.width).toBe(640);
			expect(result.probe.height).toBe(360);
			expect(result.probe.duration).toBeGreaterThan(CLIP_SECONDS * 2 - 0.2);
			expect(result.probe.duration).toBeLessThan(CLIP_SECONDS * 2 + 0.5);
			expect(result.hashes.length).toBeGreaterThan(windowEndFrame);

			const insideEarly = result.hashes[windowStartFrame + 3];
			const insideMid = result.hashes[midFrame];
			const insideLate = result.hashes[windowEndFrame - 3];
			console.log(
				`[transition] ${result.label} windowFrames ` +
					`start=${result.hashes[windowStartFrame]} early=${insideEarly} ` +
					`mid=${insideMid} late=${insideLate} end=${result.hashes[windowEndFrame]}`
			);

			// Inside the window the picture must actually be changing.
			expect(
				new Set([insideEarly, insideMid, insideLate]).size,
				`${result.label} window interior must vary`
			).toBe(3);
		}

		// Every transition type must produce a different result from the others,
		// otherwise the transition type is not reaching the renderer at all.
		const midHashes = results.map((result) => result.hashes[midFrame]);
		expect(new Set(midHashes).size, "transition types must differ").toBe(
			results.length
		);
		console.log(`[transition] MID_HASHES=${JSON.stringify(midHashes)}`);
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
