import type { IndependentGraphProfile } from "./graph-profiles.js";
import { PROFILES as tiled } from "./graph-profiles-dual-tiled.js";
import { PROFILES as vf } from "./graph-profiles-dual-vf.js";
import { PROFILES as legacy } from "./graph-profiles-dual-legacy.js";
import { HYBRID_DUAL_SHARPEN_A } from "./graph-profiles-dual-sharpen-a.js";
import { HYBRID_DUAL_SHARPEN_B } from "./graph-profiles-dual-sharpen-b.js";
import { HYBRID_DUAL_ADDITIONAL } from "./graph-profiles-dual-additional.js";

// Only exact, pixel-tested versions belong here. Model inference remains local.
export const HYBRID_DUAL_PROFILES: readonly IndependentGraphProfile[] = [
	...tiled,
	...vf,
	...legacy,
	...HYBRID_DUAL_SHARPEN_A,
	...HYBRID_DUAL_SHARPEN_B,
	...HYBRID_DUAL_ADDITIONAL,
];
