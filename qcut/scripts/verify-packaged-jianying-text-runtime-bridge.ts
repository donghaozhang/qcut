import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME } from "../electron/jianying-text-runtime/bridge-resolver.js";

const execFileAsync = promisify(execFile);
const MACH_O_MAGICS = new Set([
	0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xcafebabf,
	0xbebafeca, 0xbfbafeca,
]);

async function newestPackagedBridge({ distRoot }: { distRoot: string }) {
	const entries = await readdir(distRoot, { recursive: true }).catch(() => []);
	const suffix = path.join(
		"Contents",
		"Resources",
		"bin",
		JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME
	);
	const candidates = entries
		.filter((entry) => entry.endsWith(suffix))
		.map((entry) => path.join(distRoot, entry));
	if (candidates.length === 0) {
		throw new Error(
			`Packaged Jianying text runtime bridge not found under ${distRoot}`
		);
	}
	const metadata = await Promise.all(
		candidates.map(async (filePath) => ({
			filePath,
			modifiedAt: (await stat(filePath)).mtimeMs,
		}))
	);
	return metadata.sort((left, right) => right.modifiedAt - left.modifiedAt)[0]
		.filePath;
}

async function requireExecutable({ filePath }: { filePath: string }) {
	try {
		await access(filePath, constants.X_OK);
	} catch {
		throw new Error(
			`Jianying text runtime bridge is not executable: ${filePath}`
		);
	}
}

function isMachO({ contents }: { contents: Buffer }) {
	return contents.length >= 4 && MACH_O_MAGICS.has(contents.readUInt32BE(0));
}

export function parseMachOUuidOutput({ output }: { output: string }) {
	return output
		.split(/\r?\n/)
		.flatMap((line) => {
			const match = line.match(/UUID:\s+([0-9A-F-]+)\s+\(([^)]+)\)/i);
			return match ? [`${match[2]}:${match[1].toUpperCase()}`] : [];
		})
		.sort();
}

async function machOUuids({ filePath }: { filePath: string }) {
	const { stdout } = await execFileAsync("dwarfdump", ["--uuid", filePath]);
	const identities = parseMachOUuidOutput({ output: stdout });
	if (identities.length === 0) {
		throw new Error(`Mach-O UUID not found: ${filePath}`);
	}
	return identities;
}

async function requireValidCodeSignature({ filePath }: { filePath: string }) {
	try {
		await execFileAsync("codesign", ["--verify", "--strict", filePath]);
	} catch {
		throw new Error(
			`Packaged Jianying text runtime bridge has an invalid signature: ${filePath}`
		);
	}
}

async function requireMatchingBridge({
	packaged,
	packagedPath,
	staged,
	stagedPath,
}: {
	packaged: Buffer;
	packagedPath: string;
	staged: Buffer;
	stagedPath: string;
}) {
	const stagedIsMachO = isMachO({ contents: staged });
	const packagedIsMachO = isMachO({ contents: packaged });
	if (stagedIsMachO && packagedIsMachO) {
		const [stagedUuids, packagedUuids] = await Promise.all([
			machOUuids({ filePath: stagedPath }),
			machOUuids({ filePath: packagedPath }),
		]);
		if (JSON.stringify(stagedUuids) !== JSON.stringify(packagedUuids)) {
			throw new Error(
				"Packaged Jianying text runtime bridge differs from the staged binary"
			);
		}
		await requireValidCodeSignature({ filePath: packagedPath });
		return;
	}
	if (stagedIsMachO !== packagedIsMachO || !staged.equals(packaged)) {
		throw new Error(
			"Packaged Jianying text runtime bridge differs from the staged binary"
		);
	}
}

export async function verifyPackagedJianyingTextRuntimeBridge({
	distRoot,
	projectRoot,
}: {
	distRoot: string;
	projectRoot: string;
}) {
	const stagedPath = path.join(
		projectRoot,
		"electron",
		"resources",
		"bin",
		JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME
	);
	const packagedPath = await newestPackagedBridge({ distRoot });
	await Promise.all([
		requireExecutable({ filePath: stagedPath }),
		requireExecutable({ filePath: packagedPath }),
	]);
	const [staged, packaged] = await Promise.all([
		readFile(stagedPath),
		readFile(packagedPath),
	]);
	await requireMatchingBridge({ packaged, packagedPath, staged, stagedPath });
	return packagedPath;
}

if (import.meta.main) {
	const projectRoot = path.resolve(import.meta.dir, "..");
	const packagedPath = await verifyPackagedJianyingTextRuntimeBridge({
		projectRoot,
		distRoot: path.join(projectRoot, "dist-electron"),
	});
	console.log(
		`Verified packaged Jianying text runtime bridge: ${packagedPath}`
	);
}
