import { cp, copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { createJianyingFilterLocalRenderSession } from "../../electron/jianying-filter-local-runtime/render.js";
import type { JianyingFilterLocalRuntimeInspection } from "../../electron/jianying-filter-local-runtime/runtime-discovery.js";
import type { RealVideoFrame } from "./real-video-sequence.js";

const MAX_PACKAGE_FILES = 5_000;

async function findDualLutAssets({ packagePath }: { packagePath: string }) {
	const pending = [packagePath];
	const matches: string[] = [];
	let inspectedFiles = 0;
	while (pending.length > 0 && inspectedFiles < MAX_PACKAGE_FILES) {
		const directory = pending.pop();
		if (!directory) continue;
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				pending.push(path);
				continue;
			}
			if (entry.isFile()) {
				matches.push(path);
				inspectedFiles += 1;
			}
		}
	}
	if (pending.length > 0) {
		throw new Error(`Dual-LUT package exceeds ${MAX_PACKAGE_FILES} files`);
	}
	const select = ({ role }: { role: "bg" | "skin" }) => {
		const pattern = new RegExp(`^filter_${role}\\.(?:3dl\\.vf|png)$`, "i");
		const candidates = matches.filter((path) => pattern.test(basename(path)));
		if (candidates.length !== 1) {
			throw new Error(
				`Dual-LUT package has ${candidates.length} ${role} assets`
			);
		}
		return candidates[0];
	};
	return { background: select({ role: "bg" }), skin: select({ role: "skin" }) };
}

async function prepareDiagnosticPackage({
	packagePath,
	directory,
	role,
}: {
	packagePath: string;
	directory: string;
	role: "background" | "skin";
}) {
	const destination = join(directory, role);
	await cp(packagePath, destination, { recursive: true });
	const assets = await findDualLutAssets({ packagePath });
	const relativeBackground = relative(packagePath, assets.background);
	const relativeSkin = relative(packagePath, assets.skin);
	if (role === "background") {
		await copyFile(
			join(destination, relativeBackground),
			join(destination, relativeSkin)
		);
	} else {
		await copyFile(
			join(destination, relativeSkin),
			join(destination, relativeBackground)
		);
	}
	return destination;
}

export async function withDualLutDiagnosticSessions<T>({
	resourceId,
	packagePath,
	frames,
	width,
	height,
	runtime,
	run,
}: {
	resourceId: string;
	packagePath: string;
	frames: RealVideoFrame[];
	width: number;
	height: number;
	runtime: JianyingFilterLocalRuntimeInspection;
	run: ({
		backgroundSession,
		skinSession,
	}: {
		backgroundSession: Awaited<
			ReturnType<typeof createJianyingFilterLocalRenderSession>
		>;
		skinSession: Awaited<
			ReturnType<typeof createJianyingFilterLocalRenderSession>
		>;
	}) => Promise<T>;
}) {
	const firstFrame = frames[0];
	if (!firstFrame) throw new Error("Dual-LUT diagnostic requires video frames");
	const directory = await mkdtemp(join(tmpdir(), "qcut-dual-lut-diagnostic-"));
	let backgroundSession: Awaited<
		ReturnType<typeof createJianyingFilterLocalRenderSession>
	> | null = null;
	let skinSession: Awaited<
		ReturnType<typeof createJianyingFilterLocalRenderSession>
	> | null = null;
	try {
		const [backgroundPackage, skinPackage] = await Promise.all([
			prepareDiagnosticPackage({ packagePath, directory, role: "background" }),
			prepareDiagnosticPackage({ packagePath, directory, role: "skin" }),
		]);
		if (
			!(
				Number.isSafeInteger(width) &&
				Number.isSafeInteger(height) &&
				width > 0 &&
				height > 0 &&
				firstFrame.rgba.length === width * height * 4
			)
		) {
			throw new Error("Diagnostic frame dimensions are invalid");
		}
		[backgroundSession, skinSession] = await Promise.all([
			createJianyingFilterLocalRenderSession({
				resourceId,
				packagePath: backgroundPackage,
				width,
				height,
				bootstrapRgba: firstFrame.rgba,
				runtime,
			}),
			createJianyingFilterLocalRenderSession({
				resourceId,
				packagePath: skinPackage,
				width,
				height,
				bootstrapRgba: firstFrame.rgba,
				runtime,
			}),
		]);
		return await run({ backgroundSession, skinSession });
	} finally {
		await Promise.all([
			backgroundSession?.dispose().catch(() => undefined),
			skinSession?.dispose().catch(() => undefined),
		]);
		await rm(directory, { recursive: true, force: true });
	}
}
