import {
	buildCodexPromptEnv,
	buildCodexShellCommand,
	getCodexPrompt,
	isCodexAgentCommand,
	tokenizeCommand,
} from "../run-container.js";
import {
	AGENT_DONE_FILE,
	AGENT_PID_FILE,
	ARCHIVE_COMMAND,
	CODEX_LIVE_STDOUT_FILE,
	DAYTONA_OUTPUT_DIR,
	OUTPUT_ARCHIVE,
	QCUT_EXIT_FILE,
	QCUT_STDERR_FILE,
	QCUT_STDOUT_FILE,
	WRAPPER_STDERR_FILE,
	WRAPPER_STDOUT_FILE,
} from "./constants.js";
import type { CommandParts } from "./types.js";

export function isDaytonaEmptyExitCodeError({
	error,
}: {
	error: unknown;
}): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("failed to convert exit code to int") ||
		message.includes('strconv.Atoi: parsing ""')
	);
}

export function quoteShellArg({ arg }: { arg: string }): string {
	if (/^[A-Za-z0-9_\-./:=,@+]+$/.test(arg)) {
		return arg;
	}
	return `'${arg.replaceAll("'", "'\\''")}'`;
}

function buildQcutShellCommand({ quotedArgv }: { quotedArgv: string }): string {
	const qcutCommand = `/usr/local/bin/qcut-entrypoint ${quotedArgv} -o ${DAYTONA_OUTPUT_DIR}`;
	return [
		`mkdir -p ${DAYTONA_OUTPUT_DIR}`,
		"set +e",
		`${qcutCommand} > ${DAYTONA_OUTPUT_DIR}/${QCUT_STDOUT_FILE} 2> ${DAYTONA_OUTPUT_DIR}/${QCUT_STDERR_FILE}`,
		"exit_code=$?",
		`printf '{"exitCode":%s}\\n' "$exit_code" > ${DAYTONA_OUTPUT_DIR}/${QCUT_EXIT_FILE}`,
		'[ "$exit_code" -eq 0 ]',
	].join("; ");
}

function buildCodexShellCommandForJob({ args }: { args?: unknown }): string {
	const env = buildCodexPromptEnv({ prompt: getCodexPrompt({ args }) });
	return [
		`export QCUT_CODEX_PROMPT_B64=${quoteShellArg({ arg: env.QCUT_CODEX_PROMPT_B64 })}`,
		"export QCUT_BOOTSTRAP_CODEX=1",
		buildCodexShellCommand({ outputDir: DAYTONA_OUTPUT_DIR }),
	].join("; ");
}

export function outputPath({ filename }: { filename: string }): string {
	return `${DAYTONA_OUTPUT_DIR}/${filename}`;
}

export function buildAsyncStartCommand({
	command,
}: {
	command: string;
}): string {
	const donePath = outputPath({ filename: AGENT_DONE_FILE });
	const pidPath = outputPath({ filename: AGENT_PID_FILE });
	const wrapperStdoutPath = outputPath({ filename: WRAPPER_STDOUT_FILE });
	const wrapperStderrPath = outputPath({ filename: WRAPPER_STDERR_FILE });
	const wrappedCommand = [
		"set +e",
		command,
		"exit_code=$?",
		`[ -f ${outputPath({ filename: QCUT_EXIT_FILE })} ] || printf '{"exitCode":%s}\\n' "$exit_code" > ${outputPath({ filename: QCUT_EXIT_FILE })}`,
		`touch ${donePath}`,
		'exit "$exit_code"',
	].join("; ");
	return [
		`rm -rf ${DAYTONA_OUTPUT_DIR} ${OUTPUT_ARCHIVE}`,
		`mkdir -p ${DAYTONA_OUTPUT_DIR}`,
		`( ${wrappedCommand} ) > ${wrapperStdoutPath} 2> ${wrapperStderrPath} & pid=$!`,
		`printf '{"pid":%s}\\n' "$pid" > ${pidPath}`,
	].join("; ");
}

export function buildDaytonaCommand({
	command,
	args,
}: {
	command: string;
	args?: unknown;
}): CommandParts {
	const safeArgv = tokenizeCommand(command);
	if (isCodexAgentCommand({ command })) {
		getCodexPrompt({ args });
		return {
			command: buildCodexShellCommandForJob({ args }),
			archiveCommand: ARCHIVE_COMMAND,
			streams: [
				{
					path: outputPath({ filename: CODEX_LIVE_STDOUT_FILE }),
					kind: "codex_stdout",
					source: CODEX_LIVE_STDOUT_FILE,
				},
				{
					path: outputPath({ filename: "codex-events.jsonl" }),
					kind: "codex_event",
					source: "codex-events.jsonl",
				},
				{
					path: outputPath({ filename: WRAPPER_STDERR_FILE }),
					kind: "daytona_stderr",
					source: WRAPPER_STDERR_FILE,
				},
			],
			stdoutPath: outputPath({ filename: "codex-events.jsonl" }),
			stderrPath: outputPath({ filename: WRAPPER_STDERR_FILE }),
			exitPath: outputPath({ filename: QCUT_EXIT_FILE }),
		};
	}

	const quotedArgv = safeArgv.map((arg) => quoteShellArg({ arg })).join(" ");

	return {
		command: buildQcutShellCommand({ quotedArgv }),
		archiveCommand: ARCHIVE_COMMAND,
		streams: [
			{
				path: outputPath({ filename: QCUT_STDOUT_FILE }),
				kind: "daytona_stdout",
				source: QCUT_STDOUT_FILE,
			},
			{
				path: outputPath({ filename: QCUT_STDERR_FILE }),
				kind: "daytona_stderr",
				source: QCUT_STDERR_FILE,
			},
			{
				path: outputPath({ filename: WRAPPER_STDERR_FILE }),
				kind: "daytona_stderr",
				source: WRAPPER_STDERR_FILE,
			},
		],
		stdoutPath: outputPath({ filename: QCUT_STDOUT_FILE }),
		stderrPath: outputPath({ filename: QCUT_STDERR_FILE }),
		exitPath: outputPath({ filename: QCUT_EXIT_FILE }),
	};
}

export function parseExitCode({ text }: { text: string }): number {
	try {
		const parsed = JSON.parse(text);
		const value = (parsed as { exitCode?: unknown }).exitCode;
		return typeof value === "number" && Number.isFinite(value) ? value : 1;
	} catch {
		return 1;
	}
}
