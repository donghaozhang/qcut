import { describe, expect, it } from "vitest";
import {
	queryAssetCatalog,
	validateAssetManifestPack,
} from "@qcut/editor-core";
import { CAPTION_STYLE_PRESETS } from "@/lib/captions/workbench";
import { FILTER_PRESETS } from "@/lib/filters/filter-registry";
import { POPULAR_COLLECTIONS } from "@/lib/stickers/iconify-api";
import { CURATED_STICKERS } from "@/lib/stickers/sticker-catalog";
import { MOTION_STICKERS } from "@/lib/stickers/sticker-motion-packs";
import {
	TEXT_TEMPLATE_DEFINITIONS,
	TEXT_TEMPLATES,
} from "@/lib/text/text-template-registry";
import { transitionPresets } from "@/components/editor/media-panel/views/transitions/transition-presets";
import type { SoundEffect } from "@/types/sounds";
import {
	QCUT_ASSET_CATALOG,
	QCUT_ASSET_MANIFEST,
	createFreesoundAssetEntry,
	createTransitionAssetEntry,
	resolveStickerAssetEntry,
} from "../qcut-asset-manifest";

function sound({ license }: { license: string }): SoundEffect {
	return {
		id: 42,
		name: "Kick",
		description: "",
		url: "https://freesound.org/s/42/",
		previewUrl: "https://cdn.example.test/kick.mp3",
		downloadUrl: "https://cdn.example.test/kick.wav",
		duration: 0.5,
		filesize: 1024,
		type: "wav",
		channels: 2,
		bitrate: 0,
		bitdepth: 24,
		samplerate: 48_000,
		username: "creator",
		tags: ["kick", "drum"],
		license,
		created: "2026-01-01",
		downloads: 10,
		rating: 4.8,
		ratingCount: 2,
	};
}

describe("QCut asset manifest", () => {
	it("validates every built-in asset and includes each source registry", () => {
		expect(
			validateAssetManifestPack({ manifest: QCUT_ASSET_MANIFEST })
		).toEqual({ valid: true, issues: [] });
		expect(
			queryAssetCatalog({
				catalog: QCUT_ASSET_CATALOG,
				query: { kinds: ["filter"] },
			})
		).toHaveLength(FILTER_PRESETS.length);
		expect(
			queryAssetCatalog({
				catalog: QCUT_ASSET_CATALOG,
				query: { kinds: ["text-template"] },
			})
		).toHaveLength(TEXT_TEMPLATES.length);
		expect(
			queryAssetCatalog({
				catalog: QCUT_ASSET_CATALOG,
				query: { kinds: ["caption-style"] },
			})
		).toHaveLength(CAPTION_STYLE_PRESETS.length);
		const transitions = queryAssetCatalog({
			catalog: QCUT_ASSET_CATALOG,
			query: { kinds: ["transition"] },
		});
		expect(transitions).toHaveLength(transitionPresets.length);
		expect(transitions.length).toBeGreaterThanOrEqual(50);
		expect(transitions[0]).toMatchObject({
			delivery: "bundled",
			license: { commercialUse: "allowed" },
			version: 1,
		});
		expect(transitions[0].files.map((file) => file.role)).toEqual([
			"thumbnail",
			"preview",
		]);
	});

	it("publishes text templates as versioned downloadable resource assets", () => {
		const textAssets = queryAssetCatalog({
			catalog: QCUT_ASSET_CATALOG,
			query: { kinds: ["text-template"] },
		});
		const definitionsByAssetId = new Map(
			TEXT_TEMPLATE_DEFINITIONS.map((definition) => [
				definition.resource?.assetId ?? `text-legacy-${definition.id}`,
				definition,
			])
		);
		const redAsset = textAssets.find((asset) => asset.category === "red");
		const premiumAsset = textAssets.find(
			(asset) =>
				(asset.metadata as { entitlement?: string } | undefined)
					?.entitlement === "svip"
		);
		const bundledAsset = textAssets.find(
			(asset) => asset.delivery === "bundled" && asset.files.length === 3
		);

		expect(textAssets).toHaveLength(TEXT_TEMPLATES.length);
		expect(
			textAssets.every((asset) => definitionsByAssetId.has(asset.id))
		).toBe(true);
		expect(redAsset?.files.map((file) => file.role)).toEqual([
			"thumbnail",
			"source",
			"package",
		]);
		expect(redAsset?.files[0]?.url).toMatch(
			/^https:\/\/assets\.qcut\.app\/text-assets\/.+\/thumbnail\.webp$/
		);
		expect(redAsset?.files[1]?.url).toMatch(
			/^https:\/\/assets\.qcut\.app\/text-assets\/.+\/template\.json$/
		);
		expect(redAsset?.files[2]?.url).toMatch(
			/^https:\/\/assets\.qcut\.app\/text-assets\/.+\/template\.qctext$/
		);
		expect(redAsset?.metadata).toMatchObject({
			packageId: "text-fancy-red",
			entitlement: expect.stringMatching(/^(free|svip)$/),
		});
		expect(bundledAsset?.files[0]).toMatchObject({
			role: "thumbnail",
			url: expect.stringMatching(/^\/text-assets\/.+\/thumbnail\.webp$/),
			checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
		});
		expect(bundledAsset?.files[1]).toMatchObject({
			role: "source",
			url: expect.stringMatching(/^\/text-assets\/.+\/template\.json$/),
			checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
		});
		expect(bundledAsset?.files[2]).toMatchObject({
			role: "package",
			url: expect.stringMatching(/^\/text-assets\/.+\/template\.qctext$/),
			checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
		});
		expect(premiumAsset?.delivery).toBe("remote");
		expect(premiumAsset?.tags).toContain("svip");
	});

	it("maps transition presets to downloadable preview assets", () => {
		const transition = createTransitionAssetEntry({
			preset: transitionPresets[0],
		});

		expect(transition).toMatchObject({
			id: transitionPresets[0].id,
			kind: "transition",
			delivery: transitionPresets[0].delivery,
			metadata: {
				clipType: transitionPresets[0].clipType,
				defaultDuration: transitionPresets[0].defaultDuration,
			},
		});
		expect(transition.files).toEqual([
			{
				role: "thumbnail",
				url: transitionPresets[0].preview.from,
				mimeType: "image/webp",
			},
			{
				role: "preview",
				url: transitionPresets[0].preview.to,
				mimeType: "image/webp",
			},
		]);
	});

	it("publishes real animated sticker sources with license and preview files", () => {
		const expectedStickerIds = new Set([
			...POPULAR_COLLECTIONS.flatMap((collection) =>
				(collection.samples ?? []).map((icon) => `${collection.prefix}:${icon}`)
			),
			...CURATED_STICKERS.map((sticker) => sticker.id),
			...MOTION_STICKERS.map((sticker) => sticker.id),
		]);
		const stickers = queryAssetCatalog({
			catalog: QCUT_ASSET_CATALOG,
			query: { kinds: ["sticker"] },
		});
		const motionStickers = queryAssetCatalog({
			catalog: QCUT_ASSET_CATALOG,
			query: { kinds: ["sticker"], categories: ["motion"] },
		});

		expect(stickers).toHaveLength(expectedStickerIds.size);
		expect(
			stickers.filter((sticker) => sticker.id.startsWith("fluent-emoji:"))
		).toHaveLength(
			CURATED_STICKERS.filter((sticker) => sticker.source.kind === "iconify")
				.length
		);
		const originalStickers = stickers.filter((sticker) =>
			sticker.id.startsWith("qcut-original:")
		);
		expect(originalStickers).toHaveLength(
			CURATED_STICKERS.filter(
				(sticker) => sticker.collection === "qcut-original"
			).length
		);
		for (const sticker of originalStickers) {
			expect(sticker).toMatchObject({
				delivery: "bundled",
				license: {
					attributionRequired: false,
					commercialUse: "allowed",
				},
			});
			expect(sticker.files.map((file) => file.role)).toEqual([
				"thumbnail",
				"source",
			]);
		}
		expect(motionStickers.length).toBeGreaterThanOrEqual(20);
		for (const sticker of motionStickers) {
			expect(sticker.files.map((file) => file.role)).toEqual([
				"thumbnail",
				"source",
			]);
			expect(sticker.license.commercialUse).toBe("allowed");
			expect(sticker.metadata).toMatchObject({ animated: true });
		}
		const localMotionSticker = resolveStickerAssetEntry({
			collectionPrefix: "qcut-motion-emphasis",
			icon: "attention-pulse",
		});
		expect(localMotionSticker).toMatchObject({
			id: "qcut-motion-emphasis:attention-pulse",
			category: "motion",
			delivery: "bundled",
			metadata: {
				animated: true,
				motion: "pulse",
			},
		});
		expect(localMotionSticker.files[0]?.url).toContain(
			"stickers/qcut-motion/qcut-motion-emphasis/attention-pulse.png"
		);
	});

	it("normalizes Freesound commercial licensing", () => {
		expect(
			createFreesoundAssetEntry({
				sound: sound({
					license: "https://creativecommons.org/publicdomain/zero/1.0/",
				}),
				kind: "sound-effect",
			}).license
		).toMatchObject({
			commercialUse: "allowed",
			attributionRequired: false,
		});
		expect(
			createFreesoundAssetEntry({
				sound: sound({
					license: "https://creativecommons.org/licenses/by-nc/4.0/",
				}),
				kind: "music",
			}).license
		).toMatchObject({
			commercialUse: "restricted",
			attributionRequired: true,
		});
	});
});
