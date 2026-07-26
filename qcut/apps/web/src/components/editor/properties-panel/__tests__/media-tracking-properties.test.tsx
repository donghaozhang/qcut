import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clearActiveMaskTrackingRuntimes,
	registerActiveMaskTrackingRuntime,
} from "@/lib/segmentation/mask-tracking-runtime";
import { createMediaMask } from "@/lib/video/media-mask-stack";
import { MediaTrackingProperties } from "../media-tracking-properties";

describe("MediaTrackingProperties", () => {
	afterEach(() => {
		clearActiveMaskTrackingRuntimes();
		vi.restoreAllMocks();
	});

	it("opens mask creation when no trackable mask exists", () => {
		const onOpenMasks = vi.fn();
		render(
			<MediaTrackingProperties
				elementId="clip-1"
				masks={[]}
				currentFrame={0}
				onChange={vi.fn()}
				onTrack={vi.fn()}
				onOpenMasks={onOpenMasks}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "创建蒙版" }));
		expect(onOpenMasks).toHaveBeenCalledOnce();
	});

	it("forwards bidirectional tracking for the selected mask", () => {
		const mask = {
			...createMediaMask({
				id: "person-mask",
				type: "person",
				index: 0,
				name: "人物",
			}),
			tracking: {
				direction: "forward" as const,
				status: "ready" as const,
				source: "mediapipe" as const,
				correctedFrames: [4],
				trackedFrames: 18,
				totalFrames: 20,
			},
		};
		const onTrack = vi.fn();
		const onChange = vi.fn();
		render(
			<MediaTrackingProperties
				elementId="clip-1"
				masks={[mask]}
				currentFrame={12}
				onChange={onChange}
				onTrack={onTrack}
				onOpenMasks={vi.fn()}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "双向跟踪" }));
		expect(onTrack).toHaveBeenCalledWith({ mask, direction: "both" });
		expect(onChange).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					tracking: expect.objectContaining({
						correctedFrames: [4],
						trackedFrames: 18,
						totalFrames: 20,
						direction: "both",
						status: "processing",
					}),
				}),
			],
			true
		);
	});

	it("pauses tracking and writes a correction keyframe from the tracking tab", () => {
		const mask = {
			...createMediaMask({
				id: "person-mask",
				type: "person",
				index: 0,
				name: "人物",
			}),
			centerX: 0.25,
			tracking: {
				direction: "both" as const,
				status: "processing" as const,
				source: "mediapipe" as const,
				progress: 50,
			},
		};
		const onChange = vi.fn();
		const { rerender } = render(
			<MediaTrackingProperties
				elementId="clip-1"
				masks={[mask]}
				currentFrame={18}
				onChange={onChange}
				onTrack={vi.fn()}
				onOpenMasks={vi.fn()}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "暂停跟踪" }));
		expect(onChange).toHaveBeenLastCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					tracking: expect.objectContaining({ status: "paused" }),
				}),
			]),
			true
		);

		rerender(
			<MediaTrackingProperties
				elementId="clip-1"
				masks={[
					{
						...mask,
						tracking: {
							...mask.tracking,
							status: "paused",
						},
					},
				]}
				currentFrame={18}
				onChange={onChange}
				onTrack={vi.fn()}
				onOpenMasks={vi.fn()}
			/>
		);
		fireEvent.click(screen.getByRole("button", { name: "修正当前帧" }));
		expect(onChange).toHaveBeenLastCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					keyframes: expect.objectContaining({
						centerX: [expect.objectContaining({ frame: 18, value: 0.25 })],
					}),
				}),
			]),
			true
		);
	});

	it("cancels the active runtime when pausing from the tracking tab", () => {
		const mask = {
			...createMediaMask({
				id: "object-mask",
				type: "object",
				index: 0,
				name: "物体",
			}),
			tracking: {
				direction: "forward" as const,
				status: "processing" as const,
				source: "sam3" as const,
				progress: 24,
			},
		};
		const cancel = vi.fn();
		registerActiveMaskTrackingRuntime({
			runtime: {
				elementId: "clip-1",
				maskId: "object-mask",
				source: "sam3",
				direction: "forward",
				cancel,
			},
		});

		render(
			<MediaTrackingProperties
				elementId="clip-1"
				masks={[mask]}
				currentFrame={18}
				onChange={vi.fn()}
				onTrack={vi.fn()}
				onOpenMasks={vi.fn()}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "暂停跟踪" }));
		expect(cancel).toHaveBeenCalledOnce();
	});

	it("falls back to relaunching when an active resume action fails", async () => {
		const mask = {
			...createMediaMask({
				id: "object-mask",
				type: "object",
				index: 0,
				name: "物体",
			}),
			tracking: {
				direction: "forward" as const,
				status: "paused" as const,
				source: "sam3" as const,
				progress: 24,
			},
		};
		const onChange = vi.fn();
		const onTrack = vi.fn();
		vi.spyOn(console, "error").mockImplementation(() => {});
		registerActiveMaskTrackingRuntime({
			runtime: {
				elementId: "clip-1",
				maskId: "object-mask",
				source: "sam3",
				direction: "forward",
				cancel: vi.fn(),
				resume: () => Promise.reject(new Error("resume failed")),
			},
		});

		render(
			<MediaTrackingProperties
				elementId="clip-1"
				masks={[mask]}
				currentFrame={18}
				onChange={onChange}
				onTrack={onTrack}
				onOpenMasks={vi.fn()}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "继续跟踪" }));

		expect(onChange).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					tracking: expect.objectContaining({ status: "processing" }),
				}),
			],
			true
		);
		await waitFor(() =>
			expect(onTrack).toHaveBeenCalledWith({
				mask,
				direction: "forward",
			})
		);
	});
});
