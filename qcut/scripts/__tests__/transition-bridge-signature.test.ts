// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
	requireTransitionBridgeEntitlements,
	verifyPackagedJianyingRuntimeBridge,
} from "../verify-packaged-jianying-runtime-bridge.js";

const bridgeFileName = "jianying-transition-bridge";
const temporaryDirectories: string[] = [];
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

async function createFixture({ entitlements }: { entitlements: string }) {
	const root = await mkdtemp(path.join(tmpdir(), "qcut-signed-bridge-"));
	temporaryDirectories.push(root);
	const stagedPath = path.join(root, "electron/resources/bin", bridgeFileName);
	const distRoot = path.join(root, "dist-electron");
	const packagedPath = path.join(
		distRoot,
		"mac-arm64/QCut.app/Contents/Resources/bin",
		bridgeFileName
	);
	await mkdir(path.dirname(stagedPath), { recursive: true });
	await mkdir(path.dirname(packagedPath), { recursive: true });
	const source = path.join(root, "bridge.c");
	await writeFile(
		source,
		'#include <stdlib.h>\n#include <stdio.h>\nint main(void) {\nconst char *p = getenv("DYLD_LIBRARY_PATH");\nif (!p) return 7;\nputs(p);\nreturn 0;\n}\n'
	);
	execFileSync("/usr/bin/clang", [source, "-o", stagedPath], {
		timeout: 30_000,
	});
	await copyFile(stagedPath, packagedPath);
	execFileSync("/usr/bin/codesign", [
		"--force",
		"--sign",
		"-",
		"--options",
		"runtime",
		"--timestamp=none",
		"--entitlements",
		entitlements,
		packagedPath,
	]);
	return { projectRoot: root, distRoot, packagedPath };
}

// This exercises macOS dyld and codesign, not a mock of their behavior.
describe.skipIf(process.platform !== "darwin")(
	"signed transition bridge",
	() => {
		it("reproduces the old failure and rejects the packaged helper", async () => {
			const fixture = await createFixture({
				entitlements: path.join(projectRoot, "build/entitlements.mac.plist"),
			});
			const result = spawnSync(fixture.packagedPath, [], {
				env: {
					...process.env,
					DYLD_LIBRARY_PATH: "/tmp/qcut-private-frameworks",
				},
			});
			expect(result.status).toBe(7);
			await expect(
				verifyPackagedJianyingRuntimeBridge({ ...fixture, bridgeFileName })
			).rejects.toThrow("allow-dyld-environment-variables");
		}, 30_000);

		it("preserves the runtime search path and accepts the corrected signature", async () => {
			const fixture = await createFixture({
				entitlements: path.join(
					projectRoot,
					"build/entitlements.transition-bridge.mac.plist"
				),
			});
			const output = execFileSync(fixture.packagedPath, [], {
				env: {
					...process.env,
					DYLD_LIBRARY_PATH: "/tmp/qcut-private-frameworks",
				},
				encoding: "utf8",
			});
			expect(output.trim()).toBe("/tmp/qcut-private-frameworks");
			await expect(
				verifyPackagedJianyingRuntimeBridge({ ...fixture, bridgeFileName })
			).resolves.toBe(fixture.packagedPath);
		}, 30_000);

		it("rejects false entitlements rather than accepting their key names", async () => {
			const root = await mkdtemp(
				path.join(tmpdir(), "qcut-false-entitlements-")
			);
			temporaryDirectories.push(root);
			const plist = path.join(root, "false.plist");
			await writeFile(
				plist,
				'<?xml version="1.0"?><plist version="1.0"><dict><key>com.apple.security.cs.allow-dyld-environment-variables</key><false/><key>com.apple.security.cs.disable-library-validation</key><true/></dict></plist>'
			);
			const fixture = await createFixture({ entitlements: plist });
			await expect(
				requireTransitionBridgeEntitlements({ filePath: fixture.packagedPath })
			).rejects.toThrow("allow-dyld-environment-variables");
		}, 30_000);
	}
);
