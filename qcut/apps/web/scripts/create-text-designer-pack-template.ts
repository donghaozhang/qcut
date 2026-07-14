import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	TextDesignerAssetPackEntry,
	TextDesignerAssetPackManifest,
} from "./import-text-designer-assets";
import type { TextAssetGeneratedEntry } from "./verify-text-asset-cdn-manifest";
import { readGeneratedManifest } from "./verify-text-asset-cdn-manifest";

export type TextDesignerPackTemplateOptions = {
	assetIds: string[];
	generatedManifestPath: string;
	outDir: string;
};

export type TextDesignerPackTemplateAssetContract = {
	assetId: string;
	cacheKey: string;
	files: {
		qcutPackage: TextDesignerPackTemplateFileContract;
		source: TextDesignerPackTemplateFileContract;
		thumbnail: TextDesignerPackTemplateFileContract;
	};
	packageId: string;
	version: number;
};

export type TextDesignerPackTemplateFileContract = {
	currentByteSize: number;
	currentChecksumSha256: string;
	currentUrl: string;
	designerPath: string;
	mimeType: string;
};

export type TextDesignerPackTemplate = {
	contracts: TextDesignerPackTemplateAssetContract[];
	manifest: TextDesignerAssetPackManifest;
};

type ResolvedDesignerPackAsset = {
	entry: TextAssetGeneratedEntry;
	packEntry: TextDesignerAssetPackEntry;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_GENERATED_MANIFEST_PATH = join(
	SCRIPT_DIR,
	"../src/lib/text/text-asset-generated-manifest.json"
);
const DEFAULT_OUT_DIR = join(SCRIPT_DIR, "../dist/text-designer-pack-template");

export function parseTextDesignerPackTemplateArgs({
	argv,
}: {
	argv: string[];
}): TextDesignerPackTemplateOptions {
	const options: TextDesignerPackTemplateOptions = {
		assetIds: [],
		generatedManifestPath: DEFAULT_GENERATED_MANIFEST_PATH,
		outDir: DEFAULT_OUT_DIR,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--asset-id") {
			options.assetIds.push(requireValue({ argv, index, name: arg }));
			index += 1;
			continue;
		}
		if (arg === "--generated-manifest") {
			options.generatedManifestPath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--out-dir") {
			options.outDir = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	if (options.assetIds.length === 0) {
		throw new Error("Pass at least one --asset-id.");
	}
	return {
		...options,
		assetIds: uniqueAssetIds({ assetIds: options.assetIds }),
	};
}

export function buildTextDesignerPackTemplate({
	assetIds,
	generatedManifest,
}: {
	assetIds: readonly string[];
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
}): TextDesignerPackTemplate {
	const resolvedAssets = resolveDesignerPackAssets({
		assetIds: uniqueAssetIds({ assetIds }),
		generatedManifest,
	});
	return {
		contracts: resolvedAssets.map(({ entry, packEntry }) =>
			buildAssetContract({ entry, packEntry })
		),
		manifest: {
			assets: resolvedAssets.map(({ packEntry }) => packEntry),
			schemaVersion: 1,
		},
	};
}

export async function writeTextDesignerPackTemplate({
	outDir,
	template,
}: {
	outDir: string;
	template: TextDesignerPackTemplate;
}): Promise<void> {
	const manifestPath = join(outDir, "manifest.json");
	const readmePath = join(outDir, "README.md");
	const contractWrites = template.contracts.map((contract) => ({
		contract,
		path: join(outDir, "assets", contract.assetId, "asset-contract.json"),
	}));
	await Promise.all([
		mkdir(dirname(manifestPath), { recursive: true }),
		...contractWrites.map(({ path }) =>
			mkdir(dirname(path), { recursive: true })
		),
	]);
	await Promise.all([
		writeFile(
			manifestPath,
			`${JSON.stringify(template.manifest, null, "\t")}\n`,
			"utf8"
		),
		writeFile(readmePath, renderReadme({ template }), "utf8"),
		...contractWrites.map(({ contract, path }) =>
			writeFile(path, `${JSON.stringify(contract, null, "\t")}\n`, "utf8")
		),
	]);
}

function resolveDesignerPackAssets({
	assetIds,
	generatedManifest,
}: {
	assetIds: readonly string[];
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
}): ResolvedDesignerPackAsset[] {
	return assetIds.map((assetId) => {
		const entry = generatedManifest[assetId];
		if (!entry) {
			throw new Error(`Unknown text asset id: ${assetId}`);
		}
		if (!entry.qcutPackage) {
			throw new Error(
				`Text asset is missing qcut package metadata: ${assetId}`
			);
		}
		const assetDir = `assets/${assetId}`;
		return {
			entry,
			packEntry: {
				assetId,
				qcutPackage: `${assetDir}/template.qctext`,
				source: `${assetDir}/template.json`,
				thumbnail: `${assetDir}/thumbnail.webp`,
			},
		};
	});
}

function buildAssetContract({
	entry,
	packEntry,
}: {
	entry: TextAssetGeneratedEntry;
	packEntry: TextDesignerAssetPackEntry;
}): TextDesignerPackTemplateAssetContract {
	if (!entry.qcutPackage) {
		throw new Error(
			`Text asset is missing qcut package metadata: ${entry.assetId}`
		);
	}
	return {
		assetId: entry.assetId,
		cacheKey: entry.cacheKey,
		files: {
			qcutPackage: {
				currentByteSize: entry.qcutPackage.byteSize,
				currentChecksumSha256: entry.qcutPackage.checksumSha256,
				currentUrl: entry.qcutPackage.url,
				designerPath: packEntry.qcutPackage,
				mimeType: entry.qcutPackage.mimeType,
			},
			source: {
				currentByteSize: entry.source.byteSize,
				currentChecksumSha256: entry.source.checksumSha256,
				currentUrl: entry.source.url,
				designerPath: packEntry.source,
				mimeType: entry.source.mimeType,
			},
			thumbnail: {
				currentByteSize: entry.thumbnail.byteSize,
				currentChecksumSha256: entry.thumbnail.checksumSha256,
				currentUrl: entry.thumbnail.url,
				designerPath: packEntry.thumbnail,
				mimeType: entry.thumbnail.mimeType,
			},
		},
		packageId: entry.packageId,
		version: entry.version,
	};
}

function renderReadme({
	template,
}: {
	template: TextDesignerPackTemplate;
}): string {
	const assetRows = template.contracts
		.map(
			(contract) =>
				`| ${contract.assetId} | ${contract.packageId} | ${contract.version} | ${contract.cacheKey} |`
		)
		.join("\n");
	return `# QCut Text Designer Pack

Replace the files referenced by \`manifest.json\`, then run:

\`\`\`bash
bun run assets:text:import-designer -- --pack-dir <this-folder> --dry-run
bun run assets:text:import-designer -- --pack-dir <this-folder>
bun run assets:text:verify-cdn
\`\`\`

Each asset folder contains \`asset-contract.json\` with the required target identity. Keep \`assetId\`, \`packageId\`, \`version\`, and \`cacheKey\` unchanged inside \`template.json\` and \`template.qctext\`.

| assetId | packageId | version | cacheKey |
| --- | --- | --- | --- |
${assetRows}
`;
}

function uniqueAssetIds({
	assetIds,
}: {
	assetIds: readonly string[];
}): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const assetId of assetIds) {
		if (seen.has(assetId)) {
			continue;
		}
		seen.add(assetId);
		unique.push(assetId);
	}
	return unique;
}

function requireValue({
	argv,
	index,
	name,
}: {
	argv: string[];
	index: number;
	name: string;
}): string {
	const value = argv[index + 1];
	if (!value) throw new Error(`${name} requires a value`);
	return value;
}

async function main(): Promise<void> {
	const options = parseTextDesignerPackTemplateArgs({
		argv: process.argv.slice(2),
	});
	const generatedManifest = await readGeneratedManifest({
		manifestPath: options.generatedManifestPath,
	});
	const template = buildTextDesignerPackTemplate({
		assetIds: options.assetIds,
		generatedManifest,
	});
	await writeTextDesignerPackTemplate({
		outDir: options.outDir,
		template,
	});
	console.log(
		JSON.stringify(
			{
				assets: template.contracts.length,
				ok: true,
				outDir: options.outDir,
			},
			null,
			"\t"
		)
	);
}

if (import.meta.main) {
	await main();
}
