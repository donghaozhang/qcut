import type {
	InteropDowngradeDeclaration,
	InteropEffectAdjustParameter,
	InteropEffectPreset,
} from "../../draft-interop/document.js";
import type { RawGraphMaterialNode } from "./graph-reader.js";

/**
 * One locally installed, render-verified Jianying effect package, keyed by
 * resource id. The caller (the Electron import host) builds this map from
 * the local effect catalog — editor-core never touches the filesystem, and
 * admission is machine-bound by design (L7): the same draft on a machine
 * without the package keeps its effect segments opaque.
 */
export interface JianyingLocalEffectCapability {
	presetId: string;
	name: string;
	/** Package md5 — the id the local catalog and the disk agree on. */
	packageHash: string;
	adjustParameters: InteropEffectAdjustParameter[];
}

export type JianyingLocalEffectCapabilities = ReadonlyMap<
	string,
	JianyingLocalEffectCapability
>;

export interface MappedBeta4SegmentEffect {
	effectPreset: InteropEffectPreset;
	downgrade: InteropDowngradeDeclaration;
	reason: string;
}

/**
 * Maps one beta4 effect-track segment onto a locally installed
 * jianying-local package.
 *
 * Shape contract (fixture-defined; no plaintext beta4 effect draft exists
 * locally to fingerprint, so anything off-contract simply stays opaque and
 * never crosses): an effects-bucket material with a string resource_id whose
 * id is present in the local capability map and whose name matches the local
 * catalog title exactly. Sliders import at package defaults — per-segment
 * adjust values need a real draft sample before they can cross.
 */
export function mapBeta4SegmentEffect({
	material,
	localEffects,
}: {
	material: RawGraphMaterialNode;
	localEffects: JianyingLocalEffectCapabilities | undefined;
}): MappedBeta4SegmentEffect | undefined {
	if (localEffects === undefined) return undefined;
	const raw = material.raw;
	const resourceId = raw.resource_id;
	if (typeof resourceId !== "string") return undefined;
	const local = localEffects.get(resourceId);
	if (local === undefined || raw.name !== local.name) return undefined;
	return {
		effectPreset: {
			presetId: local.presetId,
			name: local.name,
			packageHash: local.packageHash,
			...(local.adjustParameters.length === 0
				? {}
				: { adjustParameters: local.adjustParameters }),
		},
		downgrade: {
			approximation: `jianying-local-effect:${local.presetId}`,
			fidelityEvidence:
				"rendered by the locally installed Jianying runtime (reference batch verified; machine-bound: exports of this element stay blocked until the native frame roundtrip lands); sliders import at package defaults",
		},
		reason: `effect ${local.name} maps to the locally installed jianying-local package ${local.packageHash}`,
	};
}
