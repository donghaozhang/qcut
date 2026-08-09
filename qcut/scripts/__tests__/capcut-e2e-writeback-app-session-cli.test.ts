import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCapCut81WritebackAppSessionCliOptions } from "../capcut-e2e/capcut-8-1-writeback-app-session-cli";

describe("CapCut 8.1 writeback app session CLI", () => {
	it("parses the pre-open boundary with explicit evidence bindings", () => {
		expect(
			parseCapCut81WritebackAppSessionCliOptions({
				argv: [
					"pre-open",
					"--app",
					"CapCut 8.1.1.app",
					"--case-id",
					"writeback-case",
					"--draft",
					"draft",
					"--home",
					"home",
					"--output-sha256",
					"a".repeat(64),
					"--profile-id",
					"capcut-desktop-8.1-plaintext",
					"--run-id",
					"run-1",
					"--session",
					"evidence",
					"--json",
				],
			})
		).toEqual({
			appPath: resolve("CapCut 8.1.1.app"),
			caseId: "writeback-case",
			command: "pre-open",
			dedicatedTestHomeDirectory: resolve("home"),
			draftDirectory: resolve("draft"),
			json: true,
			outputContentSha256: "a".repeat(64),
			profileId: "capcut-desktop-8.1-plaintext",
			runId: "run-1",
			sessionDirectory: resolve("evidence"),
		});
	});

	it("parses a later manual boundary", () => {
		expect(
			parseCapCut81WritebackAppSessionCliOptions({
				argv: ["reopened", "--session", "evidence"],
			})
		).toEqual({
			command: "reopened",
			json: false,
			sessionDirectory: resolve("evidence"),
		});
	});

	it("rejects missing, duplicate, and command-specific flags", () => {
		expect(() =>
			parseCapCut81WritebackAppSessionCliOptions({ argv: [] })
		).toThrow("Command must be one of");
		expect(() =>
			parseCapCut81WritebackAppSessionCliOptions({
				argv: ["saved", "--session", "one", "--session", "two"],
			})
		).toThrow("Duplicate flag: --session");
		expect(() =>
			parseCapCut81WritebackAppSessionCliOptions({
				argv: ["saved", "--app", "CapCut.app"],
			})
		).toThrow("Unknown flag: --app");
	});
});
