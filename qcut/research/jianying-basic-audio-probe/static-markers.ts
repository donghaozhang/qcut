import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import {
	AUDIO_BASIC_CAPABILITIES,
	type AudioBasicCapabilityDefinition,
	type StaticMarkerSource,
} from "./capabilities";

export type StaticMarkerMatches = Record<StaticMarkerSource, Set<string>>;

export interface MarkerGroupEvidence {
	matched: string[];
	missing: string[];
}

export interface CapabilityStaticEvidence {
	groups: Record<StaticMarkerSource, MarkerGroupEvidence>;
	status: "complete" | "missing" | "partial";
}

function scanTokenStream({
	stream,
	tokens,
}: {
	stream: NodeJS.ReadableStream;
	tokens: string[];
}): Promise<Set<string>> {
	return new Promise((resolve, reject) => {
		const matched = new Set<string>();
		const tokenBytes = new Map(
			tokens.map((token) => [token, Buffer.from(token, "utf8")])
		);
		const overlapByteLength = Math.max(
			0,
			...[...tokenBytes.values()].map(({ byteLength }) => byteLength - 1)
		);
		let overlap = Buffer.alloc(0);
		stream.on("data", (chunk: Buffer | string) => {
			if (matched.size === tokenBytes.size) return;
			const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			const searchable = Buffer.concat([overlap, next]);
			for (const [token, bytes] of tokenBytes) {
				if (!matched.has(token) && searchable.indexOf(bytes) >= 0) {
					matched.add(token);
				}
			}
			overlap = searchable.subarray(
				Math.max(0, searchable.byteLength - overlapByteLength)
			);
		});
		stream.once("end", () => resolve(matched));
		stream.once("error", reject);
	});
}

function waitForExit({
	allowedExitCodes,
	child,
}: {
	allowedExitCodes: number[];
	child: ChildProcessWithoutNullStreams;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code) => {
			if (code !== null && allowedExitCodes.includes(code)) {
				resolve();
				return;
			}
			reject(
				new Error(`${child.spawnfile} exited with ${code ?? "no exit code"}.`)
			);
		});
	});
}

export async function scanCommandTokens({
	args,
	command,
	tokens,
}: {
	args: string[];
	command: string;
	tokens: string[];
}): Promise<Set<string>> {
	if (tokens.length === 0) return new Set();
	const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
	child.stdin.end();
	child.stderr.resume();
	const [matches] = await Promise.all([
		scanTokenStream({ stream: child.stdout, tokens }),
		waitForExit({ allowedExitCodes: [0], child }),
	]);
	return matches;
}

function markersForSource({
	source,
}: {
	source: StaticMarkerSource;
}): string[] {
	return [
		...new Set(
			AUDIO_BASIC_CAPABILITIES.flatMap(
				({ staticMarkers }) => staticMarkers[source]
			)
		),
	].sort();
}

export async function scanStaticMarkers({
	creatorBinaryPath,
	videoEditorBinaryPath,
}: {
	creatorBinaryPath: string;
	videoEditorBinaryPath: string;
}): Promise<StaticMarkerMatches> {
	const [creatorStrings, videoEditorStrings, videoEditorSymbols] =
		await Promise.all([
			scanCommandTokens({
				args: ["-a", creatorBinaryPath],
				command: "strings",
				tokens: markersForSource({ source: "creatorStrings" }),
			}),
			scanCommandTokens({
				args: ["-a", videoEditorBinaryPath],
				command: "strings",
				tokens: markersForSource({ source: "videoEditorStrings" }),
			}),
			scanCommandTokens({
				args: [
					"-c",
					'set -o pipefail; nm -gjU "$1" | c++filt',
					"qcut-jianying-audio-probe",
					videoEditorBinaryPath,
				],
				command: "/bin/zsh",
				tokens: markersForSource({ source: "videoEditorSymbols" }),
			}),
		]);
	return { creatorStrings, videoEditorStrings, videoEditorSymbols };
}

export function assessCapabilityStaticEvidence({
	capability,
	matches,
}: {
	capability: AudioBasicCapabilityDefinition;
	matches: StaticMarkerMatches;
}): CapabilityStaticEvidence {
	const sources: StaticMarkerSource[] = [
		"videoEditorSymbols",
		"videoEditorStrings",
		"creatorStrings",
	];
	const groups = Object.fromEntries(
		sources.map((source) => {
			const required = capability.staticMarkers[source];
			return [
				source,
				{
					matched: required.filter((marker) => matches[source].has(marker)),
					missing: required.filter((marker) => !matches[source].has(marker)),
				},
			];
		})
	) as Record<StaticMarkerSource, MarkerGroupEvidence>;
	const requiredCount = sources.reduce(
		(total, source) => total + capability.staticMarkers[source].length,
		0
	);
	const matchedCount = sources.reduce(
		(total, source) => total + groups[source].matched.length,
		0
	);
	const status =
		matchedCount === requiredCount
			? "complete"
			: matchedCount === 0
				? "missing"
				: "partial";
	return { groups, status };
}
