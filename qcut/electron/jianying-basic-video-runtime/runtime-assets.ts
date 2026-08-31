import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const EXPECTED_BASIC_VIDEO_VERSION = "11.3.0";
export const EXPECTED_DEFLICKER_MODEL_SHA256 =
	"0d398bb6a77650a5a07c038473e54ba488443821257f7fa729a9be0e05c777db";
export const EXPECTED_LENS_SHA256 =
	"fdf576dd066a11db7b54d815621893ed62a8ed223e22834d5753738dc66df161";
const EXPECTED_FRAMEWORK_DEPENDENCIES = [
	{
		path: "Frameworks/libfastcv.dylib",
		sha256: "679fc0665d9e24a6130f1bf53cc04d7a54edde4fcba6d9607e4559b627ae066f",
	},
	{
		path: "Frameworks/libbytenn.dylib",
		sha256: "febfce4549cd6337c232c22ed00463a54cda7b255c4961426a33bfc78542b863",
	},
	{
		path: "Frameworks/libIESAppLogger.dylib",
		sha256: "90e6e7b203d42c3315c704e4912288e9a6e9fab7db310e404a48657b1c662687",
	},
] as const;
export const DEFLICKER_MODEL_RELATIVE_PATH = path.join(
	"Models",
	"deflicker",
	"deflicker.bundle",
	"deflicker.metallib"
);
export const LENS_RELATIVE_PATH = path.join("Frameworks", "liblens.dylib");

interface BasicVideoManifestEntry {
	bytes: number;
	relativePath: string;
	sha256: string;
}

interface BasicVideoManifest {
	files: BasicVideoManifestEntry[];
	version: string;
}

interface TransitionManifestEntry {
	bytes: number;
	path: string;
	sha256: string;
}

interface TransitionManifest {
	cloudUpload: false;
	files: TransitionManifestEntry[];
	localOnly: true;
	schemaVersion: 1;
}

export interface JianyingBasicVideoRuntimeAssets {
	appVersion: string;
	deflickerModelPath: string;
	deflickerModelSha256: string;
	frameworkDirectory: string;
	lensPath: string;
	lensSha256: string;
	runtimeIdentity: string;
}

function privateRuntimeBase() {
	return path.join(
		os.homedir(),
		"Library",
		"Application Support",
		"QCut",
		"PrivateRuntimes"
	);
}

export function defaultBasicVideoRuntimeRoot() {
	return path.join(privateRuntimeBase(), "JianyingBasicVideo", "current");
}

export function defaultLensRuntimeRoot() {
	return path.join(privateRuntimeBase(), "JianyingTransition", "current");
}

function recordValue({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	return Boolean(value) && typeof value === "object"
		? (value as Record<string, unknown>)
		: null;
}

function isManifestHash({ value }: { value: unknown }) {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function parseBasicManifest({ value }: { value: unknown }): BasicVideoManifest {
	const manifest = recordValue({ value });
	if (!manifest || manifest.version !== EXPECTED_BASIC_VIDEO_VERSION) {
		throw new Error("本机基础视频模型清单版本不受支持");
	}
	if (!Array.isArray(manifest.files)) {
		throw new Error("本机基础视频模型清单缺少文件列表");
	}
	const files = manifest.files.map((entry) => {
		const file = recordValue({ value: entry });
		if (
			!file ||
			typeof file.relativePath !== "string" ||
			!Number.isSafeInteger(file.bytes) ||
			!isManifestHash({ value: file.sha256 })
		) {
			throw new Error("本机基础视频模型清单包含无效文件");
		}
		return {
			bytes: file.bytes as number,
			relativePath: file.relativePath,
			sha256: file.sha256 as string,
		};
	});
	return { files, version: manifest.version as string };
}

function parseTransitionManifest({
	value,
}: {
	value: unknown;
}): TransitionManifest {
	const manifest = recordValue({ value });
	if (
		!manifest ||
		manifest.schemaVersion !== 1 ||
		manifest.localOnly !== true ||
		manifest.cloudUpload !== false ||
		!Array.isArray(manifest.files)
	) {
		throw new Error("本机 Lens runtime 清单无效");
	}
	const files = manifest.files.map((entry) => {
		const file = recordValue({ value: entry });
		if (
			!file ||
			typeof file.path !== "string" ||
			!Number.isSafeInteger(file.bytes) ||
			!isManifestHash({ value: file.sha256 })
		) {
			throw new Error("本机 Lens runtime 清单包含无效文件");
		}
		return {
			bytes: file.bytes as number,
			path: file.path,
			sha256: file.sha256 as string,
		};
	});
	return { cloudUpload: false, files, localOnly: true, schemaVersion: 1 };
}

function requireManifestEntry<Entry extends { bytes: number; sha256: string }>({
	entry,
	expectedSha256,
	label,
}: {
	entry: Entry | undefined;
	expectedSha256: string;
	label: string;
}) {
	if (!entry || entry.sha256 !== expectedSha256 || entry.bytes <= 0) {
		throw new Error(`${label} 不在受支持的本机缓存清单中`);
	}
	return entry;
}

export function sha256File({ filePath }: { filePath: string }) {
	return new Promise<string>((resolve, reject) => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolve(hash.digest("hex")));
	});
}

async function verifyFile({
	expectedBytes,
	expectedSha256,
	filePath,
	label,
}: {
	expectedBytes: number;
	expectedSha256: string;
	filePath: string;
	label: string;
}) {
	const metadata = await stat(filePath);
	if (!metadata.isFile() || metadata.size !== expectedBytes) {
		throw new Error(`${label} 文件大小与缓存清单不一致`);
	}
	const actualSha256 = await sha256File({ filePath });
	if (actualSha256 !== expectedSha256) {
		throw new Error(`${label} SHA-256 校验失败`);
	}
}

export async function verifyJianyingBasicVideoRuntime({
	basicVideoRoot = process.env.QCUT_JIANYING_BASIC_VIDEO_RUNTIME ??
		defaultBasicVideoRuntimeRoot(),
	lensRuntimeRoot = process.env.QCUT_JIANYING_LENS_RUNTIME ??
		defaultLensRuntimeRoot(),
}: {
	basicVideoRoot?: string;
	lensRuntimeRoot?: string;
} = {}): Promise<JianyingBasicVideoRuntimeAssets> {
	const [resolvedBasicRoot, resolvedLensRoot] = await Promise.all([
		realpath(basicVideoRoot),
		realpath(lensRuntimeRoot),
	]);
	const [basicText, transitionText] = await Promise.all([
		readFile(path.join(resolvedBasicRoot, "manifest.json"), "utf8"),
		readFile(path.join(resolvedLensRoot, "qcut-effect-runtime.json"), "utf8"),
	]);
	const basicManifest = parseBasicManifest({
		value: JSON.parse(basicText) as unknown,
	});
	const transitionManifest = parseTransitionManifest({
		value: JSON.parse(transitionText) as unknown,
	});
	const modelEntry = requireManifestEntry({
		entry: basicManifest.files.find(
			(entry) =>
				entry.relativePath === "deflicker/deflicker.bundle/deflicker.metallib"
		),
		expectedSha256: EXPECTED_DEFLICKER_MODEL_SHA256,
		label: "剪映防闪烁模型",
	});
	const lensEntry = requireManifestEntry({
		entry: transitionManifest.files.find(
			(entry) => entry.path === "Frameworks/liblens.dylib"
		),
		expectedSha256: EXPECTED_LENS_SHA256,
		label: "剪映 Lens runtime",
	});
	const dependencyEntries = EXPECTED_FRAMEWORK_DEPENDENCIES.map(
		(dependency) => ({
			dependency,
			entry: requireManifestEntry({
				entry: transitionManifest.files.find(
					(entry) => entry.path === dependency.path
				),
				expectedSha256: dependency.sha256,
				label: `剪映依赖 ${path.basename(dependency.path)}`,
			}),
		})
	);
	const deflickerModelPath = path.join(
		resolvedBasicRoot,
		DEFLICKER_MODEL_RELATIVE_PATH
	);
	const lensPath = path.join(resolvedLensRoot, LENS_RELATIVE_PATH);
	await Promise.all([
		verifyFile({
			expectedBytes: modelEntry.bytes,
			expectedSha256: EXPECTED_DEFLICKER_MODEL_SHA256,
			filePath: deflickerModelPath,
			label: "剪映防闪烁模型",
		}),
		verifyFile({
			expectedBytes: lensEntry.bytes,
			expectedSha256: EXPECTED_LENS_SHA256,
			filePath: lensPath,
			label: "剪映 Lens runtime",
		}),
		...dependencyEntries.map(({ dependency, entry }) =>
			verifyFile({
				expectedBytes: entry.bytes,
				expectedSha256: dependency.sha256,
				filePath: path.join(resolvedLensRoot, dependency.path),
				label: `剪映依赖 ${path.basename(dependency.path)}`,
			})
		),
	]);
	const runtimeIdentity = createHash("sha256")
		.update(EXPECTED_BASIC_VIDEO_VERSION)
		.update(EXPECTED_DEFLICKER_MODEL_SHA256)
		.update(EXPECTED_LENS_SHA256)
		.update(
			EXPECTED_FRAMEWORK_DEPENDENCIES.map(
				(dependency) => dependency.sha256
			).join("")
		)
		.digest("hex");
	return {
		appVersion: basicManifest.version,
		deflickerModelPath,
		deflickerModelSha256: EXPECTED_DEFLICKER_MODEL_SHA256,
		frameworkDirectory: path.join(resolvedLensRoot, "Frameworks"),
		lensPath,
		lensSha256: EXPECTED_LENS_SHA256,
		runtimeIdentity,
	};
}
