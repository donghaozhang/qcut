import { describe, expect, it } from "vitest";
import type {
	MediaElement,
	TextElement,
	TextAnimationsV1,
} from "@/types/timeline";
import {
	normalizeLoadedTracks,
	normalizeMediaElement,
	normalizeTextElement,
} from "../timeline/timeline-store-normalization";

function mediaElement(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "media-1",
		type: "media",
		mediaId: "asset-1",
		name: "Video",
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

function textElement(overrides: Partial<TextElement> = {}): TextElement {
	return {
		id: "text-1",
		type: "text",
		name: "Title",
		content: "QCut",
		fontSize: 48,
		fontFamily: "Inter",
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
		startTime: 0,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

describe("timeline media mask normalization", () => {
	it("materializes a legacy single mask as the first stack item", () => {
		const normalized = normalizeMediaElement({
			element: mediaElement({
				mask: {
					type: "rectangle",
					centerX: 0.3,
					centerY: 0.4,
					width: 0.5,
					height: 0.6,
					rotation: 8,
					feather: 0.1,
					invert: false,
				},
			}),
		}) as MediaElement;

		expect(normalized.masks).toHaveLength(1);
		expect(normalized.masks?.[0]).toMatchObject({
			id: "mask-1",
			name: "Mask 1",
			type: "rectangle",
			centerX: 0.3,
		});
		expect(normalized.mask).toEqual(normalized.masks?.[0]);
	});

	it("preserves an ordered stack without duplicating the legacy field", () => {
		const normalized = normalizeMediaElement({
			element: mediaElement({
				mask: {
					type: "ellipse",
					centerX: 0.1,
					centerY: 0.1,
					width: 0.2,
					height: 0.2,
					rotation: 0,
					feather: 0,
					invert: false,
				},
				masks: [
					{
						id: "main",
						name: "Main",
						type: "star",
						blendMode: "add",
						centerX: 0.5,
						centerY: 0.5,
						width: 0.8,
						height: 0.8,
						rotation: 0,
						feather: 0,
						invert: false,
					},
					{
						id: "hole",
						name: "Hole",
						type: "heart",
						blendMode: "subtract",
						centerX: 0.5,
						centerY: 0.5,
						width: 0.3,
						height: 0.3,
						rotation: 0,
						feather: 0,
						invert: false,
					},
				],
			}),
		}) as MediaElement;

		expect(normalized.masks?.map((mask) => mask.id)).toEqual(["main", "hole"]);
		expect(normalized.mask?.id).toBe("main");
	});
});

describe("timeline text animation normalization", () => {
	it("preserves a canonical Jianying runtime reference through project load", () => {
		const jianyingTextStyle = {
			schemaVersion: 1 as const,
			source: "jianying-cache" as const,
			packageKind: "ScriptInfoSticker" as const,
			resourceId: "7410240535752903990",
			packageHash: "39b4b7c4e070ede70ae25ab264c842d4",
			editMode: "runtime-with-preload-fallback" as const,
			slotMapping: "line-to-widget" as const,
			timeMapping: "stretch" as const,
			templateDuration: 3,
		};
		const normalized = normalizeTextElement({
			element: textElement({ jianyingTextStyle }),
		}) as TextElement;

		expect(normalized.jianyingTextStyle).toEqual(jianyingTextStyle);
	});

	it("removes malformed Jianying runtime references during project load", () => {
		const normalized = normalizeTextElement({
			element: textElement({
				jianyingTextStyle: {
					packagePath: "/private/cache/package",
				} as unknown as TextElement["jianyingTextStyle"],
			}),
		}) as TextElement;

		expect(normalized.jianyingTextStyle).toBeUndefined();
	});

	it("preserves an exact local font reference through project load", () => {
		const fontAsset = {
			kind: "local-font" as const,
			source: "jianying-cache" as const,
			assetId: `sha256:${"a".repeat(64)}`,
			cssFamily: "QCutLocal_aaaaaaaaaaaaaaaaaaaa",
			familyName: "文悦新青年体",
			fullName: "文悦新青年体 W8",
			postscriptName: "WenYue-XinQingNianTi-W8",
		};
		const tracks = normalizeLoadedTracks({
			tracks: [
				{
					id: "text-track",
					name: "Text",
					type: "text",
					elements: [
						textElement({
							fontFamily: fontAsset.cssFamily,
							fontAsset,
						}),
					],
				},
			],
		});

		expect(tracks[0].elements[0]).toMatchObject({
			fontFamily: fontAsset.cssFamily,
			fontAsset,
		});
	});

	it("normalizes canonical animation data while loading a project", () => {
		const element = textElement({
			textAnimations: {
				schemaVersion: 1,
				entrance: {
					timing: {
						duration: Number.NaN,
						delay: -2,
						easing: "linear",
					},
					sequence: {
						unit: "word",
						order: "forward",
						staggerRatio: 2,
						seed: 4,
					},
					target: "text",
					effect: {
						kind: "fade",
						minimumOpacity: -1,
					},
				},
			},
		});

		const normalized = normalizeTextElement({ element, fps: 25 });

		expect(normalized).toMatchObject({
			textAnimations: {
				schemaVersion: 1,
				entrance: {
					timing: { duration: 0.6, delay: 0 },
					sequence: { staggerRatio: 0.95 },
					effect: { kind: "fade", minimumOpacity: 0 },
				},
			},
		});
	});

	it("keeps legacy animation data intact until the first explicit edit", () => {
		const normalized = normalizeTextElement({
			element: textElement({
				animationType: "slide-left",
				animationDuration: 1.25,
				animationDelay: 0.2,
			}),
		});

		expect(normalized).toMatchObject({
			animationType: "slide-left",
			animationDuration: 1.25,
			animationDelay: 0.2,
		});
		expect((normalized as TextElement).textAnimations).toBeUndefined();
	});

	it("preserves unsupported future schemas through project load", () => {
		const futureAnimations = {
			schemaVersion: 2,
			entrance: { futureEffect: "fold" },
		};
		const element = textElement({
			textAnimations: futureAnimations as unknown as TextAnimationsV1,
		});
		const tracks = normalizeLoadedTracks({
			tracks: [
				{
					id: "text-track",
					name: "Text",
					type: "text",
					elements: [element],
				},
			],
		});

		expect((tracks[0].elements[0] as TextElement).textAnimations).toBe(
			futureAnimations
		);
	});
});
