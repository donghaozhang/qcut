import type { ClipTransition } from "../types/timeline.js";
import { createDeterministicJianyingId } from "./deterministic-id.js";
import { secondsToMicroseconds } from "./time.js";
import type { JianyingTransitionMaterial } from "./types.js";

export const CAPCUT_NATIVE_DISSOLVE_METADATA = {
	defaultDuration: 466_666,
	effectId: "392FD26E-A514-4d0f-8950-EA4A20CB407C",
	isOverlap: false,
	md5: "986161b2af25f7aa752278aa8b39c7b7",
	name: "Dissolve",
	resourceId: "6724846004274729480",
} as const;

export const JIANYING_NATIVE_DISSOLVE_METADATA = {
	defaultDuration: 500_000,
	effectId: "322577",
	isOverlap: true,
	md5: "2d641adc4bb63e37e3a0067d8c8cc3c3",
	name: "叠化",
	resourceId: "6724845717472416269",
} as const;

export function mapNativeDissolveTransitionToJianying({
	transition,
}: {
	transition: ClipTransition;
}): JianyingTransitionMaterial {
	return {
		category_id: "",
		category_name: "",
		duration: secondsToMicroseconds({ seconds: transition.duration }),
		effect_id: JIANYING_NATIVE_DISSOLVE_METADATA.effectId,
		id: createDeterministicJianyingId({
			namespace: "transition",
			sourceId: transition.id,
		}),
		is_overlap: JIANYING_NATIVE_DISSOLVE_METADATA.isOverlap,
		name: JIANYING_NATIVE_DISSOLVE_METADATA.name,
		platform: "all",
		resource_id: JIANYING_NATIVE_DISSOLVE_METADATA.resourceId,
		type: "transition",
	};
}
