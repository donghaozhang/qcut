// Batch-render reference clips for JianYing effects through the local runtime
// bridge (the same machinery as the 特效实验室), building the ground-truth
// library that drives QCut-native effect reimplementation.
//
// Run with node (NOT bun — the catalog needs node:sqlite):
//   node scripts/jianying-effect-reference-batch.cjs [--limit N] [--panel effects2|face-prop] [--only id1,id2]
//
// Requires: macOS, JianYing Pro installed, `bun run build` done (dist/electron).
// All outputs stay in .local/jianying-effect-references/ (gitignored) — the
// packages and rendered references are JianYing-derived and must never be
// committed or redistributed; they exist only as local parity references.
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const REPO = path.resolve(__dirname, "..");
const DIST = path.join(REPO, "dist/electron");
const { inspectJianyingEffectRuntime } = require(
	path.join(DIST, "jianying-effect/runtime-discovery.js")
);
const { renderJianyingEffectClip } = require(
	path.join(DIST, "jianying-effect/render.js")
);
const { readAdjustParameters } = require(
	path.join(DIST, "jianying-effect/catalog-parsing.js")
);
const { getFFmpegPath } = require(path.join(DIST, "ffmpeg/paths.js"));
const { listJianyingResourceDatabasePaths } = require(
	path.join(DIST, "jianying-resource-database.js")
);

const REF_ROOT = path.join(REPO, ".local/jianying-effect-references");
const PACKAGE_ROOT = path.join(REF_ROOT, "_packages");
const REF_CLIP = path.join(REF_ROOT, "_assets/ref-clip-1280x720.mp4");
const REF_BASELINE = path.join(REF_ROOT, "_assets/ref-baseline.mp4");
const MANIFEST_PATH = path.join(REF_ROOT, "manifest.jsonl");
const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const SECONDS = 6;
const SUPPORTED_REQUIREMENTS = new Set(["blit", "texture_blit"]);
/** Above this SSIM vs the untouched baseline, flag for a manual time-sweep. */
const IDENTITY_SSIM_THRESHOLD = 0.997;
const DOWNLOAD_DELAY_MS = 500;

function parseArgs() {
	const args = { limit: Infinity, panel: null, only: null };
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--limit") args.limit = Number(argv[++i]);
		else if (argv[i] === "--panel") args.panel = argv[++i];
		else if (argv[i] === "--only") args.only = new Set(argv[++i].split(","));
	}
	return args;
}

function databaseRoots() {
	const home = os.homedir();
	return [
		path.join(home, "Movies/JianyingPro/User Data/Cache/ressdk_db"),
		path.join(
			home,
			"Library/Containers/com.lemon.lvpro/Data/Movies/JianyingPro/User Data/Cache/ressdk_db"
		),
	];
}

function jianyingPackageRoots() {
	const home = os.homedir();
	return [
		path.join(home, "Movies/JianyingPro/User Data/Cache/effect"),
		path.join(
			home,
			"Library/Containers/com.lemon.lvpro/Data/Movies/JianyingPro/User Data/Cache/effect"
		),
	];
}

/** Full catalog straight from JianYing's cached list responses, URLs included. */
async function readFullCatalog() {
	const byEffectId = new Map();
	for (const root of databaseRoots()) {
		const databasePaths = await listJianyingResourceDatabasePaths({
			databaseRoot: root,
		});
		for (const databasePath of databasePaths) {
			let database = null;
			try {
				database = new DatabaseSync(databasePath, { readOnly: true });
				const records = database
					.prepare(
						"SELECT url, response_body FROM http_cache WHERE url LIKE ? OR url LIKE ?"
					)
					.all("%effects2%", "%face-prop%");
				for (const record of records) {
					if (!record.url || !record.response_body) continue;
					const panel = record.url.includes("_effects2_")
						? "effects2"
						: record.url.includes("_face-prop_")
							? "face-prop"
							: null;
					if (!panel) continue;
					let body;
					try {
						body = JSON.parse(record.response_body);
					} catch {
						continue;
					}
					const items = body?.data?.effect_item_list;
					if (!Array.isArray(items)) continue;
					for (const item of items) {
						const attr = item?.common_attr;
						if (!attr?.effect_id || !attr?.md5) continue;
						byEffectId.set(attr.effect_id, {
							effectId: attr.effect_id,
							title: attr.title || attr.effect_id,
							md5: attr.md5,
							panel,
							requirements: Array.isArray(attr.requirements)
								? attr.requirements
								: [],
							itemUrls: Array.isArray(attr.item_urls) ? attr.item_urls : [],
							sdkExtra:
								typeof attr.sdk_extra === "string" ? attr.sdk_extra : "",
						});
					}
				}
			} catch {
				// databases from other builds contribute nothing
			} finally {
				database?.close();
			}
		}
	}
	return [...byEffectId.values()];
}

/** md5 → package dir across JianYing's own caches (reuse before downloading). */
function indexExistingPackages() {
	const packages = new Map();
	for (const root of [...jianyingPackageRoots(), PACKAGE_ROOT]) {
		let effectDirs = [];
		try {
			effectDirs = fs.readdirSync(root, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const effectDir of effectDirs) {
			if (!effectDir.isDirectory()) continue;
			const effectPath = path.join(root, effectDir.name);
			let versions = [];
			try {
				versions = fs.readdirSync(effectPath, { withFileTypes: true });
			} catch {
				continue;
			}
			for (const version of versions) {
				if (!version.isDirectory()) continue;
				if (!packages.has(version.name)) {
					packages.set(version.name, path.join(effectPath, version.name));
				}
			}
		}
	}
	return packages;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function downloadPackage(item) {
	const url = item.itemUrls[0];
	if (!url) throw new Error("no item_urls");
	const response = await fetch(url, {
		headers: { "User-Agent": "JianyingPro/8.5.0 (Macintosh)" },
	});
	if (!response.ok) throw new Error(`download HTTP ${response.status}`);
	const data = Buffer.from(await response.arrayBuffer());
	const digest = require("node:crypto")
		.createHash("md5")
		.update(data)
		.digest("hex");
	if (digest !== item.md5) {
		throw new Error(`md5 mismatch: got ${digest}, expected ${item.md5}`);
	}
	const dest = path.join(PACKAGE_ROOT, item.effectId, item.md5);
	fs.mkdirSync(dest, { recursive: true });
	const zipPath = path.join(dest, "__package.zip");
	fs.writeFileSync(zipPath, data);
	const unzip = spawnSync("unzip", ["-o", "-q", zipPath, "-d", dest]);
	fs.rmSync(zipPath, { force: true });
	if (unzip.status !== 0) {
		throw new Error(`unzip failed: ${unzip.stderr?.toString().trim()}`);
	}
	await sleep(DOWNLOAD_DELAY_MS);
	return dest;
}

function ssimVsBaseline(ffmpeg, renderedPath) {
	const result = spawnSync(
		ffmpeg,
		[
			"-i",
			renderedPath,
			"-i",
			REF_BASELINE,
			"-filter_complex",
			"[0:v][1:v]ssim",
			"-f",
			"null",
			"-",
		],
		{ encoding: "utf8" }
	);
	const match = (result.stderr || "").match(/All:(\d+\.\d+)/);
	return match ? Number(match[1]) : null;
}

function loadDoneSet() {
	const done = new Set();
	if (!fs.existsSync(MANIFEST_PATH)) return done;
	for (const line of fs.readFileSync(MANIFEST_PATH, "utf8").split("\n")) {
		if (!line.trim()) continue;
		try {
			const entry = JSON.parse(line);
			if (entry.ok) done.add(entry.effectId);
		} catch {
			// ignore torn lines from interrupted runs
		}
	}
	return done;
}

function safeName(title) {
	return title.replace(/[^\w一-鿿-]+/g, "_").slice(0, 60);
}

async function main() {
	const args = parseArgs();
	const ffmpeg = getFFmpegPath();
	if (!fs.existsSync(REF_CLIP) || !fs.existsSync(REF_BASELINE)) {
		throw new Error(`reference clip missing: ${REF_CLIP}`);
	}

	const inspection = await inspectJianyingEffectRuntime();
	if (!inspection.bridgePath || !inspection.runtimeRootPath) {
		throw new Error(`runtime not usable: ${inspection.status.message}`);
	}

	const catalog = await readFullCatalog();
	const existingPackages = indexExistingPackages();
	const done = loadDoneSet();

	let targets = catalog.filter(
		(item) =>
			item.requirements.every((requirement) =>
				SUPPORTED_REQUIREMENTS.has(requirement)
			) &&
			(item.itemUrls.length > 0 || existingPackages.has(item.md5))
	);
	if (args.panel) targets = targets.filter((t) => t.panel === args.panel);
	if (args.only) targets = targets.filter((t) => args.only.has(t.effectId));
	const pending = targets.filter((t) => !done.has(t.effectId));
	const queue = pending.slice(0, args.limit);

	console.log(
		`catalog=${catalog.length} blit=${targets.length} done=${done.size} queue=${queue.length}`
	);

	const manifest = fs.createWriteStream(MANIFEST_PATH, { flags: "a" });
	let ok = 0;
	let failed = 0;
	for (const [index, item] of queue.entries()) {
		const label = `[${index + 1}/${queue.length}] ${item.title} (${item.effectId})`;
		const outDir = path.join(REF_ROOT, "refs", item.panel);
		fs.mkdirSync(outDir, { recursive: true });
		const outPath = path.join(
			outDir,
			`${item.effectId}-${safeName(item.title)}.mp4`
		);
		const started = Date.now();
		const entry = {
			effectId: item.effectId,
			title: item.title,
			panel: item.panel,
			md5: item.md5,
			requirements: item.requirements,
			file: path.relative(REF_ROOT, outPath),
			renderedAt: new Date().toISOString(),
		};
		try {
			let packagePath = existingPackages.get(item.md5);
			let downloaded = false;
			if (!packagePath) {
				packagePath = await downloadPackage(item);
				existingPackages.set(item.md5, packagePath);
				downloaded = true;
			}

			const extraPath = path.join(packagePath, "extra.json");
			const sdkExtra = fs.existsSync(extraPath)
				? fs.readFileSync(extraPath, "utf8")
				: item.sdkExtra;
			const adjustParameters = readAdjustParameters({ sdkExtra });

			const counts = await renderJianyingEffectClip({
				inspection,
				definition: {
					id: `jy-effect-${item.effectId}`,
					effectId: item.effectId,
					resourceId: item.effectId,
					packageHash: item.md5,
					packagePath,
					name: item.title,
					panel: item.panel,
					defaultDurationMs: 3000,
					adjustParameters,
					access: "free",
					supported: true,
				},
				inputPath: REF_CLIP,
				outputPath: outPath,
				width: WIDTH,
				height: HEIGHT,
				frameRate: FPS,
				startSeconds: 0,
				durationSeconds: SECONDS,
				adjustValues: adjustParameters.map((parameter) => ({
					key: parameter.key,
					value: parameter.defaultValue,
				})),
			});

			const ssim = ssimVsBaseline(ffmpeg, outPath);
			Object.assign(entry, {
				ok: true,
				downloaded,
				seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
				frames: counts.outputFrames,
				ssim,
				flaggedIdentity: ssim !== null && ssim > IDENTITY_SSIM_THRESHOLD,
				adjustParameters,
			});
			ok++;
			console.log(
				`OK   ${label} ${entry.seconds}s ssim=${ssim}${entry.flaggedIdentity ? " [identity?]" : ""}`
			);
		} catch (error) {
			Object.assign(entry, {
				ok: false,
				seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
				error: String(error?.message ?? error).slice(0, 500),
			});
			failed++;
			// A bridge that reports no frame counts still muxed a pass-through
			// file — delete it so the refs directory only holds real references.
			fs.rmSync(outPath, { force: true });
			console.log(`FAIL ${label}: ${entry.error}`);
		}
		manifest.write(`${JSON.stringify(entry)}\n`);
	}
	manifest.end();
	console.log(
		`\nfinished: ok=${ok} failed=${failed} (manifest: ${MANIFEST_PATH})`
	);
}

main().catch((error) => {
	console.error("BATCH FAILED:", error);
	process.exit(1);
});
