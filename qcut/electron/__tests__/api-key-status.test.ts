import { describe, expect, it } from "vitest";
import { computeKeyStatus, KEY_SOURCE_PRECEDENCE } from "../api-key-status";

describe("computeKeyStatus", () => {
	it("reports environment with electron shadowed", () => {
		expect(
			computeKeyStatus({
				env: true,
				electron: true,
				aicpCli: false,
				qcutEnv: false,
			})
		).toEqual({
			set: true,
			source: "environment",
			shadowedBy: ["electron"],
		});
	});

	it("reports electron with aicp-cli shadowed", () => {
		expect(
			computeKeyStatus({
				env: false,
				electron: true,
				aicpCli: true,
				qcutEnv: false,
			})
		).toEqual({
			set: true,
			source: "electron",
			shadowedBy: ["aicp-cli"],
		});
	});

	it("reports every lower tier shadowed when all tiers are set", () => {
		expect(
			computeKeyStatus({
				env: true,
				electron: true,
				aicpCli: true,
				qcutEnv: true,
			})
		).toEqual({
			set: true,
			source: "environment",
			shadowedBy: ["electron", "aicp-cli", "qcut-env"],
		});
	});

	it("reports qcut-env when only qcut-env is set", () => {
		expect(
			computeKeyStatus({
				env: false,
				electron: false,
				aicpCli: false,
				qcutEnv: true,
			})
		).toEqual({
			set: true,
			source: "qcut-env",
			shadowedBy: [],
		});
	});

	it("reports not-set when no tier is set", () => {
		expect(
			computeKeyStatus({
				env: false,
				electron: false,
				aicpCli: false,
				qcutEnv: false,
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
			"aicp-cli",
			"qcut-env",
		]);
	});
});
