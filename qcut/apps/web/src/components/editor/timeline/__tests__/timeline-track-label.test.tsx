import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import { TimelineTrackLabel } from "../timeline-track-label";
import { useLocaleStore } from "@/stores/locale-store";

function renderAudioTrack({ solo = false }: { solo?: boolean } = {}) {
	const onToggleSolo = vi.fn();
	const track: TimelineTrack = {
		id: "audio-track",
		name: "Dialogue",
		type: "audio",
		elements: [],
		audio: { solo } as TimelineTrack["audio"],
	};
	render(
		<TimelineTrackLabel
			track={track}
			dragHandleProps={null}
			isDragging={false}
			onToggleHidden={vi.fn()}
			onToggleLocked={vi.fn()}
			onToggleMuted={vi.fn()}
			onToggleSolo={onToggleSolo}
			onResizeStart={vi.fn()}
			onResizeHeight={vi.fn()}
		/>
	);
	return { onToggleSolo };
}

describe("TimelineTrackLabel", () => {
	beforeEach(() => {
		useLocaleStore.getState().setLocale({ locale: "en" });
	});

	afterEach(() => {
		useLocaleStore.getState().setLocale({ locale: "zh" });
	});

	it("exposes the existing audio solo state", () => {
		renderAudioTrack({ solo: true });

		expect(
			screen.getByRole("button", { name: "Disable solo for Dialogue" })
		).toHaveAttribute("aria-pressed", "true");
	});

	it("toggles solo from the track header", () => {
		const { onToggleSolo } = renderAudioTrack();

		fireEvent.click(screen.getByRole("button", { name: "Solo Dialogue" }));

		expect(onToggleSolo).toHaveBeenCalledOnce();
	});

	it("exposes an accessible keyboard track-height control", () => {
		const onResizeStart = vi.fn();
		const onResizeHeight = vi.fn();
		const track: TimelineTrack = {
			id: "captions",
			name: "Captions",
			type: "captions",
			elements: [],
			height: 48,
		};
		render(
			<TimelineTrackLabel
				track={track}
				dragHandleProps={null}
				isDragging={false}
				onToggleHidden={vi.fn()}
				onToggleLocked={vi.fn()}
				onToggleMuted={vi.fn()}
				onToggleSolo={vi.fn()}
				onResizeStart={onResizeStart}
				onResizeHeight={onResizeHeight}
			/>
		);

		fireEvent.keyDown(
			screen.getByRole("separator", { name: "Resize Captions track" }),
			{ key: "ArrowDown" }
		);

		expect(onResizeStart).toHaveBeenCalledOnce();
		expect(onResizeHeight).toHaveBeenCalledWith(56);
	});
});
