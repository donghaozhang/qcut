import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import type { OverlaySticker } from "@/types/sticker-overlay";
import { StickerControls } from "../StickerControls";

const mocks = vi.hoisted(() => ({
	addElementToTrack: vi.fn(),
	bringToFront: vi.fn(),
	checkElementOverlap: vi.fn(() => false),
	insertTrackAt: vi.fn(() => "new-sticker-track"),
	removeOverlaySticker: vi.fn(),
	saveHistorySnapshot: vi.fn(),
	sendToBack: vi.fn(),
	updateOverlaySticker: vi.fn(),
	tracks: [] as Array<{
		id: string;
		type: string;
		elements: Array<Record<string, unknown>>;
	}>,
}));

vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: () => mocks,
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: () => ({
			_tracks: mocks.tracks,
			addElementToTrack: mocks.addElementToTrack,
			checkElementOverlap: mocks.checkElementOverlap,
			insertTrackAt: mocks.insertTrackAt,
		}),
	},
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({
		children,
		...props
	}: ComponentProps<"button"> & { children: ReactNode }) => (
		<button {...props}>{children}</button>
	),
}));

vi.mock("@/components/ui/tooltip", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children: ReactNode }) => (
		<span>{children}</span>
	),
	TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/slider", () => ({
	Slider: ({
		onValueChange,
		onValueCommit,
	}: {
		onValueChange: (value: number[]) => void;
		onValueCommit: () => void;
	}) => (
		<>
			<button
				type="button"
				onClick={() => {
					onValueChange([80]);
					onValueChange([65]);
					onValueCommit();
				}}
			>
				Opacity gesture
			</button>
		</>
	),
}));

const sticker: OverlaySticker = {
	id: "sticker-1",
	mediaItemId: "media-1",
	position: { x: 50, y: 50 },
	size: { width: 20, height: 20 },
	rotation: 0,
	opacity: 1,
	zIndex: 3,
	maintainAspectRatio: true,
};

describe("StickerControls history boundaries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.tracks = [
			{
				id: "sticker-track",
				type: "sticker",
				elements: [
					{
						id: "sticker-element",
						type: "sticker",
						stickerId: sticker.id,
						mediaId: sticker.mediaItemId,
						name: "Sticker",
						startTime: 2,
						duration: 5,
						trimStart: 0,
						trimEnd: 0,
						x: 50,
						y: 50,
					},
				],
			},
		];
	});

	it.each([
		{
			label: "Rotate sticker 45 degrees",
			mutation: mocks.updateOverlaySticker,
		},
		{ label: "Bring sticker to front", mutation: mocks.bringToFront },
		{ label: "Send sticker to back", mutation: mocks.sendToBack },
	])("snapshots once before $label", ({ label, mutation }) => {
		const calls: string[] = [];
		mocks.saveHistorySnapshot.mockImplementation(() => calls.push("history"));
		mutation.mockImplementation(() => calls.push("mutation"));
		render(
			<div
				onMouseDown={() => {
					mocks.saveHistorySnapshot();
				}}
			>
				<StickerControls stickerId={sticker.id} isVisible sticker={sticker} />
			</div>
		);

		const button = screen.getByRole("button", { name: label });
		fireEvent.mouseDown(button);
		fireEvent.click(button);

		expect(calls).toEqual(["history", "mutation"]);
		expect(mocks.saveHistorySnapshot).toHaveBeenCalledOnce();
	});

	it("snapshots opacity once before all updates in one slider gesture", () => {
		const calls: string[] = [];
		mocks.saveHistorySnapshot.mockImplementation(() => calls.push("history"));
		mocks.updateOverlaySticker.mockImplementation(() => calls.push("mutation"));
		render(
			<StickerControls stickerId={sticker.id} isVisible sticker={sticker} />
		);

		const sliderGesture = screen.getByRole("button", {
			name: "Opacity gesture",
		});
		fireEvent.click(sliderGesture);

		expect(calls).toEqual(["history", "mutation", "mutation"]);
		expect(mocks.saveHistorySnapshot).toHaveBeenCalledOnce();

		fireEvent.click(sliderGesture);
		expect(mocks.saveHistorySnapshot).toHaveBeenCalledTimes(2);
	});

	it("labels icon controls and keeps their keyboard events local", () => {
		const onKeyDown = vi.fn();
		render(
			<div onKeyDown={onKeyDown}>
				<StickerControls stickerId={sticker.id} isVisible sticker={sticker} />
			</div>
		);

		for (const label of [
			"Delete sticker",
			"Duplicate sticker",
			"Rotate sticker 45 degrees",
			"Bring sticker to front",
			"Send sticker to back",
		]) {
			const button = screen.getByRole("button", { name: label });
			expect(button.querySelector("svg title")?.textContent).toBe(label);
			fireEvent.keyDown(button, { key: "Enter" });
		}
		expect(onKeyDown).not.toHaveBeenCalled();
	});

	it("duplicates the timeline clip with a new projected sticker identity", () => {
		render(
			<StickerControls stickerId={sticker.id} isVisible sticker={sticker} />
		);

		fireEvent.click(
			screen.getByRole("button", {
				name: "Duplicate sticker",
			})
		);

		expect(mocks.addElementToTrack).toHaveBeenCalledOnce();
		const [trackId, duplicate] = mocks.addElementToTrack.mock.calls[0];
		expect(trackId).toBe("sticker-track");
		expect(duplicate).toMatchObject({
			type: "sticker",
			mediaId: sticker.mediaItemId,
			name: "Sticker (copy)",
			startTime: 2,
			x: 55,
			y: 55,
		});
		expect(duplicate).not.toHaveProperty("id");
		expect(duplicate.stickerId).not.toBe(sticker.id);
		expect(mocks.saveHistorySnapshot).not.toHaveBeenCalled();
	});
});
