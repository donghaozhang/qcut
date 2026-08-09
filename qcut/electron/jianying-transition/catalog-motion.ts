import { JIANYING_CAMERA_TRANSITIONS } from "./catalog-categories/camera.js";
import { JIANYING_SHOOTING_TRANSITIONS } from "./catalog-categories/shooting.js";
import { JIANYING_SLIDESHOW_TRANSITIONS } from "./catalog-categories/slideshow.js";

export const JIANYING_MOTION_TRANSITIONS = [
	...JIANYING_SLIDESHOW_TRANSITIONS,
	...JIANYING_SHOOTING_TRANSITIONS,
	...JIANYING_CAMERA_TRANSITIONS,
];
