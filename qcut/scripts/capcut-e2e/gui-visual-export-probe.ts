import type {
	CapCutGuiVisualExportProbe,
	CapCutGuiVisualExtractionFrame,
} from "./gui-visual-evidence-contract.js";
import { runGuiVisualFfprobe } from "./gui-visual-ffmpeg.js";
import type { VisualFileEvidence } from "./visual-contract.js";

const FRAME_RATE = Object.freeze({
	denominator: 1 as const,
	numerator: 30 as const,
});

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function requireArray({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): unknown[] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	return value;
}

function requireDecimalInteger({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	const text = typeof value === "number" ? String(value) : value;
	if (typeof text !== "string" || !/^-?(?:0|[1-9]\d*)$/u.test(text)) {
		throw new Error(`${label} must be a canonical decimal integer.`);
	}
	if (typeof value === "number" && !Number.isSafeInteger(value)) {
		throw new Error(`${label} exceeds safe JSON integer precision.`);
	}
	return text;
}

function parsePositiveRational({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): { denominator: bigint; numerator: bigint; text: string } {
	if (typeof value !== "string" || !/^[1-9]\d*\/[1-9]\d*$/u.test(value)) {
		throw new Error(`${label} must be a positive rational.`);
	}
	const [numeratorText, denominatorText] = value.split("/");
	if (!numeratorText || !denominatorText) {
		throw new Error(`${label} must contain a numerator and denominator.`);
	}
	return {
		denominator: BigInt(denominatorText),
		numerator: BigInt(numeratorText),
		text: value,
	};
}

export function buildGuiVisualExportProbeArgs({
	sourceExportPath,
}: {
	sourceExportPath: string;
}): string[] {
	return [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-count_frames",
		"-show_frames",
		"-show_streams",
		"-show_entries",
		"stream=index,codec_type,avg_frame_rate,r_frame_rate,time_base,nb_frames,nb_read_frames:frame=best_effort_timestamp,duration",
		"-of",
		"json",
		sourceExportPath,
	];
}

function requireFrameRate({ stream }: { stream: Record<string, unknown> }) {
	for (const key of ["avg_frame_rate", "r_frame_rate"] as const) {
		if (stream[key] !== "30/1") {
			throw new Error(`GUI export ${key} must be observed as CFR 30/1.`);
		}
	}
}

function requireFrameCount({
	frameCount,
	stream,
}: {
	frameCount: number;
	stream: Record<string, unknown>;
}) {
	const readCount = requireDecimalInteger({
		label: "GUI export FFprobe read-frame count",
		value: stream.nb_read_frames,
	});
	if (BigInt(readCount) !== BigInt(frameCount)) {
		throw new Error("GUI export FFprobe frame count is inconsistent.");
	}
	if (stream.nb_frames === undefined) return;
	const containerCount = requireDecimalInteger({
		label: "GUI export container frame count",
		value: stream.nb_frames,
	});
	if (BigInt(containerCount) !== BigInt(frameCount)) {
		throw new Error("GUI export container frame count is inconsistent.");
	}
}

function requireConstantFrameTiming({
	durationTicks,
	timestampTicks,
	timeBase,
}: {
	durationTicks: readonly string[];
	timestampTicks: readonly string[];
	timeBase: { denominator: bigint; numerator: bigint };
}) {
	const isOneFrame = ({ ticks }: { ticks: bigint }) =>
		ticks * timeBase.numerator * 30n === timeBase.denominator;
	for (const duration of durationTicks) {
		if (!isOneFrame({ ticks: BigInt(duration) })) {
			throw new Error("GUI export frame duration is not exactly 1/30 second.");
		}
	}
	for (let index = 1; index < timestampTicks.length; index += 1) {
		const current = timestampTicks[index];
		const prior = timestampTicks[index - 1];
		if (
			current === undefined ||
			prior === undefined ||
			!isOneFrame({ ticks: BigInt(current) - BigInt(prior) })
		) {
			throw new Error("GUI export presentation timestamps are not CFR 30.");
		}
	}
}

export async function probeGuiVisualExport({
	caseId,
	ffprobePath,
	sourceExport,
}: {
	caseId: CapCutGuiVisualExtractionFrame["caseId"];
	ffprobePath: string;
	sourceExport: VisualFileEvidence;
}): Promise<CapCutGuiVisualExportProbe> {
	const args = buildGuiVisualExportProbeArgs({
		sourceExportPath: sourceExport.path,
	});
	const output = await runGuiVisualFfprobe({ args, ffprobePath });
	const root = requireRecord({
		label: "GUI export FFprobe output",
		value: JSON.parse(output) as unknown,
	});
	const streams = requireArray({
		label: "GUI export FFprobe streams",
		value: root.streams,
	});
	if (streams.length !== 1) {
		throw new Error(
			"GUI export must contain exactly one selected video stream."
		);
	}
	const stream = requireRecord({
		label: "GUI export FFprobe video stream",
		value: streams[0],
	});
	if (stream.codec_type !== "video") {
		throw new Error("GUI export selected stream must be video.");
	}
	requireFrameRate({ stream });
	const timeBase = parsePositiveRational({
		label: "GUI export FFprobe time base",
		value: stream.time_base,
	});
	const frames = requireArray({
		label: "GUI export FFprobe frames",
		value: root.frames,
	});
	if (frames.length < 2) {
		throw new Error("GUI export must contain at least two video frames.");
	}
	const frameRecords = frames.map((frame, index) =>
		requireRecord({ label: `GUI export frame ${index}`, value: frame })
	);
	const timestampTicks = frameRecords.map((frame, index) =>
		requireDecimalInteger({
			label: `GUI export frame ${index} presentation timestamp`,
			value: frame.best_effort_timestamp,
		})
	);
	const durationTicks = frameRecords.map((frame, index) =>
		requireDecimalInteger({
			label: `GUI export frame ${index} duration`,
			value: frame.duration,
		})
	);
	requireFrameCount({ frameCount: frames.length, stream });
	requireConstantFrameTiming({ durationTicks, timestampTicks, timeBase });
	return {
		caseId,
		command: { args, contract: "ffprobe-cfr-30-frames-v1" },
		durationTicks,
		frameCount: frames.length,
		frameRate: FRAME_RATE,
		sourceExport,
		timestampTicks,
		timeBase: timeBase.text,
	};
}
