import { assertRuntimeFrameTable } from "./runtime-frames.js";
import {
	StickerRuntimeError,
	type StickerRuntimeDescriptor,
	type StickerRuntimeNormalizedRect,
	type StickerRuntimePixelRect,
	type StickerRuntimePixelSize,
	type StickerRuntimeRepeat,
} from "./runtime-model.js";

export type UnknownRecord = Record<string, unknown>;

export function invalidDescriptor({ message }: { message: string }): never {
	throw new StickerRuntimeError({ code: "INVALID_DESCRIPTOR", message });
}

export function readRecord({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): UnknownRecord {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		invalidDescriptor({ message: `${label} must be an object` });
	}
	return value as UnknownRecord;
}

export function readNonEmptyString({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): string {
	if (typeof value !== "string" || value.length === 0) {
		invalidDescriptor({ message: `${label} must be a non-empty string` });
	}
	return value;
}

export function readBoolean({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): boolean {
	if (typeof value !== "boolean") {
		invalidDescriptor({ message: `${label} must be a boolean` });
	}
	return value;
}

export function readFiniteNumber({
	value,
	label,
	positive,
}: {
	value: unknown;
	label: string;
	positive: boolean;
}): number {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		(positive ? value <= 0 : value < 0)
	) {
		invalidDescriptor({
			message: `${label} must be a finite ${positive ? "positive" : "non-negative"} number`,
		});
	}
	return value;
}

export function readSafeInteger({
	value,
	label,
	maximum,
	positive,
}: {
	value: unknown;
	label: string;
	maximum?: number;
	positive: boolean;
}): number {
	if (
		typeof value !== "number" ||
		!Number.isSafeInteger(value) ||
		(positive ? value <= 0 : value < 0) ||
		(maximum !== undefined && value > maximum)
	) {
		invalidDescriptor({
			message: `${label} must be a safe ${positive ? "positive" : "non-negative"} integer`,
		});
	}
	return value;
}

export function readPixelRect({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): StickerRuntimePixelRect {
	const record = readRecord({ value, label });
	return {
		x: readSafeInteger({
			value: record.x,
			label: `${label}.x`,
			positive: false,
		}),
		y: readSafeInteger({
			value: record.y,
			label: `${label}.y`,
			positive: false,
		}),
		width: readSafeInteger({
			value: record.width,
			label: `${label}.width`,
			positive: true,
		}),
		height: readSafeInteger({
			value: record.height,
			label: `${label}.height`,
			positive: true,
		}),
	};
}

export function readPixelSize({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): StickerRuntimePixelSize {
	const record = readRecord({ value, label });
	return {
		width: readSafeInteger({
			value: record.width,
			label: `${label}.width`,
			positive: true,
		}),
		height: readSafeInteger({
			value: record.height,
			label: `${label}.height`,
			positive: true,
		}),
	};
}

export function assertRectFits({
	container,
	label,
	message,
	rect,
}: {
	container: StickerRuntimePixelSize;
	label: string;
	message?: string;
	rect: StickerRuntimePixelRect;
}): void {
	if (
		rect.width > container.width ||
		rect.height > container.height ||
		rect.x > container.width - rect.width ||
		rect.y > container.height - rect.height
	) {
		invalidDescriptor({
			message: message ?? `${label} lies outside its containing image`,
		});
	}
}

export function readNormalizedRect({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): StickerRuntimeNormalizedRect {
	const record = readRecord({ value, label });
	const rect = {
		x: readFiniteNumber({
			value: record.x,
			label: `${label}.x`,
			positive: false,
		}),
		y: readFiniteNumber({
			value: record.y,
			label: `${label}.y`,
			positive: false,
		}),
		width: readFiniteNumber({
			value: record.width,
			label: `${label}.width`,
			positive: true,
		}),
		height: readFiniteNumber({
			value: record.height,
			label: `${label}.height`,
			positive: true,
		}),
	};
	if (rect.x + rect.width > 1 || rect.y + rect.height > 1) {
		invalidDescriptor({
			message: `${label} must remain inside normalized bounds`,
		});
	}
	return rect;
}

export function rectanglesOverlap({
	left,
	right,
}: {
	left: StickerRuntimeNormalizedRect;
	right: StickerRuntimeNormalizedRect;
}): boolean {
	return (
		left.x < right.x + right.width &&
		left.x + left.width > right.x &&
		left.y < right.y + right.height &&
		left.y + left.height > right.y
	);
}

export function assertDescriptorKind({
	record,
	kind,
}: {
	record: UnknownRecord;
	kind: StickerRuntimeDescriptor["kind"];
}): void {
	if (record.kind !== kind) {
		invalidDescriptor({ message: `Sticker runtime kind must be ${kind}` });
	}
}

export function assertRuntimeCompletion({
	completion,
}: {
	completion: unknown;
}): void {
	if (completion !== "freeze-last" && completion !== "hide") {
		invalidDescriptor({
			message: "completion must be freeze-last or hide",
		});
	}
}

export function assertRuntimeRepeat({ repeat }: { repeat: unknown }): void {
	const record = readRecord({ value: repeat, label: "repeat" });
	if (record.kind === "infinite") {
		if (record.additionalIterations !== undefined) {
			invalidDescriptor({
				message: "Infinite repeats cannot declare additionalIterations",
			});
		}
		return;
	}
	if (record.kind !== "finite") {
		invalidDescriptor({ message: "repeat.kind must be finite or infinite" });
	}
	const additionalIterations = readSafeInteger({
		value: record.additionalIterations,
		label: "additionalIterations",
		positive: false,
	});
	if (!Number.isSafeInteger(additionalIterations + 1)) {
		invalidDescriptor({
			message: "additionalIterations is too large to count safely",
		});
	}
}

export function finiteRuntimeIterationCount({
	repeat,
}: {
	repeat: StickerRuntimeRepeat;
}): number | undefined {
	assertRuntimeRepeat({ repeat });
	return repeat.kind === "finite" ? repeat.additionalIterations + 1 : undefined;
}

export function assertRuntimeControls({
	completion,
	repeat,
}: {
	completion: unknown;
	repeat: unknown;
}): void {
	assertRuntimeCompletion({ completion });
	assertRuntimeRepeat({ repeat });
}

export function readFrameRecords({
	record,
	label,
}: {
	record: UnknownRecord;
	label: string;
}): UnknownRecord[] {
	if (!Array.isArray(record.frames)) {
		invalidDescriptor({ message: `${label}.frames must be an array` });
	}
	return record.frames.map((frame, index) =>
		readRecord({ value: frame, label: `${label}.frames[${index}]` })
	);
}

export function assertFrameTiming({
	cycleDurationSeconds,
	frameRecords,
}: {
	cycleDurationSeconds: unknown;
	frameRecords: readonly UnknownRecord[];
}): void {
	const cycleDuration = readFiniteNumber({
		value: cycleDurationSeconds,
		label: "cycleDurationSeconds",
		positive: true,
	});
	const frames = frameRecords.map((frame, index) => ({
		startSeconds: readFiniteNumber({
			value: frame.startSeconds,
			label: `frames[${index}].startSeconds`,
			positive: false,
		}),
		durationSeconds: readFiniteNumber({
			value: frame.durationSeconds,
			label: `frames[${index}].durationSeconds`,
			positive: true,
		}),
	}));
	assertRuntimeFrameTable({ frames, cycleDurationSeconds: cycleDuration });
}
