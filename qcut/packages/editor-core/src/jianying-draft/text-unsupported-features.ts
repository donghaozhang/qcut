import { resolveSubtitleStyle } from "../captions/subtitle-style.js";
import type {
	CaptionElement,
	TextElement,
	TimelineTrack,
} from "../types/timeline.js";
import {
	CAPCUT_8_1_LEGACY_DEFAULT_FONT_ALIAS,
	resolveCapCut81Font,
} from "./capcut-8-1-font-resolver.js";
import { CAPCUT_8_1_APP_VERSION } from "./capcut-8-1-profile.js";
import type {
	JianyingDraftIssue,
	JianyingDraftTargetPlatform,
} from "./types.js";

export type JianyingTextFontProfile =
	| {
			kind: "capcut-8.1";
			targetPlatform: JianyingDraftTargetPlatform;
	  }
	| { kind: "legacy" };

const LEGACY_TEXT_FONT_PROFILE: JianyingTextFontProfile = { kind: "legacy" };

function addIssue({
	code,
	element,
	issues,
	message,
	severity = "error",
	track,
}: {
	code: string;
	element: CaptionElement | TextElement;
	issues: JianyingDraftIssue[];
	message: string;
	severity?: JianyingDraftIssue["severity"];
	track: TimelineTrack;
}): void {
	issues.push({
		code,
		severity,
		message,
		elementId: element.id,
		trackId: track.id,
	});
}

function hasTextKeyframes({ element }: { element: TextElement }): boolean {
	return Object.values(element.keyframes ?? {}).some(
		(keyframes) => (keyframes?.length ?? 0) > 0
	);
}

function hasNonDefaultInactiveAnimationTiming({
	animationDelay,
	animationDuration,
	animationType,
}: {
	animationDelay?: number;
	animationDuration?: number;
	animationType?: string;
}): boolean {
	if (animationType !== "none") return false;
	return (
		(animationDuration !== undefined &&
			Math.abs(animationDuration - 0.6) > Number.EPSILON) ||
		(animationDelay !== undefined && Math.abs(animationDelay) > Number.EPSILON)
	);
}

function collectFontIssues({
	content,
	element,
	fontFamily,
	fontProfile,
	issues,
	track,
}: {
	content: string;
	element: CaptionElement | TextElement;
	fontFamily: string;
	fontProfile: JianyingTextFontProfile;
	issues: JianyingDraftIssue[];
	track: TimelineTrack;
}): void {
	if (fontProfile.kind === "legacy") {
		if (fontFamily.trim() && fontFamily !== "Arial") {
			addIssue({
				code: "UNSUPPORTED_TEXT_FONT",
				element,
				issues,
				message: `Font family ${fontFamily} is not embedded in the draft.`,
				track,
			});
		}
		return;
	}

	const resolution = resolveCapCut81Font({
		appVersion: CAPCUT_8_1_APP_VERSION,
		content,
		requestedFamily: fontFamily,
		targetPlatform: fontProfile.targetPlatform,
	});
	const resolutionIssues = resolution.ok
		? resolution.warnings
		: resolution.errors;
	for (const resolutionIssue of resolutionIssues) {
		addIssue({
			code: resolutionIssue.code,
			element,
			issues,
			message: resolutionIssue.message,
			severity: resolutionIssue.severity,
			track,
		});
	}
}

export function collectTextFontIssues({
	element,
	fontProfile = LEGACY_TEXT_FONT_PROFILE,
	track,
}: {
	element: CaptionElement | TextElement;
	fontProfile?: JianyingTextFontProfile;
	track: TimelineTrack;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	const fontRequest =
		element.type === "text"
			? { content: element.content, fontFamily: element.fontFamily }
			: {
					content: element.text,
					fontFamily: resolveSubtitleStyle(element.style).fontFamily,
				};
	collectFontIssues({
		...fontRequest,
		element,
		fontProfile,
		issues,
		track,
	});
	return issues;
}

export function prepareCapCut81TextFontForLegacySerializer({
	element,
	targetPlatform,
	track,
}: {
	element: CaptionElement | TextElement;
	targetPlatform: JianyingDraftTargetPlatform;
	track: TimelineTrack;
}): {
	issues: JianyingDraftIssue[];
	projectedElement: CaptionElement | TextElement;
} {
	const issues = collectTextFontIssues({
		element,
		fontProfile: { kind: "capcut-8.1", targetPlatform },
		track,
	});
	const projected = structuredClone(element);
	if (projected.type === "text") {
		return {
			issues,
			projectedElement: {
				...projected,
				fontFamily: CAPCUT_8_1_LEGACY_DEFAULT_FONT_ALIAS,
			},
		};
	}
	if (!projected.style) return { issues, projectedElement: projected };
	return {
		issues,
		projectedElement: {
			...projected,
			style: {
				...projected.style,
				fontFamily: CAPCUT_8_1_LEGACY_DEFAULT_FONT_ALIAS,
			},
		},
	};
}

function collectSharedWarnings({
	element,
	issues,
	track,
}: {
	element: CaptionElement | TextElement;
	issues: JianyingDraftIssue[];
	track: TimelineTrack;
}): void {
	if (
		(element.effects?.length ?? 0) > 0 ||
		(element.effectChains?.length ?? 0) > 0 ||
		(element.effectIds?.length ?? 0) > 0
	) {
		addIssue({
			code: "UNSUPPORTED_TEXT_EFFECT",
			element,
			issues,
			message: "Text effects and effect chains are not mapped yet.",
			track,
		});
	}
	if (element.name.trim() && element.name !== element.id) {
		addIssue({
			code: "UNSUPPORTED_TEXT_METADATA",
			element,
			issues,
			message:
				"Custom text and caption element names are not represented in the draft.",
			severity: "warning",
			track,
		});
	}
	if (element.colorLabel?.trim()) {
		addIssue({
			code: "UNSUPPORTED_TEXT_METADATA",
			element,
			issues,
			message:
				"Text and caption color labels are not represented in the draft.",
			severity: "warning",
			track,
		});
	}
	if (element.groupId?.trim() || element.templateBinding !== undefined) {
		addIssue({
			code: "UNSUPPORTED_TEXT_METADATA",
			element,
			issues,
			message: "Text grouping and template bindings are not mapped yet.",
			severity: "warning",
			track,
		});
	}
}

function collectTextWarnings({
	element,
	issues,
	track,
}: {
	element: TextElement;
	issues: JianyingDraftIssue[];
	track: TimelineTrack;
}): void {
	if (element.height !== undefined) {
		addIssue({
			code: "UNSUPPORTED_TEXT_GEOMETRY",
			element,
			issues,
			message: "Explicit text height needs a verified JianYing mapping.",
			track,
		});
	}
	if (element.animationType !== undefined && element.animationType !== "none") {
		addIssue({
			code: "UNSUPPORTED_TEXT_ANIMATION",
			element,
			issues,
			message: "Legacy text animation is not mapped yet.",
			track,
		});
	}
	if (
		hasNonDefaultInactiveAnimationTiming({
			animationDelay: element.animationDelay,
			animationDuration: element.animationDuration,
			animationType: element.animationType,
		})
	) {
		addIssue({
			code: "UNSUPPORTED_TEXT_METADATA",
			element,
			issues,
			message:
				"Inactive legacy text animation duration or delay is not preserved.",
			severity: "warning",
			track,
		});
	}
	if (
		element.textAnimations?.entrance ||
		element.textAnimations?.loop ||
		element.textAnimations?.exit
	) {
		addIssue({
			code: "UNSUPPORTED_TEXT_ANIMATION",
			element,
			issues,
			message: "Phased text animation is not mapped yet.",
			track,
		});
	}
	if (hasTextKeyframes({ element })) {
		addIssue({
			code: "UNSUPPORTED_TEXT_KEYFRAMES",
			element,
			issues,
			message: "Text keyframes are not mapped yet.",
			track,
		});
	}
	if (Math.abs(element.curve ?? 0) > Number.EPSILON) {
		addIssue({
			code: "UNSUPPORTED_TEXT_CURVE",
			element,
			issues,
			message: "Curved text is exported as straight text.",
			track,
		});
	}
	if ((element.glowOpacity ?? 0) > 0) {
		addIssue({
			code: "UNSUPPORTED_TEXT_GLOW",
			element,
			issues,
			message: "Text glow is not mapped yet.",
			track,
		});
	}
	if (
		element.trackingTargetId?.trim() ||
		Math.abs(element.trackingOffsetX ?? 0) > Number.EPSILON ||
		Math.abs(element.trackingOffsetY ?? 0) > Number.EPSILON ||
		element.trackingRotation
	) {
		addIssue({
			code: "UNSUPPORTED_TEXT_TRACKING",
			element,
			issues,
			message: "Text motion tracking is not mapped yet.",
			track,
		});
	}
	if (element.blendMode !== undefined && element.blendMode !== "normal") {
		addIssue({
			code: "UNSUPPORTED_TEXT_BLEND_MODE",
			element,
			issues,
			message: "Text blend mode is exported as normal.",
			track,
		});
	}
	issues.push(...collectTextFontIssues({ element, track }));
	if (
		element.textDecoration === "line-through" ||
		(element.lineHeight !== undefined &&
			Math.abs(element.lineHeight - 1) > Number.EPSILON) ||
		(element.verticalAlign !== undefined && element.verticalAlign !== "middle")
	) {
		addIssue({
			code: "UNSUPPORTED_TEXT_STYLE",
			element,
			issues,
			message:
				"Line-through, custom line height, or vertical alignment is not mapped yet.",
			track,
		});
	}
}

function collectCaptionWarnings({
	element,
	issues,
	track,
}: {
	element: CaptionElement;
	issues: JianyingDraftIssue[];
	track: TimelineTrack;
}): void {
	const style = resolveSubtitleStyle(element.style);
	if (
		element.x !== undefined ||
		element.y !== undefined ||
		element.width !== undefined ||
		element.height !== undefined
	) {
		addIssue({
			code: "UNSUPPORTED_CAPTION_GEOMETRY",
			element,
			issues,
			message:
				"Explicit caption element position or bounds need a verified JianYing mapping.",
			track,
		});
	}
	if (style.position.align !== "bottom") {
		addIssue({
			code: "UNSUPPORTED_CAPTION_GEOMETRY",
			element,
			issues,
			message: "Top and center caption alignment are not mapped yet.",
			track,
		});
	}
	if (style.animationType !== "none") {
		addIssue({
			code: "UNSUPPORTED_CAPTION_ANIMATION",
			element,
			issues,
			message: "Caption animation is not mapped yet.",
			track,
		});
	}
	if (
		hasNonDefaultInactiveAnimationTiming({
			animationDelay: style.animationDelay,
			animationDuration: style.animationDuration,
			animationType: style.animationType,
		})
	) {
		addIssue({
			code: "UNSUPPORTED_TEXT_METADATA",
			element,
			issues,
			message: "Inactive caption animation duration or delay is not preserved.",
			severity: "warning",
			track,
		});
	}
	addIssue({
		code: "UNSUPPORTED_CAPTION_METADATA",
		element,
		issues,
		message:
			"Caption language, confidence, and source metadata are not represented in the draft.",
		severity: "warning",
		track,
	});
	if ((element.words?.length ?? 0) > 0) {
		addIssue({
			code: "UNSUPPORTED_CAPTION_WORD_TIMING",
			element,
			issues,
			message: "Caption word timing is not mapped yet.",
			track,
		});
	}
	if (style.karaokeMode !== undefined && style.karaokeMode !== "none") {
		addIssue({
			code: "UNSUPPORTED_CAPTION_KARAOKE",
			element,
			issues,
			message: "Karaoke caption styling is exported as static subtitles.",
			track,
		});
	}
	issues.push(...collectTextFontIssues({ element, track }));
	if (Math.abs(style.lineSpacing - 1.4) > Number.EPSILON) {
		addIssue({
			code: "UNSUPPORTED_TEXT_STYLE",
			element,
			issues,
			message: "Custom caption line spacing is not mapped yet.",
			track,
		});
	}
}

export function collectLossyTextFeatureIssues({
	element,
	track,
}: {
	element: CaptionElement | TextElement;
	track: TimelineTrack;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	collectSharedWarnings({ element, issues, track });
	if (element.type === "text") {
		collectTextWarnings({ element, issues, track });
		return issues;
	}
	collectCaptionWarnings({ element, issues, track });
	return issues;
}
