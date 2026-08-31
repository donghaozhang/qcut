import type {
	StickerMotionTracking,
	StickerTrackingAnchor,
} from "@qcut/editor-core";
import {
	assertNoUnknownKeys,
	assertOptionalBoolean,
	assertOptionalFiniteNumber,
	assertStringLiteral,
	getFiniteNumber,
	getRecord,
	getString,
	type JsonValue,
} from "./runtime-json.js";
import { validateStickerPlanarTrackingRuntime } from "./snapshot-planar-tracking-runtime-validation.js";
import { createAllowedKeySet } from "./snapshot-runtime-helpers.js";

const STICKER_MOTION_TRACKING_KEYS = createAllowedKeySet<StickerMotionTracking>(
	{
		keys: {
			anchor: true,
			followRotation: true,
			followScale: true,
			mode: true,
			targetElementId: true,
			targetMaskId: true,
		},
	}
);

const STICKER_TRACKING_ANCHOR_KEYS = createAllowedKeySet<StickerTrackingAnchor>(
	{
		keys: {
			centerX: true,
			centerY: true,
			height: true,
			rotation: true,
			width: true,
		},
	}
);

const STICKER_TRACKING_MODES = new Set(["motion", "planar"]);

export function validateStickerTrackingRuntime({
	path,
	value,
}: {
	path: string;
	value: JsonValue;
}): void {
	const tracking = getRecord({ path, value });
	const mode = assertStringLiteral({
		allowed: STICKER_TRACKING_MODES,
		path: `${path}.mode`,
		value: tracking.mode,
	});
	if (mode === "planar") {
		validateStickerPlanarTrackingRuntime({ path, value: tracking });
		return;
	}
	assertNoUnknownKeys({
		allowed: STICKER_MOTION_TRACKING_KEYS,
		path,
		record: tracking,
	});
	getString({
		path: `${path}.targetElementId`,
		value: tracking.targetElementId,
	});
	if (tracking.targetMaskId !== undefined) {
		getString({
			path: `${path}.targetMaskId`,
			value: tracking.targetMaskId,
		});
	}
	assertOptionalBoolean({
		path: `${path}.followScale`,
		value: tracking.followScale,
	});
	assertOptionalBoolean({
		path: `${path}.followRotation`,
		value: tracking.followRotation,
	});
	const anchorPath = `${path}.anchor`;
	const anchor = getRecord({ path: anchorPath, value: tracking.anchor });
	assertNoUnknownKeys({
		allowed: STICKER_TRACKING_ANCHOR_KEYS,
		path: anchorPath,
		record: anchor,
	});
	for (const key of ["centerX", "centerY", "width", "height"]) {
		getFiniteNumber({
			path: `${anchorPath}.${key}`,
			value: anchor[key],
		});
	}
	assertOptionalFiniteNumber({
		path: `${anchorPath}.rotation`,
		value: anchor.rotation,
	});
}
