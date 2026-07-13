import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudTaskCenter } from "../cloud-task-center";
import {
	clearAllCloudTaskRuntimeActions,
	getCloudTaskRuntimeActions,
	registerCloudTaskRuntimeActions,
} from "@/lib/cloud-tasks/task-runtime-actions";
import { useCloudTaskStore } from "@/stores/cloud-task-store";

describe("CloudTaskCenter", () => {
	beforeEach(() => {
		useCloudTaskStore.getState().resetTasks();
		clearAllCloudTaskRuntimeActions();
	});

	it("shows persistent progress and invokes the underlying cancel action", () => {
		const store = useCloudTaskStore.getState();
		const taskId = store.createTask({
			kind: "review",
			label: "AI 审片：片段 1",
		});
		store.startTask({ id: taskId, message: "正在运行在线审片" });
		store.updateProgress({ id: taskId, progress: 32 });
		const cancel = vi.fn();
		registerCloudTaskRuntimeActions({ taskId, actions: { cancel } });

		render(<CloudTaskCenter />);
		fireEvent.pointerDown(screen.getByRole("button", { name: "任务中心" }), {
			button: 0,
			ctrlKey: false,
		});

		expect(screen.getByText("AI 审片：片段 1")).toBeInTheDocument();
		expect(screen.getByText("正在运行在线审片")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "取消" }));
		expect(cancel).toHaveBeenCalledOnce();
		expect(useCloudTaskStore.getState().tasks[0]?.status).toBe("canceled");
	});

	it("offers task-scoped undo and clears runtime actions with the record", () => {
		const store = useCloudTaskStore.getState();
		const taskId = store.createTask({
			kind: "scene-detection",
			label: "镜头分割：片段 1",
		});
		store.completeTask({ id: taskId, output: { createdElementIds: ["b"] } });
		const undo = vi.fn();
		registerCloudTaskRuntimeActions({ taskId, actions: { undo } });

		render(<CloudTaskCenter />);
		fireEvent.pointerDown(screen.getByRole("button", { name: "任务中心" }), {
			button: 0,
			ctrlKey: false,
		});
		fireEvent.click(screen.getByRole("button", { name: "撤销" }));
		expect(undo).toHaveBeenCalledOnce();
		fireEvent.click(screen.getByRole("button", { name: "移除任务记录" }));
		expect(getCloudTaskRuntimeActions({ taskId })).toBeUndefined();
	});
});
