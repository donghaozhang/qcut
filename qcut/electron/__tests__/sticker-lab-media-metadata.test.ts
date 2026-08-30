import { describe, expect, it } from "vitest";
import type { StickerRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";
import {
	parseStickerLabMediaMetadata,
	parseStickerLabRestrictedMediaMetadata,
} from "../types/sticker-lab-media-metadata.js";

const PROVENANCE = {
	animatedSticker: true,
	batchId: "jianying-2026-08-30-batch-19-v2",
	checksumSha256: "a".repeat(64),
	itemId: "9901000000000000002",
	redistribution: "prohibited",
	referenceOnly: true,
	source: "sticker-lab",
	usage: "internal-reference-only",
} as const;

const RUNTIME: StickerRuntimeDescriptor = {
	kind: "png-sequence",
	completion: "freeze-last",
	cycleDurationSeconds: 1,
	frames: [
		{
			durationSeconds: 0.5,
			startSeconds: 0,
			source: "$resource:asset_0001",
		},
		{
			durationSeconds: 0.5,
			startSeconds: 0.5,
			source: "$resource:asset_0002",
		},
	],
	repeat: { kind: "infinite" },
};

describe("Sticker Lab restricted media metadata", () => {
	it("keeps the legacy path-free provenance contract strict", () => {
		expect(
			parseStickerLabMediaMetadata({
				candidate: PROVENANCE,
				label: "Legacy metadata",
			})
		).toEqual(PROVENANCE);
		expect(() =>
			parseStickerLabMediaMetadata({
				candidate: { ...PROVENANCE, rootPath: "/private/cache" },
				label: "Legacy metadata",
			})
		).toThrow("unsupported field 'rootPath'");
	});

	it("accepts a validated project-normalized runtime descriptor and resource map", () => {
		const metadata = {
			...PROVENANCE,
			stickerRuntime: RUNTIME,
			stickerRuntimeResources: {
				asset_0001: "runtime-frame-1",
				asset_0002: "runtime-frame-2",
			},
		};

		expect(
			parseStickerLabRestrictedMediaMetadata({
				candidate: metadata,
				label: "Runtime metadata",
			})
		).toEqual(metadata);
		expect(() =>
			parseStickerLabRestrictedMediaMetadata({
				candidate: { ...metadata, source: "ordinary-media" },
				label: "Runtime metadata",
			})
		).toThrow("source must equal sticker-lab");
		expect(() =>
			parseStickerLabRestrictedMediaMetadata({
				candidate: { ...metadata, animatedSticker: false },
				label: "Runtime metadata",
			})
		).toThrow("animatedSticker must equal true");
	});

	it("allows a runtime descriptor that uses only the primary media", () => {
		const stickerRuntime: StickerRuntimeDescriptor = {
			kind: "atlas-animation",
			atlasSize: { height: 64, width: 64 },
			completion: "freeze-last",
			cycleDurationSeconds: 1,
			frames: [
				{
					durationSeconds: 1,
					frameRect: { height: 64, width: 64, x: 0, y: 0 },
					id: "frame-1",
					rotated: false,
					sourceSize: { height: 64, width: 64 },
					spriteSourceRect: { height: 64, width: 64, x: 0, y: 0 },
					startSeconds: 0,
					trimmed: false,
				},
			],
			repeat: { kind: "infinite" },
		};

		expect(
			parseStickerLabRestrictedMediaMetadata({
				candidate: { ...PROVENANCE, stickerRuntime },
				label: "Primary runtime metadata",
			})
		).toEqual({ ...PROVENANCE, stickerRuntime });
	});

	it("rejects missing, ordinary, and unused runtime resource names", () => {
		const parse = ({
			runtime,
			resources,
		}: {
			runtime: StickerRuntimeDescriptor;
			resources: Record<string, string>;
		}) =>
			parseStickerLabRestrictedMediaMetadata({
				candidate: {
					...PROVENANCE,
					stickerRuntime: runtime,
					stickerRuntimeResources: resources,
				},
				label: "Runtime metadata",
			});

		expect(() =>
			parse({ runtime: RUNTIME, resources: { asset_0001: "frame-1" } })
		).toThrow("missing descriptor resource asset_0002");
		expect(() =>
			parse({
				runtime: {
					...RUNTIME,
					frames: RUNTIME.frames.map((frame, index) => ({
						...frame,
						source: `ordinary-${index}`,
					})),
				},
				resources: {},
			})
		).toThrow("descriptor source is not project-normalized");
		expect(() =>
			parse({
				runtime: RUNTIME,
				resources: {
					asset_0001: "frame-1",
					asset_0002: "frame-2",
					asset_0003: "frame-3",
				},
			})
		).toThrow("unused runtime resource");
	});

	it("accepts a runtime resource only when identity and source stay private", () => {
		const metadata = {
			batchId: PROVENANCE.batchId,
			checksumSha256: "b".repeat(64),
			itemId: PROVENANCE.itemId,
			redistribution: "prohibited",
			referenceOnly: true,
			source: "sticker-runtime-resource",
			stickerAssetId: `sticker-lab:${PROVENANCE.batchId}:${PROVENANCE.itemId}`,
			stickerAssetVersion: 1,
			stickerRuntimeResourceName: "asset_0001",
			stickerRuntimeSourceUrl: "sequence/frame-000.png",
			usage: "internal-reference-only",
		} as const;

		expect(
			parseStickerLabRestrictedMediaMetadata({
				candidate: metadata,
				label: "Runtime resource metadata",
			})
		).toEqual(metadata);
		expect(() =>
			parseStickerLabRestrictedMediaMetadata({
				candidate: {
					...metadata,
					stickerRuntimeSourceUrl: "https://example.invalid/frame.png",
				},
				label: "Runtime resource metadata",
			})
		).toThrow("private relative resource name");
		expect(() =>
			parseStickerLabRestrictedMediaMetadata({
				candidate: {
					...metadata,
					stickerRuntimeSourceUrl: "data:image/png;base64,AAAA",
				},
				label: "Runtime resource metadata",
			})
		).toThrow("private relative resource name");
		for (const stickerRuntimeSourceUrl of [
			"   ",
			" sequence/frame-000.png",
			"sequence/frame-000.png ",
			"$primary",
			"$resource:asset_0001",
		]) {
			expect(() =>
				parseStickerLabRestrictedMediaMetadata({
					candidate: { ...metadata, stickerRuntimeSourceUrl },
					label: "Runtime resource metadata",
				})
			).toThrow("private relative resource name");
		}
		expect(() =>
			parseStickerLabRestrictedMediaMetadata({
				candidate: {
					...metadata,
					stickerAssetId: `sticker-lab:${PROVENANCE.batchId}:other`,
				},
				label: "Runtime resource metadata",
			})
		).toThrow("does not match its provenance");
	});
});
