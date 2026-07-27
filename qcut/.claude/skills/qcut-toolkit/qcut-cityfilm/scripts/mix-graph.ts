/**
 * Pure filter-graph construction for the qcut-cityfilm final mix.
 *
 * QCut's exporter currently drops CLI-imported audio from the render, so the
 * picture is exported from QCut (it still carries the source clips' ambience)
 * and the music + narration are mixed on top in a single ffmpeg pass that
 * copies the video stream untouched. Nothing here spawns a process.
 */
import { isAbsolute, join, resolve } from "node:path";
import { type CityFilmPlan, DEFAULT_MIX_LEVELS, type MixLevels } from "./types";
import { voFileName } from "./vo";

/** Seconds below which two timeline positions count as the same instant. */
const EPSILON = 1e-3;

/** Every concat segment must agree on format or ffmpeg rejects the join. */
const AUDIO_FORMAT =
	"aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";

/** Input pads (`0:a`, `1:v`) are supplied by ffmpeg, not by a filter chain. */
const INPUT_PAD_PATTERN = /^\d+:[a-zA-Z]+$/;

/** A fully wired filter graph, ready to be turned into ffmpeg arguments. */
export interface MixGraph {
	/** Audio files appended after the video input, in ffmpeg input order. */
	inputs: string[];
	filterComplex: string;
	/** Raw `-map` values, e.g. `["0:v", "[aout]"]`. */
	maps: string[];
}

export function formatNumber({ value }: { value: number }): string {
	if (!Number.isFinite(value)) {
		throw new Error(`Expected a finite number, received ${value}`);
	}
	return String(Math.round(value * 1000) / 1000);
}

/**
 * Where vo.ts wrote a cue's narration: `<assetsDir>/vo/vo-<lang>-<id>.mp3`.
 * The filename itself comes from vo.ts so the rule has one owner.
 */
export function resolveVoFile({
	assetsDir,
	language,
	cueId,
}: {
	assetsDir: string;
	language: string;
	cueId: string;
}): string {
	return join(assetsDir, "vo", voFileName({ language, cueId }));
}

/**
 * Picture length the music bed has to cover: every shot laid end to end plus
 * the black tail held for the closing card.
 */
export function computeTimelineDuration({
	plan,
}: {
	plan: CityFilmPlan;
}): number {
	const shots = plan.shots.reduce((total, shot) => {
		const length = shot.endSeconds - shot.startSeconds;
		if (length <= 0) {
			throw new Error(
				`Shot ${shot.file} has a non-positive length (${shot.startSeconds}..${shot.endSeconds})`
			);
		}
		return total + length;
	}, 0);
	return shots + Math.max(0, plan.blackTailSeconds);
}

function splitChainLabels({ chain }: { chain: string }): {
	inputs: string[];
	outputs: string[];
} {
	const trimmed = chain.trim();
	const leading = trimmed.match(/^(?:\[[^[\]]+\])+/);
	const trailing = trimmed.match(/(?:\[[^[\]]+\])+$/);
	const leadingEnd = leading ? leading[0].length : 0;
	const names = (value: string | undefined): string[] =>
		value ? [...value.matchAll(/\[([^[\]]+)\]/g)].map((match) => match[1]) : [];
	const trailingIsSeparate =
		trailing !== null &&
		trailing.index !== undefined &&
		trailing.index >= leadingEnd;
	return {
		inputs: names(leading?.[0]),
		outputs: trailingIsSeparate ? names(trailing[0]) : [],
	};
}

/**
 * Guards the mistake that broke the first hand-run: ffmpeg aborts the whole
 * render when a filter graph declares a label nothing reads. Also catches the
 * two neighbouring failures — referencing a label that is never produced, and
 * producing the same label twice.
 *
 * @param outputLabels Terminal labels meant to leave the graph via `-map`.
 * Defaults to the outputs of the last filter chain.
 */
export function assertLabelsConsumed({
	filterComplex,
	outputLabels,
}: {
	filterComplex: string;
	outputLabels?: string[];
}): void {
	const chains = filterComplex
		.split(";")
		.map((chain) => chain.trim())
		.filter((chain) => chain.length > 0);
	if (chains.length === 0) throw new Error("Filter graph is empty");

	const produced: string[] = [];
	const consumed = new Set<string>();
	let lastOutputs: string[] = [];
	for (const chain of chains) {
		const { inputs, outputs } = splitChainLabels({ chain });
		for (const label of inputs) {
			if (!INPUT_PAD_PATTERN.test(label)) consumed.add(label);
		}
		for (const label of outputs) {
			if (produced.includes(label)) {
				throw new Error(
					`Filter graph declares label [${label}] more than once; ffmpeg needs unique labels`
				);
			}
			produced.push(label);
		}
		lastOutputs = outputs;
	}

	const terminal = new Set(outputLabels ?? lastOutputs);
	const list = (labels: string[]): string =>
		labels.map((label) => `[${label}]`).join(", ");
	const undefinedLabels = [...consumed].filter(
		(label) => !produced.includes(label)
	);
	if (undefinedLabels.length > 0) {
		throw new Error(
			`Filter graph reads labels that are never produced: ${list(undefinedLabels)}`
		);
	}
	const orphans = produced.filter(
		(label) => !consumed.has(label) && !terminal.has(label)
	);
	if (orphans.length > 0) {
		throw new Error(
			`Filter graph produces labels nothing consumes: ${list(orphans)}. ffmpeg fails on unused filter outputs; consume them or drop the chain.`
		);
	}
}

function buildMusicChains({
	plan,
	levels,
	firstAudioIndex,
	timelineDuration,
}: {
	plan: CityFilmPlan;
	levels: MixLevels;
	firstAudioIndex: number;
	timelineDuration: number;
}): { chains: string[]; inputs: string[]; concatChain: string } {
	const ordered = [...plan.music].sort(
		(left, right) => left.startSeconds - right.startSeconds
	);
	const chains: string[] = [];
	const inputs: string[] = [];
	const segments: string[] = [];
	let cursor = 0;
	let padIndex = 0;

	const pad = ({ length }: { length: number }): void => {
		const label = `mp${padIndex}`;
		padIndex += 1;
		chains.push(
			`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${formatNumber({ value: length })},asetpts=PTS-STARTPTS,${AUDIO_FORMAT}[${label}]`
		);
		segments.push(label);
	};

	for (const cue of ordered) {
		const length = cue.endSeconds - cue.startSeconds;
		if (length <= 0) {
			throw new Error(
				`Music cue ${cue.file} has a non-positive length (${cue.startSeconds}..${cue.endSeconds})`
			);
		}
		if (cue.sourceOffsetSeconds < 0) {
			throw new Error(`Music cue ${cue.file} has a negative source offset`);
		}
		if (cue.startSeconds < cursor - EPSILON) {
			throw new Error(
				`Music cue ${cue.file} at ${cue.startSeconds}s overlaps the previous cue ending at ${cursor}s`
			);
		}
		if (cue.startSeconds > cursor + EPSILON) {
			pad({ length: cue.startSeconds - cursor });
		}

		const label = `m${inputs.length}`;
		const inputIndex = firstAudioIndex + inputs.length;
		inputs.push(
			isAbsolute(cue.file) ? cue.file : join(plan.assetsDir, cue.file)
		);
		const steps = [
			`atrim=${formatNumber({ value: cue.sourceOffsetSeconds })}:${formatNumber({ value: cue.sourceOffsetSeconds + length })}`,
			"asetpts=PTS-STARTPTS",
			AUDIO_FORMAT,
		];
		if (cue.fadeInSeconds && cue.fadeInSeconds > 0) {
			steps.push(
				`afade=t=in:st=0:d=${formatNumber({ value: cue.fadeInSeconds })}`
			);
		}
		if (cue.fadeOutSeconds && cue.fadeOutSeconds > 0) {
			const start = Math.max(0, length - cue.fadeOutSeconds);
			steps.push(
				`afade=t=out:st=${formatNumber({ value: start })}:d=${formatNumber({ value: cue.fadeOutSeconds })}`
			);
		}
		chains.push(`[${inputIndex}:a]${steps.join(",")}[${label}]`);
		segments.push(label);
		cursor = cue.endSeconds;
	}

	if (cursor < timelineDuration - EPSILON) {
		pad({ length: timelineDuration - cursor });
	}
	if (segments.length === 0) {
		throw new Error("Music bed has no segments; the timeline duration is zero");
	}

	return {
		chains,
		inputs,
		concatChain: `${segments.map((label) => `[${label}]`).join("")}concat=n=${segments.length}:v=0:a=1,volume=${formatNumber({ value: levels.music })}[music]`,
	};
}

function buildVoiceChains({
	plan,
	levels,
	firstAudioIndex,
}: {
	plan: CityFilmPlan;
	levels: MixLevels;
	firstAudioIndex: number;
}): { chains: string[]; inputs: string[]; labels: string[] } {
	const chains: string[] = [];
	const inputs: string[] = [];
	const labels: string[] = [];
	const ordered = [...plan.cues].sort(
		(left, right) => left.startSeconds - right.startSeconds
	);
	for (const cue of ordered) {
		if (cue.startSeconds < 0) {
			throw new Error(`Cue ${cue.id} starts before the timeline`);
		}
		const label = `vo${labels.length}`;
		const inputIndex = firstAudioIndex + inputs.length;
		inputs.push(
			resolveVoFile({
				assetsDir: plan.assetsDir,
				language: plan.language,
				cueId: cue.id,
			})
		);
		const delayMs = Math.round(cue.startSeconds * 1000);
		chains.push(
			`[${inputIndex}:a]adelay=${delayMs}|${delayMs},volume=${formatNumber({ value: levels.voice })}[${label}]`
		);
		labels.push(label);
	}
	return { chains, inputs, labels };
}

/**
 * Builds the whole mix graph. Music segments are concatenated in timeline
 * order — any stretch the cues do not cover is padded with `anullsrc` so
 * concat cannot shorten the bed — then ducked under the narration by a
 * sidechain compressor keyed off a split copy of the voice bus.
 *
 * Input order is: the picture at `videoInputIndex`, then one input per music
 * cue in timeline order, then one input per narration cue in timeline order.
 * A cue gets its own input even when two cues share a file, because an ffmpeg
 * input pad can only be read once.
 */
export function buildMixGraph({
	plan,
	levels = DEFAULT_MIX_LEVELS,
	videoInputIndex = 0,
}: {
	plan: CityFilmPlan;
	levels?: MixLevels;
	videoInputIndex?: number;
}): MixGraph {
	if (!Number.isInteger(videoInputIndex) || videoInputIndex < 0) {
		throw new Error("videoInputIndex must be a non-negative integer");
	}

	const musicEnd = plan.music.reduce(
		(latest, cue) => Math.max(latest, cue.endSeconds),
		0
	);
	const timelineDuration = Math.max(
		computeTimelineDuration({ plan }),
		musicEnd
	);

	const music = buildMusicChains({
		plan,
		levels,
		firstAudioIndex: videoInputIndex + 1,
		timelineDuration,
	});
	const voice = buildVoiceChains({
		plan,
		levels,
		firstAudioIndex: videoInputIndex + 1 + music.inputs.length,
	});

	const chains = [
		`[${videoInputIndex}:a]volume=${formatNumber({ value: levels.ambience })}[amb]`,
		...music.chains,
		music.concatChain,
		...voice.chains,
	];

	// `sidechaincompress` stops as soon as its key input ends, so a voice bus
	// that runs out before the last shot would truncate the whole film. Pad the
	// bus to the timeline before it is split into key and mix copies.
	const voiceBus = `amix=inputs=${voice.labels.length}:normalize=0:dropout_transition=0,apad,atrim=0:${formatNumber({ value: timelineDuration })},asetpts=PTS-STARTPTS`;

	if (voice.labels.length === 0) {
		chains.push(
			"[amb][music]amix=inputs=2:normalize=0,alimiter=limit=0.95,aresample=48000[aout]"
		);
	} else {
		chains.push(
			`${voice.labels.map((label) => `[${label}]`).join("")}${voiceBus}[vo]`,
			"[vo]asplit=2[vokey][vomix]",
			"[amb][music]amix=inputs=2:normalize=0[bed]",
			`[bed][vokey]sidechaincompress=threshold=0.05:ratio=${formatNumber({ value: levels.duckRatio })}:attack=15:release=350:makeup=1[bedduck]`,
			"[bedduck][vomix]amix=inputs=2:normalize=0,alimiter=limit=0.95,aresample=48000[aout]"
		);
	}

	const filterComplex = chains.join(";");
	assertLabelsConsumed({ filterComplex, outputLabels: ["aout"] });
	return {
		inputs: [...music.inputs, ...voice.inputs],
		filterComplex,
		maps: [`${videoInputIndex}:v`, "[aout]"],
	};
}

/**
 * Full ffmpeg argv. The video stream is copied, so this pass only re-encodes
 * audio. Assumes the picture occupies input 0, which is what `buildMixGraph`
 * produces with its default `videoInputIndex`.
 */
export function buildMixArgs({
	videoPath,
	outputPath,
	graph,
}: {
	videoPath: string;
	outputPath: string;
	graph: MixGraph;
}): string[] {
	if (resolve(videoPath) === resolve(outputPath)) {
		throw new Error("Mix output cannot replace the exported picture");
	}
	if (graph.maps.length === 0) throw new Error("Mix graph has no output maps");
	assertLabelsConsumed({ filterComplex: graph.filterComplex });

	const args = ["-y", "-i", videoPath];
	for (const input of graph.inputs) args.push("-i", input);
	args.push("-filter_complex", graph.filterComplex);
	for (const map of graph.maps) args.push("-map", map);
	args.push(
		"-c:v",
		"copy",
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		"-shortest",
		outputPath
	);
	return args;
}
