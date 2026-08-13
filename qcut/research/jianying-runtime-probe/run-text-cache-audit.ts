import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runJianyingTextCacheAudit } from "./text-cache-audit.js";

function parseArguments({ args }: { args: string[] }) {
	const options: {
		databaseRoot?: string;
		output?: string;
		packageRoot?: string;
	} = {};
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		const value = args[index + 1];
		if (!value) throw new Error(`${argument} requires a value`);
		if (argument === "--database-root") options.databaseRoot = resolve(value);
		else if (argument === "--output") options.output = resolve(value);
		else if (argument === "--package-root") {
			options.packageRoot = resolve(value);
		} else throw new Error(`Unknown argument: ${argument}`);
		index += 1;
	}
	return options;
}

async function main({ args }: { args: string[] }) {
	const { output, ...options } = parseArguments({ args });
	const report = await runJianyingTextCacheAudit(options);
	const serialized = `${JSON.stringify(report, null, 2)}\n`;
	if (output) {
		await mkdir(dirname(output), { recursive: true });
		await writeFile(output, serialized, "utf8");
	}
	process.stdout.write(serialized);
}

main({ args: process.argv.slice(2) }).catch((cause: unknown) => {
	const message = cause instanceof Error ? cause.message : String(cause);
	process.stderr.write(`${message}\n`);
	process.exitCode = 1;
});
