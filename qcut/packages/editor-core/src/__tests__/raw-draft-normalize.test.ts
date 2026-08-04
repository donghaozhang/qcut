import { describe, expect, it } from "vitest";
import { parseDraftInteropDocumentV1 } from "../draft-interop/document.js";
import type { DraftSourceDescriptor } from "../draft-interop/document.js";
import {
	buildCapCut81Draft,
	buildJianyingDraft,
	mapInteropDocumentToQCutPlan,
	normalizeRawDraft,
	PLAINTEXT_5_9_PROFILE_ID,
} from "../jianying-draft/index.js";
import type { QCutDraftExportSnapshotV1 } from "../jianying-draft/types.js";
import type { TextElement } from "../types/timeline.js";

/**
 * JYI-005 acceptance: deterministic semantic snapshots for the synthetic
 * 5.9 fixture and the CapCut 8.1 fixture, honest per-node capability, and
 * a QCut plan that maps only the exact media subset.
 */

function createTextElement({
	content = "A剪🎬",
}: {
	content?: string;
} = {}): TextElement {
	return {
		backgroundColor: "transparent",
		color: "#ffffff",
		content,
		duration: 3,
		fontFamily: "Arial",
		fontSize: 64,
		fontStyle: "normal",
		fontWeight: "normal",
		id: "text-1",
		name: "text-1",
		opacity: 1,
		rotation: 0,
		startTime: 0,
		textAlign: "center",
		textDecoration: "none",
		trimEnd: 0,
		trimStart: 0,
		type: "text",
		x: 0,
		y: 0,
	};
}

function createSnapshot({
	textContent,
}: {
	textContent?: string;
} = {}): QCutDraftExportSnapshotV1 {
	return {
		media: [
			{
				duration: 5,
				height: 1080,
				id: "video-1",
				name: "clip.mp4",
				sourcePath: "/source/clip.mp4",
				type: "video",
				width: 1920,
			},
			{
				duration: 3,
				id: "audio-media-1",
				name: "song.mp3",
				sourcePath: "/source/song.mp3",
				type: "audio",
			},
		],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project-1",
			name: "Normalize Fixture",
			sceneId: "scene-1",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {
			"audio-1": 3,
			"clip-1": 4,
			"text-1": 3,
		},
		tracks: [
			{
				elements: [
					{
						duration: 5,
						id: "clip-1",
						mediaId: "video-1",
						name: "clip-1",
						startTime: 0,
						trimEnd: 0.5,
						trimStart: 0.5,
						type: "media",
					},
				],
				hidden: false,
				id: "track-1",
				muted: false,
				name: "Video",
				order: 0,
				type: "media",
			},
			{
				elements: [
					{
						duration: 3,
						id: "audio-1",
						mediaId: "audio-media-1",
						name: "audio-1",
						startTime: 1,
						trimEnd: 0,
						trimStart: 0,
						type: "media",
					},
				],
				hidden: false,
				id: "track-2",
				muted: false,
				name: "Audio",
				order: 1,
				type: "audio",
			},
			{
				elements: [
					createTextElement(
						textContent === undefined ? {} : { content: textContent }
					),
				],
				hidden: false,
				id: "track-3",
				muted: false,
				name: "Text",
				order: 2,
				type: "text",
			},
		],
	};
}

function createSource({
	product,
	profileId,
}: {
	product: DraftSourceDescriptor["product"];
	profileId: string;
}): DraftSourceDescriptor {
	return {
		product,
		profileId,
		platform: "macos",
		files: [
			{
				relativePath: "draft_info.json",
				byteLength: 4096,
				sha256: "a".repeat(64),
				role: "content",
				classification: "plaintext-json",
			},
		],
	};
}

function build59Content(): Record<string, unknown> {
	const { content } = buildJianyingDraft({
		createdAtUnixSeconds: 100,
		draftOutputDirectory: "/qcut-fixture/draft",
		snapshot: createSnapshot(),
		targetPlatform: "macos",
	});
	return JSON.parse(JSON.stringify(content));
}

function normalize59() {
	return normalizeRawDraft({
		content: build59Content(),
		source: createSource({
			product: "jianying",
			profileId: PLAINTEXT_5_9_PROFILE_ID,
		}),
		contentFileName: "draft_info.json",
		fallbackProjectName: "Normalize Fixture",
	});
}

function build81Content(): Record<string, unknown> {
	const result = buildCapCut81Draft({
		createdAtUnixSeconds: 100,
		draftOutputDirectory: "/qcut-fixture/draft",
		placeholderId: "00000000-0000-0000-0000-00000000aaaa",
		// The 8.1 font preflight rejects emoji without a verified reference.
		snapshot: createSnapshot({ textContent: "A剪测试" }),
		targetPlatform: "macos",
		timelineId: "00000000-0000-0000-0000-00000000bbbb",
	});
	expect(result.content).not.toBeNull();
	return JSON.parse(JSON.stringify(result.content));
}

describe("normalizeRawDraft on the synthetic 5.9 fixture", () => {
	it("produces a document that round-trips the interop parser", () => {
		const { document } = normalize59();
		const parsed = parseDraftInteropDocumentV1(
			JSON.parse(JSON.stringify(document))
		);
		expect(parsed.ok).toBe(true);
	});

	it("is deterministic and matches the semantic snapshot", () => {
		const first = normalize59();
		const second = normalize59();
		expect(JSON.parse(JSON.stringify(second))).toEqual(
			JSON.parse(JSON.stringify(first))
		);
		expect(first.document).toMatchSnapshot();
	});

	it("assigns honest capabilities per node", () => {
		const { document } = normalize59();
		const [timeline] = document.timelines;
		expect(timeline.isRoot).toBe(true);
		expect(timeline.tracks).toHaveLength(3);

		const [video, audio, text] = timeline.tracks;
		expect(video.kind).toBe("video");
		expect(video.isMain).toBe(true);
		expect(video.capability).toBe("exact");
		expect(video.segments[0].kind).toBe("video");
		expect(video.segments[0].capability).toBe("exact");

		expect(audio.kind).toBe("audio");
		expect(audio.segments[0].kind).toBe("audio");
		expect(audio.segments[0].capability).toBe("exact");

		expect(text.kind).toBe("text");
		expect(text.capability).toBe("downgrade");
		expect(text.segments[0].kind).toBe("text");
		expect(text.segments[0].capability).toBe("downgrade");
		expect(
			document.issues.some(
				(issue) =>
					issue.code === "FEATURE_DOWNGRADED" &&
					issue.subjectId === text.segments[0].id
			)
		).toBe(true);
	});

	it("converts times to integer microseconds", () => {
		const { document } = normalize59();
		const video = document.timelines[0].tracks[0].segments[0];
		expect(video.targetRange).toEqual({ startUs: 0, durationUs: 4_000_000 });
		expect(video.sourceRange).toEqual({
			startUs: 500_000,
			durationUs: 4_000_000,
		});
		const audio = document.timelines[0].tracks[1].segments[0];
		expect(audio.targetRange.startUs).toBe(1_000_000);
	});

	it("extracts media resources without leaking source paths", () => {
		const result = normalize59();
		const { document, restrictedSourcePathsByResourceId } = result;
		expect(document.resources).toHaveLength(2);
		for (const resource of document.resources) {
			expect(resource.status).toBe("pending");
			expect(resource.originHint).toBe("local-media");
			expect(resource.durationUs).toBeGreaterThan(0);
		}
		// RESTRICTED: media paths live only in the provenance side channel.
		// (The builder already rewrote them to draft asset-copy paths.)
		expect(JSON.stringify(document)).not.toContain("/qcut-fixture/");
		const restrictedPaths = Object.values(restrictedSourcePathsByResourceId);
		expect(restrictedPaths).toHaveLength(2);
		expect(restrictedPaths.some((path) => path.endsWith("clip.mp4"))).toBe(
			true
		);
		expect(restrictedPaths.some((path) => path.endsWith("song.mp3"))).toBe(
			true
		);
	});

	it("binds every semantic node to its raw location", () => {
		const { document, bindings } = normalize59();
		const byRef = new Map(
			bindings.map((binding) => [binding.foreignRef, binding])
		);
		for (const track of document.timelines[0].tracks) {
			expect(byRef.get(track.id)?.jsonPointer).toMatch(/^\/tracks\/\d+$/);
			for (const segment of track.segments) {
				expect(byRef.get(segment.id)?.file).toBe("draft_info.json");
			}
		}
	});
});

describe("normalizeRawDraft on the CapCut 8.1 fixture", () => {
	it("is deterministic, parses clean, and matches the snapshot", () => {
		const run = () =>
			normalizeRawDraft({
				content: build81Content(),
				source: createSource({
					product: "capcut",
					profileId: "capcut-desktop-8.1-plaintext",
				}),
				contentFileName: "draft_info.json",
			});
		const first = run();
		const second = run();
		expect(JSON.parse(JSON.stringify(second))).toEqual(
			JSON.parse(JSON.stringify(first))
		);
		const parsed = parseDraftInteropDocumentV1(
			JSON.parse(JSON.stringify(first.document))
		);
		expect(parsed.ok).toBe(true);
		expect(JSON.stringify(first.document)).not.toContain("/source/");
		expect(first.document).toMatchSnapshot();
	});
});

describe("normalizeRawDraft degradation paths", () => {
	it("blocks a segment with a dangling material ref", () => {
		const content = {
			id: "draft-x",
			canvas_config: { width: 1920, height: 1080, ratio: "original" },
			fps: 30,
			duration: 1_000_000,
			tracks: [
				{
					id: "t1",
					type: "video",
					segments: [
						{
							id: "s1",
							material_id: "missing",
							target_timerange: { start: 0, duration: 1_000_000 },
						},
					],
				},
			],
			materials: {},
		};
		const { document } = normalizeRawDraft({
			content,
			source: createSource({
				product: "jianying",
				profileId: PLAINTEXT_5_9_PROFILE_ID,
			}),
			contentFileName: "draft_info.json",
		});
		const segment = document.timelines[0].tracks[0].segments[0];
		expect(segment.capability).toBe("blocked");
		expect(document.issues.some((issue) => issue.code === "REF_BROKEN")).toBe(
			true
		);
	});

	it("marks unknown buckets and track types opaque", () => {
		const content = {
			id: "draft-y",
			canvas_config: { width: 1920, height: 1080, ratio: "original" },
			fps: 30,
			duration: 1_000_000,
			tracks: [
				{
					id: "t1",
					type: "hologram",
					segments: [
						{
							id: "s1",
							material_id: "m1",
							target_timerange: { start: 0, duration: 1_000_000 },
						},
					],
				},
			],
			materials: { holograms: [{ id: "m1" }] },
		};
		const { document } = normalizeRawDraft({
			content,
			source: createSource({
				product: "jianying",
				profileId: PLAINTEXT_5_9_PROFILE_ID,
			}),
			contentFileName: "draft_info.json",
		});
		const track = document.timelines[0].tracks[0];
		expect(track.kind).toBe("unknown");
		expect(track.capability).toBe("opaque");
		expect(track.segments[0].capability).toBe("opaque");
	});

	it("blocks a segment without a target range", () => {
		const content = {
			id: "draft-z",
			canvas_config: { width: 1920, height: 1080, ratio: "original" },
			fps: 30,
			duration: 0,
			tracks: [
				{
					id: "t1",
					type: "video",
					segments: [{ id: "s1", material_id: "m1" }],
				},
			],
			materials: { videos: [{ id: "m1", type: "video" }] },
		};
		const { document } = normalizeRawDraft({
			content,
			source: createSource({
				product: "jianying",
				profileId: PLAINTEXT_5_9_PROFILE_ID,
			}),
			contentFileName: "draft_info.json",
		});
		const segment = document.timelines[0].tracks[0].segments[0];
		expect(segment.capability).toBe("blocked");
		expect(
			document.issues.some(
				(issue) =>
					issue.code === "TIME_RANGE_INVALID" && issue.subjectId === "s1"
			)
		).toBe(true);
	});
});

describe("mapInteropDocumentToQCutPlan", () => {
	it("maps the exact media subset and skips the rest, deterministically", () => {
		const { document } = normalize59();
		const first = mapInteropDocumentToQCutPlan({ document });
		const second = mapInteropDocumentToQCutPlan({ document });
		expect(second).toEqual(first);

		expect(first.tracks).toHaveLength(2);
		const [video, audio] = first.tracks;
		expect(video.type).toBe("media");
		expect(video.isMain).toBe(true);
		expect(video.elements).toHaveLength(1);
		expect(video.elements[0]).toMatchObject({
			startTime: 0,
			duration: 5,
			trimStart: 0.5,
			trimEnd: 0.5,
		});
		expect(audio.type).toBe("audio");
		expect(audio.elements[0].startTime).toBe(1);

		// Synthetic 5.9 has no production text mapper, so it remains reported.
		// (Builder-generated segment ids are UUIDs, so match by capability.)
		const skippedSegments = first.skipped.filter(
			(node) => node.nodeType === "segment"
		);
		expect(
			skippedSegments.some((node) => node.capability === "downgrade")
		).toBe(true);
		expect(
			first.skipped.some(
				(node) =>
					node.nodeType === "track" &&
					node.reason === "no importable segments on this track"
			)
		).toBe(true);

		expect(first.resourceIds).toHaveLength(2);
		expect(first.project).toMatchObject({
			width: 1920,
			height: 1080,
			fps: 30,
		});
	});
});
