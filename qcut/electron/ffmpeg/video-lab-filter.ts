export type NormalizedVideoLabFilterSettings = {
	deflicker: number;
	opticalFlowMotionBlur: number;
	localSuperResolution: 1 | 2 | 4;
};

const DEFAULT_VIDEO_LAB_FILTER_SETTINGS: NormalizedVideoLabFilterSettings = {
	deflicker: 0,
	opticalFlowMotionBlur: 0,
	localSuperResolution: 1,
};

const MIN_DEFLICKER_WINDOW = 3;
const MAX_DEFLICKER_WINDOW = 31;
const MIN_MOTION_BLUR_FRAMES = 2;
const MAX_MOTION_BLUR_FRAMES = 8;
const MOTION_INTERPOLATION_MULTIPLIER = 4;

function normalizePercentage({ value }: { value: number }): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(100, Math.max(0, value));
}

function normalizeLocalSuperResolution({
	value,
}: {
	value: number;
}): 1 | 2 | 4 {
	return value === 2 || value === 4 ? value : 1;
}

function formatFilterNumber({ value }: { value: number }): string {
	return String(Number(value.toFixed(6)));
}

function assertPositiveFps({ fps }: { fps: number }): void {
	if (!Number.isFinite(fps) || fps <= 0) {
		throw new RangeError("fps must be a positive finite number");
	}
}

function assertTargetDimensions({
	width,
	height,
}: {
	width: number;
	height: number;
}): void {
	if (!Number.isInteger(width) || width <= 0) {
		throw new RangeError("width must be a positive integer");
	}
	if (!Number.isInteger(height) || height <= 0) {
		throw new RangeError("height must be a positive integer");
	}
}

export function normalizeVideoLabFilterSettings({
	settings,
}: {
	settings?: Partial<NormalizedVideoLabFilterSettings>;
}): NormalizedVideoLabFilterSettings {
	return {
		deflicker: normalizePercentage({
			value: settings?.deflicker ?? DEFAULT_VIDEO_LAB_FILTER_SETTINGS.deflicker,
		}),
		opticalFlowMotionBlur: normalizePercentage({
			value:
				settings?.opticalFlowMotionBlur ??
				DEFAULT_VIDEO_LAB_FILTER_SETTINGS.opticalFlowMotionBlur,
		}),
		localSuperResolution: normalizeLocalSuperResolution({
			value:
				settings?.localSuperResolution ??
				DEFAULT_VIDEO_LAB_FILTER_SETTINGS.localSuperResolution,
		}),
	};
}

export function hasVideoLabFilters({
	settings,
}: {
	settings?: Partial<NormalizedVideoLabFilterSettings>;
}): boolean {
	const values = normalizeVideoLabFilterSettings({ settings });
	return (
		values.deflicker > 0 ||
		values.opticalFlowMotionBlur > 0 ||
		values.localSuperResolution > 1
	);
}

function getDeflickerWindow({ strength }: { strength: number }): number {
	const stepCount = (MAX_DEFLICKER_WINDOW - MIN_DEFLICKER_WINDOW) / 2;
	const selectedStep = Math.round((strength / 100) * stepCount);
	return MIN_DEFLICKER_WINDOW + selectedStep * 2;
}

function getMotionBlurFrameCount({ strength }: { strength: number }): number {
	const frameRange = MAX_MOTION_BLUR_FRAMES - MIN_MOTION_BLUR_FRAMES;
	return MIN_MOTION_BLUR_FRAMES + Math.round((strength / 100) * frameRange);
}

export function getVideoLabTemporalContextSeconds({
	settings,
	fps,
}: {
	settings?: Partial<NormalizedVideoLabFilterSettings>;
	fps: number;
}): number {
	const values = normalizeVideoLabFilterSettings({ settings });
	if (values.deflicker === 0 && values.opticalFlowMotionBlur === 0) return 0;
	assertPositiveFps({ fps });
	const deflickerContext =
		values.deflicker > 0
			? getDeflickerWindow({ strength: values.deflicker }) / fps
			: 0;
	const motionBlurContext =
		values.opticalFlowMotionBlur > 0
			? getMotionBlurFrameCount({ strength: values.opticalFlowMotionBlur }) /
				(fps * MOTION_INTERPOLATION_MULTIPLIER)
			: 0;
	return Number(Math.max(deflickerContext, motionBlurContext).toFixed(6));
}

function buildDeflickerFilter({ strength }: { strength: number }): string {
	return `deflicker=size=${getDeflickerWindow({ strength })}:mode=am`;
}

function buildMotionBlurFilters({
	strength,
	fps,
}: {
	strength: number;
	fps: number;
}): string[] {
	assertPositiveFps({ fps });
	const mixedFrameCount = getMotionBlurFrameCount({ strength });
	const weights = new Array<string>(mixedFrameCount).fill("1").join(" ");
	const interpolatedFps = formatFilterNumber({
		value: fps * MOTION_INTERPOLATION_MULTIPLIER,
	});
	const outputFps = formatFilterNumber({ value: fps });
	return [
		`minterpolate=fps=${interpolatedFps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
		`tmix=frames=${mixedFrameCount}:weights='${weights}'`,
		`fps=${outputFps}`,
	];
}

function buildLocalSuperResolutionFilters({
	scale,
	width,
	height,
}: {
	scale: 2 | 4;
	width: number;
	height: number;
}): string[] {
	assertTargetDimensions({ width, height });
	return [
		`scale=iw*${scale}:ih*${scale}:flags=lanczos`,
		"unsharp=5:5:0.35:5:5:0",
		`scale=${width}:${height}:flags=lanczos`,
	];
}

export function buildVideoLabFilter({
	settings,
	width,
	height,
	fps,
}: {
	settings?: Partial<NormalizedVideoLabFilterSettings>;
	width: number;
	height: number;
	fps: number;
}): string {
	const values = normalizeVideoLabFilterSettings({ settings });
	const filters: string[] = [];

	if (values.deflicker > 0) {
		filters.push(buildDeflickerFilter({ strength: values.deflicker }));
	}
	if (values.opticalFlowMotionBlur > 0) {
		filters.push(
			...buildMotionBlurFilters({
				strength: values.opticalFlowMotionBlur,
				fps,
			})
		);
	}
	const localSuperResolution = values.localSuperResolution;
	if (localSuperResolution === 2 || localSuperResolution === 4) {
		filters.push(
			...buildLocalSuperResolutionFilters({
				scale: localSuperResolution,
				width,
				height,
			})
		);
	}

	return filters.join(",");
}
