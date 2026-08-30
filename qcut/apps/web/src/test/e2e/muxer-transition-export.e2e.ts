/**
 * Real two-seam transition export through the renderer muxer engine,
 * compared against the utility-process native FFmpeg export.
 *
 * Seam A→B carries a jianying-local 叠化 (rendered by the native Jianying
 * timeline pass after muxing); seam B→C carries a QCut wipe (rendered on
 * canvas from the shared presentation). Midpoint frames, duration, frame
 * count, audio RMS, and wall-clock time are captured as evidence.
 */

import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import { resolveJianyingTransition } from "../../../../../electron/jianying-transition-catalog";
import { uploadTestMedia } from "./helpers/e2e-panel-helpers";
import {
	createTestProject,
	expect,
	test as qcutTest,
} from "./helpers/electron-helpers";
import {
	audioRmsDb,
	blendFrames,
	colorDistance,
	decodeFrame,
	meanAbsDiff,
	meanColor,
	probeVideo,
	savePngFrame,
	startNativeExport,
	waitForExportJob,
	type DecodedFrame,
} from "./helpers/transition-export-evidence";
import { generateToneClip } from "./helpers/transition-export-evidence";

const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;
const SOURCE_SECONDS = 5;
const CLIP_SECONDS = 1.2;
const TRANSITION_SECONDS = 0.8;
const TIMELINE_SECONDS = CLIP_SECONDS * 3;
const CUT_AB = CLIP_SECONDS;
const CUT_BC = CLIP_SECONDS * 2;
const HALF_WINDOW = TRANSITION_SECONDS / 2;
const BLUE = "0x2060ff";
const GREEN = "0x20c060";
const JIANYING_DISSOLVE_ID = "jianying-local-6724845717472416269";
const EVIDENCE_DIR = path.resolve(
	process.cwd(),
	"output/playwright/muxer-transitions"
);

const jianyingDissolve = resolveJianyingTransition({
	value: JIANYING_DISSOLVE_ID,
});
if (!jianyingDissolve) throw new Error("Missing 叠化 catalog entry");

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
			tracks: Array<{
				id: string;
				isMain?: boolean;
				transitions?: Array<{ id: string }>;
				type: string;
			}>;
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
				engine: "jianying-local" | "qcut";
				fromElementId: string;
				packageHash?: string;
				presetId: string;
				toElementId: string;
				trackId: string;
				type: "dissolve" | "wipe";
				videoMediaIds: ReadonlySet<string>;
			}) => string | null;
		};
	};
}

async function findAvailablePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => resolve());
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Could not allocate an API port");
	}
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
	return address.port;
}

const test = qcutTest.extend<{ apiPort: number }>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require empty destructuring
	apiPort: async ({}, use) => {
		await use(await findAvailablePort());
	},
	electronApp: async ({ apiPort }, use) => {
		const userDataDirectory = await mkdtemp(
			path.join(tmpdir(), "qcut-muxer-transition-")
		);
		const electronApp = await electron.launch({
			args: ["dist/electron/main.js", `--user-data-dir=${userDataDirectory}`],
			env: {
				...process.env,
				ELECTRON_DISABLE_GPU: "1",
				NODE_ENV: "test",
				QCUT_API_PORT: String(apiPort),
			},
		});
		await use(electronApp);
		await electronApp.close();
		await rm(userDataDirectory, { force: true, recursive: true });
	},
});

async function buildSeamTimeline({
	page,
	names,
}: {
	page: Page;
	names: { a: string; b: string; c: string };
}): Promise<{ projectId: string; transitionIds: string[] }> {
	return page.evaluate(
		({ names, clipSeconds, transitionSeconds, dissolve }) => {
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
			const [a, b, c] = [byName(names.a), byName(names.b), byName(names.c)];
			const timeline = editorWindow.__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!track) throw new Error("Missing media track");
			const addClip = (
				item: { id: string; name: string },
				index: number
			): string => {
				// Placement collision checks use the element duration directly, so
				// declare the visible length and read the source from its start.
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
			const [elementA, elementB, elementC] = [
				addClip(a, 0),
				addClip(b, 1),
				addClip(c, 2),
			];
			const videoMediaIds = new Set([a.id, b.id, c.id]);
			const seamAB = timeline.addTransition({
				trackId: track.id,
				fromElementId: elementA,
				toElementId: elementB,
				videoMediaIds,
				presetId: dissolve.id,
				engine: "jianying-local",
				packageHash: dissolve.packageHash,
				type: "dissolve",
				duration: transitionSeconds,
				easing: "linear",
			});
			const seamBC = timeline.addTransition({
				trackId: track.id,
				fromElementId: elementB,
				toElementId: elementC,
				videoMediaIds,
				presetId: "wipe-left",
				engine: "qcut",
				type: "wipe",
				direction: "left",
				duration: transitionSeconds,
				easing: "linear",
			});
			if (!seamAB || !seamBC) throw new Error("Could not add both seams");
			return { projectId, transitionIds: [seamAB, seamBC] };
		},
		{
			names,
			clipSeconds: CLIP_SECONDS,
			transitionSeconds: TRANSITION_SECONDS,
			dissolve: {
				id: jianyingDissolve.id,
				packageHash: jianyingDissolve.metadataMd5,
			},
		}
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
}): Promise<number> {
	await page.getByTestId("export-button").click();
	await expect(page.getByTestId("export-dialog")).toBeVisible();
	await page.waitForFunction(
		() => Boolean((window as unknown as ExposedWindow).__exportActions),
		undefined,
		{ timeout: 10_000 }
	);
	const startedAt = Date.now();
	await page.evaluate(
		async ({ projectId, outputPath, width, height }) => {
			const actions = (window as unknown as ExposedWindow).__exportActions;
			if (!actions) throw new Error("Export actions are not registered");
			await actions.exportLocalVideo({
				engine: "muxer",
				filename: "muxer-transitions.mp4",
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
	return Date.now() - startedAt;
}

interface SeamEvidence {
	blendError: number;
	fromDistance: number;
	q1FromDistance: number;
	q1ToDistance: number;
	q3FromDistance: number;
	q3ToDistance: number;
	sourceDistance: number;
	toDistance: number;
}

async function seamEvidence({
	filePath,
	cutTime,
	fromReference,
	toReference,
}: {
	filePath: string;
	cutTime: number;
	fromReference: DecodedFrame;
	toReference: DecodedFrame;
}): Promise<SeamEvidence> {
	const [q1, mid, q3] = await Promise.all([
		decodeFrame({ filePath, timeSeconds: cutTime - HALF_WINDOW / 2 }),
		decodeFrame({ filePath, timeSeconds: cutTime }),
		decodeFrame({ filePath, timeSeconds: cutTime + HALF_WINDOW / 2 }),
	]);
	return {
		sourceDistance: meanAbsDiff({ a: fromReference, b: toReference }),
		fromDistance: meanAbsDiff({ a: mid, b: fromReference }),
		toDistance: meanAbsDiff({ a: mid, b: toReference }),
		blendError: meanAbsDiff({
			a: mid,
			b: blendFrames({ a: fromReference, b: toReference }),
		}),
		q1FromDistance: meanAbsDiff({ a: q1, b: fromReference }),
		q1ToDistance: meanAbsDiff({ a: q1, b: toReference }),
		q3FromDistance: meanAbsDiff({ a: q3, b: fromReference }),
		q3ToDistance: meanAbsDiff({ a: q3, b: toReference }),
	};
}

async function saveSeamFrames({
	filePath,
	label,
	cutTime,
}: {
	filePath: string;
	label: string;
	cutTime: number;
}): Promise<void> {
	const offsets = [
		-HALF_WINDOW,
		-HALF_WINDOW / 2,
		0,
		HALF_WINDOW / 2,
		HALF_WINDOW,
	];
	for (const offset of offsets) {
		const timeSeconds = cutTime + offset;
		await savePngFrame({
			filePath,
			timeSeconds,
			outputPath: path.join(
				EVIDENCE_DIR,
				`${label}-${timeSeconds.toFixed(2)}s.png`
			),
		});
	}
}

test("muxer exports real transitions on both seams and matches the native export envelope", async ({
	page,
	apiPort,
}) => {
	test.setTimeout(900_000);
	const runtime = await page.evaluate(async (dissolveId) => {
		const api = window.electronAPI?.jianyingTransitions;
		if (!api) return { ready: false, reason: "no desktop bridge" };
		const status = await api.inspect();
		const entry = status.transitions.find((item) => item.id === dissolveId);
		return {
			ready: status.state === "ready" && entry?.available === true,
			reason: status.message,
		};
	}, JIANYING_DISSOLVE_ID);
	test.skip(
		!runtime.ready,
		`Local Jianying runtime unavailable: ${runtime.reason}`
	);

	const workDir = await mkdtemp(path.join(tmpdir(), "qcut-seam-media-"));
	await mkdir(EVIDENCE_DIR, { recursive: true });
	const sources = {
		a: path.join(workDir, "seam-a-motion.mp4"),
		b: path.join(workDir, "seam-b-blue.mp4"),
		c: path.join(workDir, "seam-c-green.mp4"),
	};
	try {
		await generateToneClip({
			filePath: sources.a,
			pattern: "testsrc2",
			toneHz: 220,
			seconds: SOURCE_SECONDS,
		});
		await generateToneClip({
			filePath: sources.b,
			pattern: `color=c=${BLUE}`,
			toneHz: 440,
			seconds: SOURCE_SECONDS,
		});
		await generateToneClip({
			filePath: sources.c,
			pattern: `color=c=${GREEN}`,
			toneHz: 880,
			seconds: SOURCE_SECONDS,
		});

		await page.setViewportSize({ width: 1440, height: 1000 });
		await createTestProject(page, "Muxer Transition Export E2E");
		for (const filePath of [sources.a, sources.b, sources.c]) {
			await uploadTestMedia(page, filePath);
		}
		await waitForLocalPaths({ page });
		const { projectId, transitionIds } = await buildSeamTimeline({
			page,
			names: {
				a: path.basename(sources.a),
				b: path.basename(sources.b),
				c: path.basename(sources.c),
			},
		});
		expect(transitionIds).toHaveLength(2);

		const muxerPath = path.join(workDir, "muxer-transitions.mp4");
		const nativePath = path.join(workDir, "native-transitions.mp4");
		const muxerMs = await exportWithMuxer({
			page,
			projectId,
			outputPath: muxerPath,
		});
		expect(existsSync(muxerPath)).toBe(true);

		const nativeStartedAt = Date.now();
		const { jobId } = await startNativeExport({
			apiPort,
			projectId,
			outputPath: nativePath,
			width: WIDTH,
			height: HEIGHT,
			fps: FPS,
			token: process.env.QCUT_API_TOKEN,
		});
		const nativeJob = await waitForExportJob({
			apiPort,
			projectId,
			jobId,
			token: process.env.QCUT_API_TOKEN,
			timeoutMs: 600_000,
		});
		const nativeMs = Date.now() - nativeStartedAt;
		expect(nativeJob).toMatchObject({ status: "completed" });

		const [muxerProbe, nativeProbe] = await Promise.all([
			probeVideo({ filePath: muxerPath }),
			probeVideo({ filePath: nativePath }),
		]);

		// Reference content for each seam: the outgoing clip's cut frame and
		// the incoming clip's first frame, decoded from the sources themselves.
		const aCut = await decodeFrame({
			filePath: sources.a,
			timeSeconds: CLIP_SECONDS,
		});
		const blue = await decodeFrame({ filePath: sources.b, timeSeconds: 0 });
		const green = await decodeFrame({ filePath: sources.c, timeSeconds: 0 });
		const blueMean = meanColor({ frame: blue });
		const greenMean = meanColor({ frame: green });
		const muxerAB = await seamEvidence({
			filePath: muxerPath,
			cutTime: CUT_AB,
			fromReference: aCut,
			toReference: blue,
		});
		const nativeAB = await seamEvidence({
			filePath: nativePath,
			cutTime: CUT_AB,
			fromReference: aCut,
			toReference: blue,
		});
		const muxerMidBC = await decodeFrame({
			filePath: muxerPath,
			timeSeconds: CUT_BC,
		});
		const nativeMidBC = await decodeFrame({
			filePath: nativePath,
			timeSeconds: CUT_BC,
		});
		const muxerBC = {
			left: meanColor({ frame: muxerMidBC, region: "left" }),
			right: meanColor({ frame: muxerMidBC, region: "right" }),
		};
		const nativeBC = {
			left: meanColor({ frame: nativeMidBC, region: "left" }),
			right: meanColor({ frame: nativeMidBC, region: "right" }),
		};
		const audioWindows = [
			{ label: "clip-a-220hz", start: 0.3, duration: 0.4 },
			{ label: "clip-b-440hz", start: 1.5, duration: 0.4 },
			{ label: "clip-c-880hz", start: 2.8, duration: 0.4 },
		];
		const audio: Record<string, { muxerDb: number; nativeDb: number }> = {};
		for (const window of audioWindows) {
			const [muxerDb, nativeDb] = await Promise.all([
				audioRmsDb({
					filePath: muxerPath,
					startSeconds: window.start,
					durationSeconds: window.duration,
				}),
				audioRmsDb({
					filePath: nativePath,
					startSeconds: window.start,
					durationSeconds: window.duration,
				}),
			]);
			audio[window.label] = { muxerDb, nativeDb };
		}

		// Persist the evidence before asserting so a failed expectation still
		// leaves the frames and numbers behind for review.
		for (const [filePath, label] of [
			[muxerPath, "muxer"],
			[nativePath, "native"],
		] as const) {
			await saveSeamFrames({ filePath, label: `${label}-ab`, cutTime: CUT_AB });
			await saveSeamFrames({ filePath, label: `${label}-bc`, cutTime: CUT_BC });
			await copyFile(
				filePath,
				path.join(EVIDENCE_DIR, `${label}-transitions.mp4`)
			);
		}
		await writeFile(
			path.join(EVIDENCE_DIR, "evidence.json"),
			JSON.stringify(
				{
					timeline: {
						clipSeconds: CLIP_SECONDS,
						transitionSeconds: TRANSITION_SECONDS,
						cutAB: CUT_AB,
						cutBC: CUT_BC,
						seamAB: `${jianyingDissolve.id} (jianying-local ${jianyingDissolve.localizedName})`,
						seamBC: "qcut wipe left",
					},
					muxer: {
						probe: muxerProbe,
						wallClockMs: muxerMs,
						seamAB: muxerAB,
						seamBC: muxerBC,
					},
					native: {
						probe: nativeProbe,
						wallClockMs: nativeMs,
						engine: nativeJob.engine,
						seamAB: nativeAB,
						seamBC: nativeBC,
					},
					references: { blue: blueMean, green: greenMean },
					audio,
				},
				null,
				2
			)
		);

		// Envelope: the muxer keeps the timeline length frame-exact; the
		// container runs a few AAC frames longer than the video stream.
		expect(muxerProbe).toMatchObject({
			width: WIDTH,
			height: HEIGHT,
			hasAudio: true,
			frameCount: Math.round(TIMELINE_SECONDS * FPS),
		});
		expect(muxerProbe.fps).toBeCloseTo(FPS, 1);
		expect(muxerProbe.videoDurationSeconds).toBeCloseTo(TIMELINE_SECONDS, 1);
		expect(nativeProbe.videoDurationSeconds).toBeCloseTo(TIMELINE_SECONDS, 1);

		// Jianying 叠化 midpoint is a real intermediate: far from both sources,
		// close to their blend, and the quarter frames lean the right way.
		expect(muxerAB.sourceDistance).toBeGreaterThan(60);
		expect(muxerAB.fromDistance).toBeGreaterThan(muxerAB.sourceDistance * 0.2);
		expect(muxerAB.toDistance).toBeGreaterThan(muxerAB.sourceDistance * 0.2);
		expect(muxerAB.blendError).toBeLessThan(muxerAB.sourceDistance * 0.3);
		expect(muxerAB.q1FromDistance).toBeLessThan(muxerAB.q1ToDistance);
		expect(muxerAB.q3ToDistance).toBeLessThan(muxerAB.q3FromDistance);

		// QCut wipe (direction left) reveals the incoming clip from the left
		// edge: at 50% the left half is green and the right half is still blue.
		expect(colorDistance({ a: muxerBC.left, b: greenMean })).toBeLessThan(40);
		expect(colorDistance({ a: muxerBC.right, b: blueMean })).toBeLessThan(40);
		const nativeHalves = [
			colorDistance({ a: nativeBC.left, b: greenMean }) +
				colorDistance({ a: nativeBC.right, b: blueMean }),
			colorDistance({ a: nativeBC.left, b: blueMean }) +
				colorDistance({ a: nativeBC.right, b: greenMean }),
		];
		expect(Math.min(...nativeHalves)).toBeLessThan(80);

		// lavfi's sine defaults to a -20 dBFS tone; both engines must carry it
		// at the same level in every clip window.
		for (const [label, levels] of Object.entries(audio)) {
			expect(levels.muxerDb, label).toBeGreaterThan(-30);
			expect(Math.abs(levels.muxerDb - levels.nativeDb), label).toBeLessThan(3);
		}
	} finally {
		await rm(workDir, { force: true, recursive: true });
	}
});
