import type {
	QCutImportPlanElement,
	QCutImportPlanTextElement,
} from "../jianying-draft/import/qcut-mapping.js";
import type { TimelineElement, TimelineTrack } from "../types/timeline.js";
import type { QCutImportBundleV1 } from "./import-bundle.js";

export function getQCutImportMediaType({
	resourceKind,
}: {
	resourceKind: string;
}): "audio" | "image" | "video" {
	if (resourceKind === "audio") return "audio";
	if (resourceKind === "image") return "image";
	return "video";
}

function requireInternalId({
	bundle,
	semanticId,
}: {
	bundle: QCutImportBundleV1;
	semanticId: string;
}): string {
	const internalId = bundle.internalIdBySemanticId[semanticId];
	if (internalId === undefined) {
		throw new Error(`Import bundle has no internal id for ${semanticId}.`);
	}
	return internalId;
}

function buildTextElement({
	bundle,
	planElement,
}: {
	bundle: QCutImportBundleV1;
	planElement: QCutImportPlanTextElement;
}): TimelineElement {
	return {
		id: requireInternalId({ bundle, semanticId: planElement.id }),
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

function buildMediaElement({
	bundle,
	mediaItemIdByResourceId,
	planElement,
}: {
	bundle: QCutImportBundleV1;
	mediaItemIdByResourceId: ReadonlyMap<string, string>;
	planElement: Exclude<QCutImportPlanElement, QCutImportPlanTextElement>;
}): TimelineElement {
	const mediaId = mediaItemIdByResourceId.get(planElement.resourceId);
	if (mediaId === undefined) {
		throw new Error(`Plan element ${planElement.id} has no staged media item.`);
	}
	return {
		id: requireInternalId({ bundle, semanticId: planElement.id }),
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
		...(planElement.x === undefined ? {} : { x: planElement.x }),
		...(planElement.y === undefined ? {} : { y: planElement.y }),
		...(planElement.keyframes === undefined
			? {}
			: { keyframes: planElement.keyframes }),
	};
}

export function buildQCutImportTimelineTracks({
	bundle,
	mediaItemIdByResourceId,
}: {
	bundle: QCutImportBundleV1;
	mediaItemIdByResourceId: ReadonlyMap<string, string>;
}): TimelineTrack[] {
	return bundle.timelinePlan.tracks.map((planTrack) => ({
		id: requireInternalId({ bundle, semanticId: planTrack.id }),
		name: planTrack.name,
		type: planTrack.type,
		elements: planTrack.elements.map((planElement) =>
			planElement.type === "text"
				? buildTextElement({ bundle, planElement })
				: buildMediaElement({ bundle, mediaItemIdByResourceId, planElement })
		),
		...((planTrack.transitions?.length ?? 0) === 0
			? {}
			: {
					transitions: planTrack.transitions?.map((transition) => ({
						id: requireInternalId({ bundle, semanticId: transition.id }),
						fromElementId: requireInternalId({
							bundle,
							semanticId: transition.fromElementId,
						}),
						toElementId: requireInternalId({
							bundle,
							semanticId: transition.toElementId,
						}),
						presetId: transition.presetId,
						type: transition.type,
						duration: transition.duration,
						easing: transition.easing,
					})),
				}),
		order: planTrack.order,
		...(planTrack.isMain === true ? { isMain: true } : {}),
	}));
}
