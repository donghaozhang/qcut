import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import {
	TRANSITION_DRAG_MIME,
	useTransitionDrop,
} from "../use-transition-drop";

const { addTransition, mockedTimelineStore } = vi.hoisted(() => {
	const addTransitionFn = vi.fn(() => "transition-1");
	return {
		addTransition: addTransitionFn,
		mockedTimelineStore: vi.fn(
			(
				selector: (state: { addTransition: typeof addTransitionFn }) => unknown
			) => selector({ addTransition: addTransitionFn })
		),
	};
});

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: mockedTimelineStore,
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

function mediaElement({
	id,
	mediaId,
	startTime,
}: {
	id: string;
	mediaId: string;
	startTime: number;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId,
		startTime,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
	};
}

function touchingClips(): TimelineTrack {
	return {
		id: "track-1",
		name: "Main",
		type: "media",
		isMain: true,
		elements: [
			mediaElement({ id: "from", mediaId: "media-from", startTime: 0 }),
			mediaElement({ id: "to", mediaId: "media-to", startTime: 2 }),
		],
	};
}

function dropEvent({
	payload,
}: {
	payload: Record<string, unknown>;
}): React.DragEvent<HTMLDivElement> {
	return {
		clientX: TIMELINE_CONSTANTS.PIXELS_PER_SECOND * 2,
		preventDefault: vi.fn(),
		stopPropagation: vi.fn(),
		dataTransfer: {
			getData: (format: string) =>
				format === TRANSITION_DRAG_MIME ? JSON.stringify(payload) : "",
		},
	} as unknown as React.DragEvent<HTMLDivElement>;
}

function renderTransitionDrop() {
	const track = touchingClips();
	const timelineRef = {
		current: {
			getBoundingClientRect: () => ({ left: 0 }),
		} as HTMLDivElement,
	};
	return renderHook(() =>
		useTransitionDrop({
			track,
			zoomLevel: 1,
			timelineRef,
			videoMediaIds: new Set(["media-from", "media-to"]),
		})
	);
}

describe("useTransitionDrop", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		addTransition.mockReturnValue("transition-1");
	});

	it("applies the same shaped mask encoded by the transition card", () => {
		const { result } = renderTransitionDrop();

		act(() => {
			result.current.handleTransitionDrop(
				dropEvent({
					payload: {
						kind: "qcut-transition-preset",
						id: "ink-bleed",
						type: "texture-mask",
						maskShape: "ink",
						defaultDuration: 0.8,
					},
				})
			);
		});

		expect(addTransition).toHaveBeenCalledWith({
			trackId: "track-1",
			fromElementId: "from",
			toElementId: "to",
			videoMediaIds: new Set(["media-from", "media-to"]),
			presetId: "ink-bleed",
			type: "texture-mask",
			direction: undefined,
			tuning: undefined,
			maskShape: "ink",
			duration: 0.8,
			easing: "easeInOut",
		});
	});

	it("rejects unknown mask shapes instead of changing the applied effect", () => {
		const { result } = renderTransitionDrop();

		act(() => {
			result.current.handleTransitionDrop(
				dropEvent({
					payload: {
						kind: "qcut-transition-preset",
						id: "untrusted-mask",
						type: "texture-mask",
						maskShape: "square",
						defaultDuration: 0.8,
					},
				})
			);
		});

		expect(addTransition).not.toHaveBeenCalled();
	});

	it("preserves a validated local engine identity", () => {
		const { result } = renderTransitionDrop();
		const packageHash = "b".repeat(32);

		act(() => {
			result.current.handleTransitionDrop(
				dropEvent({
					payload: {
						kind: "qcut-transition-preset",
						id: "jianying-local-3d-space",
						engine: "jianying-local",
						packageHash,
						type: "glass-refraction",
						defaultDuration: 1.5,
					},
				})
			);
		});

		expect(addTransition).toHaveBeenCalledWith(
			expect.objectContaining({
				presetId: "jianying-local-3d-space",
				engine: "jianying-local",
				packageHash,
			})
		);
	});

	it("rejects local path data in place of a package hash", () => {
		const { result } = renderTransitionDrop();

		act(() => {
			result.current.handleTransitionDrop(
				dropEvent({
					payload: {
						kind: "qcut-transition-preset",
						id: "jianying-local-3d-space",
						engine: "jianying-local",
						packageHash: "/Users/example/private-package",
						type: "glass-refraction",
						defaultDuration: 1.5,
					},
				})
			);
		});

		expect(addTransition).not.toHaveBeenCalled();
	});

	it("preserves a preset's quint progress policy", () => {
		const { result } = renderTransitionDrop();

		act(() => {
			result.current.handleTransitionDrop(
				dropEvent({
					payload: {
						kind: "qcut-transition-preset",
						id: "move-left",
						type: "push",
						direction: "right",
						easing: "easeInOutQuint",
						defaultDuration: 1,
					},
				})
			);
		});

		expect(addTransition).toHaveBeenCalledWith(
			expect.objectContaining({
				presetId: "move-left",
				duration: 1,
				easing: "easeInOutQuint",
			})
		);
	});
});
