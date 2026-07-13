export interface SmartPackagingCaption {
	id: string;
	text: string;
	startTime: number;
	duration: number;
}

export interface SmartPackagingBeat {
	timestamp: number;
	strength?: number;
	downbeat?: boolean;
}

export interface SmartPackagingShot {
	id: string;
	trackId: string;
	elementId: string;
	startTime: number;
	endTime: number;
}

export interface SmartPackagingOptions {
	addText: boolean;
	addStickers: boolean;
	addSoundEffects: boolean;
	addZooms: boolean;
	addTransitions: boolean;
	maxTextOverlays?: number;
	maxStickers?: number;
	maxSoundEffects?: number;
	maxZooms?: number;
	maxTransitions?: number;
}

export type SmartPackagingAction =
	| {
			kind: "text";
			captionId: string;
			content: string;
			startTime: number;
			duration: number;
			textTemplateId: string;
	  }
	| {
			kind: "sticker";
			startTime: number;
			duration: number;
			stickerAssetId: "spark-burst";
	  }
	| {
			kind: "sound-effect";
			startTime: number;
			duration: number;
			soundAssetId: "accent-pop";
	  }
	| {
			kind: "zoom";
			trackId: string;
			elementId: string;
			startTime: number;
			endTime: number;
			fromScale: number;
			toScale: number;
	  }
	| {
			kind: "transition";
			trackId: string;
			fromElementId: string;
			toElementId: string;
			startTime: number;
			duration: number;
			presetId: "dissolve" | "whip-pan-right";
	  };

export interface SmartPackagingPlan {
	actions: SmartPackagingAction[];
	sourceCounts: { captions: number; beats: number; shots: number };
	warnings: string[];
}

const DEFAULT_OPTIONS: SmartPackagingOptions = {
	addText: true,
	addStickers: true,
	addSoundEffects: true,
	addZooms: true,
	addTransitions: true,
	maxTextOverlays: 6,
	maxStickers: 4,
	maxSoundEffects: 4,
	maxZooms: 8,
	maxTransitions: 8,
};

function isFiniteRange({
	startTime,
	duration,
}: {
	startTime: number;
	duration: number;
}): boolean {
	return (
		Number.isFinite(startTime) &&
		Number.isFinite(duration) &&
		startTime >= 0 &&
		duration > 0
	);
}

function selectSpacedTimes({
	times,
	minimumGap,
	limit,
}: {
	times: readonly number[];
	minimumGap: number;
	limit: number;
}): number[] {
	const selected: number[] = [];
	for (const time of [...times].sort((left, right) => left - right)) {
		if (!Number.isFinite(time) || time < 0) continue;
		if (selected.some((candidate) => Math.abs(candidate - time) < minimumGap)) {
			continue;
		}
		selected.push(time);
		if (selected.length >= limit) break;
	}
	return selected;
}

function selectCaptionHighlights({
	captions,
	limit,
}: {
	captions: readonly SmartPackagingCaption[];
	limit: number;
}): SmartPackagingCaption[] {
	const candidates = captions
		.filter(
			(caption) =>
				isFiniteRange(caption) &&
				caption.text.trim().length >= 4 &&
				caption.text.trim().length <= 90
		)
		.sort((left, right) => {
			const leftPriority = /[!?]/.test(left.text) ? 1 : 0;
			const rightPriority = /[!?]/.test(right.text) ? 1 : 0;
			return rightPriority - leftPriority || left.startTime - right.startTime;
		});
	const selected: SmartPackagingCaption[] = [];
	for (const caption of candidates) {
		if (
			selected.some(
				(candidate) => Math.abs(candidate.startTime - caption.startTime) < 2
			)
		) {
			continue;
		}
		selected.push(caption);
		if (selected.length >= limit) break;
	}
	return selected.sort((left, right) => left.startTime - right.startTime);
}

function touchingShotPairs({
	shots,
}: {
	shots: readonly SmartPackagingShot[];
}): Array<{ from: SmartPackagingShot; to: SmartPackagingShot }> {
	const byTrack = new Map<string, SmartPackagingShot[]>();
	for (const shot of shots) {
		if (
			!Number.isFinite(shot.startTime) ||
			!Number.isFinite(shot.endTime) ||
			shot.endTime <= shot.startTime
		) {
			continue;
		}
		const trackShots = byTrack.get(shot.trackId) ?? [];
		trackShots.push(shot);
		byTrack.set(shot.trackId, trackShots);
	}
	const pairs: Array<{ from: SmartPackagingShot; to: SmartPackagingShot }> = [];
	for (const trackShots of byTrack.values()) {
		trackShots.sort((left, right) => left.startTime - right.startTime);
		for (let index = 0; index < trackShots.length - 1; index++) {
			const from = trackShots[index];
			const to = trackShots[index + 1];
			if (Math.abs(from.endTime - to.startTime) <= 0.05) {
				pairs.push({ from, to });
			}
		}
	}
	return pairs.sort((left, right) => left.to.startTime - right.to.startTime);
}

export function buildSmartPackagingPlan({
	captions,
	beats,
	shots,
	options,
}: {
	captions: readonly SmartPackagingCaption[];
	beats: readonly SmartPackagingBeat[];
	shots: readonly SmartPackagingShot[];
	options?: Partial<SmartPackagingOptions>;
}): SmartPackagingPlan {
	const config = { ...DEFAULT_OPTIONS, ...options };
	const actions: SmartPackagingAction[] = [];
	const warnings: string[] = [];
	const highlights = selectCaptionHighlights({
		captions,
		limit: config.maxTextOverlays ?? 6,
	});
	const shotPairs = touchingShotPairs({ shots });

	if (config.addText) {
		const textTemplates = ["social-hook", "dark-bubble", "social-breaking"];
		for (const [index, caption] of highlights.entries()) {
			actions.push({
				kind: "text",
				captionId: caption.id,
				content: caption.text.trim(),
				startTime: caption.startTime,
				duration: Math.min(3, Math.max(1.2, caption.duration)),
				textTemplateId: textTemplates[index % textTemplates.length],
			});
		}
		if (highlights.length === 0) warnings.push("No caption highlights found");
	}

	const preferredBeatTimes = beats
		.filter((beat) => beat.downbeat || (beat.strength ?? 0) >= 0.65)
		.map((beat) => beat.timestamp);
	const fallbackBeatTimes = beats.map((beat) => beat.timestamp);
	const accentTimes = selectSpacedTimes({
		times:
			preferredBeatTimes.length > 0
				? preferredBeatTimes
				: fallbackBeatTimes.length > 0
					? fallbackBeatTimes
					: highlights.map((caption) => caption.startTime),
		minimumGap: 2,
		limit: Math.max(config.maxStickers ?? 4, config.maxSoundEffects ?? 4),
	});

	if (config.addStickers) {
		for (const startTime of accentTimes.slice(0, config.maxStickers ?? 4)) {
			actions.push({
				kind: "sticker",
				startTime,
				duration: 1.4,
				stickerAssetId: "spark-burst",
			});
		}
		if (accentTimes.length === 0)
			warnings.push("No sticker accent points found");
	}

	if (config.addSoundEffects) {
		const soundTimes = selectSpacedTimes({
			times: [...accentTimes, ...shotPairs.map((pair) => pair.to.startTime)],
			minimumGap: 1.5,
			limit: config.maxSoundEffects ?? 4,
		});
		for (const startTime of soundTimes) {
			actions.push({
				kind: "sound-effect",
				startTime,
				duration: 0.24,
				soundAssetId: "accent-pop",
			});
		}
		if (soundTimes.length === 0) warnings.push("No sound accent points found");
	}

	if (config.addZooms) {
		const zoomShots = shots
			.filter((shot) => shot.endTime - shot.startTime >= 1.25)
			.sort((left, right) => left.startTime - right.startTime)
			.slice(0, config.maxZooms ?? 8);
		for (const [index, shot] of zoomShots.entries()) {
			actions.push({
				kind: "zoom",
				trackId: shot.trackId,
				elementId: shot.elementId,
				startTime: shot.startTime,
				endTime: shot.endTime,
				fromScale: index % 2 === 0 ? 1 : 1.08,
				toScale: index % 2 === 0 ? 1.08 : 1,
			});
		}
		if (zoomShots.length === 0)
			warnings.push("No shots are long enough to zoom");
	}

	if (config.addTransitions) {
		for (const [index, pair] of shotPairs
			.slice(0, config.maxTransitions ?? 8)
			.entries()) {
			actions.push({
				kind: "transition",
				trackId: pair.from.trackId,
				fromElementId: pair.from.elementId,
				toElementId: pair.to.elementId,
				startTime: pair.to.startTime,
				duration: 0.35,
				presetId: index % 3 === 2 ? "whip-pan-right" : "dissolve",
			});
		}
		if (shotPairs.length === 0)
			warnings.push("No touching shots found for transitions");
	}

	return {
		actions: actions.sort((left, right) => {
			const leftTime = "startTime" in left ? left.startTime : 0;
			const rightTime = "startTime" in right ? right.startTime : 0;
			return leftTime - rightTime || left.kind.localeCompare(right.kind);
		}),
		sourceCounts: {
			captions: captions.length,
			beats: beats.length,
			shots: shots.length,
		},
		warnings,
	};
}
