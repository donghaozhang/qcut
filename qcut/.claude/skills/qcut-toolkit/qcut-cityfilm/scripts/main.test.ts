import { describe, expect, it } from "vitest";
import { parseArgs, parseWindows, renderHuman } from "./main";

describe("parseArgs", () => {
	it("splits a command, positionals, and flags", () => {
		const parsed = parseArgs({
			argv: ["analyze", "ref.mp4", "-o", "out", "--frames", "40"],
		});
		expect(parsed.command).toBe("analyze");
		expect(parsed.positional).toEqual(["ref.mp4"]);
		expect(parsed.flags.get("output-dir")).toBe("out");
		expect(parsed.flags.get("frames")).toBe("40");
	});

	it("treats a flag with no value as boolean", () => {
		const parsed = parseArgs({
			argv: ["vo", "--plan", "p.json", "--force", "--json"],
		});
		expect(parsed.flags.get("force")).toBe(true);
		expect(parsed.flags.get("json")).toBe(true);
		expect(parsed.flags.get("plan")).toBe("p.json");
	});

	it("accepts --flag=value", () => {
		const parsed = parseArgs({ argv: ["mix", "--video=a.mp4"] });
		expect(parsed.flags.get("video")).toBe("a.mp4");
	});

	it("does not swallow the next flag as a value", () => {
		const parsed = parseArgs({ argv: ["vo", "--force", "--plan", "p.json"] });
		expect(parsed.flags.get("force")).toBe(true);
		expect(parsed.flags.get("plan")).toBe("p.json");
	});

	it("reports no command when argv starts with a flag", () => {
		const parsed = parseArgs({ argv: ["--help"] });
		expect(parsed.command).toBe("");
		expect(parsed.flags.get("help")).toBe(true);
	});
});

describe("parseWindows", () => {
	it("defaults to an opening and a mid-film window", () => {
		const windows = parseWindows({});
		expect(windows).toHaveLength(2);
		expect(windows[0]).toMatchObject({ startSeconds: 0, endSeconds: 5 });
	});

	it("converts start:length pairs into start/end windows", () => {
		expect(parseWindows({ value: "0:5,48.4:12" })).toEqual([
			{ label: "w1", startSeconds: 0, endSeconds: 5 },
			{ label: "w2", startSeconds: 48.4, endSeconds: 60.4 },
		]);
	});

	it("rejects malformed windows", () => {
		expect(() => parseWindows({ value: "0:abc" })).toThrow();
		expect(() => parseWindows({ value: "5:0" })).toThrow();
	});
});

describe("renderHuman", () => {
	it("renders one key per line instead of JSON", () => {
		const text = renderHuman({
			payload: { outputPath: "/out/final.mp4", durationSeconds: 101.8 },
		});
		expect(text).toBe("outputPath: /out/final.mp4\ndurationSeconds: 101.8");
	});

	it("summarises arrays by length", () => {
		expect(renderHuman({ payload: { failed: [1, 2, 3] } })).toBe(
			"failed: 3 item(s)"
		);
	});
});
