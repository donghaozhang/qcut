/**
 * Shared contracts for the qcut-cityfilm skill.
 *
 * The workflow this encodes: analyze a reference film, gather licensed
 * footage, pick segments, narrate with emotion, assemble in QCut, and mix the
 * final audio bed outside the editor.
 */

/** One act of the film. Acts drive pacing, copy, VO emotion, and music. */
export interface ActPlan {
	/** Stable key used in filenames and cue ids, e.g. "a2-market". */
	id: string;
	/** Human label, e.g. "第2幕·市场". */
	title: string;
	startSeconds: number;
	endSeconds: number;
	/** Target shot length inside this act, in seconds. */
	shotSeconds: number;
	/** Emotion directive passed to the TTS model, in the copy's language. */
	emotion: string;
}

/** A chosen in/out range of a source clip. */
export interface SegmentPick {
	/** Basename of the source file, as imported into the project. */
	file: string;
	startSeconds: number;
	endSeconds: number;
	/** Why this segment was chosen — kept for review, not used by the build. */
	note?: string;
}

/** One narration/subtitle cue. */
export interface Cue {
	/** Cue id, e.g. "t04". Also names the VO file: vo-<lang>-<id>.mp3. */
	id: string;
	/** Act this cue belongs to; supplies the TTS emotion directive. */
	actId: string;
	startSeconds: number;
	durationSeconds: number;
	/** Subtitle text; also the TTS prompt body. */
	text: string;
	/** Centered title card instead of a bottom subtitle. */
	title?: boolean;
}

/** Music bed segment: one stretch of one track. */
export interface MusicCue {
	/** Basename of the audio file. */
	file: string;
	/** Where the segment lands on the timeline. */
	startSeconds: number;
	endSeconds: number;
	/** Offset inside the source track. */
	sourceOffsetSeconds: number;
	fadeInSeconds?: number;
	fadeOutSeconds?: number;
}

/** The full recipe for one language cut. */
export interface CityFilmPlan {
	name: string;
	/** BCP-47-ish short code used in VO filenames: "zh", "en", ... */
	language: string;
	width: number;
	height: number;
	fps: number;
	/** Directory holding footage, music, and generated VO. */
	assetsDir: string;
	acts: ActPlan[];
	/** Ordered shot list; the build lays these out end to end. */
	shots: SegmentPick[];
	cues: Cue[];
	music: MusicCue[];
	/** Seconds of black held after the last shot for the closing card. */
	blackTailSeconds: number;
	/** Subtitle styling, in canvas pixels. */
	subtitle: SubtitleStyle;
}

export interface SubtitleStyle {
	fontSize: number;
	letterSpacing: number;
	/** Vertical offset from canvas center, positive is down. */
	offsetY: number;
	titleFontSize: number;
	titleLetterSpacing: number;
}

/** Per-language mixing levels. */
export interface MixLevels {
	/** Source-clip ambience kept under the bed. */
	ambience: number;
	music: number;
	voice: number;
	/** Ducking depth applied to the bed while narration plays. */
	duckRatio: number;
}

export const DEFAULT_MIX_LEVELS: MixLevels = {
	ambience: 0.22,
	music: 0.5,
	voice: 1.6,
	duckRatio: 7,
};

/** Scene-cut statistics extracted from a reference film. */
export interface PacingProfile {
	durationSeconds: number;
	cutCount: number;
	/** Cuts per minute, index 0 = first minute. */
	cutsPerMinute: number[];
	averageShotSeconds: number;
}
