import { JIANYING_BLUR_TRANSITIONS } from "./catalog-categories/blur.js";
import { JIANYING_DISTORTION_TRANSITIONS } from "./catalog-categories/distortion.js";
import { JIANYING_GLITCH_TRANSITIONS } from "./catalog-categories/glitch.js";
import { JIANYING_LIGHT_TRANSITIONS } from "./catalog-categories/light.js";

export const JIANYING_EFFECT_TRANSITIONS = [
	...JIANYING_GLITCH_TRANSITIONS,
	...JIANYING_LIGHT_TRANSITIONS,
	...JIANYING_BLUR_TRANSITIONS,
	...JIANYING_DISTORTION_TRANSITIONS,
];
