import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import type {
	JianyingTextAnimationLabSummary,
	JianyingTextAnimationReferences,
	JianyingTextAnimationSlot,
	JianyingTextStyleLabStyleSummary,
} from "@/types/electron";
import type { TextElement } from "@/types/timeline";

export type TextStyleLabUpdates = Pick<
	TextElement,
	| "color"
	| "strokeColor"
	| "strokeWidth"
	| "strokeOpacity"
	| "backgroundColor"
	| "backgroundOpacity"
	| "shadowColor"
	| "shadowOpacity"
	| "shadowOffsetX"
	| "shadowOffsetY"
	| "shadowBlur"
	| "glowColor"
	| "glowOpacity"
	| "glowBlur"
	| "width"
	| "height"
	| "jianyingTextStyle"
>;

export function buildTextStyleLabUpdates({
	animations,
	style,
}: {
	animations?: JianyingTextAnimationReferences;
	style: JianyingTextStyleLabStyleSummary;
}): TextStyleLabUpdates | null {
	if (style.runtimeReference) {
		const fallback = style.approximation;
		const { animations: existingAnimations, ...runtimeReference } =
			style.runtimeReference;
		const selectedAnimations = animations ?? existingAnimations;
		const jianyingTextStyle =
			selectedAnimations && Object.keys(selectedAnimations).length > 0
				? { ...runtimeReference, animations: selectedAnimations }
				: runtimeReference;
		return {
			color: fallback?.color ?? "#ffffff",
			strokeColor: fallback?.strokeColor ?? "#000000",
			strokeWidth: fallback?.strokeWidth ?? 0,
			strokeOpacity: fallback?.strokeOpacity ?? 0,
			backgroundColor: "transparent",
			backgroundOpacity: 0,
			shadowColor: fallback?.shadowColor ?? "#000000",
			shadowOpacity: fallback?.shadowOpacity ?? 0,
			shadowOffsetX: fallback?.shadowOffsetX ?? 0,
			shadowOffsetY: fallback?.shadowOffsetY ?? 0,
			shadowBlur: fallback?.shadowBlur ?? 0,
			glowColor: fallback?.glowColor ?? "#ffffff",
			glowOpacity: fallback?.glowOpacity ?? 0,
			glowBlur: fallback?.glowBlur ?? 0,
			width: 1024,
			height: 512,
			jianyingTextStyle,
		};
	}
	const approximation = style.approximation;
	if (!approximation) return null;
	return {
		color: approximation.color,
		strokeColor: approximation.strokeColor,
		strokeWidth: approximation.strokeWidth,
		strokeOpacity: approximation.strokeOpacity,
		backgroundColor: "transparent",
		backgroundOpacity: 0,
		shadowColor: approximation.shadowColor,
		shadowOpacity: approximation.shadowOpacity,
		shadowOffsetX: approximation.shadowOffsetX,
		shadowOffsetY: approximation.shadowOffsetY,
		shadowBlur: approximation.shadowBlur,
		glowColor: approximation.glowColor,
		glowOpacity: approximation.glowOpacity,
		glowBlur: approximation.glowBlur,
		jianyingTextStyle: undefined,
	};
}

export function buildTextStyleLabElement({
	animations,
	style,
	content,
}: {
	animations?: JianyingTextAnimationReferences;
	style: JianyingTextStyleLabStyleSummary;
	content?: string;
}): TextElement | null {
	const updates = buildTextStyleLabUpdates({ animations, style });
	if (!updates) return null;
	return {
		id: `jianying-text-style-lab:${style.styleId}`,
		type: "text",
		name: style.title ?? `本机花字 ${style.resourceId.slice(-6)}`,
		content: content ?? (style.runtimeReference ? "花字" : "花字实验"),
		fontSize: 72,
		fontFamily: "PingFang SC",
		textAlign: "center",
		fontWeight: "bold",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		width: style.runtimeReference ? 1024 : 720,
		height: style.runtimeReference ? 512 : 200,
		letterSpacing: 0,
		lineHeight: 1.2,
		verticalAlign: "middle",
		backgroundRadius: 0,
		backgroundPadding: 16,
		curve: 0,
		animationType: "none",
		animationDuration: 0.6,
		animationDelay: 0,
		blendMode: "normal",
		duration: TIMELINE_CONSTANTS.DEFAULT_TEXT_DURATION,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		...updates,
	};
}

export function updateTextStyleLabAnimationSelection({
	animation,
	animations,
	slot,
}: {
	animation?: JianyingTextAnimationLabSummary;
	animations: JianyingTextAnimationReferences;
	slot: JianyingTextAnimationSlot;
}): JianyingTextAnimationReferences {
	const retained: JianyingTextAnimationReferences = {
		...(slot !== "entrance" && animations.entrance
			? { entrance: animations.entrance }
			: {}),
		...(slot !== "exit" && animations.exit ? { exit: animations.exit } : {}),
		...(slot !== "loop" && animations.loop ? { loop: animations.loop } : {}),
	};
	if (!animation) return retained;
	const reference = {
		source: "jianying-cache" as const,
		resourceId: animation.resourceId,
		packageHash: animation.packageHash,
		duration: animation.duration,
	};
	if (slot === "entrance") return { ...retained, entrance: reference };
	if (slot === "exit") return { ...retained, exit: reference };
	return { ...retained, loop: reference };
}
