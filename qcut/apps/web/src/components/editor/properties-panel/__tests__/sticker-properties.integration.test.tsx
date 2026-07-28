import type { ChangeEvent, ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor/editor-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useLocaleStore } from "@/stores/locale-store";
import { useProjectStore } from "@/stores/project-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { clearAutoSaveTimer } from "@/stores/timeline/timeline-store-autosave";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type {
	StickerElement,
	StickerKeyframeProperty,
	StickerPropertyKeyframe,
	TimelineTrack,
} from "@/types/timeline";
import { StickerProperties } from "../sticker-properties";

vi.mock("@/components/ui/select", () => ({
	Select: ({
		children,
		onValueChange,
		value,
	}: {
		children: ReactNode;
		onValueChange: (value: string) => void;
		value: string;
	}) => (
		<select
			value={value}
			onChange={(event: ChangeEvent<HTMLSelectElement>) =>
				onValueChange(event.target.value)
			}
		>
			{children}
		</select>
	),
	SelectContent: ({ children }: { children: ReactNode }) => children,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<option value={value}>{children}</option>
	),
	SelectTrigger: () => null,
	SelectValue: () => null,
}));

vi.mock("@/components/ui/tabs", () => ({
	Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TabsTrigger: ({ children }: { children: ReactNode }) => (
		<button type="button" role="tab">
			{children}
		</button>
	),
}));

const BASIC_KEYFRAME_PROPERTIES = [
	"x",
	"y",
	"width",
	"height",
	"rotation",
	"opacity",
] as const satisfies readonly StickerKeyframeProperty[];

const perspective = {
	topLeftX: 0,
	topLeftY: 0,
	topRightX: 1,
	topRightY: 0,
	bottomRightX: 1,
	bottomRightY: 1,
	bottomLeftX: 0,
	bottomLeftY: 1,
};

function propertyKeyframes({
	property,
	value,
}: {
	property: StickerKeyframeProperty;
	value: number;
}): StickerPropertyKeyframe[] {
	return [
		{
			id: `${property}-start`,
			frame: 0,
			value,
			easing: "linear",
		},
		{
			id: `${property}-end`,
			frame: 60,
			value,
			easing: "linear",
		},
	];
}

function stickerElement(): StickerElement {
	return {
		id: "sticker-element",
		type: "sticker",
		name: "Sticker",
		stickerId: "sticker-overlay",
		mediaId: "sticker-media",
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		x: 30,
		y: 40,
		width: 20,
		height: 10,
		rotation: 0,
		opacity: 1,
		maintainAspectRatio: true,
		perspective,
		animationInType: "none",
		animationInDuration: 0.5,
		animationOutType: "none",
		animationOutDuration: 0.5,
		animationLoopType: "none",
		animationLoopIntensity: 0.5,
		keyframes: {
			x: [
				{ id: "x-start", frame: 0, value: 10, easing: "linear" },
				{ id: "x-end", frame: 60, value: 70, easing: "linear" },
			],
			y: propertyKeyframes({ property: "y", value: 40 }),
			width: propertyKeyframes({ property: "width", value: 20 }),
			height: propertyKeyframes({ property: "height", value: 10 }),
			rotation: propertyKeyframes({ property: "rotation", value: 0 }),
			opacity: propertyKeyframes({ property: "opacity", value: 1 }),
		},
	};
}

function overlaySticker({
	element,
}: {
	element: StickerElement;
}): OverlaySticker {
	return {
		id: element.stickerId,
		mediaItemId: element.mediaId,
		position: { x: element.x ?? 50, y: element.y ?? 50 },
		size: { width: element.width ?? 15, height: element.height ?? 15 },
		rotation: element.rotation ?? 0,
		opacity: element.opacity ?? 1,
		zIndex: element.zIndex ?? 1,
		maintainAspectRatio: element.maintainAspectRatio ?? true,
		perspective: element.perspective,
		animationInType: element.animationInType,
		animationInDuration: element.animationInDuration,
		animationOutType: element.animationOutType,
		animationOutDuration: element.animationOutDuration,
		animationLoopType: element.animationLoopType,
		animationLoopIntensity: element.animationLoopIntensity,
	};
}

function resetStores(): StickerElement {
	const element = stickerElement();
	const tracks: TimelineTrack[] = [
		{
			id: "sticker-track",
			name: "Stickers",
			type: "sticker",
			elements: [element],
		},
		{
			id: "main-track",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [],
		},
	];
	useTimelineStore.setState({
		_tracks: tracks,
		tracks,
		history: [],
		redoStack: [],
		selectedElements: [],
	});
	useStickersOverlayStore.setState({
		overlayStickers: new Map([
			[element.stickerId, overlaySticker({ element })],
		]),
		selectedStickerId: element.stickerId,
		history: { past: [], future: [] },
	});
	return element;
}

function currentStickerElement(): StickerElement {
	const element = useTimelineStore
		.getState()
		._tracks.flatMap((track) => track.elements)
		.find((candidate) => candidate.id === "sticker-element");
	if (element?.type !== "sticker") {
		throw new Error("Sticker element missing from timeline");
	}
	return element;
}

function expectNoCurrentBasicKeyframes(): void {
	const element = currentStickerElement();
	for (const property of BASIC_KEYFRAME_PROPERTIES) {
		expect(
			element.keyframes?.[property]?.some((keyframe) => keyframe.frame === 30)
		).toBe(false);
	}
}

describe("StickerProperties store integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useLocaleStore.setState({ locale: "zh" });
		usePlaybackStore.setState({ currentTime: 1 });
		useProjectStore.setState({
			activeProject: { fps: 30 } as ReturnType<
				typeof useProjectStore.getState
			>["activeProject"],
		});
		useEditorStore.setState({ canvasSize: { width: 1920, height: 1080 } });
	});

	afterEach(() => {
		clearAutoSaveTimer();
	});

	it("updates animation without inserting unrelated basic keyframes", () => {
		const element = resetStores();
		render(<StickerProperties element={element} trackId="sticker-track" />);

		fireEvent.change(screen.getAllByRole("combobox")[0], {
			target: { value: "slide-left" },
		});

		expect(currentStickerElement().animationInType).toBe("slide-left");
		expect(
			useStickersOverlayStore.getState().overlayStickers.get(element.stickerId)
				?.animationInType
		).toBe("slide-left");
		expectNoCurrentBasicKeyframes();
	});

	it("updates perspective without inserting unrelated basic keyframes", () => {
		const element = resetStores();
		render(<StickerProperties element={element} trackId="sticker-track" />);

		fireEvent.change(screen.getByLabelText("左上角 X数值"), {
			target: { value: "12.5" },
		});

		expect(currentStickerElement().perspective?.topLeftX).toBe(0.125);
		expect(
			useStickersOverlayStore.getState().overlayStickers.get(element.stickerId)
				?.perspective?.topLeftX
		).toBe(0.125);
		expectNoCurrentBasicKeyframes();
	});

	it("keeps a basic property edit consistent in timeline and overlay", () => {
		const element = resetStores();
		render(<StickerProperties element={element} trackId="sticker-track" />);

		fireEvent.change(screen.getByLabelText("位置 X数值"), {
			target: { value: "45" },
		});

		const current = currentStickerElement();
		expect(current.x).toBe(45);
		expect(
			current.keyframes?.x?.find((keyframe) => keyframe.frame === 30)?.value
		).toBe(45);
		expect(
			useStickersOverlayStore.getState().overlayStickers.get(element.stickerId)
				?.position.x
		).toBe(45);
		for (const property of BASIC_KEYFRAME_PROPERTIES) {
			if (property === "x") continue;
			expect(
				current.keyframes?.[property]?.some((keyframe) => keyframe.frame === 30)
			).toBe(false);
		}
	});
});
