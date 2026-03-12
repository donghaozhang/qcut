/**
 * Structured debug event stream for CLI command execution.
 *
 * Emits JSONL events to stderr for machine-consumable realtime feedback.
 * Extends the pipeline StreamEmitter pattern to all CLI commands.
 *
 * Events:
 *   command:start  — emitted before command dispatch
 *   command:end    — emitted after command completes (success or failure)
 *
 * @module electron/native-pipeline/infra/debug-stream
 */

export interface DebugEvent {
	event: "command:start" | "command:end";
	command_id: string;
	command: string;
	timestamp: string;
	session_id?: string;
	exit_code?: number;
	duration_ms?: number;
}

export interface DebugStreamOptions {
	/** Enable debug event emission. When false, all methods are no-ops. */
	enabled: boolean;
	/** Session ID for correlation across commands in session mode. */
	sessionId?: string;
	/** Output stream (defaults to stderr). */
	stream?: NodeJS.WriteStream;
}

export class DebugStream {
	private readonly enabled: boolean;
	private readonly sessionId?: string;
	private readonly stream: NodeJS.WriteStream;

	constructor(options: DebugStreamOptions) {
		this.enabled = options.enabled;
		this.sessionId = options.sessionId;
		this.stream = options.stream ?? process.stderr;
	}

	private emit(event: DebugEvent): void {
		if (!this.enabled) return;
		this.stream.write(JSON.stringify(event) + "\n");
	}

	/** Emit a command:start event before dispatch. */
	commandStart(commandId: string, command: string): void {
		const event: DebugEvent = {
			event: "command:start",
			command_id: commandId,
			command,
			timestamp: new Date().toISOString(),
		};
		if (this.sessionId) event.session_id = this.sessionId;
		this.emit(event);
	}

	/** Emit a command:end event after dispatch completes. */
	commandEnd(
		commandId: string,
		command: string,
		exitCode: number,
		durationMs: number
	): void {
		const event: DebugEvent = {
			event: "command:end",
			command_id: commandId,
			command,
			timestamp: new Date().toISOString(),
			exit_code: exitCode,
			duration_ms: durationMs,
		};
		if (this.sessionId) event.session_id = this.sessionId;
		this.emit(event);
	}
}
