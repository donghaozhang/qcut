import path from "node:path";
import { describe, expect, test } from "vitest";
import { qcutStandaloneUserDataRoot } from "../jianying-effect/user-data-paths";

describe("QCut standalone user-data paths", () => {
	test("matches the macOS Electron user-data location", () => {
		expect(
			qcutStandaloneUserDataRoot({
				homeDirectory: "/Users/tester",
				platform: "darwin",
				environment: {},
			})
		).toBe(
			path.join("/Users/tester", "Library", "Application Support", "QCut")
		);
	});

	test("uses platform configuration roots and an explicit override", () => {
		expect(
			qcutStandaloneUserDataRoot({
				homeDirectory: "/home/tester",
				platform: "linux",
				environment: { XDG_CONFIG_HOME: "/config" },
			})
		).toBe(path.join("/config", "QCut"));
		expect(
			qcutStandaloneUserDataRoot({
				homeDirectory: "/home/tester",
				platform: "linux",
				environment: { QCUT_USER_DATA_DIR: "./custom-qcut" },
			})
		).toBe(path.resolve("./custom-qcut"));
	});
});
