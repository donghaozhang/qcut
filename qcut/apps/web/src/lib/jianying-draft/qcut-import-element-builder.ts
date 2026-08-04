import type { QCutImportPlanElement } from "@qcut/editor-core/jianying-draft";
import type { TimelineElement } from "@/types/timeline";

function buildTextElement({
	internalId,
	planElement,
}: {
	internalId: string;
	planElement: Extract<QCutImportPlanElement, { type: "text" }>;
}): TimelineElement {
	return {
		id: internalId,
		type: "text",
		name: planElement.name,
		duration: planElement.duration,
		startTime: planElement.startTime,
		trimStart: planElement.trimStart,
		trimEnd: planElement.trimEnd,
		content: planElement.content,
		fontSize: planElement.fontSize,
		fontFamily: planElement.fontFamily,
		color: planElement.color,
		backgroundColor: planElement.backgroundColor,
		textAlign: planElement.textAlign,
		fontWeight: planElement.fontWeight,
		fontStyle: planElement.fontStyle,
		textDecoration: planElement.textDecoration,
		x: planElement.x,
		y: planElement.y,
		rotation: planElement.rotation,
		opacity: planElement.opacity,
		...(planElement.letterSpacing === undefined
			? {}
			: { letterSpacing: planElement.letterSpacing }),
		...(planElement.width === undefined ? {} : { width: planElement.width }),
		...(planElement.strokeColor === undefined
			? {}
			: { strokeColor: planElement.strokeColor }),
		...(planElement.strokeWidth === undefined
			? {}
			: { strokeWidth: planElement.strokeWidth }),
		...(planElement.strokeOpacity === undefined
			? {}
			: { strokeOpacity: planElement.strokeOpacity }),
		...(planElement.backgroundOpacity === undefined
			? {}
			: { backgroundOpacity: planElement.backgroundOpacity }),
		...(planElement.backgroundRadius === undefined
			? {}
			: { backgroundRadius: planElement.backgroundRadius }),
		...(planElement.backgroundPadding === undefined
			? {}
			: { backgroundPadding: planElement.backgroundPadding }),
		...(planElement.shadowColor === undefined
			? {}
			: { shadowColor: planElement.shadowColor }),
		...(planElement.shadowOpacity === undefined
			? {}
			: { shadowOpacity: planElement.shadowOpacity }),
		...(planElement.shadowOffsetX === undefined
			? {}
			: { shadowOffsetX: planElement.shadowOffsetX }),
		...(planElement.shadowOffsetY === undefined
			? {}
			: { shadowOffsetY: planElement.shadowOffsetY }),
		...(planElement.shadowBlur === undefined
			? {}
			: { shadowBlur: planElement.shadowBlur }),
	};
}

export function buildQCutImportTimelineElement({
	planElement,
	internalIdBySemanticId,
	mediaItemIdByResourceId,
}: {
	planElement: QCutImportPlanElement;
	internalIdBySemanticId: Readonly<Record<string, string>>;
	mediaItemIdByResourceId: ReadonlyMap<string, string>;
}): TimelineElement {
	const internalId = internalIdBySemanticId[planElement.id];
	if (planElement.type === "text") {
		return buildTextElement({ internalId, planElement });
	}
	const mediaId = mediaItemIdByResourceId.get(planElement.resourceId);
	if (mediaId === undefined) {
		throw new Error(`plan element ${planElement.id} has no staged media item`);
	}
	return {
		id: internalId,
		type: "media",
		mediaId,
		name: planElement.name,
		duration: planElement.duration,
		startTime: planElement.startTime,
		trimStart: planElement.trimStart,
		trimEnd: planElement.trimEnd,
		...(planElement.speed === undefined
			? {}
			: { playbackRate: planElement.speed }),
	};
}
