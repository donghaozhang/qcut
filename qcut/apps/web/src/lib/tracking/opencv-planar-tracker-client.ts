import type { PlanarQuad } from "@qcut/editor-core";
import OpenCvPlanarTrackerWorker from "./opencv-planar-tracker-worker?worker&inline";
import {
	DEFAULT_PLANAR_TRACKER_CONFIGURATION,
	type PlanarAnalysisFrame,
	type PlanarTrackerBeginResult,
	type PlanarTrackerConfiguration,
	type PlanarTrackerStepResult,
	type PlanarTrackerWorkerRequest,
	type PlanarTrackerWorkerResponse,
} from "./planar-tracker-protocol";

interface PendingRequest {
	reject: (error: Error) => void;
	resolve: (response: PlanarTrackerWorkerResponse) => void;
}

function openCvRuntimeUrl(): string {
	return new URL(
		`${import.meta.env.BASE_URL}opencv/opencv.js`,
		document.baseURI
	).href;
}

export class OpenCvPlanarTrackerClient {
	private readonly worker: Worker;
	private requestId = 0;
	private disposed = false;
	private initializePromise?: Promise<{ providerVersion: string }>;
	private readonly pending = new Map<number, PendingRequest>();

	constructor({
		createWorker = () =>
			new OpenCvPlanarTrackerWorker({
				name: "qcut-opencv-planar-tracker",
			}),
	}: {
		createWorker?: () => Worker;
	} = {}) {
		this.worker = createWorker();
		this.worker.addEventListener("message", this.handleMessage);
		this.worker.addEventListener("error", this.handleWorkerError);
	}

	private handleMessage = (
		event: MessageEvent<PlanarTrackerWorkerResponse>
	): void => {
		const pending = this.pending.get(event.data.id);
		if (!pending) return;
		this.pending.delete(event.data.id);
		if (event.data.type === "error") {
			const error = new Error(event.data.message);
			if (event.data.code) Reflect.set(error, "code", event.data.code);
			pending.reject(error);
			return;
		}
		pending.resolve(event.data);
	};

	private handleWorkerError = (event: ErrorEvent): void => {
		this.rejectPending({
			error: new Error(event.message || "OpenCV planar worker failed."),
		});
	};

	private rejectPending({ error }: { error: Error }): void {
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
	}

	private request({
		message,
		transfer = [],
	}: {
		message: PlanarTrackerWorkerRequest;
		transfer?: Transferable[];
	}): Promise<PlanarTrackerWorkerResponse> {
		if (this.disposed) {
			return Promise.reject(new Error("OpenCV planar tracker was disposed."));
		}
		const response = new Promise<PlanarTrackerWorkerResponse>(
			(resolve, reject) => {
				this.pending.set(message.id, { reject, resolve });
			}
		);
		this.worker.postMessage(message, transfer);
		return response;
	}

	initialize(): Promise<{ providerVersion: string }> {
		this.initializePromise ??= (async () => {
			const response = await this.request({
				message: {
					id: ++this.requestId,
					runtimeUrl: openCvRuntimeUrl(),
					type: "initialize",
				},
			});
			if (response.type !== "initialized") {
				throw new Error("OpenCV planar worker returned an invalid response.");
			}
			return response.result;
		})();
		return this.initializePromise;
	}

	async begin({
		configuration = DEFAULT_PLANAR_TRACKER_CONFIGURATION,
		frame,
		seedQuad,
	}: {
		configuration?: PlanarTrackerConfiguration;
		frame: PlanarAnalysisFrame;
		seedQuad: PlanarQuad;
	}): Promise<PlanarTrackerBeginResult> {
		await this.initialize();
		const response = await this.request({
			message: {
				configuration,
				frame,
				id: ++this.requestId,
				seedQuad,
				type: "begin",
			},
			transfer: [frame.gray.buffer],
		});
		if (response.type !== "begun") {
			throw new Error(
				"OpenCV planar worker returned an invalid begin response."
			);
		}
		return response.result;
	}

	async track({
		frame,
	}: {
		frame: PlanarAnalysisFrame;
	}): Promise<PlanarTrackerStepResult> {
		const response = await this.request({
			message: { frame, id: ++this.requestId, type: "track" },
			transfer: [frame.gray.buffer],
		});
		if (response.type !== "tracked") {
			throw new Error(
				"OpenCV planar worker returned an invalid track response."
			);
		}
		return response.result;
	}

	async reset(): Promise<void> {
		const response = await this.request({
			message: { id: ++this.requestId, type: "reset" },
		});
		if (response.type !== "reset") {
			throw new Error(
				"OpenCV planar worker returned an invalid reset response."
			);
		}
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		try {
			await this.request({
				message: { id: ++this.requestId, type: "dispose" },
			});
		} finally {
			this.disposed = true;
			this.worker.removeEventListener("message", this.handleMessage);
			this.worker.removeEventListener("error", this.handleWorkerError);
			this.worker.terminate();
			this.rejectPending({
				error: new Error("OpenCV planar tracker was disposed."),
			});
		}
	}

	terminate(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.worker.terminate();
		this.rejectPending({
			error: new Error("OpenCV planar tracker was terminated."),
		});
	}
}
