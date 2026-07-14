import type { ThemedStickerCategoryId } from "./sticker-categories";

export type ThemedStickerStyle =
	| "arrow"
	| "burst"
	| "caption"
	| "frame"
	| "label"
	| "note"
	| "pill"
	| "progress"
	| "speech"
	| "stamp";

export interface ThemedStickerPalette {
	accent: string;
	background: string;
	ink: string;
	secondary: string;
}

export interface ThemedStickerDefinition {
	id: string;
	name: string;
	localizedName: string;
	style: ThemedStickerStyle;
	tags: readonly string[];
}

export interface ThemedStickerPack {
	id: ThemedStickerCategoryId;
	name: string;
	localizedName: string;
	palette: ThemedStickerPalette;
	items: readonly ThemedStickerDefinition[];
}

type PhrasePair = readonly [localizedName: string, name: string];

interface ThemedStickerPackSeed {
	count: 20 | 30;
	name: string;
	localizedName: string;
	palette: ThemedStickerPalette;
	phrases: readonly PhrasePair[];
}

const STYLES = [
	"pill",
	"burst",
	"speech",
	"arrow",
	"progress",
	"caption",
	"stamp",
	"note",
	"label",
	"frame",
] as const satisfies readonly ThemedStickerStyle[];

const STYLE_NAMES: Record<ThemedStickerStyle, string> = {
	arrow: "Arrow",
	burst: "Burst",
	caption: "Caption",
	frame: "Frame",
	label: "Label",
	note: "Note",
	pill: "Pill",
	progress: "Progress",
	speech: "Speech Bubble",
	stamp: "Stamp",
};

const PACK_SEEDS: Record<ThemedStickerCategoryId, ThemedStickerPackSeed> = {
	popular: {
		count: 30,
		name: "Popular",
		localizedName: "热门",
		palette: {
			accent: "#ff6b35",
			background: "#fff1e8",
			ink: "#3c1f1a",
			secondary: "#ffd166",
		},
		phrases: [
			["爆款推荐", "Trending pick"],
			["高能片段", "High energy"],
			["必看", "Must watch"],
			["今日热门", "Popular today"],
			["全场焦点", "Main focus"],
			["点赞收藏", "Like and save"],
			["精彩来了", "Highlight incoming"],
			["超有料", "Worth watching"],
			["别错过", "Do not miss"],
			["热度拉满", "Full heat"],
		],
	},
	interaction: {
		count: 20,
		name: "Interaction",
		localizedName: "互动",
		palette: {
			accent: "#ffcf33",
			background: "#fff2b8",
			ink: "#3c3151",
			secondary: "#ff6b6b",
		},
		phrases: [
			["关注我", "Follow me"],
			["点赞", "Like"],
			["评论区见", "See you in comments"],
			["转发一下", "Share it"],
			["收藏啦", "Saved"],
			["谢谢支持", "Thanks for the support"],
			["一起互动", "Join the conversation"],
			["记得订阅", "Remember to subscribe"],
			["戳这里", "Tap here"],
			["安排上", "Consider it done"],
		],
	},
	summer: {
		count: 20,
		name: "Summer",
		localizedName: "夏日",
		palette: {
			accent: "#00b8d9",
			background: "#d9fbff",
			ink: "#174a5b",
			secondary: "#ff7f50",
		},
		phrases: [
			["夏日快乐", "Happy summer"],
			["去看海", "See the sea"],
			["清凉一下", "Cool down"],
			["冰爽时刻", "Icy moment"],
			["假日模式", "Holiday mode"],
			["阳光正好", "Perfect sunshine"],
			["海边见", "Meet by the sea"],
			["西瓜自由", "Watermelon time"],
			["热浪来袭", "Heat wave"],
			["夏夜晚风", "Summer night breeze"],
		],
	},
	vlog: {
		count: 20,
		name: "Vlog",
		localizedName: "Vlog",
		palette: {
			accent: "#f4d35e",
			background: "#fffbe6",
			ink: "#26233a",
			secondary: "#ee6c4d",
		},
		phrases: [
			["今日美好", "Beautiful today"],
			["记录生活", "Life diary"],
			["出发啦", "Let's go"],
			["好天气", "Good weather"],
			["幸运一天", "Lucky day"],
			["幕后花絮", "Behind the scenes"],
			["本期看点", "Episode highlights"],
			["加载中", "Loading"],
			["下集见", "See you next time"],
			["周末日记", "Weekend diary"],
		],
	},
	mood: {
		count: 20,
		name: "Mood",
		localizedName: "情绪",
		palette: {
			accent: "#ff5d8f",
			background: "#ffe8f0",
			ink: "#4a2b45",
			secondary: "#8f7cff",
		},
		phrases: [
			["开心", "Happy"],
			["好期待", "Can't wait"],
			["太棒啦", "Amazing"],
			["有点害羞", "A little shy"],
			["震惊", "Shocked"],
			["委屈", "Upset"],
			["生气了", "Angry"],
			["笑不活了", "So funny"],
			["状态满格", "Full energy"],
			["今天也不错", "Today is good"],
		],
	},
	conceal: {
		count: 20,
		name: "Conceal",
		localizedName: "遮挡",
		palette: {
			accent: "#8d99ae",
			background: "#edf2f4",
			ink: "#2b2d42",
			secondary: "#ef476f",
		},
		phrases: [
			["此处保密", "Private"],
			["暂不公开", "Not public"],
			["打码中", "Redacted"],
			["请勿偷看", "Do not peek"],
			["隐藏信息", "Hidden info"],
			["重点遮挡", "Covered"],
			["神秘区域", "Mystery area"],
			["内容保护", "Protected"],
			["稍后揭晓", "Coming soon"],
			["不能说", "Can't tell"],
		],
	},
	festival: {
		count: 20,
		name: "Festival",
		localizedName: "节日",
		palette: {
			accent: "#ffd166",
			background: "#fff2d8",
			ink: "#7f1d1d",
			secondary: "#e63946",
		},
		phrases: [
			["节日快乐", "Happy holidays"],
			["新年快乐", "Happy new year"],
			["生日快乐", "Happy birthday"],
			["假期愉快", "Enjoy the holiday"],
			["好运连连", "Good luck"],
			["万事胜意", "Best wishes"],
			["团圆时刻", "Together time"],
			["庆祝一下", "Celebrate"],
			["礼物时间", "Gift time"],
			["快乐加倍", "Double happiness"],
		],
	},
	ecommerce: {
		count: 20,
		name: "E-commerce",
		localizedName: "电商",
		palette: {
			accent: "#ffb703",
			background: "#fff4cc",
			ink: "#4d2d18",
			secondary: "#fb5607",
		},
		phrases: [
			["新品上市", "New arrival"],
			["限时折扣", "Limited offer"],
			["立即抢购", "Shop now"],
			["超值推荐", "Best value"],
			["爆款", "Best seller"],
			["今日特价", "Today only"],
			["好物分享", "Good find"],
			["包邮", "Free shipping"],
			["库存告急", "Almost gone"],
			["买它", "Add to cart"],
		],
	},
	doodle: {
		count: 20,
		name: "Cute Doodles",
		localizedName: "涂鸦萌趣",
		palette: {
			accent: "#8ac926",
			background: "#f1ffd8",
			ink: "#2f3e22",
			secondary: "#ffca3a",
		},
		phrases: [
			["灵感来了", "Idea"],
			["随手一画", "Quick doodle"],
			["可可爱爱", "So cute"],
			["划重点", "Highlight"],
			["看这里", "Look here"],
			["小提醒", "Reminder"],
			["脑洞时间", "Imagination"],
			["手账一下", "Journal moment"],
			["涂鸦日常", "Doodle diary"],
			["灵光一闪", "Spark"],
		],
	},
	sports: {
		count: 20,
		name: "Sports",
		localizedName: "运动",
		palette: {
			accent: "#00b4d8",
			background: "#dcf8ff",
			ink: "#073b4c",
			secondary: "#ff4d6d",
		},
		phrases: [
			["全力以赴", "Give it all"],
			["运动打卡", "Workout done"],
			["燃起来", "On fire"],
			["坚持一下", "Keep going"],
			["状态在线", "Game on"],
			["冲向终点", "Finish strong"],
			["今日训练", "Training day"],
			["能量满格", "Full power"],
			["漂亮一球", "Great shot"],
			["冠军时刻", "Champion moment"],
		],
	},
	"little-blue": {
		count: 20,
		name: "Little Blue",
		localizedName: "小蓝",
		palette: {
			accent: "#4cc9f0",
			background: "#e4f8ff",
			ink: "#1d3557",
			secondary: "#4361ee",
		},
		phrases: [
			["蓝蓝的心", "Blue heart"],
			["清醒一下", "Refresh"],
			["海风吹来", "Ocean breeze"],
			["心情晴朗", "Clear mood"],
			["慢慢来", "Take it easy"],
			["治愈时刻", "Healing moment"],
			["自由呼吸", "Breathe free"],
			["安静一下", "Quiet time"],
			["今日份蓝", "Blue of the day"],
			["保持清凉", "Stay cool"],
		],
	},
	frames: {
		count: 20,
		name: "Frames",
		localizedName: "边框",
		palette: {
			accent: "#ff9f1c",
			background: "#fff3df",
			ink: "#463f3a",
			secondary: "#2ec4b6",
		},
		phrases: [
			["今日记录", "Today"],
			["高光时刻", "Highlight"],
			["照片日记", "Photo diary"],
			["故事开始", "Story begins"],
			["这一刻", "This moment"],
			["美好收藏", "Good memories"],
			["镜头里", "In frame"],
			["值得纪念", "Worth remembering"],
			["生活切片", "Life snapshot"],
			["画面定格", "Freeze frame"],
		],
	},
	travel: {
		count: 20,
		name: "Travel",
		localizedName: "旅行",
		palette: {
			accent: "#06d6a0",
			background: "#defcf2",
			ink: "#194d44",
			secondary: "#118ab2",
		},
		phrases: [
			["出发去旅行", "Let's travel"],
			["下一站", "Next stop"],
			["在路上", "On the road"],
			["城市漫步", "City walk"],
			["旅行日记", "Travel diary"],
			["看世界", "See the world"],
			["周末出逃", "Weekend escape"],
			["抵达快乐", "Arrived happy"],
			["风景正好", "Great view"],
			["一路顺风", "Bon voyage"],
		],
	},
	handwriting: {
		count: 20,
		name: "Handwriting",
		localizedName: "手写字",
		palette: {
			accent: "#f28482",
			background: "#fff6f1",
			ink: "#3d405b",
			secondary: "#84a59d",
		},
		phrases: [
			["今日份美好", "Today's joy"],
			["保持热爱", "Stay passionate"],
			["慢慢生活", "Live slowly"],
			["好事发生", "Good things happen"],
			["平安喜乐", "Peace and joy"],
			["随心记录", "Write freely"],
			["愿望清单", "Wish list"],
			["写给自己", "Note to self"],
			["闪闪发光", "Keep shining"],
			["明天会更好", "Better tomorrow"],
		],
	},
	romance: {
		count: 20,
		name: "Romance",
		localizedName: "浪漫",
		palette: {
			accent: "#ff70a6",
			background: "#ffe5ec",
			ink: "#5f2942",
			secondary: "#ff9770",
		},
		phrases: [
			["心动时刻", "Heart beat"],
			["喜欢你", "Like you"],
			["甜甜的", "So sweet"],
			["浪漫一下", "Be romantic"],
			["爱意满满", "Full of love"],
			["与你有关", "All about you"],
			["双向奔赴", "Meet halfway"],
			["怦然心动", "Falling for you"],
			["今日约会", "Date day"],
			["永远热恋", "Forever in love"],
		],
	},
	beauty: {
		count: 20,
		name: "Beauty",
		localizedName: "美妆",
		palette: {
			accent: "#e76f9a",
			background: "#fff0f6",
			ink: "#5a3448",
			secondary: "#9b5de5",
		},
		phrases: [
			["今日妆容", "Today's look"],
			["变美日记", "Beauty diary"],
			["好物推荐", "Beauty pick"],
			["显白神器", "Glow up"],
			["氛围感", "The vibe"],
			["精致一下", "Polished"],
			["素颜也美", "Naturally beautiful"],
			["闪耀登场", "Shine on"],
			["护肤时间", "Skin care time"],
			["今日份漂亮", "Beautiful today"],
		],
	},
	faces: {
		count: 20,
		name: "Faces",
		localizedName: "颜表情",
		palette: {
			accent: "#ffbe0b",
			background: "#fff5c2",
			ink: "#403d39",
			secondary: "#fb5607",
		},
		phrases: [
			["嘿嘿", "Hehe"],
			["哇哦", "Wow"],
			["好耶", "Yay"],
			["我懂了", "Got it"],
			["真的吗", "Really"],
			["有点慌", "Nervous"],
			["哈哈哈哈", "Hahaha"],
			["不愧是我", "That's me"],
			["可以的", "Nice"],
			["陷入沉思", "Thinking"],
		],
	},
	"world-cup": {
		count: 30,
		name: "World Cup",
		localizedName: "世界杯",
		palette: {
			accent: "#2a9d8f",
			background: "#e5fff7",
			ink: "#173b35",
			secondary: "#f4a261",
		},
		phrases: [
			["为热爱呐喊", "Cheer for the game"],
			["漂亮进球", "Great goal"],
			["今晚看球", "Match night"],
			["全场沸腾", "Crowd goes wild"],
			["冠军之路", "Road to glory"],
			["加时绝杀", "Last minute winner"],
			["绿茵时刻", "Pitch moment"],
			["一起欢呼", "Cheer together"],
			["决赛见", "See you in the final"],
			["热血开场", "Kickoff"],
		],
	},
	"line-friends": {
		count: 30,
		name: "QCut Line Friends",
		localizedName: "线条伙伴",
		palette: {
			accent: "#f8f9fa",
			background: "#ffffff",
			ink: "#30343f",
			secondary: "#ff6b6b",
		},
		phrases: [
			["早安", "Good morning"],
			["出发啦", "Let's go"],
			["加油呀", "You can do it"],
			["收到", "Got it"],
			["等等我", "Wait for me"],
			["休息一下", "Take a break"],
			["今天真棒", "Great day"],
			["晚安", "Good night"],
			["谢谢你", "Thank you"],
			["一起走", "Together"],
		],
	},
	graphics: {
		count: 30,
		name: "Graphics",
		localizedName: "图形库",
		palette: {
			accent: "#80ed99",
			background: "#f1fff4",
			ink: "#263238",
			secondary: "#57cc99",
		},
		phrases: [
			["重点", "Highlight"],
			["提示", "Tip"],
			["向这里", "This way"],
			["加载中", "Loading"],
			["请注意", "Attention"],
			["下一步", "Next"],
			["完成", "Complete"],
			["新内容", "New"],
			["稍等", "Please wait"],
			["目标", "Target"],
		],
	},
};

function createItems({
	count,
	phrases,
}: {
	count: 20 | 30;
	phrases: readonly PhrasePair[];
}): ThemedStickerDefinition[] {
	return Array.from({ length: count }, (_, index) => {
		const cycle = Math.floor(index / phrases.length);
		const [localizedName, name] = phrases[index % phrases.length];
		const style = STYLES[(index + cycle * 3) % STYLES.length];
		return {
			id: `${style}-${String(index + 1).padStart(2, "0")}`,
			name: `${name} ${STYLE_NAMES[style]}`,
			localizedName,
			style,
			tags: [name, localizedName, STYLE_NAMES[style]],
		};
	});
}

export const THEMED_STICKER_PACKS: readonly ThemedStickerPack[] =
	Object.entries(PACK_SEEDS).map(([id, seed]) => ({
		id: id as ThemedStickerCategoryId,
		name: seed.name,
		localizedName: seed.localizedName,
		palette: seed.palette,
		items: createItems({ count: seed.count, phrases: seed.phrases }),
	}));
