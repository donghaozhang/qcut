import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
	classifySuperResolutionEvidence,
	type SuperResolutionEvidence,
} from "./super-resolution-evidence";

const MODEL_NAME_PATTERN =
	/(^|[_-])(super[_-]?resolution|superres|vesr|video[_-]?sr|ai[_-]?sr|sr[_-]?model)([-_.]|$)/i;
const METADATA_PATTERN =
	/super.?resolution|superresolution|video.?sr|ai.?sr|\bvesr\b/i;
const METADATA_EXTENSIONS = new Set([
	".json",
	".plist",
	".txt",
	".yaml",
	".yml",
]);

interface ProbeArguments {
	libraryPath: string;
	roots: string[];
	outputPath: string;
}

function parseArguments({ args }: { args: string[] }): ProbeArguments {
	let libraryPath = "";
	let outputPath = "";
	const roots: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		const next = args[index + 1];
		if (!(value && next)) continue;
		if (value === "--library") libraryPath = next;
		if (value === "--root") roots.push(next);
		if (value === "--output") outputPath = next;
		if (value === "--library" || value === "--root" || value === "--output")
			index += 1;
	}
	if (!(libraryPath && outputPath) || roots.length === 0) {
		throw new Error(
			"usage: super-resolution-probe.ts --library <libvideoeditor> --root <models-or-cache>... --output <report.json>"
		);
	}
	return { libraryPath, roots, outputPath };
}

async function runCommand({
	command,
	args,
}: {
	command: string;
	args: string[];
}): Promise<string> {
	const child = Bun.spawn([command, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (exitCode !== 0) throw new Error(`${command} failed: ${stderr.trim()}`);
	return stdout;
}

async function scanRoot({ root }: { root: string }): Promise<{
	modelCandidates: string[];
	metadataEvidence: string[];
}> {
	const modelCandidates: string[] = [];
	const metadataEvidence: string[] = [];
	const pending = [root];
	while (pending.length > 0) {
		const current = pending.pop();
		if (!current) continue;
		let entries: Awaited<ReturnType<typeof readdir>>;
		try {
			entries = await readdir(current, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const absolutePath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				pending.push(absolutePath);
				continue;
			}
			if (!entry.isFile()) continue;
			if (MODEL_NAME_PATTERN.test(entry.name))
				modelCandidates.push(absolutePath);
			if (!METADATA_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
				continue;
			const fileStat = await stat(absolutePath);
			if (fileStat.size > 4 * 1024 * 1024) continue;
			const contents = await Bun.file(absolutePath).text();
			if (METADATA_PATTERN.test(contents)) metadataEvidence.push(absolutePath);
		}
	}
	return { modelCandidates, metadataEvidence };
}

async function main({ args }: { args: string[] }): Promise<void> {
	const { libraryPath, roots, outputPath } = parseArguments({ args });
	const [symbols, binaryStrings, rootResults] = await Promise.all([
		runCommand({
			command: "/usr/bin/nm",
			args: ["-arch", "arm64", "-gj", libraryPath],
		}),
		runCommand({ command: "/usr/bin/strings", args: ["-a", libraryPath] }),
		Promise.all(
			roots.map(async (root) => ({ root, ...(await scanRoot({ root })) }))
		),
	]);
	const clientSymbolNames = [
		"startConvertSuperResolution",
		"getSuperResolutionPath",
		"cancelSuperResolution",
	].filter((name) => symbols.includes(name));
	const uploadEvidence = ["uploadVideoForSuperResolution"].filter((name) =>
		binaryStrings.includes(name)
	);
	const evidence: SuperResolutionEvidence = {
		clientSymbols: clientSymbolNames,
		uploadEvidence,
		localModelCandidates: rootResults.flatMap(
			({ modelCandidates }) => modelCandidates
		),
		metadataEvidence: rootResults.flatMap(
			({ metadataEvidence }) => metadataEvidence
		),
	};
	const conclusion = classifySuperResolutionEvidence({ evidence });
	await Bun.write(
		outputPath,
		`${JSON.stringify(
			{
				probe: "ai-super-resolution",
				libraryPath,
				scannedRoots: roots,
				evidence,
				...conclusion,
			},
			null,
			2
		)}\n`
	);
	console.log(outputPath);
}

await main({ args: Bun.argv.slice(2) });
