import {
	buildSmartPackagingPlan,
	normalizeTrackOrder,
	type BeatDetectionResult,
	type SmartPackagingAction,
	type SmartPackagingOptions,
	type SmartPackagingPlan,
} from "@qcut/editor-core";
import { getTimelineElementDuration } from "@/lib/timeline";
import { TEXT_TEMPLATES } from "@/lib/text/text-template-registry";
import { generateUUID } from "@/lib/utils";
import { useBeatDetectionStore } from "@/stores/beat-detection-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { createTrack } from "@/stores/timeline/utils";
import {
	getTransitionMaxDuration,
	type ClipTransition,
	type MediaElement,
	type StickerElement,
	type TextElement,
	type TimelineElement,
	type TimelineTrack,
	type TrackType,
} from "@/types/timeline";
import {
	ensureSmartPackagingAssets,
	type SmartPackagingAssetIds,
} from "./smart-packaging-assets";

export interface SmartPackagingSources {
	captions: Array<{
		id: string;
		text: string;
		startTime: number;
		duration: number;
	}>;
	beats: Array<{
		timestamp: number;
		strength: number;
		downbeat: boolean;
	}>;
	shots: Array<{
		id: string;
		trackId: string;
		elementId: string;
		startTime: number;
		endTime: number;
	}>;
}

export interface SmartPackagingAppliedCounts {
	text: number;
	stickers: number;
	soundEffects: number;
	zooms: number;
	transitions: number;
}

export interface SmartPackagingTimelineResult {
	tracks: TimelineTrack[];
	appliedCounts: SmartPackagingAppliedCounts;
	createdTrackIds: string[];
}

export interface SmartPackagingEditorResult
	extends SmartPackagingTimelineResult {
	plan: SmartPackagingPlan;
}

interface SmartPackagingCanvasSize {
	width: number;
	height: number;
}

const EMPTY_APPLIED_COUNTS: SmartPackagingAppliedCounts = {
	text: 0,
	stickers: 0,
	soundEffects: 0,
	zooms: 0,
	transitions: 0,
};

const DEFAULT_CANVAS_SIZE: SmartPackagingCanvasSize = {
	width: 1920,
	height: 1080,
};

const TEXT_COLLISION_GAP = 16;
const FALLBACK_TEXT_SIZE = { width: 640, height: 180 };

function effectiveEndTime({
	element,
	fps,
}: {
	element: TimelineElement;
	fps: number;
}): number {
	return element.startTime + getTimelineElementDuration({ element, fps });
}

function rangesOverlap({
	leftStart,
	leftEnd,
	rightStart,
	rightEnd,
}: {
	leftStart: number;
	leftEnd: number;
	rightStart: number;
	rightEnd: number;
}): boolean {
	return leftStart < rightEnd - 0.0001 && rightStart < leftEnd - 0.0001;
}

function canPlaceOnTrack({
	track,
	element,
	fps,
}: {
	track: TimelineTrack;
	element: TimelineElement;
	fps: number;
}): boolean {
	const elementEnd = effectiveEndTime({ element, fps });
	return track.elements.every(
		(candidate) =>
			!rangesOverlap({
				leftStart: candidate.startTime,
				leftEnd: effectiveEndTime({ element: candidate, fps }),
				rightStart: element.startTime,
				rightEnd: elementEnd,
			})
	);
}

function placeOnGeneratedLane({
	lanes,
	trackType,
	trackName,
	element,
	fps,
}: {
	lanes: TimelineTrack[];
	trackType: TrackType;
	trackName: string;
	element: TimelineElement;
	fps: number;
}): void {
	let target = lanes.find((lane) =>
		canPlaceOnTrack({ track: lane, element, fps })
	);
	if (!target) {
		target = {
			...createTrack(trackType),
			name: `${trackName} ${lanes.length + 1}`,
		};
		lanes.push(target);
	}
	target.elements.push(element);
	target.elements.sort((left, right) => left.startTime - right.startTime);
}

function createSmartTextElement({
	action,
	canvasSize,
	occupiedTextElements,
}: {
	action: Extract<SmartPackagingAction, { kind: "text" }>;
	canvasSize: SmartPackagingCanvasSize;
	occupiedTextElements: readonly TextElement[];
}): TextElement {
	const template =
		TEXT_TEMPLATES.find(
			(candidate) => candidate.id === action.textTemplateId
		) ?? TEXT_TEMPLATES[0];
	const characterCount = Array.from(action.content).length;
	const usesCompactLayout = characterCount > 24;
	const templateWidth = template.width ?? FALLBACK_TEXT_SIZE.width;
	const fittedWidth = usesCompactLayout
		? Math.min(
				canvasSize.width * 0.72,
				Math.max(templateWidth, canvasSize.width * 0.58)
			)
		: Math.min(templateWidth, canvasSize.width * 0.72);
	const element: TextElement = {
		...template,
		id: generateUUID(),
		name: `Smart · ${template.name}`,
		content: action.content,
		fontSize: usesCompactLayout
			? Math.min(template.fontSize, 56)
			: template.fontSize,
		curve: usesCompactLayout ? 0 : template.curve,
		width: fittedWidth,
		startTime: action.startTime,
		duration: action.duration,
		trimStart: 0,
		trimEnd: 0,
	};
	return {
		...element,
		y: selectSmartTextY({ element, canvasSize, occupiedTextElements }),
	};
}

function textPlacementCandidates({
	canvasHeight,
	elementHeight,
}: {
	canvasHeight: number;
	elementHeight: number;
}): number[] {
	const safeInset = canvasHeight * 0.08;
	const maximumOffset = Math.max(
		0,
		canvasHeight / 2 - elementHeight / 2 - safeInset
	);
	const thirdOffset = Math.min(maximumOffset, canvasHeight * 0.28);
	const edgeOffset = Math.min(maximumOffset, canvasHeight * 0.4);
	return [...new Set([-thirdOffset, thirdOffset, -edgeOffset, edgeOffset, 0])];
}

function textCollisionArea({
	left,
	right,
}: {
	left: TextElement;
	right: TextElement;
}): number {
	if (
		!rangesOverlap({
			leftStart: left.startTime,
			leftEnd: left.startTime + left.duration,
			rightStart: right.startTime,
			rightEnd: right.startTime + right.duration,
		})
	) {
		return 0;
	}

	const leftHalfWidth =
		(left.width ?? FALLBACK_TEXT_SIZE.width) / 2 + TEXT_COLLISION_GAP;
	const rightHalfWidth =
		(right.width ?? FALLBACK_TEXT_SIZE.width) / 2 + TEXT_COLLISION_GAP;
	const horizontalOverlap = Math.max(
		0,
		Math.min(left.x + leftHalfWidth, right.x + rightHalfWidth) -
			Math.max(left.x - leftHalfWidth, right.x - rightHalfWidth)
	);
	const leftHalfHeight =
		(left.height ?? FALLBACK_TEXT_SIZE.height) / 2 + TEXT_COLLISION_GAP;
	const rightHalfHeight =
		(right.height ?? FALLBACK_TEXT_SIZE.height) / 2 + TEXT_COLLISION_GAP;
	const verticalOverlap = Math.max(
		0,
		Math.min(left.y + leftHalfHeight, right.y + rightHalfHeight) -
			Math.max(left.y - leftHalfHeight, right.y - rightHalfHeight)
	);
	return horizontalOverlap * verticalOverlap;
}

function selectSmartTextY({
	element,
	canvasSize,
	occupiedTextElements,
}: {
	element: TextElement;
	canvasSize: SmartPackagingCanvasSize;
	occupiedTextElements: readonly TextElement[];
}): number {
	const candidates = textPlacementCandidates({
		canvasHeight: canvasSize.height,
		elementHeight: element.height ?? FALLBACK_TEXT_SIZE.height,
	});
	let bestCandidate = candidates[0] ?? 0;
	let bestCollisionArea = Number.POSITIVE_INFINITY;

	for (const candidate of candidates) {
		const positionedElement = { ...element, y: candidate };
		const collisionArea = occupiedTextElements.reduce(
			(total, occupied) =>
				total + textCollisionArea({ left: positionedElement, right: occupied }),
			0
		);
		if (collisionArea === 0) return candidate;
		if (collisionArea < bestCollisionArea) {
			bestCandidate = candidate;
			bestCollisionArea = collisionArea;
		}
	}

	return bestCandidate;
}

function createSmartStickerElement({
	action,
	assetIds,
	index,
}: {
	action: Extract<SmartPackagingAction, { kind: "sticker" }>;
	assetIds: SmartPackagingAssetIds;
	index: number;
}): StickerElement {
	const id = generateUUID();
	const leftSide = index % 2 === 0;
	return {
		id,
		type: "sticker",
		name: "Smart Spark Burst",
		stickerId: `smart-${id}`,
		mediaId: assetIds.stickerMediaId,
		startTime: action.startTime,
		duration: action.duration,
		trimStart: 0,
		trimEnd: 0,
		x: leftSide ? 18 : 82,
		y: index % 3 === 2 ? 74 : 23,
		width: 22,
		height: 22,
		rotation: leftSide ? -8 : 8,
		opacity: 1,
		maintainAspectRatio: true,
	};
}

function createSmartSoundElement({
	action,
	assetIds,
}: {
	action: Extract<SmartPackagingAction, { kind: "sound-effect" }>;
	assetIds: SmartPackagingAssetIds;
}): MediaElement {
	return {
		id: generateUUID(),
		type: "media",
		mediaId: assetIds.soundMediaId,
		name: "Smart Accent Pop",
		startTime: action.startTime,
		duration: action.duration,
		trimStart: 0,
		trimEnd: 0,
		volume: 0.82,
	};
}

function applyZoomActions({
	tracks,
	actions,
	fps,
}: {
	tracks: TimelineTrack[];
	actions: readonly Extract<SmartPackagingAction, { kind: "zoom" }>[];
	fps: number;
}): { tracks: TimelineTrack[]; appliedCount: number } {
	const actionsByElement = new Map(
		actions.map((action) => [action.elementId, action])
	);
	let appliedCount = 0;
	const nextTracks = tracks.map((track) => ({
		...track,
		elements: track.elements.map((element) => {
			const action = actionsByElement.get(element.id);
			if (!action || track.id !== action.trackId || element.type !== "media") {
				return element;
			}
			const lastFrame = Math.max(
				1,
				Math.round(getTimelineElementDuration({ element, fps }) * fps)
			);
			appliedCount++;
			return {
				...element,
				keyframes: {
					...element.keyframes,
					scaleX: [
						{
							id: generateUUID(),
							frame: 0,
							value: action.fromScale,
							easing: "easeInOut" as const,
						},
						{
							id: generateUUID(),
							frame: lastFrame,
							value: action.toScale,
							easing: "easeInOut" as const,
						},
					],
					scaleY: [
						{
							id: generateUUID(),
							frame: 0,
							value: action.fromScale,
							easing: "easeInOut" as const,
						},
						{
							id: generateUUID(),
							frame: lastFrame,
							value: action.toScale,
							easing: "easeInOut" as const,
						},
					],
				},
			};
		}),
	}));
	return { tracks: nextTracks, appliedCount };
}

function transitionFromAction({
	action,
	id,
	duration,
}: {
	action: Extract<SmartPackagingAction, { kind: "transition" }>;
	id: string;
	duration: number;
}): ClipTransition {
	const isWhipPan = action.presetId === "whip-pan-right";
	return {
		id,
		fromElementId: action.fromElementId,
		toElementId: action.toElementId,
		presetId: action.presetId,
		type: isWhipPan ? "whip-pan" : "dissolve",
		duration,
		direction: isWhipPan ? "right" : undefined,
		easing: "easeInOut",
	};
}

function applyTransitionActions({
	tracks,
	actions,
	fps,
}: {
	tracks: TimelineTrack[];
	actions: readonly Extract<SmartPackagingAction, { kind: "transition" }>[];
	fps: number;
}): { tracks: TimelineTrack[]; appliedCount: number } {
	let appliedCount = 0;
	const actionsByTrack = new Map<string, typeof actions>();
	for (const action of actions) {
		const trackActions = actionsByTrack.get(action.trackId) ?? [];
		actionsByTrack.set(action.trackId, [...trackActions, action]);
	}

	const nextTracks = tracks.map((track) => {
		const trackActions = actionsByTrack.get(track.id);
		if (!trackActions || track.type !== "media") return track;
		let transitions = [...(track.transitions ?? [])];
		for (const action of trackActions) {
			const existing = transitions.find(
				(candidate) =>
					candidate.fromElementId === action.fromElementId &&
					candidate.toElementId === action.toElementId
			);
			const transitionId = existing?.id ?? generateUUID();
			const withoutExisting = transitions.filter(
				(candidate) => candidate.id !== transitionId
			);
			const maxDuration = getTransitionMaxDuration({
				track: { ...track, transitions: withoutExisting },
				fromElementId: action.fromElementId,
				toElementId: action.toElementId,
				transitions: withoutExisting,
				getElementDuration: ({ element }) =>
					getTimelineElementDuration({ element, fps }),
			});
			const duration = Math.min(action.duration, maxDuration);
			if (duration <= 0) continue;
			transitions = [
				...withoutExisting,
				transitionFromAction({ action, id: transitionId, duration }),
			];
			appliedCount++;
		}
		return { ...track, transitions };
	});
	return { tracks: nextTracks, appliedCount };
}

export function collectSmartPackagingSources({
	tracks,
	beatCache,
	fps = 30,
}: {
	tracks: readonly TimelineTrack[];
	beatCache: ReadonlyMap<string, BeatDetectionResult>;
	fps?: number;
}): SmartPackagingSources {
	const captions: SmartPackagingSources["captions"] = [];
	const beats: SmartPackagingSources["beats"] = [];
	const shots: SmartPackagingSources["shots"] = [];

	for (const track of tracks) {
		for (const element of track.elements) {
			const duration = getTimelineElementDuration({ element, fps });
			if (element.type === "captions") {
				captions.push({
					id: element.id,
					text: element.text,
					startTime: element.startTime,
					duration,
				});
			}
			if (track.type === "media" && element.type === "media") {
				shots.push({
					id: element.id,
					trackId: track.id,
					elementId: element.id,
					startTime: element.startTime,
					endTime: element.startTime + duration,
				});
			}
			if (element.type !== "media") continue;
			const result = beatCache.get(element.id);
			if (!result) continue;
			const sourceStart = element.trimStart;
			const sourceEnd = sourceStart + duration;
			for (const beat of result.beats) {
				if (beat.timestamp < sourceStart || beat.timestamp > sourceEnd)
					continue;
				beats.push({
					timestamp: element.startTime + beat.timestamp - sourceStart,
					strength: beat.strength,
					downbeat: beat.isDownbeat,
				});
			}
		}
	}

	return {
		captions: captions.sort((left, right) => left.startTime - right.startTime),
		beats: beats.sort((left, right) => left.timestamp - right.timestamp),
		shots: shots.sort((left, right) => left.startTime - right.startTime),
	};
}

export function previewSmartPackagingPlan({
	tracks,
	beatCache,
	options,
	fps = 30,
}: {
	tracks: readonly TimelineTrack[];
	beatCache: ReadonlyMap<string, BeatDetectionResult>;
	options?: Partial<SmartPackagingOptions>;
	fps?: number;
}): SmartPackagingPlan {
	const sources = collectSmartPackagingSources({ tracks, beatCache, fps });
	return buildSmartPackagingPlan({ ...sources, options });
}

export function buildSmartPackagedTimeline({
	tracks,
	plan,
	assetIds,
	fps = 30,
	canvasSize = DEFAULT_CANVAS_SIZE,
}: {
	tracks: readonly TimelineTrack[];
	plan: SmartPackagingPlan;
	assetIds: SmartPackagingAssetIds;
	fps?: number;
	canvasSize?: SmartPackagingCanvasSize;
}): SmartPackagingTimelineResult {
	const appliedCounts = { ...EMPTY_APPLIED_COUNTS };
	const textLanes: TimelineTrack[] = [];
	const stickerLanes: TimelineTrack[] = [];
	const soundLanes: TimelineTrack[] = [];
	const occupiedTextElements = tracks.flatMap((track) =>
		track.elements.filter(
			(element): element is TextElement =>
				element.type === "text" && !element.hidden
		)
	);
	const zoomActions = plan.actions.filter(
		(action): action is Extract<SmartPackagingAction, { kind: "zoom" }> =>
			action.kind === "zoom"
	);
	const transitionActions = plan.actions.filter(
		(action): action is Extract<SmartPackagingAction, { kind: "transition" }> =>
			action.kind === "transition"
	);

	for (const action of plan.actions) {
		if (action.kind === "text") {
			const element = createSmartTextElement({
				action,
				canvasSize,
				occupiedTextElements,
			});
			placeOnGeneratedLane({
				lanes: textLanes,
				trackType: "text",
				trackName: "Smart Text",
				element,
				fps,
			});
			occupiedTextElements.push(element);
			appliedCounts.text++;
		}
		if (action.kind === "sticker") {
			placeOnGeneratedLane({
				lanes: stickerLanes,
				trackType: "sticker",
				trackName: "Smart Stickers",
				element: createSmartStickerElement({
					action,
					assetIds,
					index: appliedCounts.stickers,
				}),
				fps,
			});
			appliedCounts.stickers++;
		}
		if (action.kind === "sound-effect") {
			placeOnGeneratedLane({
				lanes: soundLanes,
				trackType: "audio",
				trackName: "Smart SFX",
				element: createSmartSoundElement({ action, assetIds }),
				fps,
			});
			appliedCounts.soundEffects++;
		}
	}

	const zoomed = applyZoomActions({
		tracks: tracks.map((track) => ({
			...track,
			elements: [...track.elements],
			transitions: track.transitions ? [...track.transitions] : undefined,
		})),
		actions: zoomActions,
		fps,
	});
	appliedCounts.zooms = zoomed.appliedCount;
	const transitioned = applyTransitionActions({
		tracks: zoomed.tracks,
		actions: transitionActions,
		fps,
	});
	appliedCounts.transitions = transitioned.appliedCount;

	const createdTracks = [...textLanes, ...stickerLanes, ...soundLanes];
	const orderedTracks = normalizeTrackOrder({
		tracks: [
			...textLanes,
			...stickerLanes,
			...transitioned.tracks,
			...soundLanes,
		].map((track, order) => ({ ...track, order })),
	});
	return {
		tracks: orderedTracks,
		appliedCounts,
		createdTrackIds: createdTracks.map((track) => track.id),
	};
}

export async function applySmartPackagingToEditor({
	options,
}: {
	options?: Partial<SmartPackagingOptions>;
}): Promise<SmartPackagingEditorResult> {
	const activeProject = useProjectStore.getState().activeProject;
	if (!activeProject)
		throw new Error("Open a project before applying Smart Pack");
	const fps = activeProject.fps ?? 30;
	const timeline = useTimelineStore.getState();
	const plan = previewSmartPackagingPlan({
		tracks: timeline.tracks,
		beatCache: useBeatDetectionStore.getState().cache,
		options,
		fps,
	});
	if (plan.actions.length === 0) {
		throw new Error("No captions, beats, or shots are available to package");
	}

	const assetIds = await ensureSmartPackagingAssets({
		projectId: activeProject.id,
	});
	const result = buildSmartPackagedTimeline({
		tracks: useTimelineStore.getState().tracks,
		plan,
		assetIds,
		fps,
		canvasSize: activeProject.canvasSize,
	});
	const latestTimeline = useTimelineStore.getState();
	latestTimeline.pushHistory();
	latestTimeline.restoreTracks(result.tracks);
	await latestTimeline.saveImmediate();
	return { ...result, plan };
}
