import { buildRuntimeFrameTimings } from "./runtime-frames.js";
import {
	StickerRuntimeError,
	type AtlasRuntimeDescriptor,
	type AtlasRuntimeFrame,
	type StickerRuntimeCompletion,
	type StickerRuntimePixelRect,
	type StickerRuntimePixelSize,
	type StickerRuntimeRepeat,
} from "./runtime-model.js";
import {
	assertAtlasRuntimeDescriptor,
	assertAtlasRuntimeFrameGeometry,
} from "./runtime-validation.js";

type UnknownRecord = Record<string, unknown>;

function asRecord({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): UnknownRecord {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: `${label} must be an object`,
		});
	}
	return value as UnknownRecord;
}

function readFiniteNumber({
	value,
	label,
	allowZero,
}: {
	value: unknown;
	label: string;
	allowZero: boolean;
}): number {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		(allowZero ? value < 0 : value <= 0)
	) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: `${label} must be a finite ${allowZero ? "non-negative" : "positive"} number`,
		});
	}
	return value;
}

function readDimension({
	record,
	shortKey,
	longKey,
	label,
}: {
	record: UnknownRecord;
	shortKey: "h" | "w";
	longKey: "height" | "width";
	label: string;
}): number {
	const shortValue = record[shortKey];
	const longValue = record[longKey];
	if (
		shortValue !== undefined &&
		longValue !== undefined &&
		shortValue !== longValue
	) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: `${label} aliases must match`,
		});
	}
	const value = readFiniteNumber({
		value: shortValue ?? longValue,
		label,
		allowZero: false,
	});
	if (!Number.isSafeInteger(value)) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: `${label} must be a safe positive integer`,
		});
	}
	return value;
}

function readPixelCoordinate({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): number {
	const coordinate = readFiniteNumber({ value, label, allowZero: true });
	if (!Number.isSafeInteger(coordinate)) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: `${label} must be a safe non-negative integer`,
		});
	}
	return coordinate;
}

function readPixelRect({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): StickerRuntimePixelRect {
	const record = asRecord({ value, label });
	return {
		x: readPixelCoordinate({
			value: record.x,
			label: `${label}.x`,
		}),
		y: readPixelCoordinate({
			value: record.y,
			label: `${label}.y`,
		}),
		width: readDimension({
			record,
			shortKey: "w",
			longKey: "width",
			label: `${label}.width`,
		}),
		height: readDimension({
			record,
			shortKey: "h",
			longKey: "height",
			label: `${label}.height`,
		}),
	};
}

function readPixelSize({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): StickerRuntimePixelSize {
	const record = asRecord({ value, label });
	return {
		width: readDimension({
			record,
			shortKey: "w",
			longKey: "width",
			label: `${label}.width`,
		}),
		height: readDimension({
			record,
			shortKey: "h",
			longKey: "height",
			label: `${label}.height`,
		}),
	};
}

function readOptionalBoolean({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): boolean {
	if (value === undefined) return false;
	if (typeof value !== "boolean") {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: `${label} must be a boolean`,
		});
	}
	return value;
}

function readFrameDurationSeconds({
	record,
	frameRate,
	label,
}: {
	record: UnknownRecord;
	frameRate?: number;
	label: string;
}): number {
	if (record.duration !== undefined) {
		return (
			readFiniteNumber({
				value: record.duration,
				label: `${label}.duration`,
				allowZero: false,
			}) / 1000
		);
	}
	if (!Number.isFinite(frameRate) || (frameRate ?? 0) <= 0) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message:
				"Atlas frames without millisecond durations require a positive frameRate",
		});
	}
	return 1 / (frameRate ?? 1);
}

function readFrame({
	id,
	value,
	frameRate,
	atlasSize,
}: {
	id: string;
	value: unknown;
	frameRate?: number;
	atlasSize?: StickerRuntimePixelSize;
}): Omit<AtlasRuntimeFrame, "startSeconds"> {
	const label = `frames.${id}`;
	const record = asRecord({ value, label });
	const frameRect = readPixelRect({
		value: record.frame,
		label: `${label}.frame`,
	});
	const rotated = readOptionalBoolean({
		value: record.rotated,
		label: `${label}.rotated`,
	});
	const trimmed = readOptionalBoolean({
		value: record.trimmed,
		label: `${label}.trimmed`,
	});
	if (
		(rotated || trimmed) &&
		(record.spriteSourceSize === undefined || record.sourceSize === undefined)
	) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: `Atlas frame ${id} must preserve trim geometry when rotated or trimmed`,
		});
	}
	const sourceSize =
		record.sourceSize === undefined
			? { width: frameRect.width, height: frameRect.height }
			: readPixelSize({
					value: record.sourceSize,
					label: `${label}.sourceSize`,
				});
	const spriteSourceRect =
		record.spriteSourceSize === undefined
			? { x: 0, y: 0, width: sourceSize.width, height: sourceSize.height }
			: readPixelRect({
					value: record.spriteSourceSize,
					label: `${label}.spriteSourceSize`,
				});
	const frame = {
		id,
		frameRect,
		rotated,
		trimmed,
		spriteSourceRect,
		sourceSize,
		durationSeconds: readFrameDurationSeconds({ record, frameRate, label }),
	};
	assertAtlasRuntimeFrameGeometry({ frame, atlasSize });
	return frame;
}

function readAtlasSize({
	root,
}: {
	root: UnknownRecord;
}): StickerRuntimePixelSize | undefined {
	if (root.meta === undefined) return;
	const meta = asRecord({ value: root.meta, label: "meta" });
	if (meta.size === undefined) return;
	return readPixelSize({ value: meta.size, label: "meta.size" });
}

function readAtlasSource({
	root,
	atlasSource,
}: {
	root: UnknownRecord;
	atlasSource?: string;
}): string | undefined {
	if (atlasSource !== undefined) {
		if (typeof atlasSource !== "string" || atlasSource.length === 0) {
			throw new StickerRuntimeError({
				code: "INVALID_DESCRIPTOR",
				message: "atlasSource must be a non-empty string",
			});
		}
		return atlasSource;
	}
	if (root.meta === undefined) return;
	const meta = asRecord({ value: root.meta, label: "meta" });
	if (meta.image === undefined) return;
	if (typeof meta.image !== "string" || meta.image.length === 0) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: "meta.image must be a non-empty string",
		});
	}
	return meta.image;
}

function orderedAtlasEntries({
	framesValue,
	frameOrder,
}: {
	framesValue: unknown;
	frameOrder?: readonly string[];
}): { id: string; value: unknown }[] {
	if (Array.isArray(framesValue)) {
		const entries: { id: string; value: unknown }[] = [];
		const seenIds = new Set<string>();
		for (let index = 0; index < framesValue.length; index += 1) {
			const value = framesValue[index];
			const record = asRecord({ value, label: `frames[${index}]` });
			const id = record.filename ?? record.id;
			if (typeof id !== "string" || id.length === 0) {
				throw new StickerRuntimeError({
					code: "INVALID_DESCRIPTOR",
					message: `frames[${index}] requires a filename or id`,
				});
			}
			if (seenIds.has(id)) {
				throw new StickerRuntimeError({
					code: "INVALID_DESCRIPTOR",
					message: `Atlas frame id ${id} is duplicated`,
				});
			}
			seenIds.add(id);
			entries.push({ id, value });
		}
		return entries;
	}

	const frameMap = asRecord({ value: framesValue, label: "frames" });
	const frameIds = Object.keys(frameMap);
	if (!frameOrder || frameOrder.length !== frameIds.length) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message:
				"Atlas frame maps require an explicit frameOrder covering every frame",
		});
	}
	const seenIds = new Set<string>();
	const entries: { id: string; value: unknown }[] = [];
	for (const id of frameOrder) {
		if (seenIds.has(id) || !(id in frameMap)) {
			throw new StickerRuntimeError({
				code: "INVALID_DESCRIPTOR",
				message: "frameOrder must contain every atlas frame exactly once",
			});
		}
		seenIds.add(id);
		entries.push({ id, value: frameMap[id] });
	}
	return entries;
}

export function parseAtlasRuntimeDescriptor({
	atlas,
	atlasSource,
	completion = "freeze-last",
	frameOrder,
	frameRate,
	repeat = { kind: "infinite" },
}: {
	atlas: unknown;
	atlasSource?: string;
	completion?: StickerRuntimeCompletion;
	frameOrder?: readonly string[];
	frameRate?: number;
	repeat?: StickerRuntimeRepeat;
}): AtlasRuntimeDescriptor {
	const root = asRecord({ value: atlas, label: "atlas" });
	const atlasSize = readAtlasSize({ root });
	const resolvedAtlasSource = readAtlasSource({ root, atlasSource });
	const entries = orderedAtlasEntries({ framesValue: root.frames, frameOrder });
	const parsedFrames: Omit<AtlasRuntimeFrame, "startSeconds">[] = [];
	for (const entry of entries) {
		parsedFrames.push(
			readFrame({
				id: entry.id,
				value: entry.value,
				frameRate,
				atlasSize,
			})
		);
	}
	const timing = buildRuntimeFrameTimings({
		durationsSeconds: parsedFrames.map(
			({ durationSeconds }) => durationSeconds
		),
	});
	const frames = parsedFrames.map((frame, index) => ({
		...frame,
		startSeconds: timing.timings[index]?.startSeconds ?? 0,
	}));
	const descriptor: AtlasRuntimeDescriptor = {
		kind: "atlas-animation",
		...(resolvedAtlasSource ? { atlasSource: resolvedAtlasSource } : {}),
		...(atlasSize ? { atlasSize } : {}),
		cycleDurationSeconds: timing.cycleDurationSeconds,
		frames,
		repeat,
		completion,
	};
	assertAtlasRuntimeDescriptor({ descriptor });
	return descriptor;
}
