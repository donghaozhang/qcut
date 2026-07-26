import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { load } from "js-yaml";

interface UpdateManifestFile {
	url?: unknown;
	blockMapSize?: unknown;
}

interface UpdateManifest {
	files?: UpdateManifestFile[];
	path?: unknown;
}

export function getUpdateArtifactNames({
	manifestText,
}: {
	manifestText: string;
}): string[] {
	const parsed = load(manifestText) as UpdateManifest | undefined;
	const names = new Set<string>();

	const addCandidate = ({ candidate }: { candidate: unknown }) => {
		if (typeof candidate !== "string" || candidate.length === 0) return;
		if (
			candidate === "." ||
			candidate === ".." ||
			basename(candidate) !== candidate
		) {
			throw new Error(
				`Update manifest contains a non-local path: ${candidate}`
			);
		}
		names.add(candidate);
	};

	for (const file of parsed?.files ?? []) {
		addCandidate({ candidate: file.url });
		if (
			typeof file.url === "string" &&
			typeof file.blockMapSize === "number" &&
			file.blockMapSize > 0 &&
			// AppImage carries its blockmap inside the image, so electron-builder
			// reports blockMapSize without writing a sibling .blockmap file.
			!file.url.endsWith(".AppImage")
		) {
			addCandidate({ candidate: `${file.url}.blockmap` });
		}
	}
	addCandidate({ candidate: parsed?.path });

	if (names.size === 0) {
		throw new Error("Update manifest does not reference an artifact");
	}
	return [...names];
}

export function verifyUpdateArtifacts({
	distDir,
	manifestNames,
}: {
	distDir: string;
	manifestNames: string[];
}): string[] {
	const verified: string[] = [];
	for (const manifestName of manifestNames) {
		const manifestPath = join(distDir, manifestName);
		if (!existsSync(manifestPath)) {
			throw new Error(`Update manifest is missing: ${manifestPath}`);
		}
		const artifactNames = getUpdateArtifactNames({
			manifestText: readFileSync(manifestPath, "utf8"),
		});
		for (const artifactName of artifactNames) {
			const artifactPath = join(distDir, artifactName);
			if (!existsSync(artifactPath) || !statSync(artifactPath).isFile()) {
				throw new Error(
					`${manifestName} references missing artifact: ${artifactName}`
				);
			}
			verified.push(artifactName);
		}
	}
	return [...new Set(verified)];
}

function readManifestArguments({ args }: { args: string[] }): string[] {
	const manifests: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		if (args.at(index) !== "--manifest") continue;
		const manifestName = args.at(index + 1);
		if (!manifestName) throw new Error("--manifest requires a filename");
		manifests.push(manifestName);
		index += 1;
	}
	return manifests;
}

function main(): void {
	const distDir = join(import.meta.dirname, "..", "dist-electron");
	const requested = readManifestArguments({ args: process.argv.slice(2) });
	const manifestNames =
		requested.length > 0
			? requested
			: readdirSync(distDir).filter(
					(name) => name.startsWith("latest") && name.endsWith(".yml")
				);
	const artifacts = verifyUpdateArtifacts({ distDir, manifestNames });
	process.stdout.write(
		`Verified ${artifacts.length} update artifact(s): ${artifacts.join(", ")}\n`
	);
}

if (import.meta.main) main();
