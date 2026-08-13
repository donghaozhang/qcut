import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	buildQCutImportTimelineTracks,
	describeQCutImportMedia,
	type QCutImportBundleV1,
	verifyQCutImportMaterialization,
} from "../draft-interop/index.js";

const VIDEO_RESOURCE_ID = "video-resource";
const VIDEO_ELEMENT_ID = "video-element";
const VIDEO_TRACK_ID = "video-track";
const TEXT_ELEMENT_ID = "text-element";
const TEXT_TRACK_ID = "text-track";
const VIDEO_SHA256 = "a".repeat(64);

function createBundle(): QCutImportBundleV1 {
	return {
		schemaVersion: 1,
		bundleDigest: "b".repeat(64),
		planToken: "plan-token",
		buildIdentity: { appVersion: "test", interopSchemaVersion: 1 },
		createdAtUnixMilliseconds: 1,
		conflictPolicy: { projectName: "fail" },
		document: {
			schemaVersion: 1,
			timeUnit: "microseconds",
			source: {
				product: "capcut",
				profileId: "capcut-desktop-8.1-plaintext",
				platform: "macos",
				files: [],
			},
			project: {
				id: "source-project",
				name: "Imported Project",
				width: 1920,
				height: 1080,
				fps: 30,
			},
			timelines: [{ id: "root", isRoot: true, tracks: [] }],
			resources: [],
			links: [],
			issues: [],
		},
		timelinePlan: {
			schemaVersion: 1,
			project: {
				name: "Imported Project",
				width: 1920,
				height: 1080,
				fps: 30,
			},
			tracks: [
				{
					id: VIDEO_TRACK_ID,
					type: "media",
					name: "Video",
					order: 0,
					isMain: true,
					elements: [
						{
							id: VIDEO_ELEMENT_ID,
							type: "media",
							name: "clip.mp4",
							startTime: 0,
							duration: 5,
							trimStart: 0.5,
							trimEnd: 0.5,
							resourceId: VIDEO_RESOURCE_ID,
							sourceSegmentId: VIDEO_ELEMENT_ID,
						},
					],
					sourceTrackId: VIDEO_TRACK_ID,
				},
				{
					id: TEXT_TRACK_ID,
					type: "text",
					name: "Text",
					order: 1,
					elements: [
						{
							id: TEXT_ELEMENT_ID,
							type: "text",
							name: "Hello",
							startTime: 1,
							duration: 2,
							trimStart: 0,
							trimEnd: 0,
							content: "Hello",
							fontSize: 64,
							fontFamily: "Arial",
							color: "#ffffff",
							backgroundColor: "transparent",
							textAlign: "center",
							fontWeight: "normal",
							fontStyle: "normal",
							textDecoration: "none",
							x: 0,
							y: 0,
							rotation: 0,
							opacity: 1,
							sourceSegmentId: TEXT_ELEMENT_ID,
						},
					],
					sourceTrackId: TEXT_TRACK_ID,
				},
			],
			resourceIds: [VIDEO_RESOURCE_ID],
			skipped: [],
		},
		resourceStaging: [
			{
				resourceId: VIDEO_RESOURCE_ID,
				stagingKey: "video-resource",
				kind: "video",
				status: "resolved",
				byteLength: 123,
				sha256: VIDEO_SHA256,
			},
		],
		internalIdBySemanticId: {
			[VIDEO_RESOURCE_ID]: "internal-video-resource",
			[VIDEO_ELEMENT_ID]: "internal-video-element",
			[VIDEO_TRACK_ID]: "internal-video-track",
			[TEXT_ELEMENT_ID]: "internal-text-element",
			[TEXT_TRACK_ID]: "internal-text-track",
		},
	};
}

function expectedTracks({ bundle }: { bundle: QCutImportBundleV1 }) {
	return buildQCutImportTimelineTracks({
		bundle,
		mediaItemIdByResourceId: new Map([
			[VIDEO_RESOURCE_ID, bundle.internalIdBySemanticId[VIDEO_RESOURCE_ID]],
		]),
	});
}

function expectedMedia() {
	return [
		{
			byteLength: 123,
			id: "internal-video-resource",
			sha256: VIDEO_SHA256,
			type: "video" as const,
		},
	];
}

describe("QCut import materialization verification", () => {
	it("materializes imported media position keyframes", () => {
		const bundle = createBundle();
		const element = bundle.timelinePlan.tracks[0]?.elements[0];
		if (element?.type !== "media")
			throw new Error("fixture has no media element");
		element.x = 50;
		element.y = 0;
		element.keyframes = {
			x: [
				{ id: "x-start", frame: 0, value: 0, easing: "linear" },
				{ id: "x-end", frame: 60, value: 50, easing: "linear" },
			],
			y: [
				{ id: "y-start", frame: 0, value: 0, easing: "linear" },
				{ id: "y-end", frame: 60, value: 0, easing: "linear" },
			],
		};

		expect(expectedTracks({ bundle })[0]?.elements[0]).toMatchObject({
			x: 50,
			y: 0,
			keyframes: element.keyframes,
		});
	});

	it("hashes persisted media with bounded ordered output", async () => {
		const result = await describeQCutImportMedia({
			concurrency: 1,
			media: [
				{ bytes: new Blob(["first"]), id: "first", type: "video" },
				{ bytes: new Blob(["second"]), id: "second", type: "audio" },
			],
		});

		expect(result).toEqual([
			{
				byteLength: 5,
				id: "first",
				sha256: createHash("sha256").update("first").digest("hex"),
				type: "video",
			},
			{
				byteLength: 6,
				id: "second",
				sha256: createHash("sha256").update("second").digest("hex"),
				type: "audio",
			},
		]);
		await expect(
			describeQCutImportMedia({ concurrency: 0, media: [] })
		).rejects.toThrow("positive integer");
	});

	it("streams persisted media without buffering the complete Blob", async () => {
		const bytes = new Blob(["stream-only-media"]);
		Object.defineProperty(bytes, "arrayBuffer", {
			value: async () => {
				throw new Error("whole-blob buffering is forbidden");
			},
		});

		const result = await describeQCutImportMedia({
			media: [{ bytes, id: "streamed", type: "video" }],
		});

		expect(result).toEqual([
			{
				byteLength: 17,
				id: "streamed",
				sha256: createHash("sha256").update("stream-only-media").digest("hex"),
				type: "video",
			},
		]);
	});

	it("passes only when persisted media and tracks match the import bundle", () => {
		const bundle = createBundle();
		const result = verifyQCutImportMaterialization({
			actualMedia: expectedMedia(),
			actualTracks: expectedTracks({ bundle }),
			bundle,
		});

		expect(result).toMatchObject({
			actual: { mediaCount: 1, trackCount: 2 },
			expected: { mediaCount: 1, trackCount: 2 },
			issues: [],
			verdict: "pass",
		});
	});

	it("reports path-only media and timeline mismatches", () => {
		const bundle = createBundle();
		const tracks = expectedTracks({ bundle });
		tracks[0].elements[0].startTime = 0.25;
		const media = expectedMedia();
		media[0].sha256 = "c".repeat(64);

		const result = verifyQCutImportMaterialization({
			actualMedia: media,
			actualTracks: tracks,
			bundle,
		});

		expect(result.verdict).toBe("fail");
		expect(result.issues).toEqual([
			{ code: "MEDIA_MISMATCH", path: "/media/internal-video-resource" },
			{ code: "TRACK_MISMATCH", path: "/tracks/internal-video-track" },
		]);
		expect(JSON.stringify(result)).not.toContain("0.25");
	});

	it("detects duplicate, missing, and unexpected persisted identities", () => {
		const bundle = createBundle();
		const tracks = expectedTracks({ bundle });
		const extraTrack = { ...tracks[1], id: "unexpected/track~id" };
		const media = expectedMedia();
		const duplicateMedia = { ...media[0] };
		const unexpectedMedia = { ...media[0], id: "unexpected/media~id" };

		const result = verifyQCutImportMaterialization({
			actualMedia: [duplicateMedia, duplicateMedia, unexpectedMedia],
			actualTracks: [tracks[1], extraTrack],
			bundle,
		});

		expect(result.issues).toEqual([
			{ code: "MEDIA_DUPLICATE", path: "/media/internal-video-resource" },
			{
				code: "MEDIA_UNEXPECTED",
				path: "/media/unexpected~1media~0id",
			},
			{ code: "TRACK_MISSING", path: "/tracks/internal-video-track" },
			{
				code: "TRACK_UNEXPECTED",
				path: "/tracks/unexpected~1track~0id",
			},
		]);
	});

	it("fails closed when deterministic internal ids are not unique", () => {
		const bundle = createBundle();
		bundle.internalIdBySemanticId[TEXT_TRACK_ID] =
			bundle.internalIdBySemanticId[VIDEO_TRACK_ID];

		const result = verifyQCutImportMaterialization({
			actualMedia: [],
			actualTracks: [],
			bundle,
		});

		expect(result).toMatchObject({
			issues: [{ code: "EXPECTED_STATE_INVALID", path: "/bundle" }],
			verdict: "fail",
		});
	});

	it("fails closed when a planned media element is not resolved", () => {
		const bundle = createBundle();
		bundle.resourceStaging[0].status = "missing";

		const result = verifyQCutImportMaterialization({
			actualMedia: [],
			actualTracks: [],
			bundle,
		});

		expect(result).toMatchObject({
			issues: [{ code: "EXPECTED_STATE_INVALID", path: "/bundle" }],
			verdict: "fail",
		});
	});
});
