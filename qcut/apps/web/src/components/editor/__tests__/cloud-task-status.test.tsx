import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudTaskStatus } from "../cloud-task-status";
import { useCloudTaskStore } from "@/stores/cloud-task-store";

describe("CloudTaskStatus", () => {
	beforeEach(() => {
		useCloudTaskStore.getState().resetTasks();
	});

	it("shows live progress and estimated cost, then cancels", () => {
		const store = useCloudTaskStore.getState();
		const taskId = store.createTask({
			kind: "generation",
			label: "AI video generation",
			estimatedCostUsd: 0.42,
		});
		store.startTask({ id: taskId, message: "Generating frames" });
		store.updateProgress({ id: taskId, progress: 54 });
		const onCancel = vi.fn();

		render(<CloudTaskStatus taskId={taskId} onCancel={onCancel} />);

		expect(screen.getByText("AI video generation")).toBeInTheDocument();
		expect(screen.getByText("Est. $0.420")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "取消" }));
		expect(onCancel).toHaveBeenCalledOnce();
		expect(useCloudTaskStore.getState().tasks[0]?.status).toBe("canceled");
	});

	it("offers Resume when an interrupted task has a remote ID", () => {
		const store = useCloudTaskStore.getState();
		const taskId = store.createTask({ kind: "sam3", label: "Track product" });
		store.attachRemote({ id: taskId, remoteId: "request-12" });
		store.failTask({ id: taskId, error: "Connection lost" });
		const onRetry = vi.fn();

		render(<CloudTaskStatus taskId={taskId} onRetry={onRetry} />);

		fireEvent.click(screen.getByRole("button", { name: "继续" }));
		expect(onRetry).toHaveBeenCalledOnce();
		expect(useCloudTaskStore.getState().tasks[0]).toMatchObject({
			status: "queued",
			remoteId: "request-12",
			retryCount: 1,
		});
	});
});
