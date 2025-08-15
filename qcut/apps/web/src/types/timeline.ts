import { MediaType } from "@/stores/media-store";
import { generateUUID } from "@/lib/utils";

export type TrackType = "media" | "text" | "audio" | "sticker" | "captions";

// Base element properties
interface BaseTimelineElement {
  id: string;
  name: string;
  duration: number;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  hidden?: boolean;
}

// Media element that references MediaStore
export interface MediaElement extends BaseTimelineElement {
  type: "media";
  mediaId: string;
}

// Text element with embedded text data
export interface TextElement extends BaseTimelineElement {
  type: "text";
  content: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  textAlign: "left" | "center" | "right";
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textDecoration: "none" | "underline" | "line-through";
  x: number; // Position relative to canvas center
  y: number; // Position relative to canvas center
  rotation: number; // in degrees
  opacity: number; // 0-1
}

// Sticker element that references overlay sticker data
export interface StickerElement extends BaseTimelineElement {
  type: "sticker";
  stickerId: string; // References sticker in overlay store
  mediaId: string; // References media item for the sticker
}

// Caption element for subtitles/captions
export interface CaptionElement extends BaseTimelineElement {
  type: "captions";
  text: string;
  language: string;
  confidence?: number; // Transcription confidence level (0-1)
  source: "transcription" | "manual" | "imported";
}

// Typed timeline elements
export type TimelineElement = MediaElement | TextElement | StickerElement | CaptionElement;

// Creation types (without id, for addElementToTrack)
export type CreateMediaElement = Omit<MediaElement, "id">;
export type CreateTextElement = Omit<TextElement, "id">;
export type CreateStickerElement = Omit<StickerElement, "id">;
export type CreateCaptionElement = Omit<CaptionElement, "id">;
export type CreateTimelineElement =
  | CreateMediaElement
  | CreateTextElement
  | CreateStickerElement
  | CreateCaptionElement;

export interface TimelineElementProps {
  element: TimelineElement;
  track: TimelineTrack;
  zoomLevel: number;
  isSelected: boolean;
  onElementMouseDown: (e: React.MouseEvent, element: TimelineElement) => void;
  onElementClick: (e: React.MouseEvent, element: TimelineElement) => void;
}

export interface ResizeState {
  elementId: string;
  side: "left" | "right";
  startX: number;
  initialTrimStart: number;
  initialTrimEnd: number;
}

// Drag data types for type-safe drag and drop
export interface MediaItemDragData {
  id: string;
  type: MediaType;
  name: string;
}

export interface TextItemDragData {
  id: string;
  type: "text";
  name: string;
  content: string;
}

export type DragData = MediaItemDragData | TextItemDragData;

export interface TimelineTrack {
  id: string;
  name: string;
  type: TrackType;
  elements: TimelineElement[];
  muted?: boolean;
  isMain?: boolean;
}

export function sortTracksByOrder(tracks: TimelineTrack[]): TimelineTrack[] {
  return [...tracks].sort((a, b) => {
    // Text tracks always go to the top
    if (a.type === "text" && b.type !== "text") return -1;
    if (b.type === "text" && a.type !== "text") return 1;

    // Caption tracks go after text, before stickers
    if (a.type === "captions" && b.type !== "captions" && b.type !== "text")
      return -1;
    if (b.type === "captions" && a.type !== "captions" && a.type !== "text")
      return 1;

    // Sticker tracks go after captions, before media
    if (a.type === "sticker" && b.type !== "sticker" && b.type !== "text" && b.type !== "captions")
      return -1;
    if (b.type === "sticker" && a.type !== "sticker" && a.type !== "text" && a.type !== "captions")
      return 1;

    // Audio tracks always go to bottom
    if (a.type === "audio" && b.type !== "audio") return 1;
    if (b.type === "audio" && a.type !== "audio") return -1;

    // Main track goes above audio but below text, captions, and sticker tracks
    if (
      a.isMain &&
      !b.isMain &&
      b.type !== "audio" &&
      b.type !== "text" &&
      b.type !== "captions" &&
      b.type !== "sticker"
    )
      return 1;
    if (
      b.isMain &&
      !a.isMain &&
      a.type !== "audio" &&
      a.type !== "text" &&
      a.type !== "captions" &&
      a.type !== "sticker"
    )
      return -1;

    // Within same category, maintain creation order
    return 0;
  });
}

export function getMainTrack(tracks: TimelineTrack[]): TimelineTrack | null {
  return tracks.find((track) => track.isMain) || null;
}

export function ensureMainTrack(tracks: TimelineTrack[]): TimelineTrack[] {
  const hasMainTrack = tracks.some((track) => track.isMain);

  if (!hasMainTrack) {
    // Create main track if it doesn't exist
    const mainTrack: TimelineTrack = {
      id: generateUUID(),
      name: "Main Track",
      type: "media",
      elements: [],
      muted: false,
      isMain: true,
    };
    return [mainTrack, ...tracks];
  }

  return tracks;
}

// Timeline validation utilities
export function canElementGoOnTrack(
  elementType: "text" | "media" | "sticker" | "captions",
  trackType: TrackType
): boolean {
  if (elementType === "text") {
    return trackType === "text";
  }
  if (elementType === "media") {
    return trackType === "media" || trackType === "audio";
  }
  if (elementType === "sticker") {
    return trackType === "sticker";
  }
  if (elementType === "captions") {
    return trackType === "captions";
  }
  return false;
}

export function validateElementTrackCompatibility(
  element: { type: "text" | "media" | "sticker" | "captions" },
  track: { type: TrackType }
): { isValid: boolean; errorMessage?: string } {
  const isValid = canElementGoOnTrack(element.type, track.type);

  if (!isValid) {
    const errorMessage =
      element.type === "text"
        ? "Text elements can only be placed on text tracks"
        : element.type === "sticker"
          ? "Sticker elements can only be placed on sticker tracks"
          : element.type === "captions"
            ? "Caption elements can only be placed on caption tracks"
            : "Media elements can only be placed on media or audio tracks";

    return { isValid: false, errorMessage };
  }

  return { isValid: true };
}
