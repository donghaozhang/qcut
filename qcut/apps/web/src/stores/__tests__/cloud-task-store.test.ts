import { beforeEach, describe, expect, it } from "vitest";
import {
	normalizeCloudTaskPersistedState,
	sanitizeCloudTaskPayload,
	useCloudTaskStore,
} from "../cloud-task-store";

describe("cloud task store", () => {
	beforeEach(() => {
		useCloudTaskStore.getState().resetTasks();
	});

	it("tracks progress, remote identity, cost, and completion", () => {
		const store = useCloudTaskStore.getState();
		const id = store.createTask({
			kind: "sam3",
			label: "Track product",
			payload: { prompt: "product", sourceMediaId: "media-1" },
			estimatedCostUsd: 0.08,
		});

		store.startTask({ id, message: "Uploading" });
		store.attachRemote({ id, remoteId: "fal-request-1" });
		store.updateProgress({ id, progress: 63, message: "Tracking" });
		store.completeTask({
			id,
			actualCostUsd: 0.07,
			output: { mediaId: "mask-1" },
		});

		expect(useCloudTaskStore.getState().tasks[0]).toMatchObject({
			id,
			status: "completed",
			progress: 100,
			remoteId: "fal-request-1",
			estimatedCostUsd: 0.08,
			actualCostUsd: 0.07,
			output: { mediaId: "mask-1" },
		});
	});

	it("marks active persisted tasks interrupted and keeps remote IDs resumable", () => {
		const normalized = normalizeCloudTaskPersistedState({
			now: 5_000,
			value: {
				tasks: [
					{
						id: "task-1",
						kind: "sam3",
						label: "Track object",
						status: "running",
						progress: 44,
						message: "Processing",
						payload: { prompt: "person" },
						remoteId: "request-7",
						retryCount: 0,
						createdAt: 1_000,
						updatedAt: 2_000,
					},
				],
			},
		});

		expect(normalized.tasks[0]).toMatchObject({
			status: "interrupted",
			progress: 44,
			remoteId: "request-7",
			updatedAt: 5_000,
		});
	});

	it("removes secrets and signed URL query strings from persisted payloads", () => {
		expect(
			sanitizeCloudTaskPayload({
				payload: {
					prompt: "hello",
					apiKey: "sk-secret",
					Authorization: "Bearer secret",
					imageUrl: "https://cdn.example.test/image.png?token=secret#x",
					nested: { secretToken: "secret", keep: true },
				},
			})
		).toEqual({
			prompt: "hello",
			imageUrl: "https://cdn.example.test/image.png",
			nested: { keep: true },
		});
	});

	it("retains a remote job when preparing a retry", () => {
		const store = useCloudTaskStore.getState();
		const id = store.createTask({ kind: "sam3", label: "Mask" });
		store.attachRemote({ id, remoteId: "request-3" });
		store.failTask({ id, error: "network disconnected" });
		store.retryTask({ id });

		expect(useCloudTaskStore.getState().tasks[0]).toMatchObject({
			status: "queued",
			progress: 0,
			remoteId: "request-3",
			retryCount: 1,
			error: undefined,
		});
	});

	it("ignores late progress and completion after cancellation", () => {
		const store = useCloudTaskStore.getState();
		const id = store.createTask({ kind: "transcription", label: "识别字幕" });
		store.startTask({ id });
		store.cancelTask({ id });
		store.updateProgress({ id, progress: 90, message: "late progress" });
		store.completeTask({ id, output: { wordCount: 24 } });
		store.failTask({ id, error: "late failure" });

		const canceledTask = useCloudTaskStore.getState().tasks[0];
		expect(canceledTask).toMatchObject({
			status: "canceled",
			message: "已取消",
			progress: 0,
		});
		expect(canceledTask.output).toBeUndefined();
		expect(canceledTask.error).toBeUndefined();
	});

	it("clears interrupted tasks with the other ended states", () => {
		const interrupted = normalizeCloudTaskPersistedState({
			value: {
				tasks: [
					{
						id: "task-interrupted",
						kind: "review",
						label: "视频审片",
						status: "running",
						progress: 20,
						message: "running",
						payload: {},
						retryCount: 0,
						createdAt: 1,
						updatedAt: 2,
					},
				],
			},
		}).tasks;
		useCloudTaskStore.setState({ tasks: interrupted });

		useCloudTaskStore.getState().clearFinished();

		expect(useCloudTaskStore.getState().tasks).toEqual([]);
	});
});
