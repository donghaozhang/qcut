import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { qcutStandaloneUserDataRoot } from "./jianying-effect/user-data-paths.js";
import type { JianyingFontFormat } from "./jianying-font-lab-contract.js";

/** QCut-owned private font store under the platform user-data directory. */
export function jianyingPrivateFontRoot() {
	return join(qcutStandaloneUserDataRoot(), "PrivateAssets", "JianyingFonts");
}

function fontPath({
	sha256,
	format,
	root,
}: {
	sha256: string;
	format: JianyingFontFormat;
	root: string;
}) {
	if (!/^[a-f0-9]{64}$/.test(sha256) || !["ttf", "otf"].includes(format))
		throw new Error("Invalid private font identity");
	return join(root, `${sha256}.${format}`);
}

export async function readPrivateJianyingFont({
	sha256,
	format,
	root = jianyingPrivateFontRoot(),
}: {
	sha256: string;
	format: JianyingFontFormat;
	root?: string;
}): Promise<Buffer | null> {
	const path = fontPath({ sha256, format, root });
	try {
		const metadata = await stat(path);
		if (
			!metadata.isFile() ||
			metadata.size <= 0 ||
			metadata.size > 128 * 1024 * 1024
		)
			return null;
		const bytes = await readFile(path);
		return createHash("sha256").update(bytes).digest("hex") === sha256
			? bytes
			: null;
	} catch {
		return null;
	}
}

export async function retainPrivateJianyingFont({
	bytes,
	sha256,
	format,
	root = jianyingPrivateFontRoot(),
}: {
	bytes: Buffer;
	sha256: string;
	format: JianyingFontFormat;
	root?: string;
}): Promise<void> {
	const destination = fontPath({ sha256, format, root });
	if (
		!bytes.length ||
		bytes.length > 128 * 1024 * 1024 ||
		createHash("sha256").update(bytes).digest("hex") !== sha256
	)
		throw new Error("Private font checksum mismatch");
	if (await readPrivateJianyingFont({ sha256, format, root })) return;
	await mkdir(root, { recursive: true, mode: 0o700 });
	const temporary = join(root, `.${sha256}-${randomUUID()}.tmp`);
	try {
		await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
		try {
			await rename(temporary, destination);
		} catch (error) {
			// Windows can reject replacement after another writer publishes the same hash.
			if (!(await readPrivateJianyingFont({ sha256, format, root })))
				throw error;
		}
	} finally {
		await rm(temporary, { force: true });
	}
}
