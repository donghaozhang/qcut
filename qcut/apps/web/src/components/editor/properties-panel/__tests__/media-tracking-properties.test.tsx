import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMediaMask } from "@/lib/video/media-mask-stack";
import { MediaTrackingProperties } from "../media-tracking-properties";

describe("MediaTrackingProperties", () => {
	it("opens mask creation when no trackable mask exists", () => {
		const onOpenMasks = vi.fn();
		render(
			<MediaTrackingProperties
				masks={[]}
				onTrack={vi.fn()}
				onOpenMasks={onOpenMasks}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "创建蒙版" }));
		expect(onOpenMasks).toHaveBeenCalledOnce();
	});

	it("forwards bidirectional tracking for the selected mask", () => {
		const mask = createMediaMask({
			id: "person-mask",
			type: "person",
			index: 0,
			name: "人物",
		});
		const onTrack = vi.fn();
		render(
			<MediaTrackingProperties
				masks={[mask]}
				onTrack={onTrack}
				onOpenMasks={vi.fn()}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "双向跟踪" }));
		expect(onTrack).toHaveBeenCalledWith({ mask, direction: "both" });
	});
});
