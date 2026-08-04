import { spawn } from "node:child_process";

const TYPECHECK_TARGETS = [
	"apps/web/tsconfig.json",
	"electron/tsconfig.json",
	"packages/agent-worker/tsconfig.json",
	"packages/editor-core/tsconfig.json",
	"packages/jianying-draft-export/tsconfig.json",
	"packages/jianying-draft-import/tsconfig.json",
	"packages/license-server/tsconfig.json",
	"packages/platform-core/tsconfig.json",
	"packages/platform-desktop/tsconfig.json",
	"packages/platform-web/tsconfig.json",
	"packages/qcut-relay/tsconfig.json",
	"scripts/tsconfig.json",
] as const;

async function runTypecheck({ tsconfig }: { tsconfig: string }): Promise<void> {
	console.log(`== ${tsconfig}`);
	await runCommand({
		args: ["tsc", "--noEmit", "--pretty", "false", "-p", tsconfig],
		command: "bunx",
	});
}

async function runTypechecks({
	tsconfigs,
}: {
	tsconfigs: readonly string[];
}): Promise<void> {
	await tsconfigs.reduce<Promise<void>>(async (previousRun, tsconfig) => {
		await previousRun;
		await runTypecheck({ tsconfig });
	}, Promise.resolve());
}

function runCommand({
	args,
	command,
}: {
	args: readonly string[];
	command: string;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, [...args], {
			stdio: "inherit",
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${command} ${args.join(" ")} failed with ${code}`));
		});
	});
}

await runTypechecks({ tsconfigs: TYPECHECK_TARGETS });
