import { describe, it, expect, beforeEach } from "vitest";
import {
	mockReadFile,
	mockMkdir,
	mockRename,
	mockWriteFile,
	makeSession,
} from "./index.test-harness";
import { create } from "./index.js";

describe("setupWorkspaceHooks", () => {
	const agent = create();

	it("has setupWorkspaceHooks method", () => {
		expect(typeof agent.setupWorkspaceHooks).toBe("function");
	});

	it("creates ~/.qagent/bin directory", async () => {
		mockReadFile.mockRejectedValue(new Error("ENOENT"));

		await agent.setupWorkspaceHooks!("/workspace/test", {
			dataDir: "/data",
			sessionId: "sess-1",
		});

		expect(mockMkdir).toHaveBeenCalledWith("/mock/home/.qagent/bin", {
			recursive: true,
		});
	});

	it("writes qagent-metadata-helper.sh with executable permissions via atomic write", async () => {
		mockReadFile.mockRejectedValue(new Error("ENOENT"));

		await agent.setupWorkspaceHooks!("/workspace/test", {
			dataDir: "/data",
			sessionId: "sess-1",
		});

		const helperWriteCall = mockWriteFile.mock.calls.find(
			(call: [string, string, object]) =>
				typeof call[0] === "string" &&
				call[0].includes("qagent-metadata-helper.sh.tmp."),
		);
		expect(helperWriteCall).toBeDefined();
		expect(helperWriteCall![1]).toContain("update_qagent_metadata()");
		expect(helperWriteCall![2]).toEqual({ encoding: "utf-8", mode: 0o755 });

		const helperRenameCall = mockRename.mock.calls.find(
			(call: string[]) =>
				typeof call[1] === "string" &&
				call[1].endsWith("qagent-metadata-helper.sh"),
		);
		expect(helperRenameCall).toBeDefined();
	});

	it("writes gh and git wrappers atomically when version marker is missing", async () => {
		mockReadFile.mockRejectedValue(new Error("ENOENT"));

		await agent.setupWorkspaceHooks!("/workspace/test", {
			dataDir: "/data",
			sessionId: "sess-1",
		});

		const ghWriteCall = mockWriteFile.mock.calls.find(
			(call: [string, string, object]) =>
				typeof call[0] === "string" && call[0].includes("/gh.tmp."),
		);
		expect(ghWriteCall).toBeDefined();
		expect(ghWriteCall![1]).toContain("qagent gh wrapper");

		const ghRenameCall = mockRename.mock.calls.find(
			(call: string[]) =>
				typeof call[1] === "string" && call[1].endsWith("/gh"),
		);
		expect(ghRenameCall).toBeDefined();

		const gitWriteCall = mockWriteFile.mock.calls.find(
			(call: [string, string, object]) =>
				typeof call[0] === "string" && call[0].includes("/git.tmp."),
		);
		expect(gitWriteCall).toBeDefined();
		expect(gitWriteCall![1]).toContain("qagent git wrapper");

		const gitRenameCall = mockRename.mock.calls.find(
			(call: string[]) =>
				typeof call[1] === "string" && call[1].endsWith("/git"),
		);
		expect(gitRenameCall).toBeDefined();
	});

	it("sets executable permissions on gh and git wrappers via writeFile mode", async () => {
		mockReadFile.mockRejectedValue(new Error("ENOENT"));

		await agent.setupWorkspaceHooks!("/workspace/test", {
			dataDir: "/data",
			sessionId: "sess-1",
		});

		const ghWriteCall = mockWriteFile.mock.calls.find(
			(call: [string, string, object]) =>
				typeof call[0] === "string" && call[0].includes("/gh.tmp."),
		);
		expect(ghWriteCall![2]).toEqual({ encoding: "utf-8", mode: 0o755 });

		const gitWriteCall = mockWriteFile.mock.calls.find(
			(call: [string, string, object]) =>
				typeof call[0] === "string" && call[0].includes("/git.tmp."),
		);
		expect(gitWriteCall![2]).toEqual({ encoding: "utf-8", mode: 0o755 });
	});

	it("skips wrapper writes when version marker matches", async () => {
		mockReadFile.mockImplementation((path: string) => {
			if (typeof path === "string" && path.endsWith(".qagent-version")) {
				return Promise.resolve("0.1.0");
			}
			return Promise.reject(new Error("ENOENT"));
		});

		await agent.setupWorkspaceHooks!("/workspace/test", {
			dataDir: "/data",
			sessionId: "sess-1",
		});

		const helperWriteCall = mockWriteFile.mock.calls.find(
			(call: [string, string, object]) =>
				typeof call[0] === "string" &&
				call[0].includes("qagent-metadata-helper.sh.tmp."),
		);
		expect(helperWriteCall).toBeDefined();

		const ghWriteCall = mockWriteFile.mock.calls.find(
			(call: [string, string, object]) =>
				typeof call[0] === "string" && call[0].includes("/gh.tmp."),
		);
		expect(ghWriteCall).toBeUndefined();
	});

	it("writes version marker after installing wrappers", async () => {
		mockReadFile.mockRejectedValue(new Error("ENOENT"));

		await agent.setupWorkspaceHooks!("/workspace/test", {
			dataDir: "/data",
			sessionId: "sess-1",
		});

		const versionWriteCall = mockWriteFile.mock.calls.find(
			(call: [string, string, object]) =>
				typeof call[0] === "string" && call[0].includes(".qagent-version.tmp."),
		);
		expect(versionWriteCall).toBeDefined();
		expect(versionWriteCall![1]).toBe("0.1.0");

		const versionRenameCall = mockRename.mock.calls.find(
			(call: string[]) =>
				typeof call[1] === "string" && call[1].endsWith(".qagent-version"),
		);
		expect(versionRenameCall).toBeDefined();
	});

	it("appends ao section to AGENTS.md when not present", async () => {
		mockReadFile.mockImplementation((path: string) => {
			if (typeof path === "string" && path.endsWith(".qagent-version")) {
				return Promise.resolve("0.1.0");
			}
			if (typeof path === "string" && path.endsWith("AGENTS.md")) {
				return Promise.resolve("# Existing Content\n\nSome stuff here.\n");
			}
			return Promise.reject(new Error("ENOENT"));
		});

		await agent.setupWorkspaceHooks!("/workspace/test", {
			dataDir: "/data",
			sessionId: "sess-1",
		});

		const agentsMdCall = mockWriteFile.mock.calls.find(
			(call: string[]) =>
				typeof call[0] === "string" && call[0].endsWith("AGENTS.md"),
		);
		expect(agentsMdCall).toBeDefined();
		expect(agentsMdCall![1]).toContain("Agent Orchestrator (qagent) Session");
		expect(agentsMdCall![1]).toContain("# Existing Content");
	});

	it("creates AGENTS.md if it does not exist", async () => {
		mockReadFile.mockImplementation((path: string) => {
			if (typeof path === "string" && path.endsWith(".qagent-version")) {
				return Promise.resolve("0.1.0");
			}
			return Promise.reject(new Error("ENOENT"));
		});

		await agent.setupWorkspaceHooks!("/workspace/test", {
			dataDir: "/data",
			sessionId: "sess-1",
		});

		const agentsMdCall = mockWriteFile.mock.calls.find(
			(call: string[]) =>
				typeof call[0] === "string" && call[0].endsWith("AGENTS.md"),
		);
		expect(agentsMdCall).toBeDefined();
		expect(agentsMdCall![1]).toContain("Agent Orchestrator (qagent) Session");
	});

	it("uses atomic write (temp + rename) to prevent partial reads from concurrent sessions", async () => {
		mockReadFile.mockRejectedValue(new Error("ENOENT"));

		await agent.setupWorkspaceHooks!("/workspace/test", {
			dataDir: "/data",
			sessionId: "sess-1",
		});

		const tmpWrites = mockWriteFile.mock.calls.filter(
			(call: [string, string, object]) =>
				typeof call[0] === "string" && call[0].includes(".tmp."),
		);
		const renames = mockRename.mock.calls;

		expect(tmpWrites.length).toBe(4);
		expect(renames.length).toBe(4);

		for (const [src, dst] of renames) {
			expect(src).toContain(".tmp.");
			expect(dst).not.toContain(".tmp.");
		}
	});

	it("does not duplicate ao section in AGENTS.md if already present", async () => {
		mockReadFile.mockImplementation((path: string) => {
			if (typeof path === "string" && path.endsWith(".qagent-version")) {
				return Promise.resolve("0.1.0");
			}
			if (typeof path === "string" && path.endsWith("AGENTS.md")) {
				return Promise.resolve(
					"# Existing\n\n## Agent Orchestrator (qagent) Session\n\nAlready here.\n",
				);
			}
			return Promise.reject(new Error("ENOENT"));
		});

		await agent.setupWorkspaceHooks!("/workspace/test", {
			dataDir: "/data",
			sessionId: "sess-1",
		});

		const agentsMdCall = mockWriteFile.mock.calls.find(
			(call: string[]) =>
				typeof call[0] === "string" && call[0].endsWith("AGENTS.md"),
		);
		expect(agentsMdCall).toBeUndefined();
	});
});

describe("postLaunchSetup", () => {
	const agent = create();

	it("has postLaunchSetup method", () => {
		expect(typeof agent.postLaunchSetup).toBe("function");
	});

	it("runs setup when session has workspacePath", async () => {
		mockReadFile.mockRejectedValue(new Error("ENOENT"));
		await agent.postLaunchSetup!(
			makeSession({ workspacePath: "/workspace/test" }),
		);
		expect(mockMkdir).toHaveBeenCalled();
	});

	it("returns early when session has no workspacePath", async () => {
		await agent.postLaunchSetup!(makeSession({ workspacePath: undefined }));
		expect(mockMkdir).not.toHaveBeenCalled();
	});
});

describe("shell wrapper content", () => {
	const agent = create();

	beforeEach(() => {
		mockReadFile.mockRejectedValue(new Error("ENOENT"));
	});

	async function getWrapperContent(name: string): Promise<string> {
		await agent.setupWorkspaceHooks!("/workspace/test", {
			dataDir: "/data",
			sessionId: "sess-1",
		});

		const call = mockWriteFile.mock.calls.find(
			(callArgs: [string, string, object]) =>
				typeof callArgs[0] === "string" &&
				callArgs[0].includes(`/${name}.tmp.`),
		);
		return call ? (call[1] as string) : "";
	}

	describe("metadata helper", () => {
		it("contains update_qagent_metadata function", async () => {
			const content = await getWrapperContent("qagent-metadata-helper.sh");
			expect(content).toContain("update_qagent_metadata()");
		});

		it("uses QAGENT_DATA_DIR and QAGENT_SESSION env vars", async () => {
			const content = await getWrapperContent("qagent-metadata-helper.sh");
			expect(content).toContain("QAGENT_DATA_DIR");
			expect(content).toContain("QAGENT_SESSION");
		});

		it("escapes sed metacharacters in values", async () => {
			const content = await getWrapperContent("qagent-metadata-helper.sh");
			expect(content).toContain("escaped_value");
			expect(content).toMatch(/sed.*\\\\&/);
		});

		it("uses atomic temp file + mv pattern", async () => {
			const content = await getWrapperContent("qagent-metadata-helper.sh");
			expect(content).toContain("temp_file");
			expect(content).toContain("mv");
		});

		it("validates session name has no path separators", async () => {
			const content = await getWrapperContent("qagent-metadata-helper.sh");
			expect(content).toContain("*/*");
			expect(content).toContain("*..*");
		});

		it("validates qagent_dir is an absolute path under expected locations", async () => {
			const content = await getWrapperContent("qagent-metadata-helper.sh");
			expect(content).toContain('$HOME"/.qagent/*');
			expect(content).toContain("/tmp/*");
		});

		it("resolves symlinks and verifies file stays within qagent_dir", async () => {
			const content = await getWrapperContent("qagent-metadata-helper.sh");
			expect(content).toContain("pwd -P");
			expect(content).toContain("real_qagent_dir");
			expect(content).toContain("real_dir");
		});
	});

	describe("gh wrapper", () => {
		it("uses grep -Fxv for PATH cleaning (not regex grep)", async () => {
			const content = await getWrapperContent("gh");
			expect(content).toContain("grep -Fxv");
			expect(content).not.toMatch(/grep -v "\^\$ao_bin_dir\$"/);
		});

		it("only captures output for pr/create and pr/merge", async () => {
			const content = await getWrapperContent("gh");
			expect(content).toContain("pr/create|pr/merge");
		});

		it("uses exec for non-PR commands (transparent passthrough)", async () => {
			const content = await getWrapperContent("gh");
			expect(content).toContain('exec "$real_gh"');
		});

		it("extracts PR URL from gh pr create output", async () => {
			const content = await getWrapperContent("gh");
			expect(content).toContain("https://github");
			expect(content).toContain("update_qagent_metadata pr");
		});

		it("updates status to merged on gh pr merge", async () => {
			const content = await getWrapperContent("gh");
			expect(content).toContain("update_qagent_metadata status merged");
		});

		it("cleans up temp file on exit", async () => {
			const content = await getWrapperContent("gh");
			expect(content).toContain("trap");
			expect(content).toContain("rm -f");
		});
	});

	describe("git wrapper", () => {
		it("uses grep -Fxv for PATH cleaning (not regex grep)", async () => {
			const content = await getWrapperContent("git");
			expect(content).toContain("grep -Fxv");
			expect(content).not.toMatch(/grep -v "\^\$ao_bin_dir\$"/);
		});

		it("captures branch name from checkout -b", async () => {
			const content = await getWrapperContent("git");
			expect(content).toContain("checkout/-b");
			expect(content).toContain("update_qagent_metadata branch");
		});

		it("captures branch name from switch -c", async () => {
			const content = await getWrapperContent("git");
			expect(content).toContain("switch/-c");
		});

		it("only updates metadata on success (exit code 0)", async () => {
			const content = await getWrapperContent("git");
			expect(content).toContain("exit_code -eq 0");
		});

		it("sources the metadata helper", async () => {
			const content = await getWrapperContent("git");
			expect(content).toContain("source");
			expect(content).toContain("qagent-metadata-helper.sh");
		});
	});
});
