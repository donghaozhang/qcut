import { join, resolve } from "node:path";
import {
	advanceCapCut81WritebackAppSession,
	createCapCut81WritebackAppSession,
	type CapCut81WritebackAppSessionBoundary,
} from "./capcut-8-1-writeback-app-session.js";

const PRE_OPEN_FLAGS = [
	"--app",
	"--case-id",
	"--draft",
	"--home",
	"--output-sha256",
	"--profile-id",
	"--run-id",
	"--session",
] as const;
const ADVANCE_FLAGS = ["--session"] as const;

type PreOpenFlag = (typeof PRE_OPEN_FLAGS)[number];
type AdvanceFlag = (typeof ADVANCE_FLAGS)[number];

export type CapCut81WritebackAppSessionCliOptions =
	| {
			appPath: string;
			caseId: string;
			command: "pre-open";
			dedicatedTestHomeDirectory: string;
			draftDirectory: string;
			json: boolean;
			outputContentSha256: string;
			profileId: string;
			runId?: string;
			sessionDirectory: string;
	  }
	| {
			command: CapCut81WritebackAppSessionBoundary;
			json: boolean;
			sessionDirectory: string;
	  };

function requireAdvanceCommand({
	value,
}: {
	value: string;
}): CapCut81WritebackAppSessionBoundary {
	if (value === "opened" || value === "saved" || value === "reopened") {
		return value;
	}
	if (value === "final") return value;
	throw new Error(
		"Command must be one of: pre-open, opened, saved, reopened, final."
	);
}

function parseValues<Flag extends string>({
	argv,
	flags,
}: {
	argv: string[];
	flags: readonly Flag[];
}): { json: boolean; values: ReadonlyMap<Flag, string> } {
	const values = new Map<Flag, string>();
	let json = false;
	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index] ?? "";
		if (flag === "--json") {
			if (json) throw new Error("Duplicate flag: --json");
			json = true;
			continue;
		}
		if (!flags.includes(flag as Flag)) throw new Error(`Unknown flag: ${flag}`);
		const typedFlag = flag as Flag;
		if (values.has(typedFlag)) throw new Error(`Duplicate flag: ${flag}`);
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`Missing value for ${flag}`);
		}
		values.set(typedFlag, value);
		index += 1;
	}
	return { json, values };
}

function requireValue<Flag extends string>({
	flag,
	values,
}: {
	flag: Flag;
	values: ReadonlyMap<Flag, string>;
}): string {
	const value = values.get(flag);
	if (value === undefined) throw new Error(`Missing required flag: ${flag}`);
	return value;
}

export function parseCapCut81WritebackAppSessionCliOptions({
	argv,
}: {
	argv: string[];
}): CapCut81WritebackAppSessionCliOptions {
	const [command = "", ...commandArgv] = argv;
	if (command === "pre-open") {
		const { json, values } = parseValues({
			argv: commandArgv,
			flags: PRE_OPEN_FLAGS,
		});
		const runId = values.get("--run-id");
		return {
			appPath: resolve(requireValue({ flag: "--app", values })),
			caseId: requireValue({ flag: "--case-id", values }),
			command,
			dedicatedTestHomeDirectory: resolve(
				requireValue({ flag: "--home", values })
			),
			draftDirectory: resolve(requireValue({ flag: "--draft", values })),
			json,
			outputContentSha256: requireValue({
				flag: "--output-sha256",
				values,
			}),
			profileId: requireValue({ flag: "--profile-id", values }),
			...(runId === undefined ? {} : { runId }),
			sessionDirectory: resolve(requireValue({ flag: "--session", values })),
		};
	}
	const advanceCommand = requireAdvanceCommand({ value: command });
	const { json, values } = parseValues({
		argv: commandArgv,
		flags: ADVANCE_FLAGS,
	});
	return {
		command: advanceCommand,
		json,
		sessionDirectory: resolve(requireValue({ flag: "--session", values })),
	};
}

export async function runCapCut81WritebackAppSessionCli({
	argv,
}: {
	argv: string[];
}): Promise<void> {
	const options = parseCapCut81WritebackAppSessionCliOptions({ argv });
	const result =
		options.command === "pre-open"
			? await createCapCut81WritebackAppSession(options)
			: await advanceCapCut81WritebackAppSession({
					boundary: options.command,
					sessionDirectory: options.sessionDirectory,
				});
	process.stdout.write(
		options.json
			? `${JSON.stringify(result, null, 2)}\n`
			: `${Object.entries(result)
					.map(([key, value]) => `${key}: ${value}`)
					.join("\n")}\n`
	);
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
const expectedEntryPath = join(
	resolve(process.cwd()),
	"scripts",
	"capcut-e2e",
	"capcut-8-1-writeback-app-session-cli.ts"
);
if (entryPath === expectedEntryPath) {
	void runCapCut81WritebackAppSessionCli({ argv: process.argv.slice(2) }).catch(
		(error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			process.stderr.write(
				`capcut-8.1-writeback-app-session error: ${message}\n`
			);
			process.exitCode = 3;
		}
	);
}
