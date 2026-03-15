/** Renderer-side cursor telemetry types (no Node.js dependencies). */

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
