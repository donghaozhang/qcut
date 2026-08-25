import type {
	AtlasRuntimeFrame,
	StickerRuntimePixelSize,
} from "./runtime-model.js";
import {
	assertDescriptorKind,
	assertFrameTiming,
	assertRectFits,
	assertRuntimeControls,
	invalidDescriptor,
	readBoolean,
	readFrameRecords,
	readNonEmptyString,
	readPixelRect,
	readPixelSize,
	readRecord,
	readSafeInteger,
} from "./runtime-validation-helpers.js";

export function assertAtlasRuntimeFrameGeometry({
	atlasSize,
	frame,
}: {
	atlasSize?: StickerRuntimePixelSize;
	frame: Pick<
		AtlasRuntimeFrame,
		| "frameRect"
		| "id"
		| "rotated"
		| "trimmed"
		| "sourceSize"
		| "spriteSourceRect"
	>;
}): void {
	if (atlasSize) {
		assertRectFits({
			container: atlasSize,
			label: `Atlas frame ${frame.id}`,
			message: `Atlas frame ${frame.id} lies outside the atlas image`,
			rect: frame.frameRect,
		});
	}
	assertRectFits({
		container: frame.sourceSize,
		label: `Atlas frame ${frame.id} trim rectangle`,
		message: `Atlas frame ${frame.id} trim rectangle lies outside its source size`,
		rect: frame.spriteSourceRect,
	});
	const expectedStoredWidth = frame.rotated
		? frame.spriteSourceRect.height
		: frame.spriteSourceRect.width;
	const expectedStoredHeight = frame.rotated
		? frame.spriteSourceRect.width
		: frame.spriteSourceRect.height;
	if (
		frame.frameRect.width !== expectedStoredWidth ||
		frame.frameRect.height !== expectedStoredHeight
	) {
		invalidDescriptor({
			message: `Atlas frame ${frame.id} stored dimensions do not match its rotation and trim rectangle`,
		});
	}
	if (
		!frame.trimmed &&
		(frame.spriteSourceRect.x !== 0 ||
			frame.spriteSourceRect.y !== 0 ||
			frame.spriteSourceRect.width !== frame.sourceSize.width ||
			frame.spriteSourceRect.height !== frame.sourceSize.height)
	) {
		invalidDescriptor({
			message: `Atlas frame ${frame.id} is marked untrimmed but does not cover its source size`,
		});
	}
}

export function assertDirectGifRuntimeDescriptor({
	descriptor,
}: {
	descriptor: unknown;
}): void {
	const record = readRecord({
		value: descriptor,
		label: "direct GIF descriptor",
	});
	assertDescriptorKind({ record, kind: "direct-gif" });
	assertRuntimeControls({
		completion: record.completion,
		repeat: record.repeat,
	});
	const canvasSize = readPixelSize({
		value: record.canvasSize,
		label: "canvasSize",
	});
	const frameRecords = readFrameRecords({ record, label: "direct GIF" });
	for (let index = 0; index < frameRecords.length; index += 1) {
		const frame = frameRecords[index];
		const frameRect = readPixelRect({
			value: frame.frameRect,
			label: `frames[${index}].frameRect`,
		});
		assertRectFits({
			container: canvasSize,
			label: `GIF frame ${index}`,
			rect: frameRect,
		});
		readSafeInteger({
			value: frame.delayCentiseconds,
			label: `frames[${index}].delayCentiseconds`,
			maximum: 65_535,
			positive: false,
		});
		readSafeInteger({
			value: frame.disposalMethod,
			label: `frames[${index}].disposalMethod`,
			maximum: 7,
			positive: false,
		});
		const hasTransparency = readBoolean({
			value: frame.hasTransparency,
			label: `frames[${index}].hasTransparency`,
		});
		if (frame.transparentColorIndex !== undefined) {
			readSafeInteger({
				value: frame.transparentColorIndex,
				label: `frames[${index}].transparentColorIndex`,
				maximum: 255,
				positive: false,
			});
			if (!hasTransparency) {
				invalidDescriptor({
					message: `frames[${index}] cannot declare a transparent color when transparency is disabled`,
				});
			}
		}
	}
	assertFrameTiming({
		cycleDurationSeconds: record.cycleDurationSeconds,
		frameRecords,
	});
}

export function assertAtlasRuntimeDescriptor({
	descriptor,
}: {
	descriptor: unknown;
}): void {
	const record = readRecord({ value: descriptor, label: "atlas descriptor" });
	assertDescriptorKind({ record, kind: "atlas-animation" });
	assertRuntimeControls({
		completion: record.completion,
		repeat: record.repeat,
	});
	if (record.atlasSource !== undefined) {
		readNonEmptyString({ value: record.atlasSource, label: "atlasSource" });
	}
	const atlasSize =
		record.atlasSize === undefined
			? undefined
			: readPixelSize({ value: record.atlasSize, label: "atlasSize" });
	const frameRecords = readFrameRecords({ record, label: "atlas" });
	const seenIds = new Set<string>();
	for (let index = 0; index < frameRecords.length; index += 1) {
		const frame = frameRecords[index];
		const id = readNonEmptyString({
			value: frame.id,
			label: `frames[${index}].id`,
		});
		if (seenIds.has(id)) {
			invalidDescriptor({ message: `Atlas frame id ${id} is duplicated` });
		}
		seenIds.add(id);
		assertAtlasRuntimeFrameGeometry({
			atlasSize,
			frame: {
				id,
				frameRect: readPixelRect({
					value: frame.frameRect,
					label: `frames[${index}].frameRect`,
				}),
				rotated: readBoolean({
					value: frame.rotated,
					label: `frames[${index}].rotated`,
				}),
				trimmed: readBoolean({
					value: frame.trimmed,
					label: `frames[${index}].trimmed`,
				}),
				spriteSourceRect: readPixelRect({
					value: frame.spriteSourceRect,
					label: `frames[${index}].spriteSourceRect`,
				}),
				sourceSize: readPixelSize({
					value: frame.sourceSize,
					label: `frames[${index}].sourceSize`,
				}),
			},
		});
	}
	assertFrameTiming({
		cycleDurationSeconds: record.cycleDurationSeconds,
		frameRecords,
	});
}

export function assertPngSequenceRuntimeDescriptor({
	descriptor,
}: {
	descriptor: unknown;
}): void {
	const record = readRecord({
		value: descriptor,
		label: "PNG sequence descriptor",
	});
	assertDescriptorKind({ record, kind: "png-sequence" });
	assertRuntimeControls({
		completion: record.completion,
		repeat: record.repeat,
	});
	const frameRecords = readFrameRecords({ record, label: "PNG sequence" });
	for (let index = 0; index < frameRecords.length; index += 1) {
		readNonEmptyString({
			value: frameRecords[index].source,
			label: `frames[${index}].source`,
		});
	}
	assertFrameTiming({
		cycleDurationSeconds: record.cycleDurationSeconds,
		frameRecords,
	});
}
