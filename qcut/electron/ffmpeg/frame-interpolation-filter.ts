const MINTERPOLATE_LOOKAHEAD_FRAMES = 2;

function formatFilterNumber({ value }: { value: number }): string {
	return String(Number(value.toFixed(6)));
}

/**
 * minterpolate buffers two trailing frames. Cloned lookahead lets the caller's
 * existing segment-duration boundary retain the complete final frame range.
 */
export function buildDurationPreservingFrameInterpolationFilter({
	mode,
	fps,
}: {
	mode?: "none" | "blend" | "motion-compensated";
	fps: number;
}): string {
	if (mode !== "blend" && mode !== "motion-compensated") return "";
	if (!Number.isFinite(fps) || fps <= 0) {
		throw new RangeError("fps must be a positive finite number");
	}

	const outputFps = Math.max(1, fps);
	const lookaheadDuration = formatFilterNumber({
		value: MINTERPOLATE_LOOKAHEAD_FRAMES / outputFps,
	});
	const interpolation =
		mode === "motion-compensated"
			? `minterpolate=fps=${outputFps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`
			: `minterpolate=fps=${outputFps}:mi_mode=blend`;
	return `tpad=stop_mode=clone:stop_duration=${lookaheadDuration},${interpolation}`;
}
