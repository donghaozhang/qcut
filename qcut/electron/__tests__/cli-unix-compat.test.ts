/**
 * Tests for Unix compatibility enhancements:
 * - command_id generation
 * - duration_ms standardization
 * - error recovery hints
 * - debug event stream
 * - unified run() entrypoint
 */

import { describe, expect, it } from "vitest";
import {
	generateCommandId,
	type CLIRunOptions,
} from "../native-pipeline/cli/cli-runner/types.js";
import {
	ExitCode,
	AIPlatformError,
	APIKeyError,
	FileOperationError,
	formatErrorForCli,
	getRecoveryHint,
} from "../native-pipeline/output/errors.js";
import { DebugStream } from "../native-pipeline/infra/debug-stream.js";
import { StreamEmitter } from "../native-pipeline/infra/stream-emitter.js";
import { Writable } from "node:stream";

// Helper: capture writes to a writable stream
function createCapture(): { stream: NodeJS.WriteStream; lines: string[] } {
	const lines: string[] = [];
	const stream = new Writable({
		write(chunk, _encoding, callback) {
			const str = chunk.toString();
			for (const line of str.split("\n")) {
				if (line.trim()) lines.push(line);
			}
			callback();
		},
	}) as unknown as NodeJS.WriteStream;
	return { stream, lines };
}

describe("generateCommandId", () => {
	it("returns a string starting with cmd-", () => {
		const id = generateCommandId();
		expect(id).toMatch(/^cmd-\d+-[a-z0-9]+$/);
	});

	it("generates unique IDs", () => {
		const ids = new Set(Array.from({ length: 100 }, () => generateCommandId()));
		expect(ids.size).toBe(100);
	});
});

describe("error recovery hints", () => {
	it("returns hint for API_KEY_MISSING", () => {
		const hint = getRecoveryHint(ExitCode.API_KEY_MISSING);
		expect(hint).toContain("set-key");
	});

	it("returns hint for FILE_NOT_FOUND", () => {
		const hint = getRecoveryHint(ExitCode.FILE_NOT_FOUND);
		expect(hint).toContain("path exists");
	});

	it("returns hint for MODEL_NOT_FOUND", () => {
		const hint = getRecoveryHint(ExitCode.MODEL_NOT_FOUND);
		expect(hint).toContain("list-models");
	});

	it("returns hint for TIMEOUT", () => {
		const hint = getRecoveryHint(ExitCode.TIMEOUT);
		expect(hint).toContain("timeout");
	});

	it("returns undefined for SUCCESS", () => {
		const hint = getRecoveryHint(ExitCode.SUCCESS);
		expect(hint).toBeUndefined();
	});

	it("AIPlatformError carries hint from exit code", () => {
		const err = new APIKeyError("Missing key", "openai");
		expect(err.hint).toContain("set-key");
	});

	it("AIPlatformError accepts custom hint", () => {
		const err = new AIPlatformError(
			"Custom error",
			ExitCode.GENERAL_ERROR,
			"Try this instead"
		);
		expect(err.hint).toBe("Try this instead");
	});

	it("formatErrorForCli includes hint", () => {
		const err = new FileOperationError("Not found", "/tmp/foo.mp4");
		const formatted = formatErrorForCli(err);
		expect(formatted.hint).toContain("path exists");
		expect(formatted.exitCode).toBe(ExitCode.FILE_NOT_FOUND);
	});

	it("formatErrorForCli works with plain Error", () => {
		const err = new Error("something broke");
		const formatted = formatErrorForCli(err);
		expect(formatted.exitCode).toBe(ExitCode.GENERAL_ERROR);
		expect(formatted.message).toBe("something broke");
	});
});

describe("DebugStream", () => {
	it("emits command:start and command:end events", () => {
		const { stream, lines } = createCapture();
		const debug = new DebugStream({ enabled: true, stream });

		debug.commandStart("cmd-123", "generate-image");
		debug.commandEnd("cmd-123", "generate-image", 0, 1500);

		expect(lines).toHaveLength(2);

		const startEvent = JSON.parse(lines[0]);
		expect(startEvent.event).toBe("command:start");
		expect(startEvent.command_id).toBe("cmd-123");
		expect(startEvent.command).toBe("generate-image");
		expect(startEvent.timestamp).toBeDefined();

		const endEvent = JSON.parse(lines[1]);
		expect(endEvent.event).toBe("command:end");
		expect(endEvent.exit_code).toBe(0);
		expect(endEvent.duration_ms).toBe(1500);
	});

	it("includes session_id when provided", () => {
		const { stream, lines } = createCapture();
		const debug = new DebugStream({
			enabled: true,
			sessionId: "s-456",
			stream,
		});

		debug.commandStart("cmd-789", "list-models");

		const event = JSON.parse(lines[0]);
		expect(event.session_id).toBe("s-456");
	});

	it("emits nothing when disabled", () => {
		const { stream, lines } = createCapture();
		const debug = new DebugStream({ enabled: false, stream });

		debug.commandStart("cmd-000", "test");
		debug.commandEnd("cmd-000", "test", 0, 100);

		expect(lines).toHaveLength(0);
	});
});

describe("StreamEmitter duration_ms", () => {
	it("includes duration_ms alongside elapsed_seconds", () => {
		const { stream, lines } = createCapture();
		const emitter = new StreamEmitter({ enabled: true, stream });

		emitter.pipelineStart("test-pipeline", 3);

		expect(lines).toHaveLength(1);
		const event = JSON.parse(lines[0]);
		expect(event.duration_ms).toBeDefined();
		expect(typeof event.duration_ms).toBe("number");
		expect(Number.isInteger(event.duration_ms)).toBe(true);
		// elapsed_seconds still present for backward compat
		expect(event.elapsed_seconds).toBeDefined();
	});
});
