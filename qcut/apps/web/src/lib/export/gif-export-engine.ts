/**
 * Browser-side GIF export engine using gif.js Web Workers.
 *
 * Complements the FFmpeg palette-based gif-convert.ts (server-side)
 * with a client-side encoder for browser-based export and preview.
 */
import GIF from "gif.js";

export interface GifExportEngineConfig {
	width: number;
	height: number;
	/** Frame rate — 15, 20, 25, or 30 fps */
	frameRate: number;
	/** true = infinite loop, false = play once */
	loop: boolean;
	/** gif.js quality: 1–20 (lower = better visual quality, slower) */
	quality: number;
	/** Progress callback (0–1) */
	onProgress?: (pct: number) => void;
}

const MAX_WORKERS = 8;
const DEFAULT_QUALITY = 10;

export class GifExportEngine {
	private gif: GIF;
	private frameDelay: number;
	private onProgress?: (pct: number) => void;

	constructor(config: GifExportEngineConfig) {
		const workerCount = Math.min(
			navigator.hardwareConcurrency || 4,
			MAX_WORKERS
		);
		this.frameDelay = Math.round(1000 / config.frameRate);
		this.onProgress = config.onProgress;

		this.gif = new GIF({
			workers: workerCount,
			quality: config.quality || DEFAULT_QUALITY,
			width: config.width,
			height: config.height,
			repeat: config.loop ? 0 : -1,
			dither: "FloydSteinberg",
		});
	}

	/** Add a rendered frame to the GIF. The canvas is copied immediately. */
	addFrame(canvas: HTMLCanvasElement): void {
		this.gif.addFrame(canvas, { delay: this.frameDelay, copy: true });
	}

	/** Encode all added frames and return the GIF blob. */
	async render(): Promise<Blob> {
		return new Promise<Blob>((resolve, reject) => {
			this.gif.on("finished", (blob: Blob) => resolve(blob));
			if (this.onProgress) {
				this.gif.on("progress", this.onProgress);
			}
			try {
				this.gif.render();
			} catch (err) {
				reject(err);
			}
		});
	}

	/** Abort an in-progress render. */
	abort(): void {
		try {
			this.gif.abort();
		} catch {
			// gif.js may throw if not rendering
		}
	}

	/** Frame delay in milliseconds derived from frame rate. */
	get delay(): number {
		return this.frameDelay;
	}
}
