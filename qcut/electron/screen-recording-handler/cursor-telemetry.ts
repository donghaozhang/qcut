import { screen } from "electron";
import { log } from "./logger.js";

export interface CursorTelemetryPoint {
	t: number;
	x: number;
	y: number;
	p: boolean;
	c?: string;
}

export interface CursorTelemetryData {
	version: 1;
	captureRect: { x: number; y: number; width: number; height: number };
	points: CursorTelemetryPoint[];
}

const POLL_INTERVAL_MS = 16; // ~60Hz

/**
 * Records cursor position at ~60Hz alongside a screen recording session.
 *
 * Uses uiohook-napi for mouse events when available, falling back to
 * Electron's screen.getCursorScreenPoint() polling.
 */
export class CursorTelemetryRecorder {
	private recording = false;
	private startTime = 0;
	private points: CursorTelemetryPoint[] = [];
	private captureRect = { x: 0, y: 0, width: 1920, height: 1080 };
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private pressed = false;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private uiohook: any = null;

	start(captureRect: {
		x: number;
		y: number;
		width: number;
		height: number;
	}): void {
		if (this.recording) return;

		this.recording = true;
		this.startTime = Date.now();
		this.points = [];
		this.captureRect = captureRect;
		this.pressed = false;

		this.startCapture();
	}

	stop(): CursorTelemetryData {
		this.recording = false;
		this.stopCapture();

		const data: CursorTelemetryData = {
			version: 1,
			captureRect: { ...this.captureRect },
			points: this.points,
		};
		this.points = [];
		return data;
	}

	isRecording(): boolean {
		return this.recording;
	}

	private startCapture(): void {
		// Always poll for position at ~60Hz (works even when cursor is stationary)
		this.startPollingCapture();

		// Optionally use uiohook-napi for press/release state
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		try {
			this.uiohook = require("uiohook-napi");
			this.startUIOHookPressTracking();
		} catch {
			log.warn(
				"[CursorTelemetry] uiohook-napi unavailable, press state will not be tracked"
			);
		}
	}

	/** Use uiohook only for tracking mouse press/release state. */
	private startUIOHookPressTracking(): void {
		if (!this.uiohook) return;

		const { uIOhook } = this.uiohook;

		const onMouseDown = () => {
			if (!this.recording) return;
			this.pressed = true;
		};

		const onMouseUp = () => {
			if (!this.recording) return;
			this.pressed = false;
		};

		uIOhook.on("mousedown", onMouseDown);
		uIOhook.on("mouseup", onMouseUp);
		uIOhook.start();
	}

	private startPollingCapture(): void {
		this.pollTimer = setInterval(() => {
			if (!this.recording) return;
			try {
				const point = screen.getCursorScreenPoint();
				const t = Date.now() - this.startTime;
				this.points.push({ t, x: point.x, y: point.y, p: this.pressed });
			} catch {
				// Ignore transient errors during polling
			}
		}, POLL_INTERVAL_MS);
	}

	private stopCapture(): void {
		if (this.uiohook) {
			try {
				this.uiohook.uIOhook.stop();
			} catch {
				// best-effort stop
			}
			this.uiohook = null;
		}

		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	}
}

/**
 * Determine the capture rectangle for a given recording source.
 * Falls back to primary display bounds.
 */
export function getCaptureRect(sourceId: string): {
	x: number;
	y: number;
	width: number;
	height: number;
} {
	try {
		const displays = screen.getAllDisplays();

		// Screen sources have format "screen:0:0" — extract displayId
		if (sourceId.startsWith("screen:")) {
			const displayId = sourceId.split(":")[1];
			const display = displays.find((d) => String(d.id) === displayId);
			if (display) return display.bounds;
		}

		// Fallback to primary display
		const primary = screen.getPrimaryDisplay();
		return primary.bounds;
	} catch {
		return { x: 0, y: 0, width: 1920, height: 1080 };
	}
}
