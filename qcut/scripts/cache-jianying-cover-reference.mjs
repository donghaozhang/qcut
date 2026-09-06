import { createHash } from "node:crypto";
import {
	copyFile,
	mkdir,
	readFile,
	readdir,
	stat,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Harvested bytes never belong in the Git worktree; default to a private,
// per-user location and refuse any explicit path that resolves inside the repo.
const repository = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../.."
);
const output = path.resolve(
	process.argv[2] ??
		path.join(
			homedir(),
			"Library/Application Support/QCut/PrivateAssets/JianyingCoverReference"
		)
);
const relativeToRepository = path.relative(repository, output);
if (
	!path.isAbsolute(relativeToRepository) &&
	relativeToRepository !== ".." &&
	!relativeToRepository.startsWith(`..${path.sep}`)
) {
	throw new Error(
		`Output must stay outside the Git worktree (${repository}): ${output}`
	);
}
const userData = path.join(homedir(), "Movies/JianyingPro/User Data");
const project = path.resolve(
	process.argv[3] ??
		path.join(userData, "Projects/com.lveditor.draft/8月30日 (4)")
);
const cache = path.join(userData, "CEF/Cache/Cache/Cache_Data");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = [];
await mkdir(output, { recursive: true });

async function retain({ source, relativePath, bytes, kind }) {
	const destination = path.join(output, relativePath);
	await mkdir(path.dirname(destination), { recursive: true });
	if (bytes) await writeFile(destination, bytes);
	else await copyFile(source, destination);
	const saved = await readFile(destination);
	const original = bytes ?? (await readFile(source));
	if (sha256(saved) !== sha256(original))
		throw new Error(`Copy mismatch: ${relativePath}`);
	files.push({
		path: relativePath,
		source: path.relative(userData, source),
		kind,
		byteLength: saved.length,
		sha256: sha256(saved),
	});
}

const samples = [
	"Resources/cover/C7EB2305-1CBA-49D1-981C-4797CC34DBCB.jpg",
	"Resources/cover/7E9C299E-7BE6-4F6E-94D4-87B89A1A8E3F.jpg",
	"draft_cover.jpg",
	"Timelines/B625D41C-63ED-452F-994C-53370CD62653/draft_cover.jpg",
];
await Promise.all(
	samples.map((relativePath) =>
		retain({
			source: path.join(project, relativePath),
			relativePath: `calibration/${relativePath}`,
			kind: "controlled-project-image",
		})
	)
);

// Keep only the image payload; CEF headers and account data stay at the source.
async function retainPreview({ name }) {
	const source = path.join(cache, name);
	const info = await stat(source);
	if (info.size > 8_000_000) return;
	const data = await readFile(source);
	if (!data.includes(Buffer.from("faceu-img-sign.byteimg.com"))) return;
	const offset = data.indexOf(Buffer.from("RIFF"));
	if (
		offset < 0 ||
		offset + 12 > data.length ||
		data.toString("ascii", offset + 8, offset + 12) !== "WEBP"
	)
		return;
	const length = data.readUInt32LE(offset + 4) + 8;
	if (length < 12 || offset + length > data.length) return;
	const bytes = data.subarray(offset, offset + length);
	const relativePath = `template-previews/${sha256(bytes)}.webp`;
	if (files.some((entry) => entry.path === relativePath)) return;
	await retain({
		source,
		relativePath,
		bytes,
		kind: "preview-only-not-editable-template",
	});
}

const names = await readdir(cache);
// Bound memory to a single CEF entry while retaining deterministic ordering.
await names
	.filter((name) => /^[a-f0-9]+_[01]$/.test(name))
	.sort()
	.reduce(
		(previous, name) => previous.then(() => retainPreview({ name })),
		Promise.resolve()
	);
files.sort((left, right) => left.path.localeCompare(right.path));

const manifest = {
	schema: "qcut.private-jianying-cover-reference",
	version: 1,
	capturedAt: new Date().toISOString(),
	purpose:
		"Local cover behavior reference; excluded from Git and product assets.",
	editableTemplatePackages: 0,
	limitations: [
		"CEF previews are not editable templates or proof of offline template support.",
		"The project was modified after the August 30 experiment; current draft_cover may differ.",
		"No account tokens, CEF headers, MMKV, IndexedDB or encrypted draft bodies are copied.",
	],
	files,
};
await writeFile(
	path.join(output, "manifest.json"),
	`${JSON.stringify(manifest, null, 2)}\n`
);
console.log(
	JSON.stringify(
		{
			output,
			files: files.length,
			previews: files.filter((entry) => entry.kind.startsWith("preview-only"))
				.length,
			editableTemplatePackages: 0,
			bytes: files.reduce((total, entry) => total + entry.byteLength, 0),
		},
		null,
		2
	)
);
