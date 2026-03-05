import { execSync } from "node:child_process";
import path from "node:path";

const EXPECTED_SUBMODULE = {
	path: "qcut/packages/nexusai-website",
	url: "https://github.com/donghaozhang/nexusai-website.git",
	branch: "master",
} as const;

function runCommand({ command, cwd }: { command: string; cwd?: string }): string {
	return execSync(command, { cwd, encoding: "utf8" }).trim();
}

function assertCondition({ condition, message }: { condition: boolean; message: string }): void {
	if (!condition) {
		throw new Error(message);
	}
}

function readGitModuleConfig({ gitmodulesPath, key }: { gitmodulesPath: string; key: string }): string {
	const command = `git config -f "${gitmodulesPath}" --get ${key}`;
	return runCommand({ command });
}

try {
	const repoRoot = runCommand({ command: "git rev-parse --show-toplevel" });
	const gitmodulesPath = path.join(repoRoot, ".gitmodules");

	const pathValue = readGitModuleConfig({
		gitmodulesPath,
		key: 'submodule."qcut/packages/nexusai-website".path',
	});
	const urlValue = readGitModuleConfig({
		gitmodulesPath,
		key: 'submodule."qcut/packages/nexusai-website".url',
	});
	const branchValue = readGitModuleConfig({
		gitmodulesPath,
		key: 'submodule."qcut/packages/nexusai-website".branch',
	});

	assertCondition({
		condition: pathValue === EXPECTED_SUBMODULE.path,
		message: `Unexpected submodule path: ${pathValue}`,
	});
	assertCondition({
		condition: urlValue === EXPECTED_SUBMODULE.url,
		message: `Unexpected submodule url: ${urlValue}`,
	});
	assertCondition({
		condition: branchValue === EXPECTED_SUBMODULE.branch,
		message: `Unexpected submodule branch: ${branchValue}`,
	});

	const statusLine = runCommand({
		command: `git submodule status ${EXPECTED_SUBMODULE.path}`,
		cwd: repoRoot,
	});
	assertCondition({
		condition: statusLine.includes(EXPECTED_SUBMODULE.path),
		message: "Submodule status does not include expected path",
	});

	const branchLine = runCommand({
		command: `git -C "${path.join(repoRoot, EXPECTED_SUBMODULE.path)}" branch --show-current`,
	});
	assertCondition({
		condition: branchLine === EXPECTED_SUBMODULE.branch,
		message: `Unexpected checked out branch: ${branchLine}`,
	});

	console.log("NexusAI submodule verification passed.");
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`NexusAI submodule verification failed: ${message}`);
	process.exit(1);
}
