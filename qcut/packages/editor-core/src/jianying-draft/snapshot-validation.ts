import type { MediaElement, TimelineTrack } from "../types/timeline.js";
import { secondsToMicroseconds } from "./time.js";
import type {
	JianyingDraftIssue,
	QCutDraftExportMedia,
	QCutDraftExportSnapshotV1,
} from "./types.js";
import {
	collectLossyMediaFeatureIssues,
	findBlockingMediaTimingIssue,
} from "./unsupported-features.js";

function pushInvalidSnapshotIssue({
	issues,
	message,
}: {
	issues: JianyingDraftIssue[];
	message: string;
}): void {
	issues.push({
		code: "INVALID_EXPORT_SNAPSHOT",
		severity: "error",
		message,
	});
}

function canRepresentSecondsAsMicroseconds({
	seconds,
}: {
	seconds: number;
}): boolean {
	try {
		secondsToMicroseconds({ seconds });
		return true;
	} catch {
		return false;
	}
}

function hasValidMediaMetadata({
	media,
}: {
	media: QCutDraftExportMedia;
}): boolean {
	const hasValidDimensions =
		media.type === "audio" ||
		(Number.isFinite(media.width) &&
			media.width > 0 &&
			Number.isFinite(media.height) &&
			media.height > 0);
	const hasValidDuration =
		media.type === "image" ||
		(Number.isFinite(media.duration) &&
			media.duration > 0 &&
			canRepresentSecondsAsMicroseconds({ seconds: media.duration }));
	return (
		Boolean(media.sourcePath.trim()) && hasValidDimensions && hasValidDuration
	);
}

function hasValidElementNumbers({
	element,
}: {
	element: MediaElement;
}): boolean {
	const nonNegativeTimes = [
		element.duration,
		element.startTime,
		element.trimStart,
		element.trimEnd,
	];
	const finiteTransforms = [
		element.x ?? 0,
		element.y ?? 0,
		element.rotation ?? 0,
		element.scaleX ?? 1,
		element.scaleY ?? 1,
		element.opacity ?? 1,
		element.volume ?? 1,
	];
	return (
		nonNegativeTimes.every((value) => Number.isFinite(value) && value >= 0) &&
		finiteTransforms.every(Number.isFinite) &&
		(element.scaleX ?? 1) > 0 &&
		(element.scaleY ?? 1) > 0 &&
		(element.opacity ?? 1) >= 0 &&
		(element.opacity ?? 1) <= 1 &&
		(element.volume ?? 1) >= 0 &&
		element.trimStart + element.trimEnd <= element.duration &&
		canRepresentSecondsAsMicroseconds({ seconds: element.startTime }) &&
		canRepresentSecondsAsMicroseconds({ seconds: element.trimStart })
	);
}

function hasVisibleProjectBackground({
	snapshot,
}: {
	snapshot: QCutDraftExportSnapshotV1;
}): boolean {
	if (snapshot.project.backgroundType === "blur") return true;
	const color = snapshot.project.backgroundColor
		.replaceAll(" ", "")
		.toLowerCase();
	return ![
		"",
		"transparent",
		"#00000000",
		"rgba(0,0,0,0)",
		"hsla(0,0%,0%,0)",
	].includes(color);
}

function hasProjectAudioMixEdits({
	snapshot,
}: {
	snapshot: QCutDraftExportSnapshotV1;
}): boolean {
	const audioMix = snapshot.project.audioMix;
	if (!audioMix) return false;
	const master = audioMix.master;
	return (
		audioMix.buses.length > 0 ||
		master.gainDb !== 0 ||
		master.pan !== 0 ||
		master.muted ||
		master.solo ||
		master.effects.parametricEqualizer.enabled ||
		master.effects.compressor.enabled ||
		master.effects.limiter.enabled
	);
}

export function validateJianyingExportSnapshot({
	createdAtUnixSeconds,
	draftOutputDirectory,
	snapshot,
}: {
	createdAtUnixSeconds: number;
	draftOutputDirectory: string;
	snapshot: QCutDraftExportSnapshotV1;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	if (snapshot.schemaVersion !== 1) {
		pushInvalidSnapshotIssue({
			issues,
			message: `Unsupported snapshot schema version: ${snapshot.schemaVersion}`,
		});
	}
	if (
		!Number.isSafeInteger(snapshot.project.width) ||
		snapshot.project.width <= 0 ||
		!Number.isSafeInteger(snapshot.project.height) ||
		snapshot.project.height <= 0
	) {
		pushInvalidSnapshotIssue({
			issues,
			message: "Project canvas dimensions must be positive integers.",
		});
	}
	if (!Number.isFinite(snapshot.project.fps) || snapshot.project.fps <= 0) {
		pushInvalidSnapshotIssue({
			issues,
			message: "Project frame rate must be positive.",
		});
	}
	if (!draftOutputDirectory.trim()) {
		pushInvalidSnapshotIssue({
			issues,
			message: "Draft output directory must not be empty.",
		});
	}
	if (
		!canRepresentSecondsAsMicroseconds({
			seconds: createdAtUnixSeconds,
		})
	) {
		pushInvalidSnapshotIssue({
			issues,
			message: "Draft creation time must fit an integer microsecond timestamp.",
		});
	}
	if (hasVisibleProjectBackground({ snapshot })) {
		issues.push({
			code: "UNSUPPORTED_PROJECT_BACKGROUND",
			severity: "warning",
			message:
				"Project background color or blur is not mapped in the plaintext baseline.",
		});
	}
	if (hasProjectAudioMixEdits({ snapshot })) {
		issues.push({
			code: "UNSUPPORTED_PROJECT_AUDIO_MIX",
			severity: "warning",
			message: "Project master and submix buses are not mapped yet.",
		});
	}

	const mediaIds = new Set<string>();
	for (const media of snapshot.media) {
		if (mediaIds.has(media.id)) {
			pushInvalidSnapshotIssue({
				issues,
				message: `Duplicate media id: ${media.id}`,
			});
		}
		mediaIds.add(media.id);
	}

	return issues;
}

function getSourceDuration({
	element,
	timelineDuration,
}: {
	element: MediaElement;
	timelineDuration: number;
}): number {
	return timelineDuration * (element.playbackRate ?? 1);
}

export function validateJianyingMediaElement({
	element,
	media,
	snapshot,
	track,
}: {
	element: MediaElement;
	media: QCutDraftExportMedia | undefined;
	snapshot: QCutDraftExportSnapshotV1;
	track: TimelineTrack;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	if (!media) {
		return [
			{
				code: "MISSING_MEDIA",
				severity: "error",
				message: `Timeline element ${element.id} references missing media ${element.mediaId}.`,
				elementId: element.id,
				mediaId: element.mediaId,
				trackId: track.id,
			},
		];
	}
	if (!hasValidMediaMetadata({ media })) {
		issues.push({
			code: "INVALID_MEDIA_METADATA",
			severity: "error",
			message: `Media ${media.id} needs a local path and valid dimensions/duration.`,
			elementId: element.id,
			mediaId: media.id,
		});
	}
	if (!hasValidElementNumbers({ element })) {
		issues.push({
			code: "INVALID_ELEMENT_VALUE",
			severity: "error",
			message: `Element ${element.id} has an invalid time or transform value.`,
			elementId: element.id,
			mediaId: media.id,
		});
	}
	const mediaMatchesTrack =
		(track.type === "audio" && media.type === "audio") ||
		(track.type === "media" && media.type !== "audio");
	if (!mediaMatchesTrack) {
		issues.push({
			code: "TRACK_MEDIA_TYPE_MISMATCH",
			severity: "error",
			message: `Media ${media.id} cannot be placed on a ${track.type} draft track.`,
			elementId: element.id,
			mediaId: media.id,
			trackId: track.id,
		});
	}
	const timelineDuration = snapshot.timelineDurationByElementId[element.id];
	if (
		!Number.isFinite(timelineDuration) ||
		timelineDuration <= 0 ||
		!canRepresentSecondsAsMicroseconds({ seconds: timelineDuration })
	) {
		issues.push({
			code: "MISSING_TIMELINE_DURATION",
			severity: "error",
			message: `Element ${element.id} needs a positive playback-aware timeline duration.`,
			elementId: element.id,
			trackId: track.id,
		});
	}
	const speed = element.playbackRate ?? 1;
	if (!Number.isFinite(speed) || speed <= 0) {
		issues.push({
			code: "INVALID_PLAYBACK_RATE",
			severity: "error",
			message: `Element ${element.id} has invalid playback rate ${speed}.`,
			elementId: element.id,
		});
	}
	const blockingTimingIssue = findBlockingMediaTimingIssue({ element });
	if (blockingTimingIssue) {
		issues.push(blockingTimingIssue);
	}
	if (
		!blockingTimingIssue &&
		Number.isFinite(speed) &&
		speed > 0 &&
		Number.isFinite(timelineDuration) &&
		timelineDuration > 0
	) {
		const expectedTimelineDuration =
			(element.duration - element.trimStart - element.trimEnd) / speed;
		if (
			canRepresentSecondsAsMicroseconds({
				seconds: expectedTimelineDuration,
			}) &&
			secondsToMicroseconds({ seconds: expectedTimelineDuration }) !==
				secondsToMicroseconds({ seconds: timelineDuration })
		) {
			issues.push({
				code: "TIMELINE_DURATION_MISMATCH",
				severity: "error",
				message: `Element ${element.id} playback-aware duration does not match its trim and speed.`,
				elementId: element.id,
				mediaId: media.id,
			});
		}
	}
	const sourceDuration = getSourceDuration({ element, timelineDuration });
	if (
		!canRepresentSecondsAsMicroseconds({ seconds: sourceDuration }) ||
		(media.type !== "image" &&
			Number.isFinite(sourceDuration) &&
			sourceDuration > 0 &&
			element.trimStart + sourceDuration > media.duration + 1e-6)
	) {
		issues.push({
			code: "SOURCE_RANGE_OUT_OF_BOUNDS",
			severity: "error",
			message: `Element ${element.id} reads beyond media ${media.id}.`,
			elementId: element.id,
			mediaId: media.id,
		});
	}
	issues.push(...collectLossyMediaFeatureIssues({ element }));
	return issues;
}
