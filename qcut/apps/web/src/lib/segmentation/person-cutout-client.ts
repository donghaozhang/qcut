import {
	processPersonConfidenceMask,
	type PersonCutoutMaskOptions,
} from "./person-cutout-mask";
import type {
	PersonCutoutWorkerRequest,
	PersonCutoutWorkerResponse,
} from "./person-cutout-worker-types";

export interface PersonCutoutFrameResult {
	alpha: Float32Array;
	width: number;
	height: number;
	inferenceMs: number;
}

function publicAssetUrl(relativePath: string): string {
	return new URL(`${import.meta.env.BASE_URL}${relativePath}`, document.baseURI)
		.href;
}

export class PersonCutoutClient {
	private worker: Worker | null = null;
	private workerObjectUrl: string | null = null;
	private initializePromise: Promise<void> | null = null;
	private requestId = 0;
	private temporalState: Float32Array | undefined;
	private lastSourceTimestampMs = Number.NEGATIVE_INFINITY;
	private pending = new Map<
		number,
		{
			resolve: (result: PersonCutoutFrameResult) => void;
			reject: (error: Error) => void;
			options: PersonCutoutMaskOptions;
			sourceTimestampMs: number;
		}
	>();

	initialize(): Promise<void> {
		if (this.initializePromise) return this.initializePromise;
		this.initializePromise = this.initializeWorker();
		return this.initializePromise;
	}

	private async initializeWorker(): Promise<void> {
		const workerResponse = await fetch(
			publicAssetUrl("mediapipe/person-cutout-worker.js")
		);
		if (!workerResponse.ok) {
			throw new Error(
				`Failed to load person cutout worker (${workerResponse.status})`
			);
		}
		const workerSource = await workerResponse.text();
		this.workerObjectUrl = URL.createObjectURL(
			new Blob([workerSource], { type: "text/javascript" })
		);

		return new Promise((resolve, reject) => {
			const worker = new Worker(this.workerObjectUrl!, {
				name: "qcut-person-cutout",
			});
			this.worker = worker;
			const handleInitialMessage = (
				event: MessageEvent<PersonCutoutWorkerResponse>
			) => {
				if (event.data.type === "ready") {
					worker.removeEventListener("message", handleInitialMessage);
					resolve();
				} else if (event.data.type === "error" && !event.data.requestId) {
					worker.removeEventListener("message", handleInitialMessage);
					reject(new Error(event.data.message));
				}
			};
			worker.addEventListener("message", handleInitialMessage);
			worker.addEventListener("message", this.handleMessage);
			worker.addEventListener("error", (event) => {
				const location = event.filename
					? ` (${event.filename}:${event.lineno}:${event.colno})`
					: "";
				reject(
					new Error(
						`${event.message || "Person cutout worker failed"}${location}`
					)
				);
			});
			const message: PersonCutoutWorkerRequest = {
				type: "initialize",
				wasmRoot: publicAssetUrl("mediapipe/wasm"),
				modelUrl: publicAssetUrl("models/person-segmentation.tflite"),
				visionBundleUrl: publicAssetUrl("mediapipe/vision_bundle.cjs.js"),
			};
			worker.postMessage(message);
		});
	}

	private handleMessage = (event: MessageEvent<PersonCutoutWorkerResponse>) => {
		const message = event.data;
		if (message.type === "result") {
			const pending = this.pending.get(message.requestId);
			if (!pending) return;
			this.pending.delete(message.requestId);
			const discontinuity =
				pending.sourceTimestampMs <= this.lastSourceTimestampMs ||
				Math.abs(pending.sourceTimestampMs - this.lastSourceTimestampMs) > 250;
			if (discontinuity) this.temporalState = undefined;
			this.lastSourceTimestampMs = pending.sourceTimestampMs;
			const processed = processPersonConfidenceMask({
				personConfidence: message.personConfidence,
				width: message.width,
				height: message.height,
				previous: this.temporalState,
				options: pending.options,
			});
			this.temporalState = processed.temporalState;
			pending.resolve({
				alpha: processed.alpha,
				width: message.width,
				height: message.height,
				inferenceMs: message.inferenceMs,
			});
		} else if (message.type === "error" && message.requestId !== undefined) {
			const pending = this.pending.get(message.requestId);
			if (!pending) return;
			this.pending.delete(message.requestId);
			pending.reject(new Error(message.message));
		}
	};

	async segment({
		frame,
		sourceTimestampMs,
		options,
	}: {
		frame: ImageBitmap;
		sourceTimestampMs: number;
		options: PersonCutoutMaskOptions;
	}): Promise<PersonCutoutFrameResult> {
		await this.initialize();
		if (!this.worker) throw new Error("Person cutout worker is unavailable");
		const requestId = ++this.requestId;
		const result = new Promise<PersonCutoutFrameResult>((resolve, reject) => {
			this.pending.set(requestId, {
				resolve,
				reject,
				options,
				sourceTimestampMs,
			});
		});
		const message: PersonCutoutWorkerRequest = {
			type: "segment",
			requestId,
			frame,
			sourceTimestampMs,
		};
		this.worker.postMessage(message, [frame]);
		return result;
	}

	reset() {
		this.temporalState = undefined;
		this.lastSourceTimestampMs = Number.NEGATIVE_INFINITY;
		this.worker?.postMessage({
			type: "reset",
		} satisfies PersonCutoutWorkerRequest);
	}

	dispose() {
		this.worker?.postMessage({
			type: "close",
		} satisfies PersonCutoutWorkerRequest);
		this.worker?.terminate();
		this.worker = null;
		if (this.workerObjectUrl) {
			URL.revokeObjectURL(this.workerObjectUrl);
			this.workerObjectUrl = null;
		}
		this.initializePromise = null;
		this.temporalState = undefined;
		this.lastSourceTimestampMs = Number.NEGATIVE_INFINITY;
		for (const pending of this.pending.values()) {
			pending.reject(new Error("Person cutout worker was disposed"));
		}
		this.pending.clear();
	}
}
