import { join, resolve } from "node:path";
import {
	analyzeCapCut81FontReferencePair,
	CAPCUT_FONT_REFERENCE_VERIFICATION_STATUS,
	writeCapCut81FontReference,
} from "./font-reference.js";

export interface CapCut81FontReferenceCliOptions {
	afterDraftDirectory: string;
	beforeDraftDirectory: string;
	fontLabel: string;
	outputPath: string;
	targetText: string;
}

const CLI_FLAGS = [
	"--after",
	"--before",
	"--font-label",
	"--output",
	"--text",
] as const;

export function parseCapCut81FontReferenceCliOptions({
	args,
}: {
	args: readonly string[];
}): CapCut81FontReferenceCliOptions {
	const values = new Map<string, string>();
	for (let index = 0; index < args.length; index += 2) {
		const flag = args[index];
		const value = args[index + 1];
		if (
			!flag ||
			!CLI_FLAGS.includes(flag as (typeof CLI_FLAGS)[number]) ||
			!value ||
			value.startsWith("--")
		) {
			throw new Error(
				"Usage: --before <draft> --after <draft> --text <text> --font-label <label> --output <reference.json>"
			);
		}
		if (values.has(flag)) throw new Error(`Duplicate option ${flag}.`);
		values.set(flag, value);
	}
	if (args.length !== CLI_FLAGS.length * 2) {
		throw new Error(
			"Every CapCut font reference option is required exactly once."
		);
	}
	const required = (flag: (typeof CLI_FLAGS)[number]): string => {
		const value = values.get(flag)?.trim();
		if (!value) throw new Error(`Missing required option ${flag}.`);
		return value;
	};
	return {
		afterDraftDirectory: resolve(required("--after")),
		beforeDraftDirectory: resolve(required("--before")),
		fontLabel: required("--font-label"),
		outputPath: resolve(required("--output")),
		targetText: required("--text"),
	};
}

export async function runCapCut81FontReferenceCli({
	args,
}: {
	args: readonly string[];
}): Promise<
	CapCut81FontReferenceCliOptions & {
		verificationStatus: typeof CAPCUT_FONT_REFERENCE_VERIFICATION_STATUS;
	}
> {
	const options = parseCapCut81FontReferenceCliOptions({ args });
	const reference = await analyzeCapCut81FontReferencePair(options);
	await writeCapCut81FontReference({
		outputPath: options.outputPath,
		reference,
	});
	return {
		...options,
		verificationStatus: reference.verificationStatus,
	};
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
const expectedEntryPath = join(
	resolve(process.cwd()),
	"scripts",
	"capcut-e2e",
	"font-reference-cli.ts"
);
if (entryPath === expectedEntryPath) {
	runCapCut81FontReferenceCli({ args: process.argv.slice(2) })
		.then(({ outputPath, verificationStatus }) => {
			process.stdout.write(
				`${JSON.stringify({ outputPath, verificationStatus })}\n`
			);
		})
		.catch((error: unknown) => {
			process.stderr.write(
				`${error instanceof Error ? error.message : String(error)}\n`
			);
			process.exitCode = 1;
		});
}
