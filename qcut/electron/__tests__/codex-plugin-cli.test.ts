import { describe, expect, it } from "vitest";
import { createCodexInvocation, parseCodexOutput } from "../codex-plugin-cli";

describe("Codex CLI invocation", () => {
	it("runs Windows command shims through the command processor", () => {
		expect(
			createCodexInvocation({
				candidate: "C:\\Users\\Peter\\AppData\\Roaming\\npm\\codex.cmd",
				platform: "win32",
				commandProcessor: "C:\\Windows\\System32\\cmd.exe",
			})
		).toEqual({
			executable: "C:\\Windows\\System32\\cmd.exe",
			prefixArgs: [
				"/d",
				"/s",
				"/c",
				"C:\\Users\\Peter\\AppData\\Roaming\\npm\\codex.cmd",
			],
		});
	});

	it("runs PowerShell shims with arguments kept separate", () => {
		expect(
			createCodexInvocation({
				candidate: "C:\\Users\\Peter\\AppData\\Roaming\\npm\\codex.ps1",
				platform: "win32",
				powerShell: "powershell.exe",
			})
		).toEqual({
			executable: "powershell.exe",
			prefixArgs: [
				"-NoLogo",
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				"C:\\Users\\Peter\\AppData\\Roaming\\npm\\codex.ps1",
			],
		});
	});

	it("executes native binaries directly", () => {
		expect(
			createCodexInvocation({
				candidate: "C:\\Program Files\\Codex\\codex.exe",
				platform: "win32",
			})
		).toEqual({
			executable: "C:\\Program Files\\Codex\\codex.exe",
			prefixArgs: [],
		});
	});
});

describe("Codex CLI output", () => {
	it("parses JSON and accepts an empty successful response", () => {
		expect(parseCodexOutput({ stdout: '{"installed":[]}' })).toEqual({
			installed: [],
		});
		expect(parseCodexOutput({ stdout: " \n" })).toEqual({});
	});

	it("reports invalid CLI output clearly", () => {
		expect(() =>
			parseCodexOutput({ stdout: "warning: unsupported flag" })
		).toThrow("Codex CLI returned invalid JSON output");
	});
});
