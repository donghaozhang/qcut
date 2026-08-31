import type {
	Input,
	InputVideoTrack,
	VideoSample,
	VideoSampleSink,
} from "mediabunny";
import type { PlanarAnalysisFrame } from "./planar-tracker-protocol";

export interface PlanarFrameSourceMetadata {
	analysisHeight: number;
	analysisWidth: number;
	endPtsUs: number;
	firstPtsUs: number;
	sourceDisplayHeight: number;
	sourceDisplayWidth: number;
}

export interface PlanarFrameSource {
	backwardFrames: ({
		beforePtsUs,
		startPtsUs,
		signal,
	}: {
		beforePtsUs: number;
		startPtsUs: number;
		signal?: AbortSignal;
	}) => AsyncGenerator<PlanarAnalysisFrame>;
	dispose: () => Promise<void>;
	forwardFrames: ({
		afterPtsUs,
		endPtsUs,
		signal,
	}: {
		afterPtsUs: number;
		endPtsUs: number;
		signal?: AbortSignal;
	}) => AsyncGenerator<PlanarAnalysisFrame>;
	frameAt: ({
		ptsUs,
		signal,
	}: {
		ptsUs: number;
		signal?: AbortSignal;
	}) => Promise<PlanarAnalysisFrame>;
	metadata: () => Promise<PlanarFrameSourceMetadata>;
}

interface OpenFrameSourceState {
	canvas: HTMLCanvasElement | OffscreenCanvas;
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	input: Input;
	metadata: PlanarFrameSourceMetadata;
	sink: VideoSampleSink;
	track: InputVideoTrack;
}

function createCanvas({ height, width }: { height: number; width: number }): {
	canvas: HTMLCanvasElement | OffscreenCanvas;
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
	if (typeof OffscreenCanvas !== "undefined") {
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Unable to create planar analysis canvas.");
		return { canvas, context };
	}
	if (typeof document === "undefined") {
		throw new Error("Planar analysis canvas is unavailable.");
	}
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) throw new Error("Unable to create planar analysis canvas.");
	return { canvas, context };
}

export function rgbaToPlanarGrayscale({
	rgba,
}: {
	rgba: Uint8ClampedArray;
}): Uint8Array {
	const gray = new Uint8Array(rgba.length / 4);
	for (let index = 0; index < gray.length; index += 1) {
		const offset = index * 4;
		gray[index] = Math.round(
			rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114
		);
	}
	return gray;
}

function secondsFromPts({ ptsUs }: { ptsUs: number }): number {
	return ptsUs / 1_000_000;
}

export class MediabunnyPlanarFrameSource implements PlanarFrameSource {
	private readonly file: File;
	private readonly maxAnalysisHeight: number;
	private readonly maxAnalysisWidth: number;
	private statePromise?: Promise<OpenFrameSourceState>;

	constructor({
		file,
		maxAnalysisHeight = 540,
		maxAnalysisWidth = 960,
	}: {
		file: File;
		maxAnalysisHeight?: number;
		maxAnalysisWidth?: number;
	}) {
		this.file = file;
		this.maxAnalysisHeight = maxAnalysisHeight;
		this.maxAnalysisWidth = maxAnalysisWidth;
	}

	private async open(): Promise<OpenFrameSourceState> {
		if (this.statePromise) return this.statePromise;
		this.statePromise = (async () => {
			const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import(
				"mediabunny"
			);
			const input = new Input({
				formats: ALL_FORMATS,
				source: new BlobSource(this.file),
			});
			try {
				const track = await input.getPrimaryVideoTrack();
				if (!track) throw new Error("The selected media has no video track.");
				const scale = Math.min(
					1,
					this.maxAnalysisWidth / track.displayWidth,
					this.maxAnalysisHeight / track.displayHeight
				);
				const analysisWidth = Math.max(
					1,
					Math.round(track.displayWidth * scale)
				);
				const analysisHeight = Math.max(
					1,
					Math.round(track.displayHeight * scale)
				);
				const [firstTimestamp, duration] = await Promise.all([
					track.getFirstTimestamp(),
					track.computeDuration(),
				]);
				const { canvas, context } = createCanvas({
					height: analysisHeight,
					width: analysisWidth,
				});
				return {
					canvas,
					context,
					input,
					metadata: {
						analysisHeight,
						analysisWidth,
						endPtsUs: Math.round((firstTimestamp + duration) * 1_000_000),
						firstPtsUs: Math.round(firstTimestamp * 1_000_000),
						sourceDisplayHeight: track.displayHeight,
						sourceDisplayWidth: track.displayWidth,
					},
					sink: new VideoSampleSink(track),
					track,
				};
			} catch (cause) {
				input.dispose();
				throw cause;
			}
		})();
		return this.statePromise;
	}

	private renderFrame({
		sample,
		state,
	}: {
		sample: VideoSample;
		state: OpenFrameSourceState;
	}): PlanarAnalysisFrame {
		const { analysisHeight, analysisWidth } = state.metadata;
		state.context.clearRect(0, 0, analysisWidth, analysisHeight);
		sample.draw(state.context, 0, 0, analysisWidth, analysisHeight);
		const rgba = state.context.getImageData(
			0,
			0,
			analysisWidth,
			analysisHeight
		).data;
		return {
			gray: rgbaToPlanarGrayscale({ rgba }),
			height: analysisHeight,
			ptsUs: sample.microsecondTimestamp,
			width: analysisWidth,
		};
	}

	async metadata(): Promise<PlanarFrameSourceMetadata> {
		return (await this.open()).metadata;
	}

	async frameAt({
		ptsUs,
		signal,
	}: {
		ptsUs: number;
		signal?: AbortSignal;
	}): Promise<PlanarAnalysisFrame> {
		signal?.throwIfAborted();
		const state = await this.open();
		const sample = await state.sink.getSample(secondsFromPts({ ptsUs }));
		if (!sample) throw new Error("No video frame exists at the seed PTS.");
		try {
			signal?.throwIfAborted();
			return this.renderFrame({ sample, state });
		} finally {
			sample.close();
		}
	}

	async *forwardFrames({
		afterPtsUs,
		endPtsUs,
		signal,
	}: {
		afterPtsUs: number;
		endPtsUs: number;
		signal?: AbortSignal;
	}): AsyncGenerator<PlanarAnalysisFrame> {
		const state = await this.open();
		for await (const sample of state.sink.samples(
			secondsFromPts({ ptsUs: afterPtsUs }),
			secondsFromPts({ ptsUs: endPtsUs + 1 })
		)) {
			try {
				signal?.throwIfAborted();
				if (sample.microsecondTimestamp <= afterPtsUs) continue;
				yield this.renderFrame({ sample, state });
			} finally {
				sample.close();
			}
		}
	}

	async *backwardFrames({
		beforePtsUs,
		startPtsUs,
		signal,
	}: {
		beforePtsUs: number;
		startPtsUs: number;
		signal?: AbortSignal;
	}): AsyncGenerator<PlanarAnalysisFrame> {
		const state = await this.open();
		const timestamps: number[] = [];
		for await (const sample of state.sink.samples(
			secondsFromPts({ ptsUs: startPtsUs }),
			secondsFromPts({ ptsUs: beforePtsUs + 1 })
		)) {
			try {
				signal?.throwIfAborted();
				if (
					sample.microsecondTimestamp >= startPtsUs &&
					sample.microsecondTimestamp < beforePtsUs
				) {
					timestamps.push(sample.timestamp);
				}
			} finally {
				sample.close();
			}
		}
		timestamps.reverse();
		for await (const sample of state.sink.samplesAtTimestamps(timestamps)) {
			if (!sample) continue;
			try {
				signal?.throwIfAborted();
				yield this.renderFrame({ sample, state });
			} finally {
				sample.close();
			}
		}
	}

	async dispose(): Promise<void> {
		const state = await this.statePromise;
		state?.input.dispose();
		this.statePromise = undefined;
	}
}
