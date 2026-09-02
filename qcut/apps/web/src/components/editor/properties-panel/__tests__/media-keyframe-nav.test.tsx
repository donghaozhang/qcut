import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaKeyframeNav } from "../media-keyframe-nav";

describe("MediaKeyframeNav", () => {
	it("seeks to the nearest previous and next keyframes across the covered properties", () => {
		const onSeekFrame = vi.fn();
		const onToggle = vi.fn();
		render(
			<MediaKeyframeNav
				label="变形"
				frames={[60, 10, 30, 30]}
				currentFrame={30}
				keyframed={true}
				onToggle={onToggle}
				onSeekFrame={onSeekFrame}
			/>
		);
		fireEvent.click(screen.getByLabelText("上一个变形关键帧"));
		expect(onSeekFrame).toHaveBeenLastCalledWith(10);
		fireEvent.click(screen.getByLabelText("下一个变形关键帧"));
		expect(onSeekFrame).toHaveBeenLastCalledWith(60);
		fireEvent.click(screen.getByLabelText("移除变形关键帧"));
		expect(onToggle).toHaveBeenCalledOnce();
	});

	it("disables navigation at the ends and offers to add a keyframe when none sits here", () => {
		const onSeekFrame = vi.fn();
		render(
			<MediaKeyframeNav
				label="不透明度"
				frames={[30]}
				currentFrame={30}
				keyframed={false}
				onToggle={vi.fn()}
				onSeekFrame={onSeekFrame}
			/>
		);
		expect(screen.getByLabelText("上一个不透明度关键帧")).toBeDisabled();
		expect(screen.getByLabelText("下一个不透明度关键帧")).toBeDisabled();
		expect(screen.getByLabelText("添加不透明度关键帧")).toBeInTheDocument();
	});
});
