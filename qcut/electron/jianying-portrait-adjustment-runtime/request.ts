import type {
	JianyingPortraitAdjustmentDetectRequest,
	JianyingPortraitAdjustmentInspectRequest,
	JianyingPortraitAdjustmentRenderRequest,
	MediaPortraitAdjustmentKey,
	MediaPortraitAdjustments,
	MediaPortraitManualBody,
	MediaPortraitManualRetouchStroke,
	MediaPortraitMakeupCategory,
} from "../jianying-portrait-adjustment-contract.js";
import { jianyingPortraitControl } from "./catalog.js";
import { jianyingPortraitMakeupCard } from "./makeup-catalog.js";

const MAX_FRAME_DIMENSION = 4096;
const MAX_FRAME_PIXELS = 4096 * 4096;
const MAX_SOURCE_KEY_LENGTH = 512;
const MAX_TIMESTAMP_SECONDS = 86_399;
const MAXIMUM_MANUAL_RETOUCH_STROKES = 256;
const MAXIMUM_MANUAL_RETOUCH_POINTS = 512;
const MANUAL_RETOUCH_STROKE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const PERSON_BINDING_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAXIMUM_PERSON_BINDINGS = 10;

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

function parseSourceKey({ value }: { value: unknown }) {
	if (value === undefined) return undefined;
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > MAX_SOURCE_KEY_LENGTH ||
		/[\r\n\t]/.test(value)
	) {
		throw new Error("剪映美颜美体 sourceKey 无效");
	}
	return value;
}

function parsePersonBindingAnchor({ value }: { value: unknown }) {
	const anchor = recordValue({ value });
	const rect = recordValue({ value: anchor?.rect });
	const x = rect?.x;
	const y = rect?.y;
	const width = rect?.width;
	const height = rect?.height;
	if (
		!anchor ||
		typeof x !== "number" ||
		typeof y !== "number" ||
		typeof width !== "number" ||
		typeof height !== "number" ||
		![x, y, width, height].every((coordinate) => Number.isFinite(coordinate)) ||
		x < 0 ||
		y < 0 ||
		width <= 0 ||
		height <= 0 ||
		x + width > 1 ||
		y + height > 1
	) {
		throw new Error("剪映美颜美体人物绑定格式无效");
	}
	const frameNumber = anchor.frameNumber;
	if (
		frameNumber !== undefined &&
		(typeof frameNumber !== "number" ||
			!Number.isSafeInteger(frameNumber) ||
			frameNumber < 0)
	) {
		throw new Error("剪映美颜美体人物绑定帧号无效");
	}
	return {
		rect: { x, y, width, height },
		...(typeof frameNumber === "number" ? { frameNumber } : {}),
	};
}

function parsePersonBindings({ value }: { value: unknown }) {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.length > MAXIMUM_PERSON_BINDINGS) {
		throw new Error("剪映美颜美体人物绑定列表无效");
	}
	const ids = new Set<string>();
	return value.map((entry) => {
		const binding = recordValue({ value: entry });
		const personBindingId = binding?.personBindingId;
		if (
			!binding ||
			typeof personBindingId !== "string" ||
			!PERSON_BINDING_ID.test(personBindingId) ||
			ids.has(personBindingId)
		) {
			throw new Error("剪映美颜美体人物绑定格式无效");
		}
		ids.add(personBindingId);
		return {
			personBindingId,
			anchor: parsePersonBindingAnchor({ value: binding.anchor }),
		};
	});
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
	const sourceKey = parseSourceKey({ value: record.sourceKey });
	const frameNumber = record.frameNumber;
	if (
		frameNumber !== undefined &&
		(typeof frameNumber !== "number" ||
			!Number.isSafeInteger(frameNumber) ||
			frameNumber < 0)
	) {
		throw new Error("剪映美颜美体检测帧号无效");
	}
	const personBindings = parsePersonBindings({ value: record.personBindings });
	return {
		width,
		height,
		rgba: new Uint8Array(
			record.rgba.buffer,
			record.rgba.byteOffset,
			record.rgba.byteLength
		),
		...(sourceKey ? { sourceKey } : {}),
		...(typeof frameNumber === "number" ? { frameNumber } : {}),
		...(personBindings ? { personBindings } : {}),
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
	const seenBindings = new Set<string>();
	for (const rawEntry of value) {
		const record = recordValue({ value: rawEntry });
		if (!record) throw new Error("剪映美颜美体人脸条目无效");
		const trackId = record.trackId;
		if (
			typeof trackId !== "number" ||
			!Number.isSafeInteger(trackId) ||
			trackId < 0
		) {
			throw new Error("剪映美颜美体人脸跟踪编号无效");
		}
		const personBindingId = record.personBindingId;
		if (
			personBindingId !== undefined &&
			(typeof personBindingId !== "string" ||
				!PERSON_BINDING_ID.test(personBindingId))
		) {
			throw new Error("剪映美颜美体项目人物编号无效");
		}
		const dedupeKey = personBindingId
			? `person:${personBindingId}`
			: `legacy-track:${trackId}`;
		if (seenBindings.has(dedupeKey)) {
			throw new Error(
				personBindingId
					? "剪映美颜美体项目人物编号重复"
					: "剪映美颜美体人脸跟踪编号无效"
			);
		}
		seenBindings.add(dedupeKey);
		const makeup = parseMakeupSelections({ value: record.makeup });
		entries.push({
			trackId,
			...(personBindingId
				? {
						personBindingId,
						bindingAnchor: parsePersonBindingAnchor({
							value: record.bindingAnchor,
						}),
					}
				: {}),
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

function parseManualRetouch({
	value,
}: {
	value: unknown;
}): MediaPortraitAdjustments["manualRetouch"] {
	if (value === undefined) return undefined;
	const record = recordValue({ value });
	if (!record || !Array.isArray(record.strokes)) {
		throw new Error("剪映手动美颜笔画无效");
	}
	if (record.strokes.length > MAXIMUM_MANUAL_RETOUCH_STROKES) {
		throw new Error("剪映手动美颜笔画超出上限");
	}
	const ids = new Set<string>();
	const strokes: MediaPortraitManualRetouchStroke[] = [];
	for (const value of record.strokes) {
		const stroke = recordValue({ value });
		if (
			!stroke ||
			typeof stroke.id !== "string" ||
			!MANUAL_RETOUCH_STROKE_ID.test(stroke.id) ||
			ids.has(stroke.id) ||
			(stroke.tool !== "smooth" && stroke.tool !== "acne") ||
			(stroke.mode !== "paint" && stroke.mode !== "erase") ||
			typeof stroke.size !== "number" ||
			!Number.isFinite(stroke.size) ||
			stroke.size < 1 ||
			stroke.size > 100 ||
			typeof stroke.intensity !== "number" ||
			!Number.isFinite(stroke.intensity) ||
			stroke.intensity < 0 ||
			stroke.intensity > 100 ||
			!Array.isArray(stroke.points) ||
			stroke.points.length < 2 ||
			stroke.points.length > MAXIMUM_MANUAL_RETOUCH_POINTS
		) {
			throw new Error("剪映手动美颜笔画参数无效");
		}
		const points = stroke.points.map((value) => {
			const point = recordValue({ value });
			if (
				!point ||
				typeof point.x !== "number" ||
				!Number.isFinite(point.x) ||
				point.x < 0 ||
				point.x > 1 ||
				typeof point.y !== "number" ||
				!Number.isFinite(point.y) ||
				point.y < 0 ||
				point.y > 1
			) {
				throw new Error("剪映手动美颜笔画坐标无效");
			}
			return { x: point.x, y: point.y };
		});
		const faceTrackId = stroke.faceTrackId;
		if (
			faceTrackId !== undefined &&
			(typeof faceTrackId !== "number" ||
				!Number.isSafeInteger(faceTrackId) ||
				faceTrackId < 0)
		) {
			throw new Error("剪映手动美颜人脸跟踪编号无效");
		}
		ids.add(stroke.id);
		strokes.push({
			id: stroke.id,
			tool: stroke.tool,
			mode: stroke.mode,
			size: stroke.size,
			intensity: stroke.intensity,
			points,
			...(faceTrackId === undefined ? {} : { faceTrackId }),
		});
	}
	return strokes.length > 0 ? { strokes } : undefined;
}

function boundedNumber({
	label,
	max,
	min,
	value,
}: {
	label: string;
	max: number;
	min: number;
	value: unknown;
}) {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < min ||
		value > max
	) {
		throw new Error(`剪映手动美体参数无效: ${label}`);
	}
	return value;
}

function parseManualBody({
	value,
}: {
	value: unknown;
}): MediaPortraitAdjustments["manualBody"] {
	if (value === undefined) return undefined;
	const record = recordValue({ value });
	if (!record) throw new Error("剪映手动美体参数无效");
	const manualBody: MediaPortraitManualBody = {};
	if (record.stretch !== undefined) {
		const stretch = recordValue({ value: record.stretch });
		if (!stretch) throw new Error("剪映手动美体拉长参数无效");
		const upper = boundedNumber({
			label: "stretch.upper",
			value: stretch.upper,
			min: 0.02,
			max: 1,
		});
		const bottom = boundedNumber({
			label: "stretch.bottom",
			value: stretch.bottom,
			min: 0,
			max: 0.98,
		});
		if (upper - bottom < 0.02) {
			throw new Error("剪映手动美体拉长上下线距离过小");
		}
		manualBody.stretch = {
			intensity: boundedNumber({
				label: "stretch.intensity",
				value: stretch.intensity,
				min: -50,
				max: 50,
			}),
			upper,
			bottom,
		};
	}
	if (record.slim !== undefined) {
		const slim = recordValue({ value: record.slim });
		if (!slim) throw new Error("剪映手动美体瘦身参数无效");
		manualBody.slim = {
			intensity: boundedNumber({
				label: "slim.intensity",
				value: slim.intensity,
				min: -50,
				max: 50,
			}),
			x: boundedNumber({ label: "slim.x", value: slim.x, min: 0, max: 1 }),
			y: boundedNumber({ label: "slim.y", value: slim.y, min: 0, max: 1 }),
			width: boundedNumber({
				label: "slim.width",
				value: slim.width,
				min: 0.02,
				max: 1,
			}),
			height: boundedNumber({
				label: "slim.height",
				value: slim.height,
				min: 0.02,
				max: 1,
			}),
			rotation: boundedNumber({
				label: "slim.rotation",
				value: slim.rotation,
				min: -180,
				max: 180,
			}),
		};
	}
	if (record.zoom !== undefined) {
		const zoom = recordValue({ value: record.zoom });
		if (!zoom) throw new Error("剪映手动美体放大缩小参数无效");
		manualBody.zoom = {
			intensity: boundedNumber({
				label: "zoom.intensity",
				value: zoom.intensity,
				min: -50,
				max: 50,
			}),
			x: boundedNumber({ label: "zoom.x", value: zoom.x, min: 0, max: 1 }),
			y: boundedNumber({ label: "zoom.y", value: zoom.y, min: 0, max: 1 }),
			radius: boundedNumber({
				label: "zoom.radius",
				value: zoom.radius,
				min: 0.01,
				max: 0.5,
			}),
		};
	}
	return Object.keys(manualBody).length > 0 ? manualBody : undefined;
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
	const sourceKey = parseSourceKey({ value: record.sourceKey });
	const frameNumber = record.frameNumber;
	if (
		frameNumber !== undefined &&
		(typeof frameNumber !== "number" ||
			!Number.isSafeInteger(frameNumber) ||
			frameNumber < 0)
	) {
		throw new Error("剪映美颜美体渲染帧号无效");
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
	const manualRetouch = parseManualRetouch({
		value: adjustments.manualRetouch,
	});
	const manualBody = parseManualBody({ value: adjustments.manualBody });
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
			...(manualRetouch ? { manualRetouch } : {}),
			...(manualBody ? { manualBody } : {}),
		},
		...(sourceKey === undefined ? {} : { sourceKey }),
		...(typeof frameNumber === "number" ? { frameNumber } : {}),
		...(timestampSeconds === undefined ? {} : { timestampSeconds }),
	};
}
