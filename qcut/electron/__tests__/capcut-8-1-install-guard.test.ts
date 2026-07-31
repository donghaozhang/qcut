import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecFile } = vi.hoisted(() => ({
	mockExecFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	default: { execFile: mockExecFile },
	execFile: mockExecFile,
}));

import { createCapCut81TargetAppGuard } from "../capcut-8-1-install-guard.js";

const temporaryRoots: string[] = [];

async function createCanonicalAppFixture(): Promise<{
	canonicalAppPath: string;
	executablePath: string;
	requestedAppPath: string;
}> {
	const rootDirectory = await mkdtemp(join(tmpdir(), "qcut-capcut-guard-"));
	temporaryRoots.push(rootDirectory);
	const canonicalAppPath = join(rootDirectory, "Canonical", "CapCut.app");
	const executablePath = join(canonicalAppPath, "Contents", "MacOS", "CapCut");
	const requestedAppPath = join(rootDirectory, "Requested", "CapCut.app");
	await Promise.all([
		mkdir(join(canonicalAppPath, "Contents", "MacOS"), { recursive: true }),
		mkdir(join(rootDirectory, "Requested"), { recursive: true }),
	]);
	await writeFile(executablePath, "");
	await symlink(canonicalAppPath, requestedAppPath, "dir");
	return { canonicalAppPath, executablePath, requestedAppPath };
}

describe("CapCut 8.1 target app guard", () => {
	beforeEach(() => {
		mockExecFile.mockReset();
	});

	afterEach(async () => {
		const roots = temporaryRoots.splice(0);
		await Promise.all(
			roots.map((rootDirectory) =>
				rm(rootDirectory, { force: true, recursive: true })
			)
		);
	});

	it("uses the fixed bounded ps command and detects a process in the canonical app", async () => {
		const { executablePath, requestedAppPath } =
			await createCanonicalAppFixture();
		mockExecFile.mockImplementation(
			(
				_executable: string,
				_arguments: string[],
				_options: Record<string, unknown>,
				callback: (error: Error | null, stdout: string, stderr: string) => void
			) => {
				callback(null, `  19 /usr/bin/login\n  42 ${executablePath}\n`, "");
			}
		);
		const guard = createCapCut81TargetAppGuard();

		await expect(
			guard({
				capCutAppPath: requestedAppPath,
				targetDraftStoreDirectory: join(
					temporaryRoots[0],
					"com.lveditor.draft"
				),
			})
		).rejects.toMatchObject({
			name: "CapCutAppRunningError",
		});
		expect(mockExecFile).toHaveBeenCalledWith(
			"/bin/ps",
			["-axo", "pid=,comm="],
			{
				encoding: "utf8",
				maxBuffer: 1024 * 1024,
				timeout: 5000,
				windowsHide: true,
			},
			expect.any(Function)
		);
	});

	it("ignores unrelated absolute executable paths", async () => {
		const { requestedAppPath } = await createCanonicalAppFixture();
		mockExecFile.mockImplementation(
			(
				_executable: string,
				_arguments: string[],
				_options: Record<string, unknown>,
				callback: (error: Error | null, stdout: string, stderr: string) => void
			) => {
				callback(
					null,
					"  42 /Applications/Other.app/Contents/MacOS/Other\n",
					""
				);
			}
		);

		await expect(
			createCapCut81TargetAppGuard()({
				capCutAppPath: requestedAppPath,
				targetDraftStoreDirectory: join(
					temporaryRoots[0],
					"com.lveditor.draft"
				),
			})
		).resolves.toBeUndefined();
	});
});
