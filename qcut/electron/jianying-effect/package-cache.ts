import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";

const MAX_PACKAGE_FILES = 10_000;
const MAX_PACKAGE_BYTES = 256 * 1024 * 1024;
const EFFECT_ID_PATTERN = /^\d{1,32}$/;
const PACKAGE_HASH_PATTERN = /^[a-f0-9]{32}$/i;

interface PackageCopyBudget {
	files: number;
	bytes: number;
}

const inFlight = new Map<string, Promise<string>>();

export async function isReadyQCutEffectPackage({
	packagePath,
}: {
	packagePath: string;
}): Promise<boolean> {
	try {
		const [directory, config] = await Promise.all([
			lstat(packagePath),
			lstat(path.join(packagePath, "config.json")),
		]);
		return directory.isDirectory() && config.isFile();
	} catch {
		return false;
	}
}

async function clonePackageEntry({
	sourcePath,
	destinationPath,
	budget,
}: {
	sourcePath: string;
	destinationPath: string;
	budget: PackageCopyBudget;
}): Promise<void> {
	const metadata = await lstat(sourcePath);
	if (metadata.isSymbolicLink()) {
		throw new Error("特效包包含不允许的符号链接。");
	}
	if (metadata.isDirectory()) {
		await mkdir(destinationPath, { recursive: true });
		const entries = await readdir(sourcePath, { withFileTypes: true });
		await Promise.all(
			entries.map((entry) =>
				clonePackageEntry({
					sourcePath: path.join(sourcePath, entry.name),
					destinationPath: path.join(destinationPath, entry.name),
					budget,
				})
			)
		);
		return;
	}
	if (!metadata.isFile()) {
		throw new Error("特效包包含不支持的文件类型。");
	}
	budget.files += 1;
	budget.bytes += metadata.size;
	if (budget.files > MAX_PACKAGE_FILES || budget.bytes > MAX_PACKAGE_BYTES) {
		throw new Error("特效包超过 QCut 本机缓存限制。");
	}
	await copyFile(sourcePath, destinationPath, constants.COPYFILE_FICLONE);
}

async function cachePackage({
	effectId,
	packageHash,
	sourcePath,
	managedRoot,
}: {
	effectId: string;
	packageHash: string;
	sourcePath: string;
	managedRoot: string;
}): Promise<string> {
	if (!EFFECT_ID_PATTERN.test(effectId)) {
		throw new Error(`特效编号无效：${effectId}`);
	}
	if (!PACKAGE_HASH_PATTERN.test(packageHash)) {
		throw new Error(`特效包校验值无效：${packageHash}`);
	}
	const finalPath = path.join(managedRoot, effectId, packageHash.toLowerCase());
	if (await isReadyQCutEffectPackage({ packagePath: finalPath })) {
		return finalPath;
	}
	if (!(await isReadyQCutEffectPackage({ packagePath: sourcePath }))) {
		throw new Error("本机特效包不完整，无法保存到 QCut 缓存。");
	}
	if (path.resolve(sourcePath) === path.resolve(finalPath)) {
		throw new Error("QCut 特效缓存目录不完整。");
	}

	await mkdir(path.dirname(finalPath), { recursive: true, mode: 0o700 });
	const pendingPath = `${finalPath}.caching-${process.pid}-${randomUUID()}`;
	try {
		await clonePackageEntry({
			sourcePath,
			destinationPath: pendingPath,
			budget: { files: 0, bytes: 0 },
		});
		if (!(await isReadyQCutEffectPackage({ packagePath: pendingPath }))) {
			throw new Error("QCut 特效缓存写入不完整。");
		}
		if (await isReadyQCutEffectPackage({ packagePath: finalPath })) {
			return finalPath;
		}
		await rm(finalPath, { recursive: true, force: true });
		await rename(pendingPath, finalPath);
		return finalPath;
	} finally {
		await rm(pendingPath, { recursive: true, force: true });
	}
}

export function cacheQCutEffectPackage({
	effectId,
	packageHash,
	sourcePath,
	managedRoot,
}: {
	effectId: string;
	packageHash: string;
	sourcePath: string;
	managedRoot: string;
}): Promise<string> {
	const finalPath = path.join(managedRoot, effectId, packageHash.toLowerCase());
	const pending = inFlight.get(finalPath);
	if (pending) return pending;
	const task = cachePackage({
		effectId,
		packageHash,
		sourcePath,
		managedRoot,
	}).finally(() => {
		inFlight.delete(finalPath);
	});
	inFlight.set(finalPath, task);
	return task;
}
