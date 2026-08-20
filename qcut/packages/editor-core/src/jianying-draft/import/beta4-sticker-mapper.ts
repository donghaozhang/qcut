import type { InteropDowngradeDeclaration } from "../../draft-interop/document.js";
import type { RawGraphMaterialNode } from "./graph-reader.js";

/** Image formats the sticker staging pipeline can carry into a project. */
const STICKER_IMAGE_EXTENSION_PATTERN = /\.(?:png|gif|webp|jpe?g)$/i;

export interface MappedBeta4SegmentSticker {
	downgrade: InteropDowngradeDeclaration;
	reason: string;
}

/**
 * Reads the sticker material's local image asset path, when the draft
 * carries one the import pipeline can stage.
 */
export function readBeta4StickerAssetPath({
	material,
}: {
	material: RawGraphMaterialNode;
}): string | undefined {
	const path = material.raw.path;
	return typeof path === "string" && STICKER_IMAGE_EXTENSION_PATTERN.test(path)
		? path
		: undefined;
}

/**
 * Maps one beta4 sticker segment onto its draft-embedded image asset (L8).
 *
 * Shape contract (fixture-defined; no plaintext beta4 sticker draft exists
 * locally to fingerprint): a stickers-bucket material with a string
 * resource_id and a stageable local image `path`. The availability condition
 * is the asset file itself — staging fails closed when it is missing.
 * Off-contract stickers keep their undeclared-downgrade ruling and stay
 * skipped at the plan gate.
 *
 * Provenance discipline: the imported asset is Jianying reference material
 * (剪映参照 · 内部). It stays inside the user's local project storage and
 * must never be redistributed — the declaration records that boundary.
 */
export function mapBeta4SegmentSticker({
	material,
}: {
	material: RawGraphMaterialNode;
}): MappedBeta4SegmentSticker | undefined {
	const resourceId = material.raw.resource_id;
	if (typeof resourceId !== "string") return undefined;
	if (readBeta4StickerAssetPath({ material }) === undefined) return undefined;
	return {
		downgrade: {
			approximation: `jianying-reference-sticker:${resourceId}`,
			fidelityEvidence:
				"draft-embedded sticker image staged into local project storage (剪映参照 · 内部 — internal reference material, never redistributed); animated sticker runtimes and per-segment transforms import at static defaults",
		},
		reason: `sticker ${typeof material.raw.name === "string" ? material.raw.name : resourceId} imports its draft-embedded image asset`,
	};
}
