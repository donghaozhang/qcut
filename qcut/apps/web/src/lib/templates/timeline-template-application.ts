import {
	migrateTemplateSlotValues,
	normalizeTrackOrder,
	resolveTemplateFontDependencies,
	resolveTimelineTemplateVariant,
	validateTemplateSlotValues,
	validateTimelineTemplate,
	type TemplateAspectRatio,
	type TimelineTemplate,
	type TimelineTemplatePlacement,
	type TimelineTemplateSlotValue,
	type TimelineTemplateSlotValues,
} from "@qcut/editor-core";
import { FONT_OPTIONS } from "@/constants/font-constants";
import { generateUUID } from "@/lib/utils";
import { BUILT_IN_TEXT_PRESETS } from "@/lib/text/text-presets";
import { useEditorStore } from "@/stores/editor/editor-store";
import { useProjectStore } from "@/stores/project-store";
import type { MediaItem } from "@/stores/media/media-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { createTrack } from "@/stores/timeline/utils";
import type {
	CreateMediaElement,
	CreateTextElement,
	TimelineElement,
	TimelineTrack,
} from "@/types/timeline";

type TemplateMediaItem = Pick<MediaItem, "id" | "name" | "type" | "duration">;

export interface AppliedTimelineTemplate {
	instanceId: string;
	templateId: string;
	templateVersion: string;
	aspectRatio: TemplateAspectRatio;
	canvas: { width: number; height: number };
	elementIds: string[];
	tracks: TimelineTrack[];
}

function createTextElement({
	template,
	placement,
	value,
	instanceId,
	aspectRatio,
	instanceStartTime,
	fontFamilies,
}: {
	template: TimelineTemplate;
	placement: Extract<TimelineTemplatePlacement, { kind: "text" }>;
	value: Extract<TimelineTemplateSlotValue, { kind: "text" }>;
	instanceId: string;
	aspectRatio: TemplateAspectRatio;
	instanceStartTime: number;
	fontFamilies: Record<string, string>;
}): CreateTextElement {
	const slot = template.slots.find(
		(candidate) => candidate.id === placement.slotId
	);
	const preset = BUILT_IN_TEXT_PRESETS.find(
		(candidate) => candidate.id === placement.stylePresetId
	);
	const presetUpdates = preset?.updates ?? {};
	const requestedFont =
		placement.fontFamily ?? presetUpdates.fontFamily ?? "Arial";
	return {
		type: "text",
		name: slot?.label ?? placement.slotId,
		content: value.text,
		duration: placement.duration,
		startTime: instanceStartTime + placement.startTime,
		trimStart: 0,
		trimEnd: 0,
		fontSize: placement.fontSize ?? presetUpdates.fontSize ?? 56,
		fontFamily: fontFamilies[requestedFont] ?? requestedFont,
		color: presetUpdates.color ?? "#ffffff",
		backgroundColor: presetUpdates.backgroundColor ?? "transparent",
		textAlign: "center",
		fontWeight: presetUpdates.fontWeight ?? "normal",
		fontStyle: presetUpdates.fontStyle ?? "normal",
		textDecoration: presetUpdates.textDecoration ?? "none",
		x: placement.x,
		y: placement.y,
		width: placement.width,
		height: placement.height,
		rotation: 0,
		opacity: 1,
		letterSpacing: presetUpdates.letterSpacing ?? 0,
		lineHeight: presetUpdates.lineHeight ?? 1.2,
		verticalAlign: "middle",
		strokeColor: presetUpdates.strokeColor ?? "#000000",
		strokeWidth: presetUpdates.strokeWidth ?? 0,
		strokeOpacity: presetUpdates.strokeOpacity ?? 1,
		backgroundOpacity: presetUpdates.backgroundOpacity ?? 0,
		backgroundRadius: presetUpdates.backgroundRadius ?? 4,
		backgroundPadding: presetUpdates.backgroundPadding ?? 12,
		shadowColor: presetUpdates.shadowColor ?? "#000000",
		shadowOpacity: presetUpdates.shadowOpacity ?? 0,
		shadowOffsetX: presetUpdates.shadowOffsetX ?? 4,
		shadowOffsetY: presetUpdates.shadowOffsetY ?? 4,
		shadowBlur: presetUpdates.shadowBlur ?? 8,
		glowColor: presetUpdates.glowColor ?? "#ffffff",
		glowOpacity: presetUpdates.glowOpacity ?? 0,
		glowBlur: presetUpdates.glowBlur ?? 12,
		curve: presetUpdates.curve ?? 0,
		animationType: placement.animationType ?? "none",
		animationDuration: 0.5,
		animationDelay: 0,
		blendMode: presetUpdates.blendMode ?? "normal",
		templateBinding: {
			instanceId,
			templateId: template.id,
			templateVersion: template.version,
			slotId: placement.slotId,
			aspectRatio,
			instanceStartTime,
		},
	};
}

function createMediaElement({
	template,
	placement,
	media,
	instanceId,
	aspectRatio,
	instanceStartTime,
}: {
	template: TimelineTemplate;
	placement: Extract<TimelineTemplatePlacement, { kind: "media" }>;
	media: TemplateMediaItem;
	instanceId: string;
	aspectRatio: TemplateAspectRatio;
	instanceStartTime: number;
}): CreateMediaElement {
	return {
		type: "media",
		mediaId: media.id,
		name: media.name,
		duration: placement.duration,
		startTime: instanceStartTime + placement.startTime,
		trimStart: 0,
		trimEnd: 0,
		x: placement.x,
		y: placement.y,
		width: placement.width,
		height: placement.height,
		scaleX: placement.scaleX,
		scaleY: placement.scaleY,
		fitMode: placement.fitMode ?? "cover",
		animationInType: placement.animationInType ?? "none",
		animationInDuration: placement.animationInDuration ?? 0,
		templateBinding: {
			instanceId,
			templateId: template.id,
			templateVersion: template.version,
			slotId: placement.slotId,
			aspectRatio,
			instanceStartTime,
		},
	};
}

function requiredMediaErrors({
	template,
	values,
	mediaItems,
}: {
	template: TimelineTemplate;
	values: TimelineTemplateSlotValues;
	mediaItems: readonly TemplateMediaItem[];
}): string[] {
	const mediaById = new Map(mediaItems.map((item) => [item.id, item]));
	const errors: string[] = [];
	for (const slot of template.slots) {
		if (slot.kind !== "media") continue;
		const value = values[slot.id];
		if (!value || value.kind !== "media") continue;
		const media = mediaById.get(value.mediaId);
		if (!media) {
			errors.push(`${slot.label} media is unavailable`);
			continue;
		}
		if (!slot.acceptedTypes.includes(media.type)) {
			errors.push(`${slot.label} does not accept ${media.type}`);
		}
	}
	return errors;
}

function withTrackOrder({
	tracks,
}: {
	tracks: TimelineTrack[];
}): TimelineTrack[] {
	return normalizeTrackOrder({
		tracks: tracks.map((track, order) => ({ ...track, order })),
	});
}

export function buildAppliedTemplateTimeline({
	tracks,
	template,
	values,
	mediaItems,
	aspectRatio = template.defaultAspectRatio,
	instanceStartTime = 0,
	instanceId = `template-${generateUUID()}`,
}: {
	tracks: readonly TimelineTrack[];
	template: TimelineTemplate;
	values: TimelineTemplateSlotValues;
	mediaItems: readonly TemplateMediaItem[];
	aspectRatio?: TemplateAspectRatio;
	instanceStartTime?: number;
	instanceId?: string;
}): AppliedTimelineTemplate {
	const templateValidation = validateTimelineTemplate({ template });
	const slotErrors = validateTemplateSlotValues({ template, values });
	const mediaErrors = requiredMediaErrors({ template, values, mediaItems });
	const errors = [
		...templateValidation.issues.map((issue) => issue.message),
		...slotErrors,
		...mediaErrors,
	];
	if (errors.length > 0) throw new Error(errors.join(". "));

	const variant = resolveTimelineTemplateVariant({ template, aspectRatio });
	const { resolvedFamilies } = resolveTemplateFontDependencies({
		template,
		availableFonts: FONT_OPTIONS.map((font) => font.value),
	});
	const mediaById = new Map(mediaItems.map((item) => [item.id, item]));
	const createdTracks = new Map<string, TimelineTrack>();
	const elementIds: string[] = [];

	for (const placement of variant.placements) {
		const value = values[placement.slotId];
		if (!value || value.kind !== placement.kind) continue;
		const trackType = placement.kind === "media" ? "media" : "text";
		const trackName = placement.trackName ?? `${template.name} ${trackType}`;
		const trackKey = `${trackType}:${trackName}`;
		let track = createdTracks.get(trackKey);
		if (!track) {
			track = { ...createTrack(trackType), name: trackName };
			createdTracks.set(trackKey, track);
		}

		const id = generateUUID();
		const element =
			placement.kind === "media" && value.kind === "media"
				? createMediaElement({
						template,
						placement,
						media: mediaById.get(value.mediaId)!,
						instanceId,
						aspectRatio,
						instanceStartTime,
					})
				: createTextElement({
						template,
						placement: placement as Extract<
							TimelineTemplatePlacement,
							{ kind: "text" }
						>,
						value: value as Extract<
							TimelineTemplateSlotValue,
							{ kind: "text" }
						>,
						instanceId,
						aspectRatio,
						instanceStartTime,
						fontFamilies: resolvedFamilies,
					});
		track.elements.push({ ...element, id } as TimelineElement);
		elementIds.push(id);
	}

	const overlayTracks = [...createdTracks.values()].filter(
		(track) => track.type !== "media"
	);
	const mediaTracks = [...createdTracks.values()].filter(
		(track) => track.type === "media"
	);
	return {
		instanceId,
		templateId: template.id,
		templateVersion: template.version,
		aspectRatio,
		canvas: variant.canvas,
		elementIds,
		tracks: withTrackOrder({
			tracks: [...overlayTracks, ...mediaTracks, ...tracks],
		}),
	};
}

export function replaceTemplateSlotInTracks({
	tracks,
	template,
	instanceId,
	slotId,
	value,
	mediaItems,
}: {
	tracks: readonly TimelineTrack[];
	template: TimelineTemplate;
	instanceId: string;
	slotId: string;
	value: TimelineTemplateSlotValue;
	mediaItems: readonly TemplateMediaItem[];
}): { tracks: TimelineTrack[]; replacedCount: number } {
	const slot = template.slots.find((candidate) => candidate.id === slotId);
	if (!slot) throw new Error(`Unknown template slot: ${slotId}`);
	if (slot.kind !== value.kind)
		throw new Error(`${slot.label} has the wrong value type`);
	const media =
		value.kind === "media"
			? mediaItems.find((candidate) => candidate.id === value.mediaId)
			: undefined;
	if (value.kind === "media") {
		if (!media) throw new Error(`${slot.label} media is unavailable`);
		if (slot.kind === "media" && !slot.acceptedTypes.includes(media.type)) {
			throw new Error(`${slot.label} does not accept ${media.type}`);
		}
	}

	let replacedCount = 0;
	const nextTracks = tracks.map((track) => ({
		...track,
		elements: track.elements.map((element) => {
			const binding = element.templateBinding;
			if (binding?.instanceId !== instanceId || binding.slotId !== slotId) {
				return element;
			}
			replacedCount++;
			const templateBinding = {
				...binding,
				templateVersion: template.version,
			};
			if (element.type === "media" && value.kind === "media" && media) {
				return {
					...element,
					mediaId: media.id,
					name: media.name,
					templateBinding,
				};
			}
			if (element.type === "text" && value.kind === "text") {
				return { ...element, content: value.text, templateBinding };
			}
			return element;
		}),
	}));
	if (replacedCount === 0)
		throw new Error(`Template slot ${slotId} is not on the timeline`);
	return { tracks: nextTracks, replacedCount };
}

function placementForElement({
	template,
	aspectRatio,
	element,
}: {
	template: TimelineTemplate;
	aspectRatio: TemplateAspectRatio;
	element: TimelineElement;
}): TimelineTemplatePlacement | undefined {
	const binding = element.templateBinding;
	if (!binding) return undefined;
	return resolveTimelineTemplateVariant({
		template,
		aspectRatio,
	}).placements.find(
		(placement) =>
			placement.slotId === binding.slotId && placement.kind === element.type
	);
}

export function reflowTemplateInstanceInTracks({
	tracks,
	template,
	instanceId,
	aspectRatio,
}: {
	tracks: readonly TimelineTrack[];
	template: TimelineTemplate;
	instanceId: string;
	aspectRatio: TemplateAspectRatio;
}): {
	tracks: TimelineTrack[];
	updatedCount: number;
	canvas: { width: number; height: number };
} {
	const variant = resolveTimelineTemplateVariant({ template, aspectRatio });
	let updatedCount = 0;
	const nextTracks = tracks.map((track) => ({
		...track,
		elements: track.elements.map((element) => {
			const binding = element.templateBinding;
			if (binding?.instanceId !== instanceId) return element;
			const placement = placementForElement({ template, aspectRatio, element });
			if (!placement) return element;
			updatedCount++;
			const instanceStartTime =
				binding.instanceStartTime ?? element.startTime - placement.startTime;
			const shared = {
				...element,
				startTime: instanceStartTime + placement.startTime,
				duration: placement.duration,
				templateBinding: {
					...binding,
					templateVersion: template.version,
					aspectRatio,
					instanceStartTime,
				},
			};
			if (shared.type === "media" && placement.kind === "media") {
				return {
					...shared,
					x: placement.x,
					y: placement.y,
					width: placement.width,
					height: placement.height,
					scaleX: placement.scaleX,
					scaleY: placement.scaleY,
					fitMode: placement.fitMode ?? "cover",
				};
			}
			if (shared.type === "text" && placement.kind === "text") {
				return {
					...shared,
					x: placement.x,
					y: placement.y,
					width: placement.width,
					height: placement.height,
					fontSize: placement.fontSize ?? shared.fontSize,
					animationType: placement.animationType ?? "none",
				};
			}
			return shared;
		}),
	}));
	if (updatedCount === 0)
		throw new Error("Template instance is not on the timeline");
	return { tracks: nextTracks, updatedCount, canvas: variant.canvas };
}

export function migrateTemplateInstanceInTracks({
	tracks,
	template,
	instanceId,
}: {
	tracks: readonly TimelineTrack[];
	template: TimelineTemplate;
	instanceId: string;
}): { tracks: TimelineTrack[]; migratedCount: number } {
	let migratedCount = 0;
	const nextTracks = tracks.map((track) => ({
		...track,
		elements: track.elements.map((element) => {
			const binding = element.templateBinding;
			if (
				binding?.instanceId !== instanceId ||
				binding.templateVersion === template.version
			) {
				return element;
			}
			const placeholder: TimelineTemplateSlotValue =
				element.type === "media"
					? { kind: "media", mediaId: element.mediaId }
					: {
							kind: "text",
							text: element.type === "text" ? element.content : "",
						};
			const migrated = migrateTemplateSlotValues({
				template,
				fromVersion: binding.templateVersion,
				values: { [binding.slotId]: placeholder },
			});
			const [slotId] = Object.keys(migrated);
			migratedCount++;
			return {
				...element,
				templateBinding: {
					...binding,
					templateVersion: template.version,
					slotId,
				},
			};
		}),
	}));
	return { tracks: nextTracks, migratedCount };
}

async function commitTemplateTracks({
	tracks,
	canvas,
}: {
	tracks: TimelineTrack[];
	canvas?: { width: number; height: number };
}): Promise<void> {
	const timeline = useTimelineStore.getState();
	timeline.pushHistory();
	timeline.restoreTracks(tracks);
	if (canvas) {
		useEditorStore.getState().setCanvasSize(canvas, "custom");
		await useProjectStore.getState().updateProjectCanvasSize(canvas, "custom");
	}
	await timeline.saveImmediate();
}

export async function applyTimelineTemplateToEditor({
	template,
	values,
	mediaItems,
	aspectRatio,
	instanceStartTime,
}: {
	template: TimelineTemplate;
	values: TimelineTemplateSlotValues;
	mediaItems: readonly TemplateMediaItem[];
	aspectRatio: TemplateAspectRatio;
	instanceStartTime: number;
}): Promise<AppliedTimelineTemplate> {
	const result = buildAppliedTemplateTimeline({
		tracks: useTimelineStore.getState().tracks,
		template,
		values,
		mediaItems,
		aspectRatio,
		instanceStartTime,
	});
	await commitTemplateTracks({ tracks: result.tracks, canvas: result.canvas });
	return result;
}

export async function replaceTimelineTemplateSlot({
	template,
	instanceId,
	slotId,
	value,
	mediaItems,
}: {
	template: TimelineTemplate;
	instanceId: string;
	slotId: string;
	value: TimelineTemplateSlotValue;
	mediaItems: readonly TemplateMediaItem[];
}): Promise<number> {
	const result = replaceTemplateSlotInTracks({
		tracks: useTimelineStore.getState().tracks,
		template,
		instanceId,
		slotId,
		value,
		mediaItems,
	});
	await commitTemplateTracks({ tracks: result.tracks });
	return result.replacedCount;
}

export async function reflowTimelineTemplateInstance({
	template,
	instanceId,
	aspectRatio,
}: {
	template: TimelineTemplate;
	instanceId: string;
	aspectRatio: TemplateAspectRatio;
}): Promise<number> {
	const result = reflowTemplateInstanceInTracks({
		tracks: useTimelineStore.getState().tracks,
		template,
		instanceId,
		aspectRatio,
	});
	await commitTemplateTracks({ tracks: result.tracks, canvas: result.canvas });
	return result.updatedCount;
}

export async function migrateTimelineTemplateInstance({
	template,
	instanceId,
}: {
	template: TimelineTemplate;
	instanceId: string;
}): Promise<number> {
	const result = migrateTemplateInstanceInTracks({
		tracks: useTimelineStore.getState().tracks,
		template,
		instanceId,
	});
	if (result.migratedCount > 0) {
		await commitTemplateTracks({ tracks: result.tracks });
	}
	return result.migratedCount;
}
