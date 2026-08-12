import type {
	JianyingFilterLabLocalRuntimeRequest,
	JianyingFilterLabListRequest,
	JianyingFilterLabLoadRendererRequest,
	JianyingFilterLabLoadRequest,
	JianyingFilterLabRenderLocalEffectRequest,
	JianyingFilterLabRenderLocalPortraitRequest,
	JianyingFilterLabThumbnailRequest,
} from "./jianying-filter-lab-contract.js";

const LUT_ID_PATTERN = /^[A-Za-z0-9._/-]{1,256}$/;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const MAX_LOCAL_EFFECT_PIXELS = 1920 * 1080;
const MAX_LOCAL_SOURCE_KEY_LENGTH = 512;

export function parseFilterLabLoadRequest({ request }: { request: unknown }) {
	if (!request || typeof request !== "object" || !("lutId" in request)) {
		throw new Error("滤镜实验室请求缺少 LUT ID");
	}
	const lutId = request.lutId;
	if (
		typeof lutId !== "string" ||
		!LUT_ID_PATTERN.test(lutId) ||
		lutId.includes("..") ||
		lutId.startsWith("/") ||
		lutId.endsWith("/")
	) {
		throw new Error("滤镜实验室 LUT ID 无效");
	}
	return { lutId } satisfies JianyingFilterLabLoadRequest;
}

export function parseFilterLabListRequest({ request }: { request: unknown }) {
	if (request === undefined) return {} satisfies JianyingFilterLabListRequest;
	if (!request || typeof request !== "object") {
		throw new Error("滤镜实验室列表请求无效");
	}
	const refresh = "refresh" in request ? request.refresh : undefined;
	if (refresh !== undefined && typeof refresh !== "boolean") {
		throw new Error("滤镜实验室 refresh 参数无效");
	}
	return refresh === undefined
		? ({} satisfies JianyingFilterLabListRequest)
		: ({ refresh } satisfies JianyingFilterLabListRequest);
}

function parseResourceId({ request }: { request: unknown }) {
	if (!request || typeof request !== "object" || !("resourceId" in request)) {
		throw new Error("滤镜实验室请求缺少资源 ID");
	}
	const resourceId = request.resourceId;
	if (typeof resourceId !== "string" || !RESOURCE_ID_PATTERN.test(resourceId)) {
		throw new Error("滤镜实验室资源 ID 无效");
	}
	return resourceId;
}

export function parseFilterLabThumbnailRequest({
	request,
}: {
	request: unknown;
}) {
	return {
		resourceId: parseResourceId({ request }),
	} satisfies JianyingFilterLabThumbnailRequest;
}

export function parseFilterLabRendererRequest({
	request,
}: {
	request: unknown;
}) {
	return {
		resourceId: parseResourceId({ request }),
	} satisfies JianyingFilterLabLoadRendererRequest;
}

export function parseFilterLabLocalRuntimeRequest({
	request,
}: {
	request: unknown;
}) {
	if (request === undefined) {
		return {} satisfies JianyingFilterLabLocalRuntimeRequest;
	}
	if (!request || typeof request !== "object") {
		throw new Error("剪映本机滤镜运行时请求无效");
	}
	const refresh = "refresh" in request ? request.refresh : undefined;
	if (refresh !== undefined && typeof refresh !== "boolean") {
		throw new Error("剪映本机滤镜 refresh 参数无效");
	}
	return refresh === undefined
		? ({} satisfies JianyingFilterLabLocalRuntimeRequest)
		: ({ refresh } satisfies JianyingFilterLabLocalRuntimeRequest);
}

function parseFilterLabRenderLocalFrameRequest({
	request,
}: {
	request: unknown;
}) {
	const resourceId = parseResourceId({ request });
	if (
		!request ||
		typeof request !== "object" ||
		!("width" in request) ||
		!("height" in request) ||
		!("rgba" in request)
	) {
		throw new Error("剪映本机滤镜请求不完整");
	}
	const { width, height, rgba } = request;
	if (
		typeof width !== "number" ||
		typeof height !== "number" ||
		!Number.isSafeInteger(width) ||
		!Number.isSafeInteger(height) ||
		width <= 0 ||
		height <= 0 ||
		width > 4096 ||
		height > 4096 ||
		width * height > MAX_LOCAL_EFFECT_PIXELS
	) {
		throw new Error("剪映本机滤镜画面尺寸无效或超过 1080p");
	}
	if (!(rgba instanceof Uint8Array) || rgba.length !== width * height * 4) {
		throw new Error("剪映本机滤镜 RGBA 数据无效");
	}
	const sourceKey = "sourceKey" in request ? request.sourceKey : undefined;
	if (
		sourceKey !== undefined &&
		(typeof sourceKey !== "string" ||
			sourceKey.length === 0 ||
			sourceKey.length > MAX_LOCAL_SOURCE_KEY_LENGTH ||
			sourceKey.includes("\0"))
	) {
		throw new Error("剪映本机滤镜素材标识无效");
	}
	const timestampSeconds =
		"timestampSeconds" in request ? request.timestampSeconds : undefined;
	if (
		timestampSeconds !== undefined &&
		(typeof timestampSeconds !== "number" ||
			!Number.isFinite(timestampSeconds) ||
			timestampSeconds < 0)
	) {
		throw new Error("剪映本机滤镜时间戳无效");
	}
	return {
		resourceId,
		width,
		height,
		rgba,
		...(sourceKey === undefined ? {} : { sourceKey }),
		...(timestampSeconds === undefined ? {} : { timestampSeconds }),
	};
}

export function parseFilterLabRenderLocalPortraitRequest({
	request,
}: {
	request: unknown;
}) {
	return parseFilterLabRenderLocalFrameRequest({
		request,
	}) satisfies JianyingFilterLabRenderLocalPortraitRequest;
}

export function parseFilterLabRenderLocalEffectRequest({
	request,
}: {
	request: unknown;
}) {
	const frame = parseFilterLabRenderLocalFrameRequest({ request });
	if (!request || typeof request !== "object" || !("intensity" in request)) {
		throw new Error("剪映本机多 Pass 请求缺少强度");
	}
	const intensity = request.intensity;
	if (
		typeof intensity !== "number" ||
		!Number.isFinite(intensity) ||
		intensity < 0 ||
		intensity > 100
	) {
		throw new Error("剪映本机多 Pass 强度必须在 0 到 100 之间");
	}
	return {
		...frame,
		intensity,
	} satisfies JianyingFilterLabRenderLocalEffectRequest;
}
