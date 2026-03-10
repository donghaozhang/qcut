/**
 * @qcut/editor-core timeline exports
 * @module @qcut/editor-core/timeline
 */

export {
	sortTracksByOrder,
	getMainTrack,
	ensureMainTrack,
	getTrackName,
	createTrack,
} from "./track-utils.js";

export {
	getEffectiveDuration,
	getElementEndTime,
	getElementNameWithSuffix,
} from "./element-utils.js";

export {
	isMediaElement,
	isTextElement,
	isStickerElement,
	isCaptionElement,
	isRemotionElement,
	isMarkdownElement,
	getRemotionElements,
	getActiveRemotionElements,
} from "./type-guards.js";

export {
	canElementGoOnTrack,
	validateElementTrackCompatibility,
} from "./validation.js";
