import type { TransitionPreset } from "../transition-preset-types";
import { FLUID_AND_PARTICLE_PRESETS } from "./fluid-and-particle";
import { GLASS_AND_PAGE_PRESETS } from "./glass-and-page";
import { MOTION_AND_PIXEL_PRESETS } from "./motion-and-pixel";
import { TEXTURE_AND_FLARE_PRESETS } from "./texture-and-flare";

export const TRANSITION_ENGINE_PRESETS: TransitionPreset[] = [
	...MOTION_AND_PIXEL_PRESETS,
	...FLUID_AND_PARTICLE_PRESETS,
	...GLASS_AND_PAGE_PRESETS,
	...TEXTURE_AND_FLARE_PRESETS,
];
