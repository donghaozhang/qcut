import { afterEach, describe, expect, it, vi } from "vitest";
import { printCommandHelp, printGroupHelp, printHelp } from "../cli-help.js";

function captureStdout({ run }: { run: () => void }): string {
	const lines: string[] = [];
	const spy = vi.spyOn(console, "log").mockImplementation((value: unknown) => {
		lines.push(String(value));
	});
	try {
		run();
	} finally {
		spy.mockRestore();
	}
	return lines.join("\n");
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("printCommandHelp", () => {
	it("lists a command's own required and optional flags", () => {
		const output = captureStdout({
			run: () => printCommandHelp("analyze-inspect"),
		});

		expect(output).toContain("analyze-inspect");
		expect(output).toContain("Required:");
		for (const flag of ["--index", "--source", "--start", "--end"]) {
			expect(output).toContain(flag);
		}
		expect(output).toContain("--narration");
		// The root overview leaks in when the fallback regresses.
		expect(output).not.toContain("AI content generation CLI");
	});

	it("renders each flag once, with the registry's own dashes", () => {
		const output = captureStdout({
			run: () => printCommandHelp("analyze-inspect"),
		});

		expect(output).toContain("--index");
		expect(output).not.toContain("----index");
	});

	it("shows a short flag beside its long form", () => {
		const output = captureStdout({
			run: () => printCommandHelp("generate-image"),
		});

		expect(output).toContain("-t, --text");
	});

	it("keeps defaults and enums visible", () => {
		const output = captureStdout({
			run: () => printCommandHelp("analyze-index"),
		});

		expect(output).toContain("[default: 2]");
		expect(output).toContain("<number>");
	});

	it("still distinguishes root and group help", () => {
		const root = captureStdout({ run: () => printHelp() });
		const group = captureStdout({ run: () => printGroupHelp("analyze") });

		expect(root).toContain("AI content generation CLI");
		expect(group).toContain("Actions:");
		expect(group).not.toContain("AI content generation CLI");
	});
});
