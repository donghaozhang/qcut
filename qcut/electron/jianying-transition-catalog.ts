import { JIANYING_AI_CORE_TRANSITIONS } from "./jianying-transition/catalog-ai-core.js";
import { JIANYING_DECORATIVE_TRANSITIONS } from "./jianying-transition/catalog-decorative.js";
import { JIANYING_EFFECT_TRANSITIONS } from "./jianying-transition/catalog-effects.js";
import { JIANYING_TRANSITION_GROUPS } from "./jianying-transition/catalog-groups.js";
import { JIANYING_MOTION_TRANSITIONS } from "./jianying-transition/catalog-motion.js";
import type {
	JianyingTransitionDefinition,
	JianyingTransitionGroup,
} from "./jianying-transition/catalog-types.js";

/** Public metadata only; no Jianying binaries or effect packages are bundled. */
export { JIANYING_TRANSITION_GROUPS };
export type {
	JianyingTransitionAccess,
	JianyingTransitionDefinition,
	JianyingTransitionGroup,
	JianyingTransitionPreview,
	JianyingTransitionRuntimeKind,
} from "./jianying-transition/catalog-types.js";

export const JIANYING_TRANSITIONS: readonly JianyingTransitionDefinition[] = [
	...JIANYING_AI_CORE_TRANSITIONS,
	...JIANYING_EFFECT_TRANSITIONS,
	...JIANYING_MOTION_TRANSITIONS,
	...JIANYING_DECORATIVE_TRANSITIONS,
];

export type JianyingTransitionId = JianyingTransitionDefinition["id"];
export type JianyingTransitionCatalogEntry = JianyingTransitionDefinition;

function matchesStableIdentity({
	transition,
	normalized,
}: {
	transition: JianyingTransitionDefinition;
	normalized: string;
}): boolean {
	return [transition.id, transition.resourceId].some(
		(candidate) => candidate.toLocaleLowerCase() === normalized
	);
}

function matchesName({
	transition,
	normalized,
}: {
	transition: JianyingTransitionDefinition;
	normalized: string;
}): boolean {
	return [transition.name, transition.localizedName].some(
		(candidate) => candidate.toLocaleLowerCase() === normalized
	);
}

export function resolveJianyingTransition({
	value,
}: {
	value: string;
}): JianyingTransitionCatalogEntry | undefined {
	const normalized = value.trim().toLocaleLowerCase();
	const stableMatch = JIANYING_TRANSITIONS.find((transition) =>
		matchesStableIdentity({ transition, normalized })
	);
	if (stableMatch) return stableMatch;
	return (
		JIANYING_TRANSITIONS.find(
			(transition) =>
				transition.runtimeKind === "transition-segment" &&
				matchesName({ transition, normalized })
		) ??
		JIANYING_TRANSITIONS.find((transition) =>
			matchesName({ transition, normalized })
		)
	);
}

export function getJianyingTransitionCount({
	group,
}: {
	group: JianyingTransitionGroup;
}): number {
	return JIANYING_TRANSITIONS.filter((transition) => transition.group === group)
		.length;
}
