/**
 * JSONL Streaming Output
 *
 * Emits structured JSONL progress events during pipeline execution.
 * Progress events go to stderr, final results go to stdout.
 *
 * Ported from: cli/stream.py
 *
 * @module electron/native-pipeline/stream-emitter
 */

const SCHEMA_VERSION = "1";

export interface StreamEvent {
	schema_version: string;
	event: string;
	timestamp: number;
	/** @deprecated Use duration_ms instead. Kept for backward compatibility. */
	elapsed_seconds: number;
	/** Elapsed time in milliseconds (integer). */
	duration_ms: number;
	[key: string]: unknown;
}

export interface StreamEmitterOptions {
	enabled?: boolean;
	stream?: NodeJS.WriteStream;
}

export class StreamEmitter {
	private enabled: boolean;
	private startTime: number;
	private stream: NodeJS.WriteStream;

	constructor(options: StreamEmitterOptions = {}) {
		this.enabled = options.enabled ?? false;
		this.startTime = Date.now();
		this.stream = options.stream ?? process.stderr;
	}

	private emit(eventType: string, data: Record<string, unknown>): void {
		if (!this.enabled) return;

		const elapsedMs = Date.now() - this.startTime;
		const event: StreamEvent = {
			schema_version: SCHEMA_VERSION,
			event: eventType,
			timestamp: Date.now() / 1000,
			elapsed_seconds: Number((elapsedMs / 1000).toFixed(3)),
			duration_ms: Math.round(elapsedMs),
			...data,
		};

		this.stream.write(JSON.stringify(event) + "\n");
	}

	pipelineStart(name: string, totalSteps: number, config?: string): void {
		this.emit("pipeline_start", {
			pipeline: name,
			total_steps: totalSteps,
			...(config ? { config } : {}),
		});
	}

	stepStart(stepIndex: number, stepType: string, model?: string): void {
		this.emit("step_start", {
			step_index: stepIndex,
			step_type: stepType,
			...(model ? { model } : {}),
		});
	}

	stepProgress(stepIndex: number, percent: number, message?: string): void {
		this.emit("step_progress", {
			step_index: stepIndex,
			percent,
			...(message ? { message } : {}),
		});
	}

	stepComplete(
		stepIndex: number,
		cost = 0,
		outputPath?: string,
		duration = 0
	): void {
		this.emit("step_complete", {
			step_index: stepIndex,
			cost,
			duration,
			...(outputPath ? { output_path: outputPath } : {}),
		});
	}

	stepError(stepIndex: number, error: string, stepType?: string): void {
		this.emit("step_error", {
			step_index: stepIndex,
			error,
			...(stepType ? { step_type: stepType } : {}),
		});
	}

	/** Emit final pipeline result to stdout (not stderr). */
	pipelineComplete(result: Record<string, unknown>): void {
		if (!this.enabled) return;

		const elapsedMs = Date.now() - this.startTime;
		const event: StreamEvent = {
			schema_version: SCHEMA_VERSION,
			event: "pipeline_complete",
			timestamp: Date.now() / 1000,
			elapsed_seconds: Number((elapsedMs / 1000).toFixed(3)),
			duration_ms: Math.round(elapsedMs),
			...result,
		};

		// Final result goes to stdout for piping
		process.stdout.write(JSON.stringify(event) + "\n");
	}
}

/**
 * No-op emitter for when streaming is disabled.
 * All methods are pass-through.
 */
export class NullEmitter extends StreamEmitter {
	constructor() {
		super({ enabled: false });
	}
}
