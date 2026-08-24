import type {
	JianyingPortraitAdjustmentDetectRequest,
	JianyingPortraitAdjustmentInspectRequest,
	JianyingPortraitAdjustmentRenderRequest,
	MediaPortraitAdjustmentKey,
	MediaPortraitAdjustments,
	MediaPortraitMakeupCategory,
} from "../jianying-portrait-adjustment-contract.js";
import { jianyingPortraitControl } from "./catalog.js";
import { jianyingPortraitMakeupCard } from "./makeup-catalog.js";

const MAX_FRAME_DIMENSION = 4096;
const MAX_FRAME_PIXELS = 4096 * 4096;
const MAX_SOURCE_KEY_LENGTH = 512;
const MAX_TIMESTAMP_SECONDS = 86_399;

function recordValue({ value }: { value: unknown }) {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function positiveInteger({ value, label }: { value: unknown; label: string }) {
	if (
		typeof value !== "number" ||
		!Number.isSafeInteger(value) ||
		value <= 0 ||
		value > MAX_FRAME_DIMENSION
	) {
		throw new Error(`剪映美颜美体 ${label} 无效`);
	}
	return value;
}

export function parseJianyingPortraitInspectRequest({
	request,
}: {
	request: unknown;
}): JianyingPortraitAdjustmentInspectRequest {
	if (request === undefined) return {};
	const record = recordValue({ value: request });
	if (!record) throw new Error("剪映美颜美体检查请求无效");
	if (record.refresh !== undefined && typeof record.refresh !== "boolean") {
		throw new Error("剪映美颜美体 refresh 参数无效");
	}
	return record.refresh === undefined ? {} : { refresh: record.refresh };
}

export function parseJianyingPortraitDetectRequest({
	request,
}: {
	request: unknown;
}): JianyingPortraitAdjustmentDetectRequest {
	const record = recordValue({ value: request });
	if (!record) throw new Error("剪映美颜美体人脸检测请求无效");
	const width = record.width;
	const height = record.height;
	if (
		typeof width !== "number" ||
		typeof height !== "number" ||
		!Number.isSafeInteger(width) ||
		!Number.isSafeInteger(height) ||
		width <= 0 ||
		height <= 0 ||
		width > MAX_FRAME_DIMENSION ||
		height > MAX_FRAME_DIMENSION
	) {
		throw new Error("剪映美颜美体人脸检测尺寸无效");
	}
	if (
		!(record.rgba instanceof Uint8Array) ||
		record.rgba.byteLength !== width * height * 4
	) {
		throw new Error("剪映美颜美体人脸检测帧尺寸不匹配");
	}
	return {
		width,
		height,
		rgba: new Uint8Array(
			record.rgba.buffer,
			record.rgba.byteOffset,
			record.rgba.byteLength
		),
	};
}

function parseAdjustmentValues({ value }: { value: unknown }) {
	const record = recordValue({ value });
	if (!record) throw new Error("剪映美颜美体参数无效");
	const values: Partial<Record<MediaPortraitAdjustmentKey, number>> = {};
	for (const [key, rawValue] of Object.entries(record)) {
		const control = jianyingPortraitControl({ key });
		if (!control) throw new Error(`剪映美颜美体参数不受支持: ${key}`);
		if (
			typeof rawValue !== "number" ||
			!Number.isFinite(rawValue) ||
			rawValue < control.min ||
			rawValue > control.max
		) {
			throw new Error(`剪映美颜美体参数超出范围: ${key}`);
		}
		values[control.key] = rawValue;
	}
	return values;
}

function parseFaceTarget({
	value,
}: {
	value: unknown;
}): MediaPortraitAdjustments["faceTarget"] {
	if (value === undefined) return undefined;
	const record = recordValue({ value });
	if (!record || (record.mode !== "all" && record.mode !== "single")) {
		throw new Error("剪映美颜美体人脸目标无效");
	}
	if (record.mode === "all") return { mode: "all" };
	if (
		typeof record.faceId !== "number" ||
		!Number.isSafeInteger(record.faceId) ||
		record.faceId < 0 ||
		record.faceId > 9
	) {
		throw new Error("剪映美颜美体单人脸编号无效");
	}
	return { mode: "single", faceId: record.faceId };
}

const MAXIMUM_PORTRAIT_FACE_ENTRIES = 10;

function parseFaceEntries({
	value,
}: {
	value: unknown;
}): MediaPortraitAdjustments["faces"] {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) throw new Error("剪映美颜美体人脸列表无效");
	const entries: NonNullable<MediaPortraitAdjustments["faces"]> = [];
	const seenTrackIds = new Set<number>();
	for (const rawEntry of value) {
		const record = recordValue({ value: rawEntry });
		if (!record) throw new Error("剪映美颜美体人脸条目无效");
		const trackId = record.trackId;
		if (
			typeof trackId !== "number" ||
			!Number.isSafeInteger(trackId) ||
			trackId < 0 ||
			seenTrackIds.has(trackId)
		) {
			throw new Error("剪映美颜美体人脸跟踪编号无效");
		}
		seenTrackIds.add(trackId);
		const makeup = parseMakeupSelections({ value: record.makeup });
		entries.push({
			trackId,
			values: parseAdjustmentValues({ value: record.values }),
			...(makeup ? { makeup } : {}),
		});
	}
	if (entries.length > MAXIMUM_PORTRAIT_FACE_ENTRIES) {
		throw new Error("剪映美颜美体人脸条目超出上限");
	}
	return entries.length > 0
		? entries.sort((left, right) => left.trackId - right.trackId)
		: undefined;
}

function parseMakeupSelections({
	value,
}: {
	value: unknown;
}): MediaPortraitAdjustments["makeup"] {
	if (value === undefined) return undefined;
	const record = recordValue({ value });
	if (!record) throw new Error("剪映美妆参数无效");
	const selections: NonNullable<MediaPortraitAdjustments["makeup"]> = {};
	for (const [category, rawSelection] of Object.entries(record)) {
		const selection = recordValue({ value: rawSelection });
		if (!selection || typeof selection.cardId !== "string") {
			throw new Error(`剪映美妆卡片无效: ${category}`);
		}
		const card = jianyingPortraitMakeupCard({ id: selection.cardId });
		if (!card || card.category !== category) {
			throw new Error(`剪映美妆卡片不受支持: ${selection.cardId}`);
		}
		if (
			typeof selection.intensity !== "number" ||
			!Number.isFinite(selection.intensity) ||
			selection.intensity <= 0 ||
			selection.intensity > 100
		) {
			throw new Error(`剪映美妆强度无效: ${selection.cardId}`);
		}
		selections[category as MediaPortraitMakeupCategory] = {
			cardId: card.id,
			intensity: selection.intensity,
		};
	}
	return Object.keys(selections).length > 0 ? selections : undefined;
}

export function parseJianyingPortraitRenderRequest({
	request,
}: {
	request: unknown;
}): JianyingPortraitAdjustmentRenderRequest {
	const record = recordValue({ value: request });
	if (!record) throw new Error("剪映美颜美体渲染请求无效");
	const width = positiveInteger({ value: record.width, label: "width" });
	const height = positiveInteger({ value: record.height, label: "height" });
	if (width * height > MAX_FRAME_PIXELS) {
		throw new Error("剪映美颜美体画面像素数量超限");
	}
	if (!(record.rgba instanceof Uint8Array)) {
		throw new Error("剪映美颜美体 rgba 数据无效");
	}
	if (record.rgba.byteLength !== width * height * 4) {
		throw new Error("剪映美颜美体 rgba 数据尺寸不匹配");
	}
	const adjustments = recordValue({ value: record.adjustments });
	if (!adjustments || typeof adjustments.enabled !== "boolean") {
		throw new Error("剪映美颜美体开关无效");
	}
	const sourceKey = record.sourceKey;
	if (
		sourceKey !== undefined &&
		(typeof sourceKey !== "string" ||
			sourceKey.length === 0 ||
			sourceKey.length > MAX_SOURCE_KEY_LENGTH ||
			/[\r\n\t]/.test(sourceKey))
	) {
		throw new Error("剪映美颜美体 sourceKey 无效");
	}
	const timestampSeconds = record.timestampSeconds;
	if (
		timestampSeconds !== undefined &&
		(typeof timestampSeconds !== "number" ||
			!Number.isFinite(timestampSeconds) ||
			timestampSeconds < 0 ||
			timestampSeconds > MAX_TIMESTAMP_SECONDS)
	) {
		throw new Error("剪映美颜美体时间戳无效");
	}
	const faceTarget = parseFaceTarget({ value: adjustments.faceTarget });
	const makeup = parseMakeupSelections({ value: adjustments.makeup });
	const faces = parseFaceEntries({ value: adjustments.faces });
	return {
		width,
		height,
		rgba: new Uint8Array(
			record.rgba.buffer,
			record.rgba.byteOffset,
			record.rgba.byteLength
		),
		adjustments: {
			enabled: adjustments.enabled,
			values: parseAdjustmentValues({ value: adjustments.values }),
			...(faceTarget ? { faceTarget } : {}),
			...(makeup ? { makeup } : {}),
			...(faces ? { faces } : {}),
		},
		...(sourceKey === undefined ? {} : { sourceKey }),
		...(timestampSeconds === undefined ? {} : { timestampSeconds }),
	};
}
