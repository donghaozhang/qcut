import type { ChangeEvent, ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor/editor-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useLocaleStore } from "@/stores/locale-store";
import { useProjectStore } from "@/stores/project-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { TimelineStore } from "@/stores/timeline/types";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { MediaElement, StickerElement } from "@/types/timeline";
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

function createElement({
	overrides = {},
}: {
	overrides?: Partial<StickerElement>;
} = {}): StickerElement {
	return {
		id: "sticker-element-1",
		type: "sticker",
		name: "问号",
		stickerId: "overlay-sticker-1",
		mediaId: "sticker-media-1",
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
		...overrides,
	};
}

function createOverlay({
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
		zIndex: 1,
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

const updateStickerElement = vi.fn();
const updateOverlaySticker = vi.fn();
const pushHistory = vi.fn();
const saveHistorySnapshot = vi.fn();

function setup({ element }: { element: StickerElement }) {
	useEditorStore.setState({ canvasSize: { width: 1920, height: 1080 } });
	useTimelineStore.setState({
		updateStickerElement:
			updateStickerElement as unknown as TimelineStore["updateStickerElement"],
		pushHistory,
	});
	useStickersOverlayStore.setState({
		overlayStickers: new Map([[element.stickerId, createOverlay({ element })]]),
		updateOverlaySticker,
		saveHistorySnapshot,
	});
	return render(
		<StickerProperties element={element} trackId="sticker-track" />
	);
}

describe("StickerProperties", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useLocaleStore.setState({ locale: "zh" });
		usePlaybackStore.setState({ currentTime: 1 });
		useProjectStore.setState({
			activeProject: { fps: 30 } as ReturnType<
				typeof useProjectStore.getState
			>["activeProject"],
		});
		useTimelineStore.setState({ tracks: [] });
	});

	it("writes exact percentage positions and snapshots a continuous interaction once", () => {
		const element = createElement();
		setup({ element });
		const positionX = screen.getByLabelText("位置 X数值");

		fireEvent.focus(positionX);
		fireEvent.change(positionX, { target: { value: "27.5" } });
		fireEvent.change(positionX, { target: { value: "28.25" } });

		expect(pushHistory).toHaveBeenCalledOnce();
		expect(saveHistorySnapshot).toHaveBeenCalledOnce();
		expect(saveHistorySnapshot).toHaveBeenCalledWith({
			syncTimelineHistory: false,
		});
		expect(updateStickerElement).toHaveBeenLastCalledWith(
			"sticker-track",
			"sticker-element-1",
			{ x: 28.25 },
			false
		);
		expect(updateOverlaySticker).toHaveBeenLastCalledWith(
			"overlay-sticker-1",
			expect.objectContaining({
				position: { x: 28.25, y: 40 },
			}),
			{ syncTimeline: false }
		);

		fireEvent.blur(positionX);
		fireEvent.focus(positionX);
		expect(pushHistory).toHaveBeenCalledTimes(2);
		expect(saveHistorySnapshot).toHaveBeenCalledTimes(2);
	});

	it("preserves the current ratio when either short-edge size changes", () => {
		const element = createElement();
		setup({ element });

		fireEvent.change(screen.getByLabelText("宽度数值"), {
			target: { value: "30" },
		});

		expect(updateStickerElement).toHaveBeenLastCalledWith(
			"sticker-track",
			"sticker-element-1",
			{ width: 30, height: 15 },
			false
		);
		expect(updateOverlaySticker).toHaveBeenLastCalledWith(
			"overlay-sticker-1",
			expect.objectContaining({ size: { width: 30, height: 15 } }),
			{ syncTimeline: false }
		);

		fireEvent.change(screen.getByLabelText("高度数值"), {
			target: { value: "100" },
		});
		expect(updateStickerElement).toHaveBeenLastCalledWith(
			"sticker-track",
			"sticker-element-1",
			{ width: 100, height: 50 },
			false
		);
	});

	it("allows independent sizing when uniform scale is disabled", () => {
		const element = createElement({
			overrides: { maintainAspectRatio: false },
		});
		setup({ element });

		fireEvent.change(screen.getByLabelText("宽度数值"), {
			target: { value: "30" },
		});
		expect(updateStickerElement).toHaveBeenLastCalledWith(
			"sticker-track",
			"sticker-element-1",
			{ width: 30, height: 10 },
			false
		);

		fireEvent.click(screen.getByRole("switch", { name: "等比缩放" }));
		expect(updateStickerElement).toHaveBeenLastCalledWith(
			"sticker-track",
			"sticker-element-1",
			{ maintainAspectRatio: true },
			false
		);
	});

	it("aligns from short-edge geometry on a landscape canvas", () => {
		const element = createElement();
		setup({ element });

		fireEvent.click(screen.getByRole("button", { name: "左对齐" }));
		expect(updateStickerElement).toHaveBeenLastCalledWith(
			"sticker-track",
			"sticker-element-1",
			{ x: 5.625 },
			false
		);

		fireEvent.click(screen.getByRole("button", { name: "底部对齐" }));
		expect(updateStickerElement).toHaveBeenLastCalledWith(
			"sticker-track",
			"sticker-element-1",
			{ y: 95 },
			false
		);
	});

	it("updates deformation, entrance, exit, and loop animation fields", () => {
		const element = createElement();
		const view = setup({ element });

		fireEvent.click(screen.getByRole("tab", { name: "变形" }));
		fireEvent.focus(screen.getByLabelText("左上角 X数值"));
		fireEvent.change(screen.getByLabelText("左上角 X数值"), {
			target: { value: "12.5" },
		});
		expect(updateStickerElement).toHaveBeenLastCalledWith(
			"sticker-track",
			"sticker-element-1",
			{
				perspective: {
					...perspective,
					topLeftX: 0.125,
				},
			},
			false
		);

		fireEvent.click(screen.getByRole("tab", { name: "动画" }));
		let animationSelects = screen.getAllByRole("combobox");
		fireEvent.change(animationSelects[0], {
			target: { value: "slide-left" },
		});
		fireEvent.change(animationSelects[1], {
			target: { value: "fade" },
		});
		fireEvent.change(animationSelects[2], {
			target: { value: "wobble" },
		});

		expect(updateStickerElement).toHaveBeenCalledWith(
			"sticker-track",
			"sticker-element-1",
			{ animationInType: "slide-left" },
			false
		);
		expect(updateStickerElement).toHaveBeenCalledWith(
			"sticker-track",
			"sticker-element-1",
			{ animationOutType: "fade" },
			false
		);
		expect(updateStickerElement).toHaveBeenCalledWith(
			"sticker-track",
			"sticker-element-1",
			{ animationLoopType: "wobble" },
			false
		);

		view.rerender(
			<StickerProperties
				element={createElement({
					overrides: {
						animationInType: "slide-left",
						animationLoopType: "wobble",
					},
				})}
				trackId="sticker-track"
			/>
		);
		fireEvent.change(screen.getByLabelText("入场时长数值"), {
			target: { value: "1.25" },
		});
		fireEvent.change(screen.getByLabelText("强度数值"), {
			target: { value: "65" },
		});

		expect(updateStickerElement).toHaveBeenCalledWith(
			"sticker-track",
			"sticker-element-1",
			{ animationInDuration: 1.25 },
			false
		);
		expect(updateStickerElement).toHaveBeenCalledWith(
			"sticker-track",
			"sticker-element-1",
			{ animationLoopIntensity: 0.65 },
			false
		);

		animationSelects = screen.getAllByRole("combobox");
		expect(animationSelects).toHaveLength(4);
	});

	it("names every supported real tracker when no target is ready", () => {
		setup({ element: createElement() });

		expect(
			screen.getByText(/MediaPipe、SAM3 或光流蒙版轨迹/)
		).toBeInTheDocument();
	});

	it("binds to a real tracked mask and exposes the honest planar limitation", () => {
		const element = createElement();
		const media: MediaElement = {
			id: "media-element",
			type: "media",
			name: "采访视频",
			mediaId: "video-media",
			startTime: 0,
			duration: 5,
			trimStart: 0,
			trimEnd: 0,
			masks: [
				{
					id: "person-mask",
					name: "人物",
					type: "person",
					centerX: 0.5,
					centerY: 0.5,
					width: 0.2,
					height: 0.4,
					rotation: 0,
					feather: 0,
					invert: false,
					keyframes: {
						centerX: [{ id: "x", frame: 0, value: 0.5, easing: "linear" }],
						centerY: [{ id: "y", frame: 0, value: 0.5, easing: "linear" }],
					},
					tracking: {
						direction: "both",
						status: "ready",
						source: "mediapipe",
					},
				},
			],
		};
		useTimelineStore.setState({
			tracks: [
				{
					id: "media-track",
					name: "Media",
					type: "media",
					elements: [media],
				},
				{
					id: "sticker-track",
					name: "Sticker",
					type: "sticker",
					elements: [element],
				},
			],
		});
		setup({ element });

		fireEvent.change(screen.getAllByRole("combobox")[3], {
			target: { value: '["media-element","person-mask"]' },
		});

		expect(updateStickerElement).toHaveBeenLastCalledWith(
			"sticker-track",
			"sticker-element-1",
			{
				tracking: {
					mode: "motion",
					targetElementId: "media-element",
					targetMaskId: "person-mask",
					followScale: false,
					anchor: {
						centerX: 50,
						centerY: 50,
						width: (1920 * 0.2 * 100) / 1080,
						height: 40,
					},
				},
			},
			false
		);
		expect(
			screen.getByText(/当前跟踪引擎没有单应性或平面表面求解器/)
		).toBeInTheDocument();
	});

	it("adds and removes a diamond keyframe at the current clip-local frame", () => {
		const element = createElement();
		const view = setup({ element });

		fireEvent.click(screen.getByRole("button", { name: "添加位置 X关键帧" }));
		expect(updateStickerElement).toHaveBeenLastCalledWith(
			"sticker-track",
			"sticker-element-1",
			{
				keyframes: {
					x: [
						expect.objectContaining({
							frame: 30,
							value: 30,
							easing: "linear",
						}),
					],
				},
			},
			false
		);

		view.rerender(
			<StickerProperties
				element={createElement({
					overrides: {
						keyframes: {
							x: [
								{
									id: "x-current",
									frame: 30,
									value: 30,
									easing: "linear",
								},
							],
						},
					},
				})}
				trackId="sticker-track"
			/>
		);
		fireEvent.click(screen.getByRole("button", { name: "移除位置 X关键帧" }));
		expect(updateStickerElement).toHaveBeenLastCalledWith(
			"sticker-track",
			"sticker-element-1",
			{ keyframes: { x: [] } },
			false
		);
	});

	it("shows interpolated values and edits an existing keyed property at this frame", () => {
		const element = createElement({
			overrides: {
				keyframes: {
					x: [
						{ id: "x-start", frame: 0, value: 10, easing: "linear" },
						{ id: "x-end", frame: 60, value: 70, easing: "linear" },
					],
				},
			},
		});
		setup({ element });
		const positionX = screen.getByLabelText("位置 X数值");
		expect(positionX).toHaveValue(40);

		fireEvent.change(positionX, { target: { value: "45" } });
		expect(updateStickerElement).toHaveBeenLastCalledWith(
			"sticker-track",
			"sticker-element-1",
			{
				x: 45,
				keyframes: {
					x: [
						{ id: "x-start", frame: 0, value: 10, easing: "linear" },
						expect.objectContaining({
							frame: 30,
							value: 45,
							easing: "linear",
						}),
						{ id: "x-end", frame: 60, value: 70, easing: "linear" },
					],
				},
			},
			false
		);
	});

	it("adds deformation keyframes using normalized corner values", () => {
		const element = createElement();
		setup({ element });

		fireEvent.click(screen.getByRole("button", { name: "添加左上角 X关键帧" }));
		expect(updateStickerElement).toHaveBeenLastCalledWith(
			"sticker-track",
			"sticker-element-1",
			{
				keyframes: {
					topLeftX: [
						expect.objectContaining({
							frame: 30,
							value: 0,
							easing: "linear",
						}),
					],
				},
			},
			false
		);
	});
});
