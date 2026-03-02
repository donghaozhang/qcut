import { beforeEach, describe, expect, it, vi } from "vitest";

// -- Errors & Exit Codes (Section 3.1 + 3.5) --

import {
	ExitCode,
	AIPlatformError,
	PipelineConfigurationError,
	StepExecutionError,
	ServiceNotAvailableError,
	APIKeyError,
	CostLimitExceededError,
	ParallelExecutionError,
	ValidationError,
	ConfigurationError,
	PipelineExecutionError,
	FileOperationError,
	CostCalculationError,
	getExitCode,
	formatErrorForCli,
} from "../native-pipeline/output/errors.js";

describe("Exception hierarchy & exit codes", () => {
	it("AIPlatformError has default exit code GENERAL_ERROR", () => {
		const err = new AIPlatformError("test");
		expect(err.exitCode).toBe(ExitCode.GENERAL_ERROR);
		expect(err.name).toBe("AIPlatformError");
		expect(err.message).toBe("test");
		expect(err instanceof Error).toBe(true);
	});

	it("subclasses carry correct exit codes", () => {
		expect(new PipelineConfigurationError("x").exitCode).toBe(
			ExitCode.INVALID_ARGS
		);
		expect(new StepExecutionError("x").exitCode).toBe(ExitCode.PIPELINE_FAILED);
		expect(new ServiceNotAvailableError("x", "fal").exitCode).toBe(
			ExitCode.API_CALL_FAILED
		);
		expect(new APIKeyError("x", "fal").exitCode).toBe(ExitCode.API_KEY_MISSING);
		expect(new CostLimitExceededError("x", 10, 20).exitCode).toBe(
			ExitCode.PIPELINE_FAILED
		);
		expect(new ParallelExecutionError("x", 2, 5).exitCode).toBe(
			ExitCode.PIPELINE_FAILED
		);
		expect(new ValidationError("x").exitCode).toBe(ExitCode.INVALID_ARGS);
		expect(new ConfigurationError("x").exitCode).toBe(ExitCode.INVALID_ARGS);
		expect(new PipelineExecutionError("x").exitCode).toBe(
			ExitCode.PIPELINE_FAILED
		);
		expect(new FileOperationError("x", "/tmp/foo").exitCode).toBe(
			ExitCode.FILE_NOT_FOUND
		);
		expect(new CostCalculationError("x").exitCode).toBe(ExitCode.GENERAL_ERROR);
	});

	it("error subclasses carry contextual properties", () => {
		const step = new StepExecutionError("step failed", 3, "text_to_image");
		expect(step.stepIndex).toBe(3);
		expect(step.stepType).toBe("text_to_image");

		const api = new APIKeyError("missing", "google");
		expect(api.provider).toBe("google");

		const cost = new CostLimitExceededError("too much", 5, 10);
		expect(cost.limit).toBe(5);
		expect(cost.actual).toBe(10);

		const parallel = new ParallelExecutionError("failed", 2, 5);
		expect(parallel.failedSteps).toBe(2);
		expect(parallel.totalSteps).toBe(5);

		const file = new FileOperationError("missing", "/tmp/x");
		expect(file.filePath).toBe("/tmp/x");
	});

	it("getExitCode maps platform errors correctly", () => {
		expect(getExitCode(new APIKeyError("x", "fal"))).toBe(
			ExitCode.API_KEY_MISSING
		);
		expect(getExitCode(new PipelineConfigurationError("x"))).toBe(
			ExitCode.INVALID_ARGS
		);
		expect(getExitCode(new Error("generic"))).toBe(ExitCode.GENERAL_ERROR);
		expect(getExitCode("string error")).toBe(ExitCode.GENERAL_ERROR);
	});

	it("formatErrorForCli returns message and exit code", () => {
		const { message, exitCode } = formatErrorForCli(
			new APIKeyError("no key", "fal")
		);
		expect(message).toBe("no key");
		expect(exitCode).toBe(ExitCode.API_KEY_MISSING);
	});

	it("formatErrorForCli includes stack in debug mode", () => {
		const { message } = formatErrorForCli(new Error("test"), true);
		expect(message).toContain("test");
		expect(message).toContain("Error");
	});

	it("ExitCode enum has all expected values", () => {
		expect(ExitCode.SUCCESS).toBe(0);
		expect(ExitCode.GENERAL_ERROR).toBe(1);
		expect(ExitCode.INVALID_ARGS).toBe(2);
		expect(ExitCode.MODEL_NOT_FOUND).toBe(3);
		expect(ExitCode.API_KEY_MISSING).toBe(4);
		expect(ExitCode.API_CALL_FAILED).toBe(5);
		expect(ExitCode.PIPELINE_FAILED).toBe(6);
		expect(ExitCode.FILE_NOT_FOUND).toBe(7);
		expect(ExitCode.PERMISSION_DENIED).toBe(8);
		expect(ExitCode.TIMEOUT).toBe(9);
		expect(ExitCode.CANCELLED).toBe(10);
	});
});

// -- CLI Output (Section 2.2 + 2.3) --

import {
	CLIOutput,
	formatTable,
	colorize,
	ansi,
} from "../native-pipeline/cli/cli-output.js";

describe("CLIOutput", () => {
	it("info suppressed in json mode", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const out = new CLIOutput({ jsonMode: true });
		out.info("hello");
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it("info suppressed in quiet mode", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const out = new CLIOutput({ quiet: true });
		out.info("hello");
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it("info shown in normal mode", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const out = new CLIOutput();
		out.info("hello");
		expect(spy).toHaveBeenCalledWith("hello");
		spy.mockRestore();
	});

	it("error always visible", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const out = new CLIOutput({ quiet: true, jsonMode: true });
		out.error("fail");
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it("verbose only in debug mode", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const out = new CLIOutput({ debug: false });
		out.verbose("debug info");
		expect(spy).not.toHaveBeenCalled();

		const out2 = new CLIOutput({ debug: true });
		out2.verbose("debug info");
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it("result emits JSON envelope in json mode", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const out = new CLIOutput({ jsonMode: true });
		out.result({ key: "value" }, "test-command");
		const output = spy.mock.calls[0][0] as string;
		const parsed = JSON.parse(output);
		expect(parsed.schema_version).toBe("1");
		expect(parsed.command).toBe("test-command");
		expect(parsed.data.key).toBe("value");
		spy.mockRestore();
	});

	it("table emits JSON envelope with items in json mode", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const out = new CLIOutput({ jsonMode: true });
		out.table([{ name: "test", value: 42 }], undefined, "table-cmd");
		const output = spy.mock.calls[0][0] as string;
		const parsed = JSON.parse(output);
		expect(parsed.schema_version).toBe("1");
		expect(parsed.items).toHaveLength(1);
		expect(parsed.count).toBe(1);
		spy.mockRestore();
	});
});

describe("formatTable", () => {
	it("formats rows with headers and separators", () => {
		const result = formatTable([
			{ name: "Alice", age: "30" },
			{ name: "Bob", age: "25" },
		]);
		expect(result).toContain("name");
		expect(result).toContain("age");
		expect(result).toContain("Alice");
		expect(result).toContain("Bob");
		expect(result).toContain("---");
	});

	it("returns empty string for empty rows", () => {
		expect(formatTable([])).toBe("");
	});

	it("supports right-aligned columns", () => {
		const result = formatTable(
			[{ value: "42" }],
			[{ header: "value", width: 10, align: "right" }]
		);
		expect(result).toContain("        42");
	});
});

describe("ANSI colors", () => {
	it("colorize returns a string", () => {
		const result = colorize("test", "red");
		expect(typeof result).toBe("string");
		expect(result).toContain("test");
	});

	it("ansi object has expected keys", () => {
		expect(ansi).toHaveProperty("reset");
		expect(ansi).toHaveProperty("red");
		expect(ansi).toHaveProperty("green");
		expect(ansi).toHaveProperty("yellow");
		expect(ansi).toHaveProperty("blue");
		expect(ansi).toHaveProperty("bold");
		expect(ansi).toHaveProperty("dim");
		expect(ansi).toHaveProperty("cyan");
	});
});

// -- Stream Emitter (Section 3.2) --

import {
	StreamEmitter,
	NullEmitter,
} from "../native-pipeline/infra/stream-emitter.js";

describe("StreamEmitter", () => {
	it("emits JSONL events when enabled", () => {
		const chunks: string[] = [];
		const mockStream = {
			write: (data: string) => {
				chunks.push(data);
				return true;
			},
		} as unknown as NodeJS.WriteStream;

		const emitter = new StreamEmitter({ enabled: true, stream: mockStream });
		emitter.pipelineStart("test", 3);

		expect(chunks.length).toBe(1);
		const event = JSON.parse(chunks[0]);
		expect(event.schema_version).toBe("1");
		expect(event.event).toBe("pipeline_start");
		expect(event.pipeline).toBe("test");
		expect(event.total_steps).toBe(3);
		expect(event.elapsed_seconds).toBeGreaterThanOrEqual(0);
	});

	it("emits step events", () => {
		const chunks: string[] = [];
		const mockStream = {
			write: (data: string) => {
				chunks.push(data);
				return true;
			},
		} as unknown as NodeJS.WriteStream;

		const emitter = new StreamEmitter({ enabled: true, stream: mockStream });
		emitter.stepStart(0, "text_to_image", "flux_dev");
		emitter.stepProgress(0, 50, "Generating...");
		emitter.stepComplete(0, 0.04, "/tmp/out.png", 2.5);
		emitter.stepError(1, "API error", "text_to_video");

		expect(chunks.length).toBe(4);
		expect(JSON.parse(chunks[0]).event).toBe("step_start");
		expect(JSON.parse(chunks[1]).event).toBe("step_progress");
		expect(JSON.parse(chunks[2]).event).toBe("step_complete");
		expect(JSON.parse(chunks[3]).event).toBe("step_error");
	});

	it("does not emit when disabled", () => {
		const chunks: string[] = [];
		const mockStream = {
			write: (data: string) => {
				chunks.push(data);
				return true;
			},
		} as unknown as NodeJS.WriteStream;

		const emitter = new StreamEmitter({ enabled: false, stream: mockStream });
		emitter.pipelineStart("test", 1);
		emitter.stepStart(0, "test");
		expect(chunks.length).toBe(0);
	});

	it("NullEmitter never emits", () => {
		const spy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);
		const emitter = new NullEmitter();
		emitter.pipelineStart("test", 1);
		emitter.stepStart(0, "test");
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it("pipelineComplete writes to stdout", () => {
		const spy = vi
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true);
		const emitter = new StreamEmitter({ enabled: true });
		emitter.pipelineComplete({ success: true, cost: 0.1 });
		expect(spy).toHaveBeenCalled();
		const output = spy.mock.calls[0][0] as string;
		const event = JSON.parse(output);
		expect(event.event).toBe("pipeline_complete");
		expect(event.success).toBe(true);
		spy.mockRestore();
	});
});
