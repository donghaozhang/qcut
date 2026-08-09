import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	discoverInstalledQCutApp,
	QCUT_BUNDLE_ID,
	QCUT_MAC_TEAM_ID,
	QCUT_PRODUCT_NAME,
} from "../app-update-discovery.js";
import { replaceAppBundle, verifyMacAppBundle } from "../app-update-install.js";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "qcut-update-install-test-"));
	temporaryDirectories.push(directory);
	return directory;
}

function createFakeApp({
	path,
	marker,
}: {
	path: string;
	marker: string;
}): void {
	mkdirSync(path, { recursive: true });
	writeFileSync(join(path, "marker.txt"), marker);
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("QCut app bundle replacement", () => {
	it("accepts a bundle signed by the official QCut team", () => {
		const spawnSyncImpl = vi.fn((_command, args) => {
			if (args.includes("--display")) {
				return {
					status: 0,
					stdout: "",
					stderr: `Identifier=${QCUT_BUNDLE_ID}\nTeamIdentifier=${QCUT_MAC_TEAM_ID}`,
				};
			}
			return { status: 0, stdout: "", stderr: "" };
		}) as unknown as typeof spawnSync;

		expect(() =>
			verifyMacAppBundle({ appPath: "/tmp/QCut.app", spawnSyncImpl })
		).not.toThrow();
	});

	it("rejects a bundle signed by a different Apple team", () => {
		const spawnSyncImpl = vi.fn((_command, args) => {
			if (args.includes("--display")) {
				return {
					status: 0,
					stdout: "",
					stderr: `Identifier=${QCUT_BUNDLE_ID}\nTeamIdentifier=UNTRUSTED`,
				};
			}
			return { status: 0, stdout: "", stderr: "" };
		}) as unknown as typeof spawnSync;

		expect(() =>
			verifyMacAppBundle({ appPath: "/tmp/QCut.app", spawnSyncImpl })
		).toThrow("not signed by Quriosity Pty Ltd");
	});

	it("discovers the installed macOS app and reads its package version", () => {
		const home = temporaryDirectory();
		const appPath = join(home, "Applications", `${QCUT_PRODUCT_NAME}.app`);
		const executablePath = join(
			appPath,
			"Contents",
			"MacOS",
			QCUT_PRODUCT_NAME
		);
		mkdirSync(join(appPath, "Contents", "MacOS"), { recursive: true });
		writeFileSync(executablePath, "binary");
		const spawnSyncImpl = vi.fn(() => ({
			status: 0,
			stdout: "2026.8.103\n",
			stderr: "",
		})) as unknown as typeof spawnSync;

		const app = discoverInstalledQCutApp({
			platform: "darwin",
			home,
			env: { QCUT_APP_PATH: appPath },
			execPath: "/usr/local/bin/bun",
			spawnSyncImpl,
		});

		expect(app).toMatchObject({
			installed: true,
			path: appPath,
			executablePath,
			version: "2026.8.103",
			kind: "mac-zip",
		});
	});

	it("atomically replaces an existing app", () => {
		const directory = temporaryDirectory();
		const targetPath = join(directory, "QCut.app");
		const stagedPath = join(directory, "QCut.staged.app");
		createFakeApp({ path: targetPath, marker: "old" });
		createFakeApp({ path: stagedPath, marker: "new" });

		const action = replaceAppBundle({ stagedPath, targetPath });

		expect(action).toBe("replaced");
		expect(readFileSync(join(targetPath, "marker.txt"), "utf8")).toBe("new");
	});

	it("restores the previous app when post-install verification fails", () => {
		const directory = temporaryDirectory();
		const targetPath = join(directory, "QCut.app");
		const stagedPath = join(directory, "QCut.staged.app");
		createFakeApp({ path: targetPath, marker: "old" });
		createFakeApp({ path: stagedPath, marker: "new" });

		expect(() =>
			replaceAppBundle({
				stagedPath,
				targetPath,
				verify: () => {
					throw new Error("invalid signature");
				},
			})
		).toThrow("invalid signature");
		expect(readFileSync(join(targetPath, "marker.txt"), "utf8")).toBe("old");
	});

	it("installs when no previous app exists", () => {
		const directory = temporaryDirectory();
		const targetPath = join(directory, "QCut.app");
		const stagedPath = join(directory, "QCut.staged.app");
		createFakeApp({ path: stagedPath, marker: "new" });

		expect(replaceAppBundle({ stagedPath, targetPath })).toBe("installed");
		expect(readFileSync(join(targetPath, "marker.txt"), "utf8")).toBe("new");
	});
});
