import type {
	JianyingFilterLabListRequest,
	JianyingFilterLabLoadRendererRequest,
	JianyingFilterLabLoadRequest,
	JianyingFilterLabThumbnailRequest,
} from "./jianying-filter-lab-contract.js";

const LUT_ID_PATTERN = /^[A-Za-z0-9._/-]{1,256}$/;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

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
