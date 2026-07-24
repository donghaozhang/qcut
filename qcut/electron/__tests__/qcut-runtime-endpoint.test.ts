import { describe, expect, it } from "vitest";
import {
	DEFAULT_QCUT_API_PORT,
	resolveQCutRuntimeEndpoint,
} from "../claude/runtime-endpoint.js";

describe("QCut runtime endpoint", () => {
	it("uses the same dynamic port advertised by the running editor", () => {
		expect(
			resolveQCutRuntimeEndpoint({ env: { QCUT_API_PORT: "8878" } })
		).toEqual({
			host: "127.0.0.1",
			port: 8878,
			baseUrl: "http://127.0.0.1:8878",
		});
	});

	it.each([
		"",
		"0",
		"-1",
		"70000",
		"8878.5",
		"8878oops",
		"not-a-port",
	])("falls back for invalid port %s", (value) => {
		expect(
			resolveQCutRuntimeEndpoint({ env: { QCUT_API_PORT: value } }).port
		).toBe(DEFAULT_QCUT_API_PORT);
	});
});
