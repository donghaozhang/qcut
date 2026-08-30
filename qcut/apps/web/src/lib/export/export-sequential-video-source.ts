/**
 * Sequential video frame source for exports.
 *
 * The legacy export path seeks an HTMLVideoElement for every frame. A seek is
 * random access: Chromium re-decodes from the previous keyframe, so long-GOP
 * sources cost O(GOP) decodes per exported frame. Exports walk source time
 * monotonically, so decoding sequentially with mediabunny's CanvasSink turns
 * that into O(1) decodes per frame.
 *
 * Callers ask for the frame covering a source timestamp. Backwards jumps and
 * large forward gaps restart the decode iterator (a keyframe-accurate seek);
 * anything unsupported reports `null` so the caller can fall back to the
 * seek-based path. Failure is never silent feature loss — the same pixels
 * come from the same file either way.
 */

import { debugWarn } from "@/lib/debug/debug-config";
import type { MediaItem } from "@/stores/media/media-store-types";
import { exportProfiler } from "./export-profiler";

interface WrappedCanvasFrame {
	canvas: HTMLCanvasElement | OffscreenCanvas;
	timestamp: number;
	duration: number;
}

interface CanvasFrameIterator {
	next(): Promise<IteratorResult<WrappedCanvasFrame>>;
	return?(value?: unknown): Promise<IteratorResult<WrappedCanvasFrame>>;
}

interface MediabunnyInputHandle {
	dispose?: () => void | Promise<void>;
}

/** Forward gap beyond which restarting (keyframe seek) beats decoding through. */
const RESTART_GAP_SECONDS = 1;
/** Small tolerance for float timestamp comparisons. */
const TIME_EPSILON_SECONDS = 0.001;
/** Pooled canvases: current + lookahead + one margin. */
const CANVAS_POOL_SIZE = 3;

export class SequentialVideoFrameSource {
	private iterator: CanvasFrameIterator | null = null;
	private current: WrappedCanvasFrame | null = null;
	private lookahead: WrappedCanvasFrame | null | undefined;

	private constructor(
		private readonly input: MediabunnyInputHandle,
		private readonly makeIterator: (
			startTimestamp: number
		) => CanvasFrameIterator
	) {}

	/** Opens a source for one media file; null when the file can't decode. */
	static async open({
		blob,
	}: {
		blob: Blob;
	}): Promise<SequentialVideoFrameSource | null> {
		try {
			const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import(
				"mediabunny"
			);
			const input = new Input({
				source: new BlobSource(blob),
				formats: ALL_FORMATS,
			});
			const track = await input.getPrimaryVideoTrack();
			if (!track) return null;
			if ((await track.canDecode()) !== true) return null;
			const sink = new CanvasSink(track, { poolSize: CANVAS_POOL_SIZE });
			return new SequentialVideoFrameSource(
				input as MediabunnyInputHandle,
				(startTimestamp) =>
					sink.canvases(startTimestamp) as unknown as CanvasFrameIterator
			);
		} catch (error) {
			debugWarn(
				"[SequentialVideoFrameSource] open failed; using seek fallback",
				error
			);
			return null;
		}
	}

	private async restart(timeSeconds: number): Promise<void> {
		await this.iterator?.return?.();
		this.iterator = this.makeIterator(Math.max(0, timeSeconds));
		this.lookahead = undefined;
		const first = await this.iterator.next();
		this.current = first.done ? null : first.value;
		exportProfiler.count("sequential-video-restart");
	}

	/**
	 * Coverage is half-open with the epsilon on the *newer* side:
	 * [start - ε, start + duration - ε). A request landing exactly on a frame
	 * boundary (a 2x clip with a frame-aligned trim hits one every frame)
	 * resolves to the frame that starts there — the frame an HTMLVideoElement
	 * seek displays — instead of holding the previous frame one frame stale.
	 */
	private frameCovers(frame: WrappedCanvasFrame, timeSeconds: number): boolean {
		return (
			timeSeconds >= frame.timestamp - TIME_EPSILON_SECONDS &&
			timeSeconds < frame.timestamp + frame.duration - TIME_EPSILON_SECONDS
		);
	}

	/**
	 * Returns the decoded frame covering `timeSeconds`, advancing the decoder
	 * sequentially. Null when the source has no frame there.
	 */
	async frameAt(timeSeconds: number): Promise<WrappedCanvasFrame | null> {
		if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return null;
		const needsRestart =
			!this.iterator ||
			!this.current ||
			timeSeconds < this.current.timestamp - TIME_EPSILON_SECONDS ||
			timeSeconds >
				this.current.timestamp + this.current.duration + RESTART_GAP_SECONDS;
		if (needsRestart) {
			await this.restart(timeSeconds);
		} else {
			exportProfiler.count("sequential-video-advance");
		}
		if (!this.iterator || !this.current) return null;

		while (!this.frameCovers(this.current, timeSeconds)) {
			if (this.lookahead === undefined) {
				const next = await this.iterator.next();
				this.lookahead = next.done ? null : next.value;
			}
			if (this.lookahead === null) {
				// Past the last sample: the final frame stays valid (videos often
				// end a hair before the element's trimmed duration).
				return this.current;
			}
			if (this.lookahead.timestamp > timeSeconds + TIME_EPSILON_SECONDS) {
				// The requested time falls inside a gap before the next sample;
				// hold the current frame, exactly like a paused video element.
				return this.current;
			}
			this.current = this.lookahead;
			this.lookahead = undefined;
		}
		return this.current;
	}

	async dispose(): Promise<void> {
		try {
			await this.iterator?.return?.();
		} catch {
			// Iterator teardown is best-effort.
		}
		this.iterator = null;
		this.current = null;
		this.lookahead = undefined;
		try {
			await this.input.dispose?.();
		} catch {
			// Input teardown is best-effort.
		}
	}
}

let sequentialDecodeDisabled = false;

/** Debug switch: force the seek fallback (used for baseline profiling). */
export function setSequentialDecodeDisabled(disabled: boolean): void {
	sequentialDecodeDisabled = disabled;
}

/** Per-export registry: one sequential source per media item (and lane), or null. */
export class SequentialVideoRegistry {
	private readonly sources = new Map<
		string,
		Promise<SequentialVideoFrameSource | null>
	>();

	/**
	 * Opens (once) the sequential source for a media item. A lane keeps a
	 * second decoder for the same file so two clips reading far-apart
	 * timestamps in the same frame (a transition's incoming clip) don't
	 * restart the outgoing clip's decoder every frame.
	 */
	getOrOpen(
		mediaItem: MediaItem,
		lane?: string
	): Promise<SequentialVideoFrameSource | null> {
		if (sequentialDecodeDisabled) return Promise.resolve(null);
		const key = lane ? `${mediaItem.id}#${lane}` : mediaItem.id;
		const existing = this.sources.get(key);
		if (existing) return existing;
		const opened = (async () => {
			const blob = await resolveMediaBlob(mediaItem);
			if (!blob) return null;
			const source = await SequentialVideoFrameSource.open({ blob });
			exportProfiler.count(
				source ? "sequential-video-open" : "sequential-video-fallback"
			);
			return source;
		})();
		this.sources.set(key, opened);
		return opened;
	}

	async disposeAll(): Promise<void> {
		const pending = [...this.sources.values()];
		this.sources.clear();
		await Promise.all(
			pending.map(async (promise) => {
				try {
					await (await promise)?.dispose();
				} catch {
					// Disposal is best-effort.
				}
			})
		);
	}
}

async function resolveMediaBlob(mediaItem: MediaItem): Promise<Blob | null> {
	if (mediaItem.file instanceof Blob) return mediaItem.file;
	if (!mediaItem.url) return null;
	try {
		const response = await fetch(mediaItem.url);
		if (!response.ok) return null;
		return await response.blob();
	} catch {
		return null;
	}
}
