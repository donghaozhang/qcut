/**
 * Real muxer export of BT.709- and BT.601-tagged color-bar sources through
 * a QCut wipe seam, judged by the exported file's own color tags.
 *
 * WebCodecs fixes the stream's color tags when the encoder is configured,
 * but Chromium historically chose the RGB->Y'CbCr matrix per frame from
 * mutable canvas state, so one export could mix BT.601- and BT.709-coded
 * frames under a single tag. Decoding every exported frame through the
 * file's tags and comparing against the known bar colors catches any such
 * mismatch, on any frame, for both input tag variants.
 */

import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
	generateColorBarsClip,
	measureColorBarsFrames,
	probeColorTags,
} from "./helpers/color-space-evidence";
import { uploadTestMedia } from "./helpers/e2e-panel-helpers";
import { createTestProject, expect } from "./helpers/electron-helpers";
import { isolatedElectronTest as test } from "./helpers/isolated-electron-fixture";
import { probeVideo, savePngFrame } from "./helpers/transition-export-evidence";

const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;
const SOURCE_SECONDS = 4;
const CLIP_SECONDS = 1.5;
const TRANSITION_SECONDS = 0.6;
const TIMELINE_SECONDS = CLIP_SECONDS * 2;
const EVIDENCE_DIR = path.resolve(
	process.cwd(),
	"output/playwright/color-space"
);

interface ExposedWindow extends Window {
	__exportActions?: {
		exportLocalVideo: (request: {
			engine: "muxer";
			filename: string;
			format: "mp4";
			frameRate: 30;
			height: number;
			outputPath: string;
			projectId: string;
			quality: "720p";
			width: number;
		}) => Promise<void>;
	};
	__mediaStore: {
		getState: () => {
			mediaItems: Array<{ id: string; localPath?: string; name: string }>;
		};
	};
	__projectStore: {
		getState: () => { activeProject: { id: string } | null };
	};
	__timelineStore: {
		getState: () => {
			tracks: Array<{ id: string; isMain?: boolean; type: string }>;
			addElementToTrack: (
				trackId: string,
				element: {
					duration: number;
					mediaId: string;
					name: string;
					startTime: number;
					trimEnd: number;
					trimStart: number;
					type: "media";
				}
			) => string | null;
			addTransition: (input: {
				direction?: "left";
				duration: number;
				easing: "linear";
				engine: "qcut";
				fromElementId: string;
				presetId: string;
				toElementId: string;
				trackId: string;
				type: "wipe";
				videoMediaIds: ReadonlySet<string>;
			}) => string | null;
		};
	};
}

async function buildWipeTimeline({
	page,
	names,
}: {
	page: Page;
	names: { a: string; b: string };
}): Promise<{ projectId: string; transitionId: string }> {
	return page.evaluate(
		({ names, clipSeconds, transitionSeconds }) => {
			const editorWindow = window as unknown as ExposedWindow;
			const projectId =
				editorWindow.__projectStore.getState().activeProject?.id;
			if (!projectId) throw new Error("No active project");
			const media = editorWindow.__mediaStore.getState().mediaItems;
			const byName = (name: string) => {
				const item = media.find((candidate) => candidate.name === name);
				if (!item) throw new Error(`Media ${name} was not imported`);
				return item;
			};
			const [a, b] = [byName(names.a), byName(names.b)];
			const timeline = editorWindow.__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!track) throw new Error("Missing media track");
			const addClip = (
				item: { id: string; name: string },
				index: number
			): string => {
				const id = timeline.addElementToTrack(track.id, {
					type: "media",
					mediaId: item.id,
					name: item.name,
					duration: clipSeconds,
					startTime: index * clipSeconds,
					trimStart: 0,
					trimEnd: 0,
				});
				if (!id) throw new Error(`Could not place ${item.name}`);
				return id;
			};
			const [elementA, elementB] = [addClip(a, 0), addClip(b, 1)];
			const transitionId = timeline.addTransition({
				trackId: track.id,
				fromElementId: elementA,
				toElementId: elementB,
				videoMediaIds: new Set([a.id, b.id]),
				presetId: "wipe-left",
				engine: "qcut",
				type: "wipe",
				direction: "left",
				duration: transitionSeconds,
				easing: "linear",
			});
			if (!transitionId) throw new Error("Could not add the wipe seam");
			return { projectId, transitionId };
		},
		{ names, clipSeconds: CLIP_SECONDS, transitionSeconds: TRANSITION_SECONDS }
	);
}

async function waitForLocalPaths({ page }: { page: Page }): Promise<void> {
	await expect
		.poll(
			() =>
				page.evaluate(() =>
					(window as unknown as ExposedWindow).__mediaStore
						.getState()
						.mediaItems.every((item) => Boolean(item.localPath))
				),
			{ timeout: 30_000 }
		)
		.toBe(true);
}

async function exportWithMuxer({
	page,
	projectId,
	outputPath,
}: {
	page: Page;
	projectId: string;
	outputPath: string;
}): Promise<void> {
	await page.getByTestId("export-button").click();
	await expect(page.getByTestId("export-dialog")).toBeVisible();
	await page.waitForFunction(
		() => Boolean((window as unknown as ExposedWindow).__exportActions),
		undefined,
		{ timeout: 10_000 }
	);
	await page.evaluate(
		async ({ projectId, outputPath, width, height }) => {
			const actions = (window as unknown as ExposedWindow).__exportActions;
			if (!actions) throw new Error("Export actions are not registered");
			await actions.exportLocalVideo({
				engine: "muxer",
				filename: "color-bars-muxer.mp4",
				format: "mp4",
				frameRate: 30,
				height,
				outputPath,
				projectId,
				quality: "720p",
				width,
			});
		},
		{ projectId, outputPath, width: WIDTH, height: HEIGHT }
	);
}

test("muxer export carries truthful color tags for BT.709 and BT.601 sources on every frame", async ({
	page,
}) => {
	test.setTimeout(600_000);
	const workDir = await mkdtemp(path.join(tmpdir(), "qcut-color-space-"));
	await mkdir(EVIDENCE_DIR, { recursive: true });
	const sources = {
		a709: path.join(workDir, "bars-bt709.mp4"),
		b601: path.join(workDir, "bars-bt601.mp4"),
	};
	const outputPath = path.join(workDir, "color-bars-muxer.mp4");
	try {
		await generateColorBarsClip({
			filePath: sources.a709,
			matrix: "bt709",
			seconds: SOURCE_SECONDS,
			fps: FPS,
			width: WIDTH,
			height: HEIGHT,
		});
		await generateColorBarsClip({
			filePath: sources.b601,
			matrix: "bt601",
			seconds: SOURCE_SECONDS,
			fps: FPS,
			width: WIDTH,
			height: HEIGHT,
		});
		// The fixtures themselves must decode correctly through their own tags.
		const reference709 = await measureColorBarsFrames({
			filePath: sources.a709,
			decodeMatrix: "auto",
		});
		const reference601 = await measureColorBarsFrames({
			filePath: sources.b601,
			decodeMatrix: "auto",
		});

		await page.setViewportSize({ width: 1440, height: 1000 });
		await createTestProject(page, "Color Space Export E2E");
		for (const filePath of [sources.a709, sources.b601]) {
			await uploadTestMedia(page, filePath);
		}
		await waitForLocalPaths({ page });
		const { projectId } = await buildWipeTimeline({
			page,
			names: {
				a: path.basename(sources.a709),
				b: path.basename(sources.b601),
			},
		});
		await exportWithMuxer({ page, projectId, outputPath });
		expect(existsSync(outputPath)).toBe(true);

		const envelope = await probeVideo({ filePath: outputPath });
		const tags = await probeColorTags({ filePath: outputPath });
		const perTags = await measureColorBarsFrames({
			filePath: outputPath,
			decodeMatrix: "auto",
		});
		const as709 = await measureColorBarsFrames({
			filePath: outputPath,
			decodeMatrix: "bt709",
		});
		const as601 = await measureColorBarsFrames({
			filePath: outputPath,
			decodeMatrix: "bt601",
		});

		// Persist evidence before asserting so failures leave the numbers behind.
		await copyFile(outputPath, path.join(EVIDENCE_DIR, "color-bars-muxer.mp4"));
		for (const timeSeconds of [0.5, CLIP_SECONDS, 2.5]) {
			await savePngFrame({
				filePath: outputPath,
				timeSeconds,
				outputPath: path.join(
					EVIDENCE_DIR,
					`muxer-${timeSeconds.toFixed(2)}s.png`
				),
			});
		}
		await writeFile(
			path.join(EVIDENCE_DIR, "evidence.json"),
			JSON.stringify(
				{
					timeline: {
						clipSeconds: CLIP_SECONDS,
						transitionSeconds: TRANSITION_SECONDS,
						seam: "qcut wipe left",
						sources: { a: "bt709-tagged bars", b: "bt601-tagged bars" },
					},
					references: {
						bt709Fixture: reference709,
						bt601Fixture: reference601,
					},
					output: { envelope, tags, perTags, as709, as601 },
				},
				null,
				2
			)
		);

		expect(reference709.maxErr).toBeLessThanOrEqual(4);
		expect(reference601.maxErr).toBeLessThanOrEqual(4);

		expect(envelope).toMatchObject({ width: WIDTH, height: HEIGHT });
		expect(envelope.frameCount).toBe(Math.round(TIMELINE_SECONDS * FPS));
		expect(envelope.fps).toBeCloseTo(FPS, 1);

		// The stream must carry complete BT.709 tags (the HD contract the
		// muxer now enforces by feeding the encoder pre-converted BT.709
		// limited-range I420, so tags can never drift from the coded data).
		expect(tags).toMatchObject({
			colorPrimaries: "bt709",
			colorRange: "tv",
			colorSpace: "bt709",
			colorTransfer: "bt709",
		});

		// Decoding through the file's own tags must reproduce the bars on
		// EVERY frame; a mid-stream matrix flip fails exactly here.
		expect(perTags.maxErr).toBeLessThanOrEqual(10);
		expect(as709.maxErr).toBeLessThanOrEqual(10);
		// Sanity: the measurement discriminates — the wrong matrix reads
		// clearly off, so a silent pass cannot come from a blunt metric.
		expect(as601.maxErr).toBeGreaterThan(15);
	} finally {
		await rm(workDir, { force: true, recursive: true });
	}
});
