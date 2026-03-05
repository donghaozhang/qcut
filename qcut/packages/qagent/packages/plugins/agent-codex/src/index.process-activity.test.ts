import { describe, it, expect, vi } from "vitest";
import {
	mockExecFileAsync,
	makeTmuxHandle,
	makeProcessHandle,
	makeSession,
	mockTmuxWithProcess,
} from "./index.test-harness";
import type { RuntimeHandle } from "@composio/ao-core";
import { create } from "./index.js";

describe("isProcessRunning", () => {
	const agent = create();

	it("returns true when codex found on tmux pane TTY", async () => {
		mockTmuxWithProcess("codex");
		expect(await agent.isProcessRunning(makeTmuxHandle())).toBe(true);
	});

	it("returns false when codex not on tmux pane TTY", async () => {
		mockTmuxWithProcess("codex", false);
		expect(await agent.isProcessRunning(makeTmuxHandle())).toBe(false);
	});

	it("returns false when tmux list-panes returns empty", async () => {
		mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" });
		expect(await agent.isProcessRunning(makeTmuxHandle())).toBe(false);
	});

	it("returns true for process handle with alive PID", async () => {
		const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
		expect(await agent.isProcessRunning(makeProcessHandle(123))).toBe(true);
		expect(killSpy).toHaveBeenCalledWith(123, 0);
		killSpy.mockRestore();
	});

	it("returns false for process handle with dead PID", async () => {
		const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
			throw new Error("ESRCH");
		});
		expect(await agent.isProcessRunning(makeProcessHandle(123))).toBe(false);
		killSpy.mockRestore();
	});

	it("returns false for unknown runtime without PID", async () => {
		const handle: RuntimeHandle = { id: "x", runtimeName: "other", data: {} };
		expect(await agent.isProcessRunning(handle)).toBe(false);
		expect(mockExecFileAsync).not.toHaveBeenCalled();
	});

	it("returns false on tmux command failure", async () => {
		mockExecFileAsync.mockRejectedValue(new Error("tmux not running"));
		expect(await agent.isProcessRunning(makeTmuxHandle())).toBe(false);
	});

	it("returns true when PID exists but throws EPERM", async () => {
		const epermErr = Object.assign(new Error("EPERM"), { code: "EPERM" });
		const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
			throw epermErr;
		});
		expect(await agent.isProcessRunning(makeProcessHandle(789))).toBe(true);
		killSpy.mockRestore();
	});

	it("finds codex on any pane in multi-pane session", async () => {
		mockExecFileAsync.mockImplementation((cmd: string, args: string[]) => {
			if (cmd === "tmux" && args[0] === "list-panes") {
				return Promise.resolve({
					stdout: "/dev/ttys001\n/dev/ttys002\n",
					stderr: "",
				});
			}
			if (cmd === "ps") {
				return Promise.resolve({
					stdout:
						"  PID TT ARGS\n  100 ttys001  bash\n  200 ttys002  codex --model o3\n",
					stderr: "",
				});
			}
			return Promise.reject(new Error("unexpected"));
		});
		expect(await agent.isProcessRunning(makeTmuxHandle())).toBe(true);
	});

	it("does not match similar process names like codex-something", async () => {
		mockExecFileAsync.mockImplementation((cmd: string, args: string[]) => {
			if (cmd === "tmux" && args[0] === "list-panes") {
				return Promise.resolve({ stdout: "/dev/ttys001\n", stderr: "" });
			}
			if (cmd === "ps") {
				return Promise.resolve({
					stdout: "  PID TT ARGS\n  100 ttys001  /usr/bin/codex-helper\n",
					stderr: "",
				});
			}
			return Promise.reject(new Error("unexpected"));
		});
		expect(await agent.isProcessRunning(makeTmuxHandle())).toBe(false);
	});

	it("handles string PID by converting to number", async () => {
		const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
		expect(await agent.isProcessRunning(makeProcessHandle("456"))).toBe(true);
		expect(killSpy).toHaveBeenCalledWith(456, 0);
		killSpy.mockRestore();
	});

	it("returns false for non-numeric PID", async () => {
		expect(await agent.isProcessRunning(makeProcessHandle("not-a-pid"))).toBe(
			false,
		);
	});
});

describe("detectActivity", () => {
	const agent = create();

	it("returns idle for empty terminal output", () => {
		expect(agent.detectActivity("")).toBe("idle");
	});

	it("returns idle for whitespace-only terminal output", () => {
		expect(agent.detectActivity("   \n  ")).toBe("idle");
	});

	it("returns idle when last line is a bare > prompt", () => {
		expect(agent.detectActivity("some output\n> ")).toBe("idle");
	});

	it("returns idle when last line is a bare $ prompt", () => {
		expect(agent.detectActivity("some output\n$ ")).toBe("idle");
	});

	it("returns idle when last line is a bare # prompt", () => {
		expect(agent.detectActivity("some output\n# ")).toBe("idle");
	});

	it("returns idle when prompt follows historical activity indicators", () => {
		expect(agent.detectActivity("✶ Reading files\nDone.\n> ")).toBe("idle");
		expect(
			agent.detectActivity("Working on task (esc to interrupt)\nFinished.\n$ "),
		).toBe("idle");
	});

	it("returns waiting_input for approval required text", () => {
		expect(agent.detectActivity("some output\napproval required\n")).toBe(
			"waiting_input",
		);
	});

	it("returns waiting_input for (y)es / (n)o prompt", () => {
		expect(
			agent.detectActivity("Do you want to continue?\n(y)es / (n)o\n"),
		).toBe("waiting_input");
	});

	it("returns waiting_input when permission prompt follows historical activity", () => {
		expect(
			agent.detectActivity("✶ Writing files\nDone.\napproval required\n"),
		).toBe("waiting_input");
		expect(
			agent.detectActivity("Working (esc to interrupt)\nFinished\n(y)es / (n)o\n"),
		).toBe("waiting_input");
	});

	it("returns active for non-empty terminal output with no special patterns", () => {
		expect(agent.detectActivity("codex is running some task\n")).toBe("active");
	});

	it("returns active when (esc to interrupt) is present", () => {
		expect(agent.detectActivity("Working on task (esc to interrupt)\n")).toBe(
			"active",
		);
	});

	it("returns active for spinner symbols with -ing words", () => {
		expect(agent.detectActivity("✶ Reading files\n")).toBe("active");
		expect(agent.detectActivity("⏺ Writing to disk\n")).toBe("active");
		expect(agent.detectActivity("✽ Searching codebase\n")).toBe("active");
		expect(agent.detectActivity("⏳ Installing packages\n")).toBe("active");
	});

	it("returns active (not idle) for spinner symbol without -ing word", () => {
		expect(agent.detectActivity("✶ done\n")).toBe("active");
	});

	it("returns active for multi-line output with activity in the middle", () => {
		expect(
			agent.detectActivity("Starting\n(esc to interrupt)\nstill going\n"),
		).toBe("active");
	});
});

describe("getActivityState", () => {
	const agent = create();

	it("returns exited when no runtimeHandle", async () => {
		const session = makeSession({ runtimeHandle: null });
		const result = await agent.getActivityState(session);
		expect(result).toEqual({ state: "exited" });
	});

	it("returns exited when process is not running", async () => {
		mockExecFileAsync.mockRejectedValue(new Error("tmux not running"));
		const session = makeSession({ runtimeHandle: makeTmuxHandle() });
		const result = await agent.getActivityState(session);
		expect(result).toEqual({ state: "exited" });
	});

	it("returns null (unknown) when process is running", async () => {
		mockTmuxWithProcess("codex");
		const session = makeSession({ runtimeHandle: makeTmuxHandle() });
		expect(await agent.getActivityState(session)).toBeNull();
	});

	it("returns exited when process handle has dead PID", async () => {
		const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
			throw new Error("ESRCH");
		});
		const session = makeSession({ runtimeHandle: makeProcessHandle(999) });
		const result = await agent.getActivityState(session);
		expect(result).toEqual({ state: "exited" });
		killSpy.mockRestore();
	});

	it("does not include timestamp in exited state", async () => {
		const session = makeSession({ runtimeHandle: null });
		const result = await agent.getActivityState(session);
		expect(result).toEqual({ state: "exited" });
		expect(result?.timestamp).toBeUndefined();
	});
});
