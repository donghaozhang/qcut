import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const distDir = join(scriptDir, "..", "dist-electron");
const expectedTeamId = process.env.APPLE_TEAM_ID;

function findLatestDmg(): string {
	if (!existsSync(distDir)) {
		throw new Error(`dist-electron not found: ${distDir}`);
	}
	const candidates = readdirSync(distDir)
		.filter((f) => /^QCut.*\.dmg$/i.test(f))
		.map((f) => ({ f, mtime: statSync(join(distDir, f)).mtimeMs }))
		.sort((a, b) => b.mtime - a.mtime);
	if (candidates.length === 0) {
		throw new Error(`no QCut*.dmg in ${distDir}`);
	}
	return join(distDir, candidates[0].f);
}

function findApp(): string {
	const macDir = join(distDir, "mac-arm64");
	if (!existsSync(macDir)) {
		throw new Error(`mac-arm64 dir not found: ${macDir}`);
	}
	const apps = readdirSync(macDir).filter((f) => f.endsWith(".app"));
	if (apps.length === 0) {
		throw new Error(`no .app bundle in ${macDir}`);
	}
	if (apps.length > 1) {
		throw new Error(`expected exactly one .app, found ${apps.length}: ${apps.join(", ")}`);
	}
	return join(macDir, apps[0]);
}

function run(cmd: string, args: string[]): string {
	const result = spawnSync(cmd, args, { encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(
			`${cmd} exited ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
		);
	}
	return (result.stdout || "") + (result.stderr || "");
}

if (process.platform !== "darwin") {
	console.warn("[verify-macos-signature] non-macOS host, skipping");
	process.exit(0);
}

const app = findApp();
const dmg = findLatestDmg();

console.log(`[verify-macos-signature] codesign --verify ${app}`);
console.log(
	run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]),
);

console.log(`[verify-macos-signature] spctl --assess ${app}`);
const spctlOut = run("spctl", ["-a", "-t", "exec", "-vv", app]);
console.log(spctlOut);
if (!spctlOut.includes("accepted")) {
	throw new Error("spctl did not accept the app");
}
if (!spctlOut.includes("Notarized Developer ID")) {
	throw new Error("spctl reports app is signed but not notarized");
}

console.log(`[verify-macos-signature] xcrun stapler validate ${app}`);
const staplerAppOut = run("xcrun", ["stapler", "validate", app]);
console.log(staplerAppOut);
if (!staplerAppOut.includes("worked")) {
	throw new Error("stapler validation on .app failed");
}

console.log(`[verify-macos-signature] xcrun stapler validate ${dmg} (advisory)`);
try {
	const staplerDmgOut = run("xcrun", ["stapler", "validate", dmg]);
	console.log(staplerDmgOut);
} catch (err) {
	console.warn(
		`[verify-macos-signature] dmg not separately stapled (non-fatal: Gatekeeper validates the inner .app, which is stapled): ${(err as Error).message.split("\n")[0]}`,
	);
}

if (expectedTeamId) {
	const codesignDisplayOut = run("codesign", ["-dvv", app]);
	console.log(codesignDisplayOut);
	if (!codesignDisplayOut.includes(`(${expectedTeamId})`)) {
		throw new Error(`signing team mismatch; expected ${expectedTeamId}`);
	}
}

console.log("[verify-macos-signature] OK");
