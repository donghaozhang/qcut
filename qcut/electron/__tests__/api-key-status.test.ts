import { describe, expect, it } from "vitest";
import { computeKeyStatus, KEY_SOURCE_PRECEDENCE } from "../api-key-status";

describe("computeKeyStatus", () => {
	it("reports environment with electron shadowed", () => {
		expect(
			computeKeyStatus({
				env: true,
				electron: true,
				file: false,
			})
		).toEqual({
			set: true,
			source: "environment",
			shadowedBy: ["electron"],
		});
	});

	it("reports electron with file shadowed", () => {
		expect(
			computeKeyStatus({
				env: false,
				electron: true,
				file: true,
			})
		).toEqual({
			set: true,
			source: "electron",
			shadowedBy: ["file"],
		});
	});

	it("reports every lower tier shadowed when all tiers are set", () => {
		expect(
			computeKeyStatus({
				env: true,
				electron: true,
				file: true,
			})
		).toEqual({
			set: true,
			source: "environment",
			shadowedBy: ["electron", "file"],
		});
	});

	it("reports file when only file is set", () => {
		expect(
			computeKeyStatus({
				env: false,
				electron: false,
				file: true,
			})
		).toEqual({
			set: true,
			source: "file",
			shadowedBy: [],
		});
	});

	it("reports not-set when no tier is set", () => {
		expect(
			computeKeyStatus({
				env: false,
				electron: false,
				file: false,
			})
		).toEqual({
			set: false,
			source: "not-set",
			shadowedBy: [],
		});
	});
});

describe("KEY_SOURCE_PRECEDENCE", () => {
	it("keeps the resolver precedence order stable", () => {
		expect(KEY_SOURCE_PRECEDENCE).toEqual([
			"environment",
			"electron",
			"file",
		]);
	});
});
