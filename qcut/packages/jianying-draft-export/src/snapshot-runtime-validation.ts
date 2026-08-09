import type {
	AudioAutoCrossfadeSettings,
	AudioCrossfade,
	AudioDuckingSettings,
	AudioMixBusSettings,
	ClipTransition,
	ClipTransitionTuning,
	ClipTransitionTuningKeyframe,
	ProjectAudioMixSettings,
	TimelineTrack,
	TimelineTrackAudioSettings,
} from "@qcut/editor-core";
import type {
	QCutDraftExportAudioMedia,
	QCutDraftExportImageMedia,
	QCutDraftExportProject,
	QCutDraftExportSnapshotV1,
	QCutDraftExportVideoMedia,
} from "@qcut/editor-core/jianying-draft";
import {
	assertNoUnknownKeys,
	assertOptionalBoolean,
	assertOptionalFiniteNumber,
	assertStringLiteral,
	getArray,
	getBoolean,
	getFiniteNumber,
	getRecord,
	getString,
	type JsonValue,
	validationIssue,
} from "./runtime-json.js";
import { validateTrackElement } from "./snapshot-element-runtime-validation.js";
import { validateAudioBusEffectsSettings } from "./snapshot-media-runtime-validation.js";
import {
	createAllowedKeySet,
	validateRecordOfArrays,
} from "./snapshot-runtime-helpers.js";

const TRACK_TYPES = new Set([
	"media",
	"effect",
	"text",
	"audio",
	"sticker",
	"captions",
	"adjustment",
	"remotion",
	"hyperframes",
	"markdown",
]);
const TRANSITION_ENGINES = new Set(["qcut", "jianying-local"]);
const MAX_SNAPSHOT_ELEMENTS = 20_000;
const MAX_SNAPSHOT_MEDIA_ITEMS = 10_000;
const MAX_SNAPSHOT_TRACKS = 1_000;
const SNAPSHOT_KEYS = createAllowedKeySet<QCutDraftExportSnapshotV1>({
	keys: {
		media: true,
		project: true,
		schemaVersion: true,
		timelineDurationByElementId: true,
		tracks: true,
	},
});
const PROJECT_KEYS = createAllowedKeySet<QCutDraftExportProject>({
	keys: {
		audioMix: true,
		backgroundColor: true,
		backgroundType: true,
		fps: true,
		height: true,
		id: true,
		name: true,
		sceneId: true,
		width: true,
	},
});
const VIDEO_MEDIA_KEYS = createAllowedKeySet<QCutDraftExportVideoMedia>({
	keys: {
		duration: true,
		height: true,
		id: true,
		name: true,
		sourcePath: true,
		type: true,
		width: true,
	},
});
const IMAGE_MEDIA_KEYS = createAllowedKeySet<QCutDraftExportImageMedia>({
	keys: {
		height: true,
		id: true,
		name: true,
		sourcePath: true,
		type: true,
		width: true,
	},
});
const AUDIO_MEDIA_KEYS = createAllowedKeySet<QCutDraftExportAudioMedia>({
	keys: {
		duration: true,
		id: true,
		name: true,
		sourcePath: true,
		type: true,
	},
});
const PROJECT_AUDIO_MIX_KEYS = createAllowedKeySet<ProjectAudioMixSettings>({
	keys: { buses: true, master: true },
});
const AUDIO_MIX_BUS_KEYS = createAllowedKeySet<AudioMixBusSettings>({
	keys: {
		effects: true,
		gainDb: true,
		id: true,
		muted: true,
		name: true,
		pan: true,
		solo: true,
	},
});
const TRACK_KEYS = createAllowedKeySet<TimelineTrack>({
	keys: {
		audio: true,
		audioCrossfades: true,
		elements: true,
		height: true,
		hidden: true,
		id: true,
		isMain: true,
		locked: true,
		muted: true,
		name: true,
		order: true,
		transitions: true,
		type: true,
	},
});
const TRACK_AUDIO_KEYS = createAllowedKeySet<TimelineTrackAudioSettings>({
	keys: {
		autoCrossfade: true,
		busId: true,
		ducking: true,
		effects: true,
		gainDb: true,
		pan: true,
		solo: true,
	},
});
const AUDIO_DUCKING_KEYS = createAllowedKeySet<AudioDuckingSettings>({
	keys: {
		attackMs: true,
		enabled: true,
		reductionDb: true,
		releaseMs: true,
		sourceTrackIds: true,
		thresholdDb: true,
	},
});
const AUDIO_AUTO_CROSSFADE_KEYS =
	createAllowedKeySet<AudioAutoCrossfadeSettings>({
		keys: {
			curve: true,
			defaultDuration: true,
			enabled: true,
		},
	});
const AUDIO_CROSSFADE_KEYS = createAllowedKeySet<AudioCrossfade>({
	keys: {
		curve: true,
		duration: true,
		fromElementId: true,
		id: true,
		toElementId: true,
	},
});
const TRANSITION_KEYS = createAllowedKeySet<ClipTransition>({
	keys: {
		direction: true,
		duration: true,
		easing: true,
		engine: true,
		fromElementId: true,
		id: true,
		maskShape: true,
		packageHash: true,
		presetId: true,
		toElementId: true,
		tuning: true,
		tuningKeyframes: true,
		type: true,
	},
});
const TRANSITION_TUNING_KEYS = createAllowedKeySet<ClipTransitionTuning>({
	keys: { frequency: true, intensity: true, tint: true },
});
const TRANSITION_TUNING_KEYFRAME_KEYS =
	createAllowedKeySet<ClipTransitionTuningKeyframe>({
		keys: {
			easing: true,
			id: true,
			position: true,
			value: true,
		},
	});

function assertKeys({
	allowed,
	path,
	record,
}: {
	allowed: ReadonlySet<string>;
	path: string;
	record: { [key: string]: JsonValue };
}): void {
	assertNoUnknownKeys({ allowed, path, record });
}

function validateAudioBus({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const bus = getRecord({ path, value });
	assertKeys({ allowed: AUDIO_MIX_BUS_KEYS, path, record: bus });
	getString({ path: `${path}.id`, value: bus.id });
	getString({ allowEmpty: true, path: `${path}.name`, value: bus.name });
	getFiniteNumber({ path: `${path}.gainDb`, value: bus.gainDb });
	getFiniteNumber({ path: `${path}.pan`, value: bus.pan });
	getBoolean({ path: `${path}.muted`, value: bus.muted });
	getBoolean({ path: `${path}.solo`, value: bus.solo });
	validateAudioBusEffectsSettings({
		path: `${path}.effects`,
		value: bus.effects,
	});
}

function validateProjectAudioMix({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	if (value === undefined) return;
	const audioMix = getRecord({ path, value });
	assertKeys({
		allowed: PROJECT_AUDIO_MIX_KEYS,
		path,
		record: audioMix,
	});
	validateAudioBus({ path: `${path}.master`, value: audioMix.master });
	const buses = getArray({ path: `${path}.buses`, value: audioMix.buses });
	for (const [index, bus] of buses.entries()) {
		validateAudioBus({ path: `${path}.buses[${index}]`, value: bus });
	}
}

function validateSnapshotProject({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const project = getRecord({ path, value });
	assertKeys({ allowed: PROJECT_KEYS, path, record: project });
	getString({ path: `${path}.id`, value: project.id });
	getString({
		allowEmpty: true,
		path: `${path}.name`,
		value: project.name,
	});
	getString({ path: `${path}.sceneId`, value: project.sceneId });
	getFiniteNumber({ path: `${path}.width`, value: project.width });
	getFiniteNumber({ path: `${path}.height`, value: project.height });
	getFiniteNumber({ path: `${path}.fps`, value: project.fps });
	getString({
		allowEmpty: true,
		path: `${path}.backgroundColor`,
		value: project.backgroundColor,
	});
	assertStringLiteral({
		allowed: new Set(["blur", "color"]),
		path: `${path}.backgroundType`,
		value: project.backgroundType,
	});
	validateProjectAudioMix({
		path: `${path}.audioMix`,
		value: project.audioMix,
	});
}

function validateSnapshotMedia({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const media = getArray({ path, value });
	if (media.length > MAX_SNAPSHOT_MEDIA_ITEMS) {
		throw validationIssue({
			message: `Media exceeds ${MAX_SNAPSHOT_MEDIA_ITEMS} entries.`,
			path,
		});
	}
	for (const [index, entry] of media.entries()) {
		const entryPath = `${path}[${index}]`;
		const item = getRecord({ path: entryPath, value: entry });
		const type = assertStringLiteral({
			allowed: new Set(["audio", "image", "video"]),
			path: `${entryPath}.type`,
			value: item.type,
		});
		assertKeys({
			allowed:
				type === "audio"
					? AUDIO_MEDIA_KEYS
					: type === "image"
						? IMAGE_MEDIA_KEYS
						: VIDEO_MEDIA_KEYS,
			path: entryPath,
			record: item,
		});
		getString({ path: `${entryPath}.id`, value: item.id });
		getString({
			allowEmpty: true,
			path: `${entryPath}.name`,
			value: item.name,
		});
		getString({ path: `${entryPath}.sourcePath`, value: item.sourcePath });
		if (type !== "audio") {
			getFiniteNumber({ path: `${entryPath}.width`, value: item.width });
			getFiniteNumber({ path: `${entryPath}.height`, value: item.height });
		}
		if (type !== "image") {
			getFiniteNumber({
				path: `${entryPath}.duration`,
				value: item.duration,
			});
		}
	}
}

function validateTrackAudio({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	if (value === undefined) return;
	const audio = getRecord({ path, value });
	assertKeys({ allowed: TRACK_AUDIO_KEYS, path, record: audio });
	getFiniteNumber({ path: `${path}.gainDb`, value: audio.gainDb });
	getFiniteNumber({ path: `${path}.pan`, value: audio.pan });
	getBoolean({ path: `${path}.solo`, value: audio.solo });
	getString({ path: `${path}.busId`, value: audio.busId });
	validateAudioBusEffectsSettings({
		path: `${path}.effects`,
		value: audio.effects,
	});

	const duckingPath = `${path}.ducking`;
	const ducking = getRecord({ path: duckingPath, value: audio.ducking });
	assertKeys({
		allowed: AUDIO_DUCKING_KEYS,
		path: duckingPath,
		record: ducking,
	});
	getArray({
		path: `${duckingPath}.sourceTrackIds`,
		value: ducking.sourceTrackIds,
	});

	const crossfadePath = `${path}.autoCrossfade`;
	const crossfade = getRecord({
		path: crossfadePath,
		value: audio.autoCrossfade,
	});
	assertKeys({
		allowed: AUDIO_AUTO_CROSSFADE_KEYS,
		path: crossfadePath,
		record: crossfade,
	});
}

function validateAudioCrossfades({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	if (value === undefined) return;
	const crossfades = getArray({ path, value });
	for (const [index, entry] of crossfades.entries()) {
		const crossfadePath = `${path}[${index}]`;
		const crossfade = getRecord({ path: crossfadePath, value: entry });
		assertKeys({
			allowed: AUDIO_CROSSFADE_KEYS,
			path: crossfadePath,
			record: crossfade,
		});
	}
}

function validateTransitionTuningKeyframes({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	if (value === undefined) return;
	const keyframesByProperty = getRecord({ path, value });
	assertKeys({
		allowed: TRANSITION_TUNING_KEYS,
		path,
		record: keyframesByProperty,
	});
	validateRecordOfArrays({ path, value });
	for (const [property, entries] of Object.entries(keyframesByProperty)) {
		const keyframes = getArray({
			path: `${path}.${property}`,
			value: entries,
		});
		for (const [index, entry] of keyframes.entries()) {
			const keyframePath = `${path}.${property}[${index}]`;
			const keyframe = getRecord({ path: keyframePath, value: entry });
			assertKeys({
				allowed: TRANSITION_TUNING_KEYFRAME_KEYS,
				path: keyframePath,
				record: keyframe,
			});
		}
	}
}

function validateTransitions({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	if (value === undefined) return;
	const transitions = getArray({ path, value });
	for (const [index, entry] of transitions.entries()) {
		const transitionPath = `${path}[${index}]`;
		const transition = getRecord({ path: transitionPath, value: entry });
		assertKeys({
			allowed: TRANSITION_KEYS,
			path: transitionPath,
			record: transition,
		});
		if (transition.engine !== undefined) {
			assertStringLiteral({
				allowed: TRANSITION_ENGINES,
				path: `${transitionPath}.engine`,
				value: transition.engine,
			});
		}
		if (transition.packageHash !== undefined) {
			getString({
				path: `${transitionPath}.packageHash`,
				value: transition.packageHash,
			});
		}
		if (transition.tuning !== undefined) {
			const tuningPath = `${transitionPath}.tuning`;
			const tuning = getRecord({
				path: tuningPath,
				value: transition.tuning,
			});
			assertKeys({
				allowed: TRANSITION_TUNING_KEYS,
				path: tuningPath,
				record: tuning,
			});
		}
		validateTransitionTuningKeyframes({
			path: `${transitionPath}.tuningKeyframes`,
			value: transition.tuningKeyframes,
		});
	}
}

function validateSnapshotTracks({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const tracks = getArray({ path, value });
	if (tracks.length > MAX_SNAPSHOT_TRACKS) {
		throw validationIssue({
			message: `Tracks exceed ${MAX_SNAPSHOT_TRACKS} entries.`,
			path,
		});
	}
	let elementCount = 0;
	for (const [index, entry] of tracks.entries()) {
		const trackPath = `${path}[${index}]`;
		const track = getRecord({ path: trackPath, value: entry });
		assertKeys({ allowed: TRACK_KEYS, path: trackPath, record: track });
		getString({ path: `${trackPath}.id`, value: track.id });
		getString({
			allowEmpty: true,
			path: `${trackPath}.name`,
			value: track.name,
		});
		assertStringLiteral({
			allowed: TRACK_TYPES,
			path: `${trackPath}.type`,
			value: track.type,
		});
		const elements = getArray({
			path: `${trackPath}.elements`,
			value: track.elements,
		});
		elementCount += elements.length;
		if (elementCount > MAX_SNAPSHOT_ELEMENTS) {
			throw validationIssue({
				message: `Snapshot exceeds ${MAX_SNAPSHOT_ELEMENTS} track elements.`,
				path: `${trackPath}.elements`,
			});
		}
		for (const [elementIndex, element] of elements.entries()) {
			validateTrackElement({
				path: `${trackPath}.elements[${elementIndex}]`,
				value: element,
			});
		}
		for (const key of ["muted", "hidden", "locked", "isMain"]) {
			assertOptionalBoolean({
				path: `${trackPath}.${key}`,
				value: track[key],
			});
		}
		for (const key of ["height", "order"]) {
			assertOptionalFiniteNumber({
				path: `${trackPath}.${key}`,
				value: track[key],
			});
		}
		validateTrackAudio({
			path: `${trackPath}.audio`,
			value: track.audio,
		});
		validateAudioCrossfades({
			path: `${trackPath}.audioCrossfades`,
			value: track.audioCrossfades,
		});
		validateTransitions({
			path: `${trackPath}.transitions`,
			value: track.transitions,
		});
	}
}

function validateTimelineDurations({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const durations = getRecord({ path, value });
	for (const [elementId, duration] of Object.entries(durations)) {
		if (elementId.trim().length === 0) {
			throw validationIssue({
				message: "Element id keys must not be empty.",
				path,
			});
		}
		getFiniteNumber({ path: `${path}.${elementId}`, value: duration });
	}
}

export function validateSnapshot({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): QCutDraftExportSnapshotV1 {
	const snapshot = getRecord({ path, value });
	assertKeys({ allowed: SNAPSHOT_KEYS, path, record: snapshot });
	if (snapshot.schemaVersion !== 1) {
		throw validationIssue({
			message: "Expected schemaVersion 1.",
			path: `${path}.schemaVersion`,
		});
	}
	validateSnapshotProject({
		path: `${path}.project`,
		value: snapshot.project,
	});
	validateSnapshotMedia({
		path: `${path}.media`,
		value: snapshot.media,
	});
	validateSnapshotTracks({
		path: `${path}.tracks`,
		value: snapshot.tracks,
	});
	validateTimelineDurations({
		path: `${path}.timelineDurationByElementId`,
		value: snapshot.timelineDurationByElementId,
	});
	return snapshot as unknown as QCutDraftExportSnapshotV1;
}
