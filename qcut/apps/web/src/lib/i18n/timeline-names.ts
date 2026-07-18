import type { TimelineTrack, TrackType } from "@/types/timeline";
import { translate, type AppLocale, type TranslationKey } from "@/lib/i18n";

const TRACK_NAME_KEYS: Record<TrackType, TranslationKey> = {
	media: "timeline.track.media",
	effect: "timeline.track.effect",
	text: "timeline.track.text",
	markdown: "timeline.track.markdown",
	audio: "timeline.track.audio",
	sticker: "timeline.track.sticker",
	adjustment: "timeline.track.adjustment",
	captions: "timeline.track.captions",
	remotion: "timeline.track.remotion",
};

const SYSTEM_TRACK_NAMES: Record<TrackType, ReadonlySet<string>> = {
	media: new Set(["Media Track", "视频轨道"]),
	effect: new Set(["Effects Track", "特效轨道"]),
	text: new Set(["Text Track", "文本轨道"]),
	markdown: new Set(["Markdown Track", "Markdown 轨道"]),
	audio: new Set(["Audio Track", "音频轨道"]),
	sticker: new Set(["Sticker Track", "贴纸轨道"]),
	adjustment: new Set(["Adjustment Track", "调整轨道"]),
	captions: new Set(["Captions Track", "字幕轨道"]),
	remotion: new Set(["Remotion Track", "Remotion 轨道"]),
};

const MAIN_TRACK_NAMES = new Set(["Main Track", "Main track", "主轨道"]);
const MAIN_SCENE_NAMES = new Set(["Main scene", "主场景"]);

export function localizeTrackTypeName({
	type,
	locale,
}: {
	type: TrackType;
	locale: AppLocale;
}): string {
	return translate({ locale, key: TRACK_NAME_KEYS[type] });
}

export function localizeTrackName({
	track,
	locale,
}: {
	track: TimelineTrack;
	locale: AppLocale;
}): string {
	if (track.isMain && MAIN_TRACK_NAMES.has(track.name)) {
		return translate({ locale, key: "timeline.track.main" });
	}
	if (!SYSTEM_TRACK_NAMES[track.type].has(track.name)) return track.name;
	return translate({ locale, key: TRACK_NAME_KEYS[track.type] });
}

export function localizeTimelineElementName({
	name,
	locale,
}: {
	name: string;
	locale: AppLocale;
}): string {
	const compoundMatch = name.match(
		/^(?:Compound \((\d+) clips\)|复合片段（(\d+) 个片段）)$/
	);
	if (compoundMatch) {
		return translate({
			locale,
			key: "timeline.compoundName",
			values: { count: compoundMatch[1] ?? compoundMatch[2] },
		});
	}

	const multicamMatch = name.match(
		/^(?:Multicam \((\d+) angles\)|多机位（(\d+) 个机位）)$/
	);
	if (multicamMatch) {
		return translate({
			locale,
			key: "timeline.multicamName",
			values: { count: multicamMatch[1] ?? multicamMatch[2] },
		});
	}

	return name;
}

export function localizeSceneName({
	name,
	locale,
}: {
	name: string | undefined;
	locale: AppLocale;
}): string {
	if (name && !MAIN_SCENE_NAMES.has(name)) return name;
	return translate({ locale, key: "timeline.scene.main" });
}
