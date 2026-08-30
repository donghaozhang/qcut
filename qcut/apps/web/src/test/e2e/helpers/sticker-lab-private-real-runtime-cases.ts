import {
	assertStickerRuntimeDescriptor,
	type StickerRuntimeDescriptor,
} from "@qcut/editor-core/sticker-lab";
import { expect } from "@playwright/test";
import type { Page } from "playwright";
import type {
	LocalStickerLabDiscovery,
	LocalStickerLabReference,
} from "../../../../../../electron/preload-types/api-types/sticker-lab-api";
import type { ElectronAPI } from "../../../../../../electron/preload-types/electron-api";
import type { StickerVideoEvidenceProfile } from "./exported-sticker-video-evidence";

const RUNTIME_BATCH_PATTERN = /-batch-19-v2$/;
const RUNTIME_CATEGORY_ID = "990100";

export const PRIVATE_REAL_RUNTIME_VIDEOS_DIRECTORY =
	process.env.QCUT_REAL_STICKER_LAB_RUNTIME_VIDEOS_DIRECTORY;
export const PRIVATE_REAL_RUNTIME_INPUT_VIDEO_PATH =
	process.env.QCUT_REAL_STICKER_LAB_RUNTIME_VIDEO_PATH ??
	process.env.QCUT_REAL_STICKER_LAB_VIDEO_PATH ??
	"";

export const PRIVATE_REAL_RUNTIME_VIDEO_PROFILE: StickerVideoEvidenceProfile = {
	durationSeconds: 6,
	frameHashFrames: [1, 7, 13, 19, 25],
	frameRate: 30,
	maxDimension: 1280,
	minDimension: 720,
	postSplitFrameHashFrames: [46, 52, 58, 64, 70],
	times: {
		animated: 0.7,
		early: 0.2,
		nearEnd: 2.8,
		postSplit: 2.2,
		splitLeft: 1.49,
		splitRight: 1.51,
	},
};

export const PRIVATE_REAL_RUNTIME_DEFINITIONS = [
	{
		kind: "atlas-animation",
		runtimeCanvasSize: { height: 280, width: 280 },
		seekTimes: { changed: 0.55, initial: 0.12 },
		stickerId: "9901000000000000001",
	},
	{
		kind: "png-sequence",
		runtimeCanvasSize: { height: 900, width: 900 },
		seekTimes: { changed: 1.8, initial: 0.4 },
		stickerId: "9901000000000000002",
	},
	{
		kind: "alpha-video",
		runtimeCanvasSize: { height: 960, width: 960 },
		seekTimes: { changed: 2.2, initial: 0.6 },
		stickerId: "9901000000000000003",
	},
] as const;

export interface PrivateRealRuntimeDefinition {
	kind: (typeof PRIVATE_REAL_RUNTIME_DEFINITIONS)[number]["kind"];
	runtimeCanvasSize: { height: number; width: number };
	seekTimes: { changed: number; initial: number };
	stickerId: string;
}

export interface PrivateRealRuntimeCase extends PrivateRealRuntimeDefinition {
	asset: LocalStickerLabReference["asset"];
	batchId: string;
	categoryId: string;
	displayName: string;
	fileName: string;
	resources: NonNullable<
		LocalStickerLabReference["runtimePackage"]
	>["resources"];
	runtimeDescriptor: StickerRuntimeDescriptor;
}

export function normalizedPrivateRuntimeResourceName({
	index,
}: {
	index: number;
}): string {
	return `asset_${String(index + 1).padStart(4, "0")}`;
}

function runtimeCaseFromDiscovery({
	definition,
	discovery,
}: {
	definition: PrivateRealRuntimeDefinition;
	discovery: LocalStickerLabDiscovery;
}): PrivateRealRuntimeCase {
	const matchingCatalogs = discovery.catalogs.filter(({ batchId }) =>
		RUNTIME_BATCH_PATTERN.test(batchId)
	);
	expect(matchingCatalogs).toHaveLength(1);
	const catalog = matchingCatalogs[0];
	if (!catalog) throw new Error("Private runtime batch 19-v2 is missing");
	expect(catalog.itemCount).toBe(PRIVATE_REAL_RUNTIME_DEFINITIONS.length);

	const matches = catalog.categories.flatMap((category) =>
		category.items
			.filter(({ id }) => id === definition.stickerId)
			.map((item) => ({ category, item }))
	);
	expect(matches).toHaveLength(1);
	const match = matches[0];
	if (!match?.item.runtimePackage) {
		throw new Error(`Runtime package is missing: ${definition.stickerId}`);
	}
	expect(match.category.id).toBe(RUNTIME_CATEGORY_ID);
	expect(match.item.sourceKind).toBe(definition.kind);
	assertStickerRuntimeDescriptor({
		descriptor: match.item.runtimePackage.descriptor,
	});
	const runtimeDescriptor = match.item.runtimePackage
		.descriptor as StickerRuntimeDescriptor;
	expect(runtimeDescriptor.kind).toBe(definition.kind);
	expect(match.item.runtimePackage.resources.length).toBeGreaterThan(0);

	return {
		...definition,
		asset: match.item.asset,
		batchId: catalog.batchId,
		categoryId: match.category.id,
		displayName: match.item.displayName,
		fileName: match.item.fileName,
		resources: match.item.runtimePackage.resources,
		runtimeDescriptor,
	};
}

export async function discoverPrivateRealRuntimeCase({
	definition,
	page,
}: {
	definition: PrivateRealRuntimeDefinition;
	page: Page;
}): Promise<{
	discovery: LocalStickerLabDiscovery;
	runtimeCase: PrivateRealRuntimeCase;
}> {
	const discovery = await page.evaluate(async () => {
		const electronAPI = (window as unknown as { electronAPI?: ElectronAPI })
			.electronAPI;
		const stickerLab = electronAPI?.stickerLab;
		if (!stickerLab)
			throw new Error("Sticker Lab desktop bridge is unavailable");
		return stickerLab.discoverLocalReferences({});
	});
	expect(discovery.warnings).toEqual([]);
	expect(discovery.summary.batchCount).toBeGreaterThanOrEqual(1);
	for (const expected of PRIVATE_REAL_RUNTIME_DEFINITIONS) {
		runtimeCaseFromDiscovery({ definition: expected, discovery });
	}
	return {
		discovery,
		runtimeCase: runtimeCaseFromDiscovery({ definition, discovery }),
	};
}

export function normalizePrivateRealRuntimeDescriptor({
	runtimeCase,
}: {
	runtimeCase: PrivateRealRuntimeCase;
}): StickerRuntimeDescriptor {
	const normalizeSource = ({ source }: { source: string }): string => {
		if (source === "$primary" || source === runtimeCase.fileName) {
			return "$primary";
		}
		const index = runtimeCase.resources.findIndex(
			({ resourceName }) => resourceName === source
		);
		if (index < 0) throw new Error(`Unknown runtime source: ${source}`);
		return `$resource:${normalizedPrivateRuntimeResourceName({ index })}`;
	};
	const descriptor = runtimeCase.runtimeDescriptor;
	switch (descriptor.kind) {
		case "direct-gif":
			return descriptor;
		case "atlas-animation":
			return {
				...descriptor,
				atlasSource: normalizeSource({
					source: descriptor.atlasSource ?? "$primary",
				}),
			};
		case "png-sequence":
			return {
				...descriptor,
				frames: descriptor.frames.map((frame) => ({
					...frame,
					source: normalizeSource({ source: frame.source }),
				})),
			};
		case "alpha-video":
			return {
				...descriptor,
				source: normalizeSource({ source: descriptor.source }),
				layout:
					descriptor.layout.kind === "separate-mask"
						? {
								...descriptor.layout,
								maskSource: normalizeSource({
									source: descriptor.layout.maskSource,
								}),
							}
						: descriptor.layout,
			};
		default: {
			const unsupported: never = descriptor;
			throw new Error(`Unsupported runtime descriptor: ${String(unsupported)}`);
		}
	}
}
