import { describe, expect, it } from "vitest";
import { handleSystemDoctor, runDoctor } from "../cli-handlers-system-doctor";
import type { CLIRunOptions } from "../cli-runner/types";

function makeOptions(overrides: Partial<CLIRunOptions> = {}): CLIRunOptions {
	return {
		command: "system-doctor",
		outputDir: "/tmp/test-doctor",
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: true,
		skipHealth: true,
		...overrides,
	} as CLIRunOptions;
}

describe("runDoctor", () => {
	it("includes bun and ffmpeg checks", () => {
		const report = runDoctor({ skipHealth: true });
		const names = report.checks.map((c) => c.name);
		expect(names).toContain("bun");
		expect(names).toContain("ffmpeg");
	});

	it("does not include provider_pings when skipHealth=true", () => {
		const report = runDoctor({ skipHealth: true });
		expect(
			report.checks.some((c) => c.name === "provider_pings"),
		).toBe(false);
	});

	it("includes provider_pings warn when skipHealth=false", () => {
		const report = runDoctor({ skipHealth: false });
		const ping = report.checks.find((c) => c.name === "provider_pings");
		expect(ping?.status).toBe("warn");
	});

	it("returns a stable shape", () => {
		const report = runDoctor({ skipHealth: true });
		expect(typeof report.status).toBe("string");
		expect(Array.isArray(report.checks)).toBe(true);
		expect(typeof report.keys_configured).toBe("number");
		expect(typeof report.keys_total).toBe("number");
		expect(report.env_file).toMatch(/\.qcut\/\.env$/);
	});

	it("overall status follows fail-if-any-fail rule", () => {
		const report = runDoctor({ skipHealth: true });
		const anyFail = report.checks.some((c) => c.status === "fail");
		expect(report.status).toBe(anyFail ? "fail" : "ok");
	});
});

describe("handleSystemDoctor", () => {
	it("returns CLIResult with data attached", () => {
		const result = handleSystemDoctor(makeOptions());
		expect(result).toHaveProperty("success");
		expect(result.data).toBeDefined();
		const data = result.data as { status: string };
		expect(["ok", "fail"]).toContain(data.status);
	});

	it("success mirrors the report's status", () => {
		const result = handleSystemDoctor(makeOptions());
		const data = result.data as { status: string };
		if (data.status === "ok") {
			expect(result.success).toBe(true);
		} else {
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/doctor failed/);
		}
	});
});
