import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { clampMarkdownDuration } from "@/lib/markdown";
import { fitTextElementBoxToContent } from "@/lib/text/text-box-sizing";
import { getValidTextGroupElements } from "@/lib/timeline/text-group-drag-data";
import { generateUUID } from "@/lib/utils";
import type {
	CreateTextElement,
	DragData,
	MarkdownElement,
	TextElement,
} from "@/types/timeline";
import { toast } from "sonner";
import type { MediaItem } from "../media/media-store";
import { INITIAL_DRAG_STATE } from "./types";
import type { DragState, TimelineStore } from "./types";
import { createTrack } from "./utils";
import type {
	OperationDeps,
	StoreGet,
	StoreSet,
} from "./timeline-store-operations";

export function createAddOps(
	get: StoreGet,
	set: StoreSet,
	deps: OperationDeps
) {
	const { autoSaveTimeline, updateTracks } = deps;

	return {
		dragState: INITIAL_DRAG_STATE,

		setDragState: (dragState: Partial<DragState>) =>
			set((state: TimelineStore) => ({
				dragState: { ...state.dragState, ...dragState },
			})),

		startDrag: (
			elementId: string,
			trackId: string,
			startMouseX: number,
			startElementTime: number,
			clickOffsetTime: number
		) => {
			set({
				dragState: {
					isDragging: true,
					elementId,
					trackId,
					startMouseX,
					startElementTime,
					clickOffsetTime,
					currentTime: startElementTime,
				},
			});
		},

		updateDragTime: (currentTime: number) => {
			set((state: TimelineStore) => ({
				dragState: {
					...state.dragState,
					currentTime,
				},
			}));
		},

		endDrag: () => {
			set({ dragState: INITIAL_DRAG_STATE });
		},

		// -----------------------------------------------------------------------
		// Add-at-time operations
		// -----------------------------------------------------------------------

		addMediaAtTime: (item: MediaItem, currentTime = 0): boolean => {
			const trackType = item.type === "audio" ? "audio" : "media";
			const duration =
				item.duration || TIMELINE_CONSTANTS.DEFAULT_IMAGE_DURATION;

			// Never reject a drop as "overlapping": place on the first same-type
			// track with room at this time, or stack a new track when every lane
			// is occupied — the behavior users know from professional editors.
			const freeTrack = get()._tracks.find(
				(track) =>
					track.type === trackType &&
					!track.locked &&
					!get().checkElementOverlap(track.id, currentTime, duration)
			);
			let targetTrackId: string;
			if (freeTrack) {
				targetTrackId = freeTrack.id;
			} else if (trackType === "audio") {
				// Audio lanes stack downward at the bottom of the timeline.
				targetTrackId = get().addTrack("audio");
			} else {
				// Keep media lanes grouped above the audio lanes: insert right
				// after the last existing media track.
				let lastMediaIndex = -1;
				for (const [index, track] of get()._tracks.entries()) {
					if (track.type === "media") lastMediaIndex = index;
				}
				targetTrackId = get().insertTrackAt("media", lastMediaIndex + 1);
			}

			get().addElementToTrack(targetTrackId, {
				type: "media",
				mediaId: item.id,
				name: item.name,
				duration,
				startTime: currentTime,
				trimStart: 0,
				trimEnd: 0,
			});
			return true;
		},

		// Accepts a partial element (e.g. DragData.textTemplate): every field is
		// defaulted below, so callers never need to fabricate a full TextElement.
		addTextAtTime: (item: Partial<TextElement>, currentTime = 0): boolean => {
			const targetTrackId = get().insertTrackAt("text", 0); // Always create new text track at the top

			const textElement: CreateTextElement = {
				type: "text",
				name: item.name || "Text",
				content: item.content || "Default Text",
				duration: item.duration || TIMELINE_CONSTANTS.DEFAULT_TEXT_DURATION,
				startTime: currentTime,
				trimStart: 0,
				trimEnd: 0,
				fontSize: item.fontSize || 48,
				fontFamily: item.fontFamily || "Arial",
				color: item.color || "#ffffff",
				backgroundColor: item.backgroundColor || "transparent",
				textAlign: item.textAlign || "center",
				fontWeight: item.fontWeight || "normal",
				fontStyle: item.fontStyle || "normal",
				textDecoration: item.textDecoration || "none",
				x: item.x || 0,
				y: item.y || 0,
				rotation: item.rotation || 0,
				opacity: item.opacity !== undefined ? item.opacity : 1,
				width: item.width ?? 640,
				height: item.height ?? 180,
				letterSpacing: item.letterSpacing ?? 0,
				lineHeight: item.lineHeight ?? 1.2,
				verticalAlign: item.verticalAlign ?? "middle",
				strokeColor: item.strokeColor ?? "#000000",
				strokeWidth: item.strokeWidth ?? 0,
				strokeOpacity: item.strokeOpacity ?? 1,
				backgroundOpacity:
					item.backgroundOpacity ??
					(item.backgroundColor === "transparent" ? 0 : 1),
				backgroundRadius: item.backgroundRadius ?? 4,
				backgroundPadding: item.backgroundPadding ?? 12,
				shadowColor: item.shadowColor ?? "#000000",
				shadowOpacity: item.shadowOpacity ?? 0,
				shadowOffsetX: item.shadowOffsetX ?? 4,
				shadowOffsetY: item.shadowOffsetY ?? 4,
				shadowBlur: item.shadowBlur ?? 8,
				glowColor: item.glowColor ?? "#ffffff",
				glowOpacity: item.glowOpacity ?? 0,
				glowBlur: item.glowBlur ?? 12,
				curve: item.curve ?? 0,
				animationType: item.animationType ?? "none",
				animationDuration: item.animationDuration ?? 0.6,
				animationDelay: item.animationDelay ?? 0,
				textAnimations: item.textAnimations,
				keyframes: item.keyframes,
				blendMode: item.blendMode ?? "normal",
			};
			get().addElementToTrack(
				targetTrackId,
				fitTextElementBoxToContent({ element: textElement })
			);
			return true;
		},

		addTextGroupAtTime: ({
			elements,
			currentTime = 0,
			groupId = generateUUID(),
		}: {
			elements: CreateTextElement[];
			currentTime?: number;
			groupId?: string;
		}): boolean => {
			const validElements = getValidTextGroupElements({ value: elements });
			if (validElements.length === 0) return false;

			const newTracks = validElements.map((element) => {
				const track = createTrack("text");
				const textElement: TextElement = {
					...element,
					id: generateUUID(),
					startTime: currentTime,
					trimStart: 0,
					trimEnd: 0,
					groupId,
				};
				return { ...track, elements: [textElement] };
			});

			get().pushHistory();
			updateTracks([...newTracks, ...get()._tracks]);
			get().setSelectedElements(
				newTracks.map((track) => ({
					trackId: track.id,
					elementId: track.elements[0].id,
				}))
			);
			autoSaveTimeline();
			return true;
		},

		addMarkdownAtTime: (item: MarkdownElement, currentTime = 0): boolean => {
			const targetTrackId = get().insertTrackAt("markdown", 0);
			const duration = clampMarkdownDuration({
				duration: item.duration ?? TIMELINE_CONSTANTS.MARKDOWN_DEFAULT_DURATION,
			});

			if (get().checkElementOverlap(targetTrackId, currentTime, duration)) {
				toast.error(
					"Cannot place element here - it would overlap with existing elements"
				);
				return false;
			}

			get().addElementToTrack(targetTrackId, {
				type: "markdown",
				name: item.name || "Markdown",
				markdownContent: item.markdownContent || "# Title\n\nStart writing...",
				duration,
				startTime: currentTime,
				trimStart: 0,
				trimEnd: 0,
				theme: item.theme || "dark",
				fontSize: item.fontSize || 18,
				fontFamily: item.fontFamily || "Arial",
				padding: item.padding ?? 16,
				backgroundColor: item.backgroundColor || "rgba(0, 0, 0, 0.85)",
				textColor: item.textColor || "#ffffff",
				scrollMode: item.scrollMode || "static",
				scrollSpeed: item.scrollSpeed ?? 30,
				x: item.x ?? 0,
				y: item.y ?? 0,
				width: item.width ?? 720,
				height: item.height ?? 420,
				rotation: item.rotation ?? 0,
				opacity: item.opacity ?? 1,
			});
			return true;
		},

		addMediaToNewTrack: (item: MediaItem): boolean => {
			const trackType = item.type === "audio" ? "audio" : "media";
			const duration =
				item.duration || TIMELINE_CONSTANTS.DEFAULT_IMAGE_DURATION;
			const targetTrackId = get().findOrCreateTrack(trackType, {
				startTime: 0,
				duration,
			});

			get().addElementToTrack(targetTrackId, {
				type: "media",
				mediaId: item.id,
				name: item.name,
				duration,
				startTime: 0,
				trimStart: 0,
				trimEnd: 0,
			});
			return true;
		},

		addTextToNewTrack: (item: TextElement | DragData): boolean => {
			if (
				"type" in item &&
				item.type === "text" &&
				"textTemplatePack" in item &&
				item.textTemplatePack?.elements
			) {
				const packElements = getValidTextGroupElements({
					value: item.textTemplatePack.elements,
				});
				if (packElements.length === 0) {
					return get().addTextAtTime(
						"textTemplate" in item && item.textTemplate
							? item.textTemplate
							: { content: item.content, name: item.name },
						0
					);
				}
				return get().addTextGroupAtTime({
					elements: packElements,
					currentTime: 0,
				});
			}
			if (
				"type" in item &&
				item.type === "text" &&
				"textTemplate" in item &&
				item.textTemplate
			) {
				return get().addTextAtTime(item.textTemplate, 0);
			}
			const targetTrackId = get().insertTrackAt("text", 0); // Always create new text track at the top

			const dragDataContent =
				"type" in item && item.type === "text" ? item.content : undefined;
			const textElementContent = "content" in item ? item.content : undefined;
			const backgroundColor =
				("backgroundColor" in item ? item.backgroundColor : "transparent") ||
				"transparent";

			get().addElementToTrack(targetTrackId, {
				type: "text",
				name: item.name || "Text",
				content: (dragDataContent ?? textElementContent ?? "Default Text")
					.toString()
					.trim(),
				duration: TIMELINE_CONSTANTS.DEFAULT_TEXT_DURATION,
				startTime: 0,
				trimStart: 0,
				trimEnd: 0,
				fontSize: ("fontSize" in item ? item.fontSize : 48) || 48,
				fontFamily:
					("fontFamily" in item ? item.fontFamily : "Arial") || "Arial",
				color: ("color" in item ? item.color : "#ffffff") || "#ffffff",
				backgroundColor,
				textAlign:
					("textAlign" in item ? item.textAlign : "center") || "center",
				fontWeight:
					("fontWeight" in item ? item.fontWeight : "normal") || "normal",
				fontStyle:
					("fontStyle" in item ? item.fontStyle : "normal") || "normal",
				textDecoration:
					("textDecoration" in item ? item.textDecoration : "none") || "none",
				x: "x" in item && item.x !== undefined ? item.x : 0,
				y: "y" in item && item.y !== undefined ? item.y : 0,
				rotation:
					"rotation" in item && item.rotation !== undefined ? item.rotation : 0,
				opacity:
					"opacity" in item && item.opacity !== undefined ? item.opacity : 1,
				width: "width" in item && item.width !== undefined ? item.width : 640,
				height:
					"height" in item && item.height !== undefined ? item.height : 180,
				letterSpacing:
					"letterSpacing" in item && item.letterSpacing !== undefined
						? item.letterSpacing
						: 0,
				lineHeight:
					"lineHeight" in item && item.lineHeight !== undefined
						? item.lineHeight
						: 1.2,
				verticalAlign:
					"verticalAlign" in item && item.verticalAlign
						? item.verticalAlign
						: "middle",
				strokeColor:
					"strokeColor" in item && item.strokeColor
						? item.strokeColor
						: "#000000",
				strokeWidth:
					"strokeWidth" in item && item.strokeWidth !== undefined
						? item.strokeWidth
						: 0,
				strokeOpacity:
					"strokeOpacity" in item && item.strokeOpacity !== undefined
						? item.strokeOpacity
						: 1,
				// Same defaulting rule as addTextAtTime: a non-transparent background
				// with no explicit opacity must render visible, not invisible.
				backgroundOpacity:
					"backgroundOpacity" in item && item.backgroundOpacity !== undefined
						? item.backgroundOpacity
						: backgroundColor === "transparent"
							? 0
							: 1,
				backgroundRadius:
					"backgroundRadius" in item && item.backgroundRadius !== undefined
						? item.backgroundRadius
						: 4,
				backgroundPadding:
					"backgroundPadding" in item && item.backgroundPadding !== undefined
						? item.backgroundPadding
						: 12,
				shadowColor:
					"shadowColor" in item && item.shadowColor
						? item.shadowColor
						: "#000000",
				shadowOpacity:
					"shadowOpacity" in item && item.shadowOpacity !== undefined
						? item.shadowOpacity
						: 0,
				shadowOffsetX:
					"shadowOffsetX" in item && item.shadowOffsetX !== undefined
						? item.shadowOffsetX
						: 4,
				shadowOffsetY:
					"shadowOffsetY" in item && item.shadowOffsetY !== undefined
						? item.shadowOffsetY
						: 4,
				shadowBlur:
					"shadowBlur" in item && item.shadowBlur !== undefined
						? item.shadowBlur
						: 8,
				glowColor:
					"glowColor" in item && item.glowColor ? item.glowColor : "#ffffff",
				glowOpacity:
					"glowOpacity" in item && item.glowOpacity !== undefined
						? item.glowOpacity
						: 0,
				glowBlur:
					"glowBlur" in item && item.glowBlur !== undefined
						? item.glowBlur
						: 12,
				curve: "curve" in item && item.curve !== undefined ? item.curve : 0,
				animationType:
					"animationType" in item && item.animationType
						? item.animationType
						: "none",
				animationDuration:
					"animationDuration" in item && item.animationDuration !== undefined
						? item.animationDuration
						: 0.6,
				animationDelay:
					"animationDelay" in item && item.animationDelay !== undefined
						? item.animationDelay
						: 0,
				textAnimations:
					"textAnimations" in item ? item.textAnimations : undefined,
				keyframes: "keyframes" in item ? item.keyframes : undefined,
				blendMode:
					"blendMode" in item && item.blendMode ? item.blendMode : "normal",
			});
			return true;
		},

		addMarkdownToNewTrack: (item: MarkdownElement | DragData): boolean => {
			const targetTrackId = get().insertTrackAt("markdown", 0);

			const markdownContent =
				"type" in item && item.type === "markdown"
					? item.markdownContent
					: "markdownContent" in item &&
							typeof item.markdownContent === "string"
						? item.markdownContent
						: "# Title\n\nStart writing...";

			const duration = clampMarkdownDuration({
				duration:
					"duration" in item && typeof item.duration === "number"
						? item.duration
						: TIMELINE_CONSTANTS.MARKDOWN_DEFAULT_DURATION,
			});

			get().addElementToTrack(targetTrackId, {
				type: "markdown",
				name: item.name || "Markdown",
				markdownContent: markdownContent.toString(),
				duration,
				startTime: 0,
				trimStart: 0,
				trimEnd: 0,
				theme:
					"theme" in item && typeof item.theme === "string"
						? item.theme
						: "dark",
				fontSize:
					"fontSize" in item && typeof item.fontSize === "number"
						? item.fontSize
						: 18,
				fontFamily:
					"fontFamily" in item && typeof item.fontFamily === "string"
						? item.fontFamily
						: "Arial",
				padding:
					"padding" in item && typeof item.padding === "number"
						? item.padding
						: 16,
				backgroundColor:
					"backgroundColor" in item && typeof item.backgroundColor === "string"
						? item.backgroundColor
						: "rgba(0, 0, 0, 0.85)",
				textColor:
					"textColor" in item && typeof item.textColor === "string"
						? item.textColor
						: "#ffffff",
				scrollMode:
					"scrollMode" in item && item.scrollMode === "auto-scroll"
						? "auto-scroll"
						: "static",
				scrollSpeed:
					"scrollSpeed" in item && typeof item.scrollSpeed === "number"
						? item.scrollSpeed
						: 30,
				x: "x" in item && typeof item.x === "number" ? item.x : 0,
				y: "y" in item && typeof item.y === "number" ? item.y : 0,
				width:
					"width" in item && typeof item.width === "number" ? item.width : 720,
				height:
					"height" in item && typeof item.height === "number"
						? item.height
						: 420,
				rotation:
					"rotation" in item && typeof item.rotation === "number"
						? item.rotation
						: 0,
				opacity:
					"opacity" in item && typeof item.opacity === "number"
						? item.opacity
						: 1,
			});
			return true;
		},

		// -----------------------------------------------------------------------
		// Effects management
		// -----------------------------------------------------------------------
		setElementEffectState: ({
			elementId,
			effects,
			effectChains,
			pushHistory = true,
		}: {
			elementId: string;
			effects: import("@/types/effects").EffectInstance[];
			effectChains: import("@/types/effects").EffectChain[];
			pushHistory?: boolean;
		}) => {
			const { _tracks } = get();
			let updated = false;
			const nextTracks = _tracks.map((track) => ({
				...track,
				elements: track.elements.map((element) => {
					if (element.id !== elementId) return element;
					updated = true;
					return {
						...element,
						effects,
						effectChains,
						effectIds: effects.map((effect) => effect.id),
					};
				}),
			}));
			if (!updated) return;
			if (pushHistory) get().pushHistory();
			updateTracks(nextTracks);
			autoSaveTimeline();
		},

		addEffectToElement: (elementId: string, effectId: string) => {
			const { _tracks, pushHistory } = get();
			let updated = false;

			// Create immutable update
			const newTracks = _tracks.map((track) => {
				const elementIndex = track.elements.findIndex(
					(e) => e.id === elementId
				);
				if (elementIndex === -1) return track;

				const element = track.elements[elementIndex];
				const currentEffectIds = element.effectIds || [];

				// Check if effect already exists
				if (currentEffectIds.includes(effectId)) return track;

				// Create new element with updated effect IDs
				const updatedElement = {
					...element,
					effectIds: [...currentEffectIds, effectId],
				};

				// Create new track with updated element
				const newElements = [...track.elements];
				newElements[elementIndex] = updatedElement;

				updated = true;
				return { ...track, elements: newElements };
			});

			if (updated) {
				pushHistory();
				updateTracks(newTracks);
				autoSaveTimeline();
			}
		},

		removeEffectFromElement: (elementId: string, effectId: string) => {
			const { _tracks, pushHistory } = get();
			let updated = false;

			// Create immutable update
			const newTracks = _tracks.map((track) => {
				const elementIndex = track.elements.findIndex(
					(e) => e.id === elementId
				);
				if (elementIndex === -1) return track;

				const element = track.elements.at(elementIndex);
				if (
					!element ||
					!element.effectIds ||
					!element.effectIds.includes(effectId)
				)
					return track;

				// Create new element with updated effect IDs
				const nextEffectIds = element.effectIds.filter(
					(id: string) => id !== effectId
				);
				const updatedElement = {
					...element,
					effectIds: nextEffectIds,
				};

				// Create new track with updated element
				const newElements = [...track.elements];
				newElements[elementIndex] = updatedElement;

				updated = true;
				return { ...track, elements: newElements };
			});

			if (updated) {
				pushHistory();
				updateTracks(newTracks);
				autoSaveTimeline();
			}
		},

		getElementEffectIds: (elementId: string): string[] => {
			const tracks = get()._tracks;

			for (const track of tracks) {
				const element = track.elements.find((e) => e.id === elementId);
				if (element) {
					return element.effectIds || [];
				}
			}

			return [];
		},

		clearElementEffects: (elementId: string) => {
			const { _tracks, pushHistory } = get();
			let updated = false;

			// Create immutable update
			const newTracks = _tracks.map((track) => {
				const elementIndex = track.elements.findIndex(
					(e) => e.id === elementId
				);
				if (elementIndex === -1) return track;

				const element = track.elements.at(elementIndex);
				if (!element || !element.effectIds || element.effectIds.length === 0)
					return track;

				// Create new element with cleared effect IDs
				const updatedElement = {
					...element,
					effectIds: [],
				};

				// Create new track with updated element
				const newElements = [...track.elements];
				newElements[elementIndex] = updatedElement;

				updated = true;
				return { ...track, elements: newElements };
			});

			if (updated) {
				pushHistory();
				updateTracks(newTracks);
				autoSaveTimeline();
			}
		},
	};
}
