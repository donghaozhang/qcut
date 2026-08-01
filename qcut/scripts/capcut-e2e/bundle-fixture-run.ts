import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
	type CapCutE2eArtifactReport,
	type CapCutE2eFontFileReport,
	type CapCutE2eManifest,
	validateManifest,
} from "./manifest.js";
import { sha256File } from "./runtime.js";

export interface SourceFileEvidence {
	bytes: number;
	path: string;
	sha256: string;
}

export interface SourceArtifactEvidence extends SourceFileEvidence {
	fileName: string;
}

export interface SourceRunEvidence {
	artifacts: SourceArtifactEvidence[];
	fontFiles: {
		ascii: SourceFileEvidence;
		cjk: SourceFileEvidence;
	};
	manifestPath: string;
	manifestSha256: string;
	runId: string;
}

export interface FixtureRun {
	manifest: CapCutE2eManifest;
	runDirectory: string;
	sourceAudio: SourceFileEvidence;
	sourceRun: SourceRunEvidence;
	sourceVideo: SourceFileEvidence;
}

function createTextSha256({ value }: { value: string }): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function requireArtifact({
	fileName,
	manifest,
}: {
	fileName: string;
	manifest: CapCutE2eManifest;
}): CapCutE2eArtifactReport {
	const matches = manifest.artifacts.filter(
		(artifact) => artifact.fileName === fileName
	);
	if (matches.length !== 1 || !matches[0]) {
		throw new Error(`Fixture manifest must contain exactly one ${fileName}.`);
	}
	return matches[0];
}

async function verifyFileEvidence({
	expected,
	label,
	path,
}: {
	expected: { bytes: number; sha256: string };
	label: string;
	path: string;
}): Promise<SourceFileEvidence> {
	const [fileStats, sha256] = await Promise.all([
		stat(path),
		sha256File({ filePath: path }),
	]);
	if (
		!fileStats.isFile() ||
		fileStats.size !== expected.bytes ||
		sha256 !== expected.sha256
	) {
		throw new Error(`${label} no longer matches the fixture manifest: ${path}`);
	}
	return { bytes: fileStats.size, path, sha256 };
}

async function verifyArtifact({
	artifact,
	runDirectory,
}: {
	artifact: CapCutE2eArtifactReport;
	runDirectory: string;
}): Promise<SourceArtifactEvidence> {
	return {
		...(await verifyFileEvidence({
			expected: artifact,
			label: `Fixture artifact ${artifact.fileName}`,
			path: join(runDirectory, artifact.fileName),
		})),
		fileName: artifact.fileName,
	};
}

async function verifyFont({
	font,
	label,
}: {
	font: CapCutE2eFontFileReport;
	label: string;
}): Promise<SourceFileEvidence> {
	return verifyFileEvidence({ expected: font, label, path: font.path });
}

function requireVerifiedArtifact({
	fileName,
	verifiedArtifacts,
}: {
	fileName: string;
	verifiedArtifacts: SourceArtifactEvidence[];
}): SourceFileEvidence {
	const matches = verifiedArtifacts.filter(
		(artifact) => artifact.fileName === fileName
	);
	if (matches.length !== 1 || !matches[0]) {
		throw new Error(`Verified fixture is missing ${fileName}.`);
	}
	return matches[0];
}

export async function readFixtureRun({
	runId,
	runsRoot,
}: {
	runId: string;
	runsRoot: string;
}): Promise<FixtureRun> {
	const runDirectory = join(runsRoot, runId);
	const manifestPath = join(runDirectory, "manifest.json");
	const manifestText = await readFile(manifestPath, "utf8");
	const parsed: unknown = JSON.parse(manifestText);
	const manifest = parsed as CapCutE2eManifest;
	validateManifest({ manifest });
	if (manifest.runId !== runId) {
		throw new Error(
			`Fixture manifest run ID ${manifest.runId} does not match ${runId}.`
		);
	}
	const [verifiedArtifacts, asciiFont, cjkFont] = await Promise.all([
		Promise.all(
			manifest.artifacts.map((artifact) =>
				verifyArtifact({ artifact, runDirectory })
			)
		),
		verifyFont({ font: manifest.fontFiles.ascii, label: "ASCII font" }),
		verifyFont({ font: manifest.fontFiles.cjk, label: "CJK font" }),
	]);
	const sourceAudio = requireVerifiedArtifact({
		fileName: requireArtifact({
			fileName: manifest.spec.fileNames.sourceAudio,
			manifest,
		}).fileName,
		verifiedArtifacts,
	});
	const sourceVideo = requireVerifiedArtifact({
		fileName: requireArtifact({
			fileName: manifest.spec.fileNames.sourceVideo,
			manifest,
		}).fileName,
		verifiedArtifacts,
	});
	return {
		manifest,
		runDirectory,
		sourceAudio,
		sourceRun: {
			artifacts: verifiedArtifacts,
			fontFiles: { ascii: asciiFont, cjk: cjkFont },
			manifestPath,
			manifestSha256: createTextSha256({ value: manifestText }),
			runId,
		},
		sourceVideo,
	};
}
