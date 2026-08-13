import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type {
	JianyingEffectStyleInspection,
	JianyingEffectStyleLayer,
	JianyingEffectStyleLayerRole,
	JianyingEffectStyleManifest,
	JianyingEffectStyleRenderType,
	JianyingEffectStyleTextureResource,
} from "./jianying-text-effect-style-contract.js";
import {
	asJianyingRecord,
	detectJianyingTextPackageKind,
	readBoundedJianyingTextJson,
} from "./jianying-text-package-metadata.js";
import type {
	JianyingTextEffectCapabilities,
	JianyingTextRuntimeDiagnostic,
} from "./jianying-text-runtime-contract.js";

interface TextureInspection extends JianyingEffectStyleTextureResource {
	size?: number;
	modifiedAt?: number;
}

function diagnostic({
	code,
	message,
	resourceId,
	relativePath,
	severity,
}: JianyingTextRuntimeDiagnostic): JianyingTextRuntimeDiagnostic {
	return {
		code,
		severity,
		message,
		...(resourceId ? { resourceId } : {}),
		...(relativePath ? { relativePath } : {}),
	};
}

function inspectionFingerprint({
	resourceId,
	state,
	value,
}: {
	resourceId: string;
	state: JianyingEffectStyleInspection["state"];
	value: unknown;
}) {
	return createHash("sha256")
		.update(JSON.stringify({ resourceId, state, value }))
		.digest("hex");
}

function invalidInspection({
	code,
	message,
	resourceId,
}: {
	code: JianyingTextRuntimeDiagnostic["code"];
	message: string;
	resourceId: string;
}): JianyingEffectStyleInspection {
	const diagnostics = [
		diagnostic({ code, message, resourceId, severity: "error" }),
	];
	return {
		state: "invalid",
		canHydrate: false,
		diagnostics,
		fingerprint: inspectionFingerprint({
			resourceId,
			state: "invalid",
			value: diagnostics,
		}),
	};
}

function normalizedRenderType({
	value,
}: {
	value: unknown;
}): JianyingEffectStyleRenderType {
	return value === "solid" || value === "gradient" || value === "texture"
		? value
		: "unknown";
}

function roleForKey({
	key,
	fallback,
}: {
	key: string;
	fallback: JianyingEffectStyleLayerRole;
}): JianyingEffectStyleLayerRole {
	if (key === "fill") return "fill";
	if (key === "strokes") return "stroke";
	if (key === "inner_shadows") return "inner-shadow";
	if (key === "shadows") return "shadow";
	return fallback;
}

function collectLayers({ value }: { value: Record<string, unknown> }) {
	const layers: JianyingEffectStyleLayer[] = [];
	const visit = ({
		current,
		currentPath,
		enabled,
		role,
	}: {
		current: unknown;
		currentPath: string;
		enabled: boolean;
		role: JianyingEffectStyleLayerRole;
	}) => {
		if (Array.isArray(current)) {
			for (let index = 0; index < current.length; index += 1) {
				visit({
					current: current[index],
					currentPath: `${currentPath}[${index}]`,
					enabled,
					role,
				});
			}
			return;
		}
		const record = asJianyingRecord(current);
		if (!record) return;
		const layerEnabled = enabled && record.enable !== false;
		const content = asJianyingRecord(record.content);
		if (content && "render_type" in content) {
			const renderType = normalizedRenderType({ value: content.render_type });
			const texturePath =
				renderType === "texture"
					? asJianyingRecord(content.texture)?.path
					: undefined;
			layers.push({
				path: currentPath,
				role,
				enabled: layerEnabled,
				renderType,
				...(typeof texturePath === "string" ? { texturePath } : {}),
				source: structuredClone(record),
			});
		}
		for (const [key, child] of Object.entries(record)) {
			if (key === "content") continue;
			visit({
				current: child,
				currentPath: `${currentPath}.${key}`,
				enabled: layerEnabled,
				role: roleForKey({ key, fallback: role }),
			});
		}
	};
	visit({ current: value, currentPath: "$", enabled: true, role: "component" });
	return layers;
}

function isInside({ root, candidate }: { root: string; candidate: string }) {
	return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function inspectTexture({
	packageRoot,
	relativePath,
}: {
	packageRoot: string;
	relativePath: string;
}): Promise<TextureInspection> {
	if (
		relativePath.length === 0 ||
		path.isAbsolute(relativePath) ||
		relativePath.includes("\0")
	) {
		return { relativePath, state: "invalid" };
	}
	const candidate = path.resolve(packageRoot, relativePath);
	if (!isInside({ root: packageRoot, candidate })) {
		return { relativePath, state: "invalid" };
	}
	const resolved = await realpath(candidate).catch(() => null);
	if (!resolved) return { relativePath, state: "missing" };
	if (!isInside({ root: packageRoot, candidate: resolved })) {
		return { relativePath, state: "invalid" };
	}
	const metadata = await stat(resolved).catch(() => null);
	if (!(metadata?.isFile() && metadata.size > 0)) {
		return { relativePath, state: "missing" };
	}
	return {
		relativePath,
		state: "ready",
		size: metadata.size,
		modifiedAt: metadata.mtimeMs,
	};
}

function validateGradientLayer({
	layer,
	resourceId,
}: {
	layer: JianyingEffectStyleLayer;
	resourceId: string;
}) {
	if (!(layer.enabled && layer.renderType === "gradient")) return null;
	const gradient = asJianyingRecord(
		asJianyingRecord(layer.source.content)?.gradient
	);
	const colors = gradient?.color;
	const alphas = gradient?.alpha;
	const percentages = gradient?.percent;
	if (
		Array.isArray(colors) &&
		Array.isArray(alphas) &&
		Array.isArray(percentages) &&
		colors.length > 0 &&
		colors.length === alphas.length &&
		colors.length === percentages.length
	) {
		return null;
	}
	return diagnostic({
		code: "effect-style-gradient-invalid",
		severity: "warning",
		message: `花字 ${resourceId} 的渐变层 ${layer.path} 色标数量不一致，将交由运行时尝试降级渲染。`,
		resourceId,
	});
}

function textureDiagnostic({
	resourceId,
	texture,
}: {
	resourceId: string;
	texture: JianyingEffectStyleTextureResource;
}) {
	if (texture.state === "ready") return null;
	if (texture.relativePath.length === 0) {
		return diagnostic({
			code: "effect-style-texture-path-missing",
			severity: "warning",
			message: `花字 ${resourceId} 的纹理层没有资源路径，将跳过该外观并使用普通文字。`,
			resourceId,
		});
	}
	if (texture.state === "invalid") {
		return diagnostic({
			code: "effect-style-texture-outside-package",
			severity: "warning",
			message: `花字 ${resourceId} 的纹理路径不在资源包内，已拒绝该外观并使用普通文字。`,
			resourceId,
			relativePath: texture.relativePath,
		});
	}
	return diagnostic({
		code: "effect-style-texture-missing",
		severity: "warning",
		message: `花字 ${resourceId} 缺少纹理 ${texture.relativePath}，将跳过该外观并使用普通文字。`,
		resourceId,
		relativePath: texture.relativePath,
	});
}

function packageVersion({ value }: { value: unknown }) {
	return typeof value === "string" ||
		(typeof value === "number" && Number.isFinite(value))
		? String(value)
		: "unknown";
}

export async function parseJianyingEffectStylePackage({
	packagePath,
	resourceId,
}: {
	packagePath: string;
	resourceId: string;
}): Promise<JianyingEffectStyleInspection> {
	const packageRoot = await realpath(packagePath).catch(() => null);
	if (!packageRoot) {
		return invalidInspection({
			code: "effect-style-package-missing",
			message: `花字外观资源 ${resourceId} 的本机缓存目录不存在。`,
			resourceId,
		});
	}
	let config: unknown;
	try {
		config = await readBoundedJianyingTextJson({
			filePath: path.join(packageRoot, "config.json"),
		});
	} catch {
		return invalidInspection({
			code: "effect-style-config-invalid",
			message: `花字外观资源 ${resourceId} 的 config.json 缺失或损坏。`,
			resourceId,
		});
	}
	if (detectJianyingTextPackageKind({ config }) !== "TextStyle") {
		return invalidInspection({
			code: "effect-style-config-invalid",
			message: `花字外观资源 ${resourceId} 不是 TextStyle 包，不能作为 effectStyle 加载。`,
			resourceId,
		});
	}
	let styleValue: unknown;
	try {
		styleValue = await readBoundedJianyingTextJson({
			filePath: path.join(packageRoot, "effectStyle.json"),
		});
	} catch (cause) {
		const missing =
			cause instanceof Error && "code" in cause && cause.code === "ENOENT";
		return invalidInspection({
			code: missing
				? "effect-style-manifest-missing"
				: "effect-style-manifest-invalid",
			message: missing
				? `花字外观资源 ${resourceId} 缺少 effectStyle.json。`
				: `花字外观资源 ${resourceId} 的 effectStyle.json 无法解析。`,
			resourceId,
		});
	}
	const style = asJianyingRecord(styleValue);
	if (!style) {
		return invalidInspection({
			code: "effect-style-manifest-invalid",
			message: `花字外观资源 ${resourceId} 的 effectStyle.json 根节点无效。`,
			resourceId,
		});
	}
	const layers = collectLayers({ value: style });
	if (layers.length === 0) {
		return invalidInspection({
			code: "effect-style-layer-missing",
			message: `花字外观资源 ${resourceId} 没有可识别的填充、描边或阴影层。`,
			resourceId,
		});
	}
	const enabledLayers = layers.filter(({ enabled }) => enabled);
	const texturePaths = Array.from(
		new Set(
			enabledLayers.flatMap(({ renderType, texturePath }) =>
				renderType === "texture" ? [texturePath ?? ""] : []
			)
		)
	).sort();
	const textureInspections = await Promise.all(
		texturePaths.map((relativePath) =>
			inspectTexture({ packageRoot, relativePath })
		)
	);
	const textures = textureInspections.map(({ relativePath, state }) => ({
		relativePath,
		state,
	}));
	const strokeCount = enabledLayers.filter(
		({ role }) => role === "stroke"
	).length;
	const innerShadowCount = enabledLayers.filter(
		({ role }) => role === "inner-shadow"
	).length;
	const shadowCount = enabledLayers.filter(
		({ role }) => role === "shadow"
	).length;
	const textureLayerCount = enabledLayers.filter(
		({ renderType }) => renderType === "texture"
	).length;
	const gradientLayerCount = enabledLayers.filter(
		({ renderType }) => renderType === "gradient"
	).length;
	const capabilities: JianyingTextEffectCapabilities = {
		staticTexture: textureLayerCount > 0,
		multipleStrokes: strokeCount > 1,
		animationComponents: false,
		scriptInfoSticker: false,
		shaderComponents: false,
		threeDimensional: false,
		feedbackComponents: false,
	};
	const diagnostics = [
		...enabledLayers.flatMap((layer) => {
			const gradient = validateGradientLayer({ layer, resourceId });
			const unknown =
				layer.renderType === "unknown"
					? diagnostic({
							code: "effect-style-render-type-unknown",
							severity: "warning",
							message: `花字 ${resourceId} 的图层 ${layer.path} 使用未知渲染类型，将交由运行时尝试渲染。`,
							resourceId,
						})
					: null;
			return [gradient, unknown].filter(
				(value): value is JianyingTextRuntimeDiagnostic => value !== null
			);
		}),
		...textures.flatMap((texture) => {
			const issue = textureDiagnostic({ resourceId, texture });
			return issue ? [issue] : [];
		}),
	];
	const fillKind =
		enabledLayers.find(({ role }) => role === "fill")?.renderType ?? "unknown";
	const state = diagnostics.length > 0 ? "degraded" : "ready";
	const canHydrate = textures.every(
		({ state: textureState }) => textureState === "ready"
	);
	const fingerprintValue = {
		style,
		textures: textureInspections,
		diagnostics,
	};
	const fingerprint = inspectionFingerprint({
		resourceId,
		state,
		value: fingerprintValue,
	});
	const manifest: JianyingEffectStyleManifest = {
		schemaVersion: 1,
		resourceId,
		packageVersion: packageVersion({ value: style.version }),
		textable: typeof style.textable === "boolean" ? style.textable : null,
		fillKind,
		strokeCount,
		innerShadowCount,
		shadowCount,
		textureLayerCount,
		gradientLayerCount,
		layers,
		textures,
		capabilities,
		diagnostics,
		fingerprint,
		source: structuredClone(style),
	};
	return { state, canHydrate, manifest, diagnostics, fingerprint };
}
