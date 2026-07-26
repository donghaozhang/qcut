import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCloudTaskRuntimeActions } from "@/lib/cloud-tasks/task-runtime-actions";
import { useCloudTaskStore } from "@/stores/cloud-task-store";
import { usePersistentAiTask } from "../use-persistent-ai-task";

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("usePersistentAiTask", () => {
	beforeEach(() => useCloudTaskStore.getState().resetTasks());

	it("ignores a result that arrives after task-center cancellation", async () => {
		const pending = deferred<{ url: string }>();
		const onSuccess = vi.fn();
		const { result } = renderHook(() => usePersistentAiTask());
		let taskPromise!: Promise<{ url: string } | null>;

		act(() => {
			taskPromise = result.current.runTask({
				label: "生成配音",
				completeMessage: "配音完成",
				execute: () => pending.promise,
				onSuccess,
			});
		});
		const taskId = useCloudTaskStore.getState().tasks[0].id;
		await getCloudTaskRuntimeActions({ taskId })?.cancel?.();
		pending.resolve({ url: "https://cdn.example.test/voice.wav" });

		await expect(taskPromise).resolves.toBeNull();
		expect(onSuccess).not.toHaveBeenCalled();
		expect(useCloudTaskStore.getState().tasks[0].status).toBe("canceled");
	});

	it("retries the same task and exposes scoped undo after completion", async () => {
		const execute = vi
			.fn<() => Promise<{ id: string }>>()
			.mockRejectedValueOnce(new Error("temporary"))
			.mockResolvedValueOnce({ id: "voice-2" });
		const onUndo = vi.fn();
		const { result } = renderHook(() => usePersistentAiTask());

		await act(async () => {
			await result.current.runTask({
				label: "克隆音色",
				completeMessage: "克隆完成",
				execute,
				onUndo,
			});
		});
		const taskId = useCloudTaskStore.getState().tasks[0].id;
		await act(async () => {
			await getCloudTaskRuntimeActions({ taskId })?.retry?.();
		});

		expect(execute).toHaveBeenCalledTimes(2);
		expect(useCloudTaskStore.getState().tasks[0]).toMatchObject({
			id: taskId,
			status: "completed",
			retryCount: 1,
		});
		await getCloudTaskRuntimeActions({ taskId })?.undo?.();
		expect(onUndo).toHaveBeenCalledWith({ id: "voice-2" });
	});

	it("exposes the active attempt cancel action to a scoped runtime", async () => {
		const onCancel = vi.fn();
		const unregisterRuntime = vi.fn();
		let cancelRuntime: (() => void) | undefined;
		const { result } = renderHook(() => usePersistentAiTask());
		let taskPromise!: Promise<null>;

		act(() => {
			taskPromise = result.current.runTask({
				label: "跟踪人物",
				completeMessage: "跟踪完成",
				execute: ({ signal }) =>
					new Promise((_resolve, reject) => {
						signal.addEventListener(
							"abort",
							() => reject(new DOMException("Canceled", "AbortError")),
							{ once: true }
						);
					}),
				onCancel,
				onRuntimeReady: ({ cancel }) => {
					cancelRuntime = cancel;
					return unregisterRuntime;
				},
			});
		});

		expect(cancelRuntime).toBeTypeOf("function");
		act(() => cancelRuntime?.());

		await expect(taskPromise).resolves.toBeNull();
		expect(onCancel).toHaveBeenCalledOnce();
		expect(unregisterRuntime).toHaveBeenCalledOnce();
		expect(useCloudTaskStore.getState().tasks[0].status).toBe("canceled");
	});
});
