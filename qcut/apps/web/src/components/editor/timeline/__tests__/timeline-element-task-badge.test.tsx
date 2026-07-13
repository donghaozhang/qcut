import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import type { CloudTask } from "@/stores/cloud-task-store";
import {
	TimelineElementTaskBadge,
	resolveTimelineElementTaskStatus,
} from "../timeline-element-task-badge";

const element: MediaElement = {
	id: "clip-1",
	name: "Clip",
	type: "media",
	mediaId: "media-1",
	startTime: 0,
	duration: 5,
	trimStart: 0,
	trimEnd: 0,
};

describe("timeline element task status", () => {
	it("surfaces persistent cloud tasks attached to the clip", () => {
		const cloudTask: CloudTask = {
			id: "review-1",
			kind: "review",
			label: "AI 审片",
			status: "running",
			progress: 20,
			message: "正在运行",
			payload: { elementId: element.id },
			retryCount: 0,
			createdAt: 1,
			updatedAt: 1,
		};

		expect(
			resolveTimelineElementTaskStatus({
				element,
				cloudTasks: [cloudTask],
			})
		).toEqual({ state: "processing", label: "AI 审片" });
	});

	it("surfaces mask tracking progress", () => {
		const processingElement: MediaElement = {
			...element,
			mask: {
				type: "person",
				centerX: 0.5,
				centerY: 0.5,
				width: 1,
				height: 1,
				rotation: 0,
				feather: 0,
				invert: false,
				tracking: { direction: "both", status: "processing" },
			},
		};

		expect(
			resolveTimelineElementTaskStatus({ element: processingElement })
		).toEqual({
			state: "processing",
			label: "Mask tracking",
		});
		render(<TimelineElementTaskBadge element={processingElement} showLabel />);
		expect(
			screen.getByRole("status", { name: "Mask tracking in progress" })
		).toBeVisible();
	});

	it("prioritizes a terminal error over another active task", () => {
		const failedElement: MediaElement = {
			...element,
			mask: {
				type: "person",
				centerX: 0.5,
				centerY: 0.5,
				width: 1,
				height: 1,
				rotation: 0,
				feather: 0,
				invert: false,
				tracking: { direction: "both", status: "processing" },
			},
			customCutout: {
				enabled: true,
				applyStrokes: true,
				strokes: [],
				status: "error",
				error: "Quota exhausted",
			},
		};

		expect(
			resolveTimelineElementTaskStatus({ element: failedElement })
		).toEqual({
			state: "error",
			label: "Custom cutout",
			detail: "Quota exhausted",
		});
	});
});
