export const SCREEN_RECORDING_CAPTURE_MODES = ["editor", "preview"] as const;

export type ScreenRecordingCaptureMode =
	(typeof SCREEN_RECORDING_CAPTURE_MODES)[number];

export function normalizeScreenRecordingCaptureMode({
	value,
}: {
	value?: string;
}): ScreenRecordingCaptureMode {
	const normalized = value?.trim().toLowerCase();
	if (!normalized || normalized === "window") {
		return "editor";
	}
	if (normalized === "fullscreen" || normalized === "video") {
		return "preview";
	}
	if (
		SCREEN_RECORDING_CAPTURE_MODES.includes(
			normalized as ScreenRecordingCaptureMode
		)
	) {
		return normalized as ScreenRecordingCaptureMode;
	}
	throw new Error(
		`Unsupported recording capture mode "${value}". Use editor or preview.`
	);
}
