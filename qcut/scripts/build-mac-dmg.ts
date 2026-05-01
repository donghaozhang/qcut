import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const distDir = join(repoRoot, "dist-electron");
const macDir = join(distDir, "mac-arm64");

if (process.platform !== "darwin") {
	console.warn("[build-mac-dmg] non-macOS host, skipping");
	process.exit(0);
}

const apps = existsSync(macDir)
	? readdirSync(macDir).filter((f) => f.endsWith(".app"))
	: [];
if (apps.length !== 1) {
	throw new Error(
		`expected exactly one .app in ${macDir}, found: ${apps.join(", ") || "(none)"}`
	);
}
const appPath = join(macDir, apps[0]);
const appName = apps[0].replace(/\.app$/, "");

// Derive version from electron-builder's .zip artifact so DMG and .zip filenames
// stay in sync (electron-builder normalizes package.json's `version` via semver
// and the literal version string from package.json may differ).
const zipMatch = readdirSync(distDir).find((f) =>
	new RegExp(`^${escapeRegex(appName)}-(.+)-arm64-mac\\.zip$`).test(f)
);
if (!zipMatch) {
	throw new Error(
		`expected electron-builder .zip in ${distDir} to derive version from`
	);
}
const version = zipMatch.replace(
	new RegExp(`^${escapeRegex(appName)}-(.+)-arm64-mac\\.zip$`),
	"$1"
);
const productName = appName;

const dmgFile = join(distDir, `${productName}-${version}-arm64.dmg`);

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const stagingDir = join(distDir, ".dmg-staging-arm64");

console.log(`[build-mac-dmg] source app: ${appPath}`);
console.log(`[build-mac-dmg] output dmg: ${dmgFile}`);

if (existsSync(stagingDir))
	rmSync(stagingDir, { recursive: true, force: true });
if (existsSync(dmgFile)) rmSync(dmgFile, { force: true });
mkdirSync(stagingDir, { recursive: true });

console.log(
	`[build-mac-dmg] staging .app + Applications symlink in ${stagingDir}`
);
execFileSync("ditto", [appPath, join(stagingDir, apps[0])]);
execFileSync("ln", ["-s", "/Applications", join(stagingDir, "Applications")]);

console.log("[build-mac-dmg] running hdiutil create");
const result = spawnSync(
	"hdiutil",
	[
		"create",
		"-fs",
		"HFS+",
		"-srcfolder",
		stagingDir,
		"-volname",
		`${productName} ${version}-arm64`,
		"-format",
		"UDZO",
		"-imagekey",
		"zlib-level=9",
		"-ov",
		dmgFile,
	],
	{ encoding: "utf8" }
);
if (result.status !== 0) {
	throw new Error(
		`hdiutil exited ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
	);
}
console.log(result.stdout);

rmSync(stagingDir, { recursive: true, force: true });
console.log(`[build-mac-dmg] OK — ${dmgFile}`);
