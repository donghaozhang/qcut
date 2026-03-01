/**
 * Background E2E test launcher — runs tests without visible windows.
 *
 * Sets QCUT_E2E_OFFSCREEN=1 so Electron hides the window (opacity=0),
 * then launches Playwright. On Linux, optionally wraps with xvfb-run.
 *
 * Usage:
 *   bun run test:e2e:bg                    # invisible mode
 *   bun run test:e2e:bg -- --grep timeline  # pass args to Playwright
 *   bun run test:e2e                        # normal visible mode (unchanged)
 */

import { execFile, spawn } from "node:child_process";
import { platform } from "node:os";

function log(msg: string): void {
	process.stderr.write(`[e2e-bg] ${msg}\n`);
}

function commandExists(name: string): Promise<boolean> {
	const checkCmd = platform() === "win32" ? "where" : "which";
	return new Promise((resolve) => {
		execFile(checkCmd, [name], (err) => resolve(!err));
	});
}

function spawnAndWait(
	command: string,
	args: string[],
	env: Record<string, string | undefined>
): Promise<number> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: "inherit",
			env,
			shell: platform() === "win32",
		});

		child.on("error", (err) => reject(err));
		child.on("exit", (code, signal) => {
			if (signal) {
				log(`Playwright terminated by signal ${signal}`);
				resolve(1);
				return;
			}
			resolve(code ?? 1);
		});
	});
}

async function main(): Promise<void> {
	const plat = platform();
	log(`Platform: ${plat}`);

	// Parse args: everything after "--" goes to Playwright
	const rawArgs = process.argv.slice(2);
	const dashDashIdx = rawArgs.indexOf("--");
	const playwrightArgs =
		dashDashIdx >= 0 ? rawArgs.slice(dashDashIdx + 1) : rawArgs;

	// Base env: always set QCUT_E2E_OFFSCREEN so Electron hides the window
	const env: Record<string, string | undefined> = {
		...process.env,
		QCUT_E2E_OFFSCREEN: "1",
	};

	// Linux: wrap with xvfb-run if available (for headless CI servers)
	const useXvfb = plat === "linux" && (await commandExists("xvfb-run"));

	const command = useXvfb ? "xvfb-run" : "bunx";
	const commandArgs = useXvfb
		? [
				"--auto-servernum",
				"--server-args=-screen 0 1920x1080x24 -ac",
				"bunx",
				"playwright",
				"test",
				...playwrightArgs,
			]
		: ["playwright", "test", ...playwrightArgs];

	log(`Running: ${command} ${commandArgs.join(" ")}`);
	log("Window mode: invisible (opacity=0)");

	const exitCode = await spawnAndWait(command, commandArgs, env);
	process.exit(exitCode);
}

main().catch((err) => {
	log(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
