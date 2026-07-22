import assert from "node:assert/strict";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import {
	inspectQCut,
	isEntryPoint,
	resolveQCutCli,
	runQCutCommand,
} from "./qcut-runner.mjs";

const tempRoot = mkdtempSync(join(tmpdir(), "qcut-plugin-test-"));
after(() => rmSync(tempRoot, { recursive: true, force: true }));

function createFakeCli({ editorRunning = true } = {}) {
	const filePath = join(tempRoot, `fake-qcut-${editorRunning}.mjs`);
	writeFileSync(
		filePath,
		`#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("9.8.7\\n");
} else if (args[0] === "editor:health") {
  process.stdout.write(JSON.stringify(${editorRunning ? '{ status: "ok", data: { healthy: true } }' : '{ status: "error", error: "offline" }'}));
  process.exitCode = ${editorRunning ? "0" : "1"};
} else {
  process.stdout.write(JSON.stringify({ status: "ok", data: { args } }));
}
`,
		"utf8"
	);
	chmodSync(filePath, 0o755);
	return filePath;
}

test("resolves an explicit QCUT_CLI_PATH", () => {
	const fakeCli = createFakeCli();
	const resolved = resolveQCutCli({
		env: { ...process.env, QCUT_CLI_PATH: fakeCli },
		cwd: tempRoot,
		scriptPath: join(tempRoot, "plugin/scripts/qcut-runner.mjs"),
	});
	assert.equal(resolved?.source, "environment");
	assert.equal(resolved?.version, "9.8.7");
});

test("prefers qcut over qcut-pipeline on PATH", () => {
	const calls = [];
	const spawn = (command) => {
		calls.push(command);
		if (command === "qcut") return { status: 0, stdout: "1.2.3\n" };
		return { status: 127, stdout: "" };
	};
	const resolved = resolveQCutCli({
		env: {},
		cwd: tempRoot,
		scriptPath: join(tempRoot, "plugin/scripts/qcut-runner.mjs"),
		spawn,
	});
	assert.equal(resolved?.command, "qcut");
	assert.deepEqual(calls, ["qcut"]);
});

test("falls back to a QCut repository source checkout", () => {
	const repository = join(tempRoot, "repo");
	const nested = join(repository, "plugins/qcut/scripts");
	mkdirSync(join(repository, "electron/native-pipeline/cli"), {
		recursive: true,
	});
	mkdirSync(nested, { recursive: true });
	writeFileSync(join(repository, "package.json"), '{"name":"qcut"}', "utf8");
	writeFileSync(
		join(repository, "electron/native-pipeline/cli/cli.ts"),
		"",
		"utf8"
	);

	const spawn = (command, args) => {
		if (command === "bun" && args[0] === "run" && args[1] === "qcut") {
			return { status: 0, stdout: "1.0.0\n" };
		}
		return { status: 127, stdout: "" };
	};
	const resolved = resolveQCutCli({
		env: {},
		cwd: nested,
		scriptPath: join(nested, "qcut-runner.mjs"),
		spawn,
	});
	assert.equal(resolved?.source, "repository-source");
	assert.equal(resolved?.cwd, repository);
});

test("uses the CLI embedded in an installed QCut app", () => {
	const installedCandidate = {
		command: "/Applications/QCut.app/Contents/MacOS/QCut",
		prefixArgs: [
			"/Applications/QCut.app/Contents/Resources/app.asar/electron/native-pipeline/cli/cli.js",
		],
		source: "installed-app",
		env: { ELECTRON_RUN_AS_NODE: "1" },
	};
	let observedEnvironment;
	const spawn = (command, _args, options) => {
		if (command !== installedCandidate.command) {
			return { status: 127, stdout: "" };
		}
		observedEnvironment = options.env;
		return { status: 0, stdout: "1.0.0\n" };
	};
	const resolved = resolveQCutCli({
		env: { PATH: "" },
		cwd: tempRoot,
		scriptPath: join(tempRoot, "installed-plugin/qcut-runner.mjs"),
		spawn,
		installedCandidates: [installedCandidate],
	});

	assert.equal(resolved?.source, "installed-app");
	assert.equal(resolved?.version, "1.0.0");
	assert.equal(observedEnvironment.ELECTRON_RUN_AS_NODE, "1");
});

test("reports no CLI when every candidate fails", () => {
	const resolved = resolveQCutCli({
		env: {},
		cwd: tempRoot,
		scriptPath: join(tempRoot, "outside/qcut-runner.mjs"),
		spawn: () => ({ status: 127, stdout: "" }),
	});
	assert.equal(resolved, null);
});

test("doctor distinguishes CLI discovery from editor availability", () => {
	const fakeCli = createFakeCli({ editorRunning: false });
	const resolved = resolveQCutCli({
		env: { ...process.env, QCUT_CLI_PATH: fakeCli },
		cwd: tempRoot,
		scriptPath: join(tempRoot, "plugin/scripts/qcut-runner.mjs"),
	});
	assert.ok(resolved);
	const optional = inspectQCut({ resolved });
	assert.equal(optional.status, "ok");
	assert.equal(optional.data.editor.running, false);
	const required = inspectQCut({ resolved, requireEditor: true });
	assert.equal(required.status, "error");
	assert.equal(required.code, "qcut:editor_unavailable");
});

test("forwards arguments without invoking a shell", () => {
	let observed;
	const spawn = (command, args, options) => {
		observed = { command, args, options };
		return { status: 0 };
	};
	const result = runQCutCommand({
		resolved: {
			command: "qcut",
			prefixArgs: [],
			source: "path",
			version: "1.0.0",
		},
		args: ["gen", "image", "-t", "a; harmless prompt", "--json"],
		spawn,
	});
	assert.equal(result.status, 0);
	assert.deepEqual(observed.args, [
		"gen",
		"image",
		"-t",
		"a; harmless prompt",
		"--json",
	]);
	assert.equal(observed.options.shell, undefined);
});

test("recognizes the entry point through an equivalent symlink path", () => {
	const realDirectory = join(tempRoot, "entry-real");
	const aliasDirectory = join(tempRoot, "entry-alias");
	const realScript = join(realDirectory, "qcut-runner.mjs");
	mkdirSync(realDirectory);
	writeFileSync(realScript, "", "utf8");
	symlinkSync(realDirectory, aliasDirectory, "dir");

	assert.equal(
		isEntryPoint({
			argvPath: join(aliasDirectory, "qcut-runner.mjs"),
			moduleUrl: pathToFileURL(realScript).href,
		}),
		true
	);
});
