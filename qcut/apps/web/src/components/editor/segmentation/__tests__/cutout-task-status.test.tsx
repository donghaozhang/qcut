import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CutoutTaskStatus } from "../CutoutTaskStatus";

describe("CutoutTaskStatus", () => {
	it("shows active progress, elapsed time, and cancellation", () => {
		const onCancel = vi.fn();
		render(
			<CutoutTaskStatus
				phase="processing"
				progress={47}
				message="Tracking object..."
				elapsedTime={12.8}
				onCancel={onCancel}
			/>
		);

		expect(screen.getByText("处理中")).toBeVisible();
		expect(screen.getByText("12s")).toBeVisible();
		expect(screen.getByText("Tracking object...")).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "取消" }));
		expect(onCancel).toHaveBeenCalledOnce();
	});

	it("surfaces a terminal error and retries", () => {
		const onRetry = vi.fn();
		render(
			<CutoutTaskStatus
				phase="error"
				progress={0}
				message="Object tracking failed"
				error="Tracking quota exhausted"
				elapsedTime={3}
				onRetry={onRetry}
			/>
		);

		expect(screen.getByText("失败")).toBeVisible();
		expect(screen.getByText("Tracking quota exhausted")).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "重试" }));
		expect(onRetry).toHaveBeenCalledOnce();
	});
});
