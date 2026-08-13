// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createJianyingTextCacheAuditReport } from "../../research/jianying-runtime-probe/text-cache-audit.js";
import { createEmptyJianyingTextEffectCapabilities } from "../jianying-text-effect-capabilities.js";
import type { JianyingTextStyleCatalogEntry } from "../jianying-text-style-lab-catalog.js";
import type { JianyingTextStylePackageKind } from "../jianying-text-style-lab-contract.js";

function createEntry({
	packageKind,
	resourceId,
	runtime = false,
	version,
}: {
	packageKind: JianyingTextStylePackageKind;
	resourceId: string;
	runtime?: boolean;
	version: string;
}): JianyingTextStyleCatalogEntry {
	return {
		styleId: `${resourceId}/${version}`,
		resourceId,
		version,
		packageKind,
		packageVersion: "runtime",
		fillKind: "unknown",
		strokeCount: 0,
		innerShadowCount: 0,
		shadowCount: 0,
		textureLayerCount: 0,
		capabilities: createEmptyJianyingTextEffectCapabilities(),
		diagnostics: [],
		hasCover: false,
		compatibility: runtime ? "native-runtime" : "preview-only",
		...(runtime && packageKind !== "AmazingFeature" && packageKind !== "unknown"
			? {
					runtimeReference: {
						schemaVersion: 1 as const,
						source: "jianying-cache" as const,
						packageKind,
						resourceId,
						packageHash: version,
						editMode: "runtime-with-preload-fallback" as const,
						slotMapping: "line-to-widget" as const,
						timeMapping: "stretch" as const,
						templateDuration: 3,
					},
				}
			: {}),
	};
}

describe("Jianying text cache audit", () => {
	it("reports package classes, ownership, and product discovery from one policy", () => {
		const version = "a".repeat(32);
		const entries = [
			createEntry({
				packageKind: "TextStyle",
				resourceId: "7000000000000000001",
				runtime: true,
				version,
			}),
			createEntry({
				packageKind: "InfoSticker",
				resourceId: "7000000000000000002",
				runtime: true,
				version,
			}),
			createEntry({
				packageKind: "InfoSticker",
				resourceId: "7000000000000000003",
				runtime: true,
				version,
			}),
			createEntry({
				packageKind: "InfoSticker",
				resourceId: "7000000000000000004",
				runtime: true,
				version,
			}),
			createEntry({
				packageKind: "ScriptInfoSticker",
				resourceId: "7000000000000000005",
				runtime: true,
				version,
			}),
			createEntry({
				packageKind: "AmazingFeature",
				resourceId: "7000000000000000006",
				version,
			}),
		];
		const flower = entries[1];
		const sticker = entries[2];
		const unresolved = entries[3];
		const amazingFeature = entries[5];
		const report = createJianyingTextCacheAuditReport({
			catalog: {
				entries,
				packageCount: 7,
				invalidPackageCount: 0,
			},
			generatedAt: "2026-08-13T00:00:00.000Z",
			metadata: new Map([
				[flower.styleId, { title: "花字", categoryIds: ["popular"] }],
			]),
			ownership: new Map([
				[
					sticker.styleId,
					{
						kind: "non-flower",
						match: "exact",
						catalogFamilies: ["sticker"],
					},
				],
				[
					unresolved.styleId,
					{
						kind: "unclassified",
						match: "none",
						catalogFamilies: [],
					},
				],
				[
					amazingFeature.styleId,
					{
						kind: "non-flower",
						match: "package-structure",
						catalogFamilies: ["filter"],
					},
				],
			]),
		});

		expect(report.catalog).toEqual({
			scannedPackageCount: 7,
			recognizedPackageCount: 6,
			skippedPackageCount: 1,
			invalidPackageCount: 0,
			discoverableCardCount: 3,
		});
		expect(report.packageKinds.InfoSticker).toMatchObject({
			total: 3,
			discoverable: 1,
			excluded: 2,
			flowerCatalogMatches: 1,
			ownership: { "non-flower": 1, unclassified: 1 },
		});
		expect(report.packageKinds.AmazingFeature).toMatchObject({
			total: 1,
			discoverable: 0,
			excluded: 1,
			ownership: { "non-flower": 1 },
		});
		expect(report.ownershipMatches).toMatchObject({
			exact: 1,
			"package-structure": 1,
			none: 1,
		});
		expect(report.unresolved).toEqual([
			{
				styleId: unresolved.styleId,
				packageKind: "InfoSticker",
			},
		]);
		expect(report.ambiguous).toEqual([]);
	});
});
