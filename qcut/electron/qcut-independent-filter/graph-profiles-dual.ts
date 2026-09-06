import type { IndependentGraphProfile } from "./graph-profiles.js";
import { PROFILES as tiled } from "./graph-profiles-dual-tiled.js";
import { PROFILES as vf } from "./graph-profiles-dual-vf.js";
import { PROFILES as legacy } from "./graph-profiles-dual-legacy.js";

// Only exact, pixel-tested versions belong here. Model inference remains local.
export const HYBRID_DUAL_PROFILES: readonly IndependentGraphProfile[] = [
	...tiled,
	...vf,
	...legacy,
];
