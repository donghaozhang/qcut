import { constants } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME } from "../electron/jianying-text-runtime/bridge-resolver.js";

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
	if (!staged.equals(packaged)) {
		throw new Error(
			"Packaged Jianying text runtime bridge differs from the staged binary"
		);
	}
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
