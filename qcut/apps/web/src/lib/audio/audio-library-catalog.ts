import type { TranslationKey } from "@/lib/i18n";
import type { SavedSound, SoundEffect } from "@/types/sounds";

export type AudioLibraryKind = "sound-effect" | "music";
export type AudioLibrarySort = "downloads" | "rating" | "created" | "score";

const AUDIO_LIBRARY_TAGS_ZH: Record<string, string> = {
	achievement: "成就",
	bright: "明亮",
	calm: "平静",
	cinematic: "电影感",
	city: "城市",
	clean: "干净",
	confident: "自信",
	dance: "舞蹈",
	delicate: "细腻",
	dialogue: "对话",
	documentary: "纪录片",
	dramatic: "戏剧",
	energetic: "动感",
	farewell: "告别",
	fashion: "时尚",
	focus: "专注",
	forest: "森林",
	fresh: "清新",
	graduation: "毕业",
	healing: "治愈",
	interior: "室内",
	lifestyle: "生活记录",
	memory: "回忆",
	modern: "现代",
	morning: "清晨",
	motion: "动态",
	neutral: "中性",
	night: "夜晚",
	nostalgic: "怀旧",
	optimistic: "乐观",
	outdoor: "户外",
	peaceful: "安宁",
	photo: "照片",
	playful: "活泼",
	positive: "积极",
	rain: "雨天",
	recap: "回顾",
	reflective: "沉思",
	reveal: "揭晓",
	rising: "上扬",
	"road-trip": "公路旅行",
	sleep: "睡眠",
	smooth: "流畅",
	social: "短视频",
	sticker: "贴纸",
	story: "叙事",
	study: "学习",
	subtle: "克制",
	sunny: "阳光",
	tactile: "触感",
	title: "标题",
	trailer: "预告",
	transition: "转场",
	travel: "旅行",
	triumphant: "凯旋",
	tutorial: "教程",
	ui: "界面",
	uplifting: "振奋",
	vlog: "VLOG",
	walking: "行走",
	warm: "温暖",
	winter: "冬季",
};

export function localizeAudioLibraryTag({
	tag,
	locale,
}: {
	tag: string;
	locale: "en" | "zh";
}): string {
	if (locale === "zh") return AUDIO_LIBRARY_TAGS_ZH[tag] ?? tag;
	return tag
		.split("-")
		.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
		.join(" ");
}

export type AudioLibraryCategoryId =
	| `music-${
			| "recommended"
			| "popular"
			| "latest"
			| "instrumental"
			| "graduation"
			| "light"
			| "kpop"
			| "travel"
			| "social"
			| "beat"
			| "winter"
			| "healing"
			| "dynamic"
			| "vlog"
			| "emotional"}`
	| `sfx-${
			| "recommended"
			| "popular"
			| "latest"
			| "whoosh"
			| "impact"
			| "ui"
			| "foley"
			| "nature"
			| "ambient"
			| "cinematic"}`;

export interface AudioLibraryCategory {
	id: AudioLibraryCategoryId;
	kind: AudioLibraryKind;
	labelKey: TranslationKey;
	query: string;
	sort: AudioLibrarySort;
	matchTags: readonly string[];
}

export const MUSIC_CATEGORIES = [
	{
		id: "music-recommended",
		kind: "music",
		labelKey: "audioLibrary.category.recommended",
		query: "instrumental background music",
		sort: "rating",
		matchTags: ["music"],
	},
	{
		id: "music-popular",
		kind: "music",
		labelKey: "audioLibrary.category.popular",
		query: "instrumental music",
		sort: "downloads",
		matchTags: ["music"],
	},
	{
		id: "music-latest",
		kind: "music",
		labelKey: "audioLibrary.category.latest",
		query: "instrumental music",
		sort: "created",
		matchTags: ["music"],
	},
	{
		id: "music-instrumental",
		kind: "music",
		labelKey: "audioLibrary.category.instrumental",
		query: "pure instrumental music no vocals",
		sort: "score",
		matchTags: ["instrumental", "纯音乐"],
	},
	{
		id: "music-graduation",
		kind: "music",
		labelKey: "audioLibrary.category.graduation",
		query: "uplifting graduation memories instrumental",
		sort: "score",
		matchTags: ["graduation", "毕业"],
	},
	{
		id: "music-light",
		kind: "music",
		labelKey: "audioLibrary.category.light",
		query: "light upbeat acoustic background music",
		sort: "score",
		matchTags: ["light", "轻快"],
	},
	{
		id: "music-kpop",
		kind: "music",
		labelKey: "audioLibrary.category.kpop",
		query: "kpop inspired instrumental dance",
		sort: "downloads",
		matchTags: ["kpop"],
	},
	{
		id: "music-travel",
		kind: "music",
		labelKey: "audioLibrary.category.travel",
		query: "travel vlog uplifting instrumental",
		sort: "score",
		matchTags: ["travel", "旅行"],
	},
	{
		id: "music-social",
		kind: "music",
		labelKey: "audioLibrary.category.social",
		query: "short video trending upbeat music",
		sort: "downloads",
		matchTags: ["social", "短视频"],
	},
	{
		id: "music-beat",
		kind: "music",
		labelKey: "audioLibrary.category.beat",
		query: "rhythmic beat edit instrumental",
		sort: "score",
		matchTags: ["beat", "卡点"],
	},
	{
		id: "music-winter",
		kind: "music",
		labelKey: "audioLibrary.category.winter",
		query: "winter calm cozy instrumental",
		sort: "score",
		matchTags: ["winter", "冬天"],
	},
	{
		id: "music-healing",
		kind: "music",
		labelKey: "audioLibrary.category.healing",
		query: "healing relaxing ambient music",
		sort: "rating",
		matchTags: ["healing", "治愈"],
	},
	{
		id: "music-dynamic",
		kind: "music",
		labelKey: "audioLibrary.category.dynamic",
		query: "dynamic energetic instrumental",
		sort: "score",
		matchTags: ["dynamic", "动感"],
	},
	{
		id: "music-vlog",
		kind: "music",
		labelKey: "audioLibrary.category.vlog",
		query: "vlog background instrumental",
		sort: "downloads",
		matchTags: ["vlog"],
	},
	{
		id: "music-emotional",
		kind: "music",
		labelKey: "audioLibrary.category.emotional",
		query: "emotional cinematic instrumental",
		sort: "rating",
		matchTags: ["emotional", "情绪"],
	},
] as const satisfies readonly AudioLibraryCategory[];

export const SOUND_EFFECT_CATEGORIES = [
	{
		id: "sfx-recommended",
		kind: "sound-effect",
		labelKey: "audioLibrary.category.recommended",
		query: "video editing sound effect",
		sort: "rating",
		matchTags: ["sound-effect"],
	},
	{
		id: "sfx-popular",
		kind: "sound-effect",
		labelKey: "audioLibrary.category.popular",
		query: "sound effect",
		sort: "downloads",
		matchTags: ["sound-effect"],
	},
	{
		id: "sfx-latest",
		kind: "sound-effect",
		labelKey: "audioLibrary.category.latest",
		query: "sound effect",
		sort: "created",
		matchTags: ["sound-effect"],
	},
	{
		id: "sfx-whoosh",
		kind: "sound-effect",
		labelKey: "audioLibrary.category.whoosh",
		query: "whoosh transition",
		sort: "score",
		matchTags: ["whoosh", "转场"],
	},
	{
		id: "sfx-impact",
		kind: "sound-effect",
		labelKey: "audioLibrary.category.impact",
		query: "impact hit cinematic",
		sort: "score",
		matchTags: ["impact", "冲击"],
	},
	{
		id: "sfx-ui",
		kind: "sound-effect",
		labelKey: "audioLibrary.category.ui",
		query: "interface click notification",
		sort: "score",
		matchTags: ["ui", "click", "notification", "提示"],
	},
	{
		id: "sfx-foley",
		kind: "sound-effect",
		labelKey: "audioLibrary.category.foley",
		query: "foley movement object",
		sort: "score",
		matchTags: ["foley", "拟音"],
	},
	{
		id: "sfx-nature",
		kind: "sound-effect",
		labelKey: "audioLibrary.category.nature",
		query: "nature ambience birds water wind",
		sort: "rating",
		matchTags: ["nature", "自然"],
	},
	{
		id: "sfx-ambient",
		kind: "sound-effect",
		labelKey: "audioLibrary.category.ambient",
		query: "ambient atmosphere room tone",
		sort: "rating",
		matchTags: ["ambient", "环境"],
	},
	{
		id: "sfx-cinematic",
		kind: "sound-effect",
		labelKey: "audioLibrary.category.cinematic",
		query: "cinematic trailer sound design",
		sort: "downloads",
		matchTags: ["cinematic", "电影"],
	},
] as const satisfies readonly AudioLibraryCategory[];

export const AUDIO_LIBRARY_CATEGORIES = [
	...MUSIC_CATEGORIES,
	...SOUND_EFFECT_CATEGORIES,
] as const;

export type AudioLibrarySectionId =
	| AudioLibraryCategoryId
	| `audio-folder:${string}`
	| "favorites"
	| "recent"
	| "downloads"
	| "project-audio"
	| "project-recommended"
	| "ai-music"
	| "ai-voice";

export const DEFAULT_AUDIO_LIBRARY_CATEGORY_ID = "music-latest";

function builtInAudio({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	duration,
	kind,
	tags,
	artworkColors,
	bpm,
	musicalKey,
	moods,
	scenes,
	loopable,
	downloads,
	created,
}: {
	id: number;
	name: string;
	localizedName: string;
	description: string;
	localizedDescription: string;
	duration: number;
	kind: AudioLibraryKind;
	tags: string[];
	artworkColors: readonly [string, string];
	bpm?: number;
	musicalKey?: string;
	moods: string[];
	scenes: string[];
	loopable: boolean;
	downloads: number;
	created: string;
}): SoundEffect {
	const fileName = name.toLocaleLowerCase().replaceAll(" ", "-");
	const assetUrl = `/audio/builtin/${fileName}.ogg`;
	return {
		id,
		name,
		localizedName,
		description,
		localizedDescription,
		url: assetUrl,
		previewUrl: assetUrl,
		downloadUrl: assetUrl,
		duration,
		filesize: 0,
		type: "audio/ogg",
		channels: 1,
		bitrate: kind === "music" ? 96_000 : 72_000,
		bitdepth: 16,
		samplerate: 44_100,
		username: "QCut Studio",
		tags: [...tags, kind],
		license: "qcut://license/built-in",
		created,
		downloads,
		rating: 5,
		ratingCount: 1,
		source: "qcut",
		kind,
		artworkColors,
		bpm,
		musicalKey,
		moods,
		scenes,
		loopable,
		featured: true,
	};
}

export const BUILT_IN_AUDIO: readonly SoundEffect[] = [
	builtInAudio({
		id: -1001,
		name: "Quiet Current",
		localizedName: "静谧流光",
		description: "A calm ambient bed for focus and reflective scenes.",
		localizedDescription: "适合专注、治愈与安静叙事的氛围音乐。",
		duration: 12,
		kind: "music",
		tags: ["ambient", "instrumental", "healing", "winter", "纯音乐", "治愈"],
		artworkColors: ["#23616f", "#c8e6dc"],
		bpm: 60,
		musicalKey: "C",
		moods: ["calm", "healing"],
		scenes: ["focus", "winter", "documentary"],
		loopable: true,
		downloads: 8420,
		created: "2026-07-12T00:00:00.000Z",
	}),
	builtInAudio({
		id: -1002,
		name: "Neon Steps",
		localizedName: "霓虹节拍",
		description: "A crisp electronic pulse for rhythm edits and city reels.",
		localizedDescription: "适合卡点、城市与潮流短视频的电子节拍。",
		duration: 12,
		kind: "music",
		tags: ["electronic", "dynamic", "beat", "vlog", "卡点", "动感"],
		artworkColors: ["#43236f", "#ff5d8f"],
		bpm: 120,
		musicalKey: "E",
		moods: ["energetic", "modern"],
		scenes: ["city", "social", "vlog"],
		loopable: true,
		downloads: 12_480,
		created: "2026-07-15T00:00:00.000Z",
	}),
	builtInAudio({
		id: -1003,
		name: "Warm Window",
		localizedName: "午后暖窗",
		description: "A gentle melodic loop for lifestyle and memory edits.",
		localizedDescription: "适合生活记录、回忆与轻松片段的温暖旋律。",
		duration: 12,
		kind: "music",
		tags: ["light", "healing", "vlog", "graduation", "轻快", "毕业"],
		artworkColors: ["#d9772f", "#ffe0a8"],
		bpm: 96,
		musicalKey: "A",
		moods: ["warm", "nostalgic"],
		scenes: ["lifestyle", "graduation", "memory"],
		loopable: true,
		downloads: 9760,
		created: "2026-07-10T00:00:00.000Z",
	}),
	builtInAudio({
		id: -1004,
		name: "Open Road",
		localizedName: "向远方",
		description: "An upbeat driving loop for travel and outdoor stories.",
		localizedDescription: "适合旅行、户外和 VLOG 的轻快律动。",
		duration: 12,
		kind: "music",
		tags: ["travel", "upbeat", "vlog", "light", "旅行", "轻快"],
		artworkColors: ["#176b55", "#f5d65b"],
		bpm: 116,
		musicalKey: "G",
		moods: ["uplifting", "bright"],
		scenes: ["travel", "outdoor", "vlog"],
		loopable: true,
		downloads: 11_240,
		created: "2026-07-14T00:00:00.000Z",
	}),
	builtInAudio({
		id: -1005,
		name: "Pop Prism",
		localizedName: "流光韩潮",
		description: "A glossy dance-pop pulse for trends and fast social edits.",
		localizedDescription: "适合韩流、热门短视频和快速卡点的明亮舞曲节奏。",
		duration: 12,
		kind: "music",
		tags: ["kpop", "social", "dynamic", "beat", "流行", "韩流", "卡点"],
		artworkColors: ["#8b2f73", "#67e8f9"],
		bpm: 128,
		musicalKey: "F#",
		moods: ["confident", "energetic"],
		scenes: ["fashion", "social", "dance"],
		loopable: true,
		downloads: 14_260,
		created: "2026-07-16T00:00:00.000Z",
	}),
	builtInAudio({
		id: -1006,
		name: "Moonlit Farewell",
		localizedName: "月下告别",
		description:
			"A reflective melodic bed for endings and graduation memories.",
		localizedDescription: "适合毕业、告别和回忆叙事的克制旋律。",
		duration: 12,
		kind: "music",
		tags: [
			"emotional",
			"graduation",
			"healing",
			"instrumental",
			"毕业",
			"情绪",
		],
		artworkColors: ["#29335c", "#f3c677"],
		bpm: 72,
		musicalKey: "Am",
		moods: ["reflective", "nostalgic"],
		scenes: ["graduation", "farewell", "memory"],
		loopable: true,
		downloads: 8_940,
		created: "2026-07-13T00:00:00.000Z",
	}),
	builtInAudio({
		id: -1007,
		name: "Snow Lantern",
		localizedName: "雪夜灯影",
		description: "A delicate winter loop with spacious bells and soft harmony.",
		localizedDescription: "适合冬日、治愈和安静情绪片段的空灵旋律。",
		duration: 12,
		kind: "music",
		tags: ["winter", "healing", "emotional", "instrumental", "冬天", "治愈"],
		artworkColors: ["#315a6b", "#d8f3ff"],
		bpm: 84,
		musicalKey: "C",
		moods: ["delicate", "peaceful"],
		scenes: ["winter", "night", "memory"],
		loopable: true,
		downloads: 7_820,
		created: "2026-07-11T00:00:00.000Z",
	}),
	builtInAudio({
		id: -1008,
		name: "Golden Hour Ride",
		localizedName: "逐光旅程",
		description:
			"A breezy groove for road trips, lifestyle reels, and sunny travel.",
		localizedDescription: "适合公路旅行、生活记录和阳光 VLOG 的轻快律动。",
		duration: 12,
		kind: "music",
		tags: ["travel", "light", "vlog", "social", "旅行", "轻快", "短视频"],
		artworkColors: ["#b45309", "#fde68a"],
		bpm: 108,
		musicalKey: "D",
		moods: ["sunny", "optimistic"],
		scenes: ["travel", "road-trip", "lifestyle"],
		loopable: true,
		downloads: 12_870,
		created: "2026-07-15T00:00:00.000Z",
	}),
	builtInAudio({
		id: -1009,
		name: "Victory Frame",
		localizedName: "高光定格",
		description:
			"An energetic rise for achievements, recaps, and beat-driven cuts.",
		localizedDescription: "适合毕业高光、成就回顾和强节拍剪辑的动感音乐。",
		duration: 12,
		kind: "music",
		tags: ["graduation", "dynamic", "beat", "social", "毕业", "动感", "卡点"],
		artworkColors: ["#9f1239", "#facc15"],
		bpm: 124,
		musicalKey: "E",
		moods: ["triumphant", "energetic"],
		scenes: ["achievement", "graduation", "recap"],
		loopable: true,
		downloads: 13_410,
		created: "2026-07-16T06:00:00.000Z",
	}),
	builtInAudio({
		id: -2001,
		name: "Soft Click",
		localizedName: "轻触点击",
		description: "A short tactile interface click.",
		localizedDescription: "轻巧干净的界面点击音。",
		duration: 0.32,
		kind: "sound-effect",
		tags: ["ui", "click", "interface", "点击"],
		artworkColors: ["#334155", "#94a3b8"],
		moods: ["clean"],
		scenes: ["ui", "tutorial"],
		loopable: false,
		downloads: 15_300,
		created: "2026-07-15T00:00:00.000Z",
	}),
	builtInAudio({
		id: -2002,
		name: "Bright Notification",
		localizedName: "清亮提示",
		description: "A friendly two-tone notification.",
		localizedDescription: "友好清晰的双音提示音。",
		duration: 0.9,
		kind: "sound-effect",
		tags: ["ui", "notification", "提示"],
		artworkColors: ["#146c94", "#71c9ce"],
		moods: ["positive"],
		scenes: ["ui", "social"],
		loopable: false,
		downloads: 12_040,
		created: "2026-07-13T00:00:00.000Z",
	}),
	builtInAudio({
		id: -2003,
		name: "Cinematic Impact",
		localizedName: "电影冲击",
		description: "A low cinematic hit for reveals and title cuts.",
		localizedDescription: "适合揭示、标题和重拍点的低频冲击音。",
		duration: 1.6,
		kind: "sound-effect",
		tags: ["impact", "cinematic", "trailer", "冲击", "电影"],
		artworkColors: ["#611f1f", "#e76f51"],
		moods: ["dramatic"],
		scenes: ["cinematic", "title"],
		loopable: false,
		downloads: 18_620,
		created: "2026-07-09T00:00:00.000Z",
	}),
	builtInAudio({
		id: -2004,
		name: "Air Whoosh",
		localizedName: "空气转场",
		description: "A smooth airy whoosh for transitions.",
		localizedDescription: "适合画面切换的顺滑空气转场音。",
		duration: 1.4,
		kind: "sound-effect",
		tags: ["whoosh", "transition", "air", "转场"],
		artworkColors: ["#315b74", "#a8dadc"],
		moods: ["smooth"],
		scenes: ["transition", "motion"],
		loopable: false,
		downloads: 21_400,
		created: "2026-07-11T00:00:00.000Z",
	}),
	builtInAudio({
		id: -2005,
		name: "Camera Shutter",
		localizedName: "相机快门",
		description: "A compact camera shutter accent.",
		localizedDescription: "适合定格与照片切换的快门声。",
		duration: 0.5,
		kind: "sound-effect",
		tags: ["foley", "camera", "shutter", "拟音", "快门"],
		artworkColors: ["#374151", "#d1d5db"],
		moods: ["tactile"],
		scenes: ["photo", "travel"],
		loopable: false,
		downloads: 13_760,
		created: "2026-07-08T00:00:00.000Z",
	}),
	builtInAudio({
		id: -2006,
		name: "Digital Sparkle",
		localizedName: "数字闪光",
		description: "A bright ascending digital sparkle.",
		localizedDescription: "适合高光、贴纸和成功状态的清脆闪光音。",
		duration: 1.2,
		kind: "sound-effect",
		tags: ["ui", "sparkle", "magic", "提示", "闪光"],
		artworkColors: ["#5b21b6", "#f0abfc"],
		moods: ["bright"],
		scenes: ["ui", "reveal", "sticker"],
		loopable: false,
		downloads: 10_980,
		created: "2026-07-12T00:00:00.000Z",
	}),
	builtInAudio({
		id: -2007,
		name: "Button Pop",
		localizedName: "按钮弹响",
		description: "A compact rising pop for taps and confirmations.",
		localizedDescription: "适合点击、确认和轻提示的短促弹响。",
		duration: 0.25,
		kind: "sound-effect",
		tags: ["ui", "click", "notification", "点击", "提示"],
		artworkColors: ["#155e75", "#67e8f9"],
		moods: ["playful"],
		scenes: ["ui", "tutorial", "social"],
		loopable: false,
		downloads: 11_730,
		created: "2026-07-16T00:00:00.000Z",
	}),
	builtInAudio({
		id: -2008,
		name: "Soft Footstep",
		localizedName: "轻柔脚步",
		description: "A soft single footstep for indoor movement.",
		localizedDescription: "适合室内行走与人物动作的轻柔单步声。",
		duration: 0.7,
		kind: "sound-effect",
		tags: ["foley", "footstep", "movement", "拟音", "脚步"],
		artworkColors: ["#4b5563", "#d6d3d1"],
		moods: ["subtle"],
		scenes: ["interior", "walking", "story"],
		loopable: false,
		downloads: 9_620,
		created: "2026-07-14T00:00:00.000Z",
	}),
	builtInAudio({
		id: -2009,
		name: "Page Turn",
		localizedName: "纸张翻页",
		description: "A light paper page turn for study and story edits.",
		localizedDescription: "适合阅读、学习和叙事转场的纸张翻页声。",
		duration: 0.8,
		kind: "sound-effect",
		tags: ["foley", "paper", "page", "拟音", "翻页"],
		artworkColors: ["#7c5c3e", "#f5e6c8"],
		moods: ["tactile"],
		scenes: ["study", "story", "documentary"],
		loopable: false,
		downloads: 8_880,
		created: "2026-07-10T00:00:00.000Z",
	}),
	builtInAudio({
		id: -2010,
		name: "Reverse Sweep",
		localizedName: "反向掠过",
		description: "A rising reverse sweep for reveals and fast transitions.",
		localizedDescription: "适合揭示、加速和快速切换的上升转场声。",
		duration: 1.2,
		kind: "sound-effect",
		tags: ["whoosh", "transition", "riser", "转场"],
		artworkColors: ["#1d4ed8", "#a5f3fc"],
		moods: ["rising"],
		scenes: ["transition", "reveal", "motion"],
		loopable: false,
		downloads: 16_480,
		created: "2026-07-16T02:00:00.000Z",
	}),
	builtInAudio({
		id: -2011,
		name: "Heavy Drop",
		localizedName: "重力坠击",
		description: "A deep low-frequency drop for dramatic cuts and trailers.",
		localizedDescription: "适合戏剧转折、预告片和重拍点的深沉坠击声。",
		duration: 1.5,
		kind: "sound-effect",
		tags: ["impact", "cinematic", "trailer", "冲击", "电影"],
		artworkColors: ["#450a0a", "#fb7185"],
		moods: ["dramatic"],
		scenes: ["cinematic", "trailer", "title"],
		loopable: false,
		downloads: 17_960,
		created: "2026-07-15T03:00:00.000Z",
	}),
	builtInAudio({
		id: -2012,
		name: "Rain Window",
		localizedName: "窗边细雨",
		description: "A seamless soft rain ambience for calm interiors.",
		localizedDescription: "适合室内、治愈和安静叙事的无缝细雨环境声。",
		duration: 8,
		kind: "sound-effect",
		tags: ["nature", "ambient", "rain", "自然", "环境", "雨声"],
		artworkColors: ["#164e63", "#bae6fd"],
		moods: ["calm"],
		scenes: ["rain", "interior", "sleep"],
		loopable: true,
		downloads: 14_720,
		created: "2026-07-15T01:00:00.000Z",
	}),
	builtInAudio({
		id: -2013,
		name: "Forest Morning",
		localizedName: "森林清晨",
		description: "A light woodland ambience with distant birds.",
		localizedDescription: "带远处鸟鸣的轻柔森林清晨环境声。",
		duration: 8,
		kind: "sound-effect",
		tags: ["nature", "ambient", "birds", "forest", "自然", "环境", "森林"],
		artworkColors: ["#14532d", "#bbf7d0"],
		moods: ["fresh"],
		scenes: ["forest", "morning", "travel"],
		loopable: true,
		downloads: 12_660,
		created: "2026-07-13T04:00:00.000Z",
	}),
	builtInAudio({
		id: -2014,
		name: "Quiet Room Tone",
		localizedName: "安静室内底噪",
		description: "A low, seamless room tone for dialogue edits.",
		localizedDescription: "适合对白剪辑和室内场景衔接的低噪环境底声。",
		duration: 8,
		kind: "sound-effect",
		tags: ["ambient", "room-tone", "interior", "环境"],
		artworkColors: ["#3f3f46", "#d4d4d8"],
		moods: ["neutral"],
		scenes: ["interior", "dialogue", "documentary"],
		loopable: true,
		downloads: 7_460,
		created: "2026-07-09T02:00:00.000Z",
	}),
] as const;

const CHINESE_SEARCH_ALIASES: Readonly<Record<string, string>> = {
	旅行: "travel vlog",
	治愈: "healing relaxing",
	冬天: "winter cozy",
	毕业: "graduation memories",
	轻快: "light upbeat",
	卡点: "rhythmic beat",
	动感: "dynamic energetic",
	情绪: "emotional",
	纯音乐: "instrumental",
	转场: "whoosh transition",
	冲击: "impact hit",
	提示: "notification ui",
	拟音: "foley",
	自然: "nature ambience",
	环境: "ambient atmosphere",
	韩流: "kpop dance",
	流行: "pop social",
	雨声: "rain ambient",
	森林: "forest nature",
	脚步: "footstep foley",
	翻页: "page paper foley",
	快门: "camera shutter",
};

export function translateAudioSearchQuery({
	query,
}: {
	query: string;
}): string {
	let translated = query.trim();
	for (const [chinese, english] of Object.entries(CHINESE_SEARCH_ALIASES)) {
		translated = translated.replaceAll(chinese, ` ${english} `);
	}
	return translated.trim().replaceAll(/\s+/g, " ");
}

export function findAudioLibraryCategory({
	categoryId,
}: {
	categoryId: string;
}): AudioLibraryCategory {
	return (
		AUDIO_LIBRARY_CATEGORIES.find((category) => category.id === categoryId) ??
		MUSIC_CATEGORIES[0]
	);
}

function matchesBuiltInQuery({
	sound,
	query,
}: {
	sound: SoundEffect;
	query: string;
}): boolean {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return true;
	const searchable = [
		sound.name,
		sound.localizedName,
		sound.description,
		sound.localizedDescription,
		...sound.tags,
		...(sound.moods ?? []),
		...(sound.scenes ?? []),
	]
		.filter(Boolean)
		.join(" ")
		.toLocaleLowerCase();
	return normalizedQuery
		.split(/\s+/)
		.every((token) => searchable.includes(token));
}

export function getBuiltInAudio({
	category,
	query,
}: {
	category: AudioLibraryCategory;
	query: string;
}): SoundEffect[] {
	const candidates = BUILT_IN_AUDIO.filter(
		(sound) => sound.kind === category.kind
	);
	const queryMatches = candidates.filter((sound) =>
		matchesBuiltInQuery({ sound, query })
	);
	const categoryMatches = query.trim()
		? queryMatches
		: queryMatches.filter((sound) =>
				category.matchTags.some((tag) =>
					matchesBuiltInQuery({ sound, query: tag })
				)
			);
	return [...categoryMatches].sort((left, right) => {
		if (category.sort === "created") {
			return Date.parse(right.created) - Date.parse(left.created);
		}
		if (category.sort === "downloads") return right.downloads - left.downloads;
		return right.rating - left.rating || right.downloads - left.downloads;
	});
}

export function restoreSavedAudio({
	savedSound,
}: {
	savedSound: SavedSound;
}): SoundEffect {
	return {
		id: savedSound.id,
		name: savedSound.name,
		description: savedSound.description ?? "",
		url: savedSound.previewUrl ?? "",
		previewUrl: savedSound.previewUrl,
		downloadUrl: savedSound.downloadUrl,
		duration: savedSound.duration,
		filesize: 0,
		type: savedSound.previewUrl?.endsWith(".ogg") ? "audio/ogg" : "audio/mpeg",
		channels: 0,
		bitrate: 0,
		bitdepth: 0,
		samplerate: 0,
		username: savedSound.username,
		tags: savedSound.tags,
		license: savedSound.license,
		created: savedSound.savedAt,
		downloads: 0,
		rating: 0,
		ratingCount: 0,
		source: savedSound.source,
		mediaId: savedSound.mediaId,
		kind: savedSound.kind,
		localizedName: savedSound.localizedName,
		localizedDescription: savedSound.localizedDescription,
		artworkColors: savedSound.artworkColors,
		bpm: savedSound.bpm,
		musicalKey: savedSound.musicalKey,
		moods: savedSound.moods,
		scenes: savedSound.scenes,
		loopable: savedSound.loopable,
	};
}
