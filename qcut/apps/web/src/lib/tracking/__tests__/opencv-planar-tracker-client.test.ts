import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenCvPlanarTrackerClient } from "../opencv-planar-tracker-client";
import type {
	PlanarTrackerWorkerRequest,
	PlanarTrackerWorkerResponse,
} from "../planar-tracker-protocol";

class WorkerHarness extends EventTarget {
	readonly terminate = vi.fn();
	private readonly onPostMessage: (input: {
		message: PlanarTrackerWorkerRequest;
	}) => void;

	constructor({
		onPostMessage,
	}: {
		onPostMessage: (input: { message: PlanarTrackerWorkerRequest }) => void;
	}) {
		super();
		this.onPostMessage = onPostMessage;
	}

	postMessage(message: PlanarTrackerWorkerRequest): void {
		this.onPostMessage({ message });
	}

	respond({ response }: { response: PlanarTrackerWorkerResponse }): void {
		this.dispatchEvent(new MessageEvent("message", { data: response }));
	}
}

afterEach(() => {
	vi.useRealTimers();
});

describe("OpenCvPlanarTrackerClient", () => {
	it("rejects a synchronous send failure and allows initialization to retry", async () => {
		const sendFailure = new DOMException("detached buffer", "DataCloneError");
		let attempts = 0;
		let worker: WorkerHarness;
		worker = new WorkerHarness({
			onPostMessage: ({ message }) => {
				attempts += 1;
				if (attempts === 1) throw sendFailure;
				queueMicrotask(() =>
					worker.respond({
						response: {
							id: message.id,
							result: { providerVersion: "test" },
							type: "initialized",
						},
					})
				);
			},
		});
		const client = new OpenCvPlanarTrackerClient({
			createWorker: () => worker as unknown as Worker,
		});

		await expect(client.initialize()).rejects.toMatchObject({
			cause: sendFailure,
			message: "OpenCV planar worker request failed.",
		});
		await expect(client.initialize()).resolves.toEqual({
			providerVersion: "test",
		});
		expect(attempts).toBe(2);
		client.terminate();
	});

	it("terminates when the worker does not acknowledge disposal", async () => {
		vi.useFakeTimers();
		const worker = new WorkerHarness({ onPostMessage: () => undefined });
		const client = new OpenCvPlanarTrackerClient({
			createWorker: () => worker as unknown as Worker,
		});

		const disposal = expect(client.dispose()).rejects.toThrow(
			"OpenCV planar worker disposal timed out."
		);
		await vi.advanceTimersByTimeAsync(1_000);

		await disposal;
		expect(worker.terminate).toHaveBeenCalledOnce();
	});
});
