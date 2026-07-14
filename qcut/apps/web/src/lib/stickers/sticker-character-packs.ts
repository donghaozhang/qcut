import type { CharacterStickerCategoryId } from "./sticker-categories";

export interface CharacterStickerPose {
	id: string;
	name: string;
	localizedName: string;
	tags: readonly string[];
	message?: string;
}

export interface CharacterStickerPalette {
	accent: string;
	body: string;
	inner: string;
	outline: string;
}

export interface CharacterStickerPack {
	id: CharacterStickerCategoryId;
	name: string;
	localizedName: string;
	species: "bear" | "mouse" | "rabbit";
	palette: CharacterStickerPalette;
	poses: readonly CharacterStickerPose[];
}

const CHARACTER_POSES = [
	{ id: "happy", name: "Happy", localizedName: "开心", tags: ["smile"] },
	{ id: "love", name: "In love", localizedName: "心动", tags: ["heart"] },
	{ id: "wave", name: "Hello", localizedName: "打招呼", tags: ["hello"] },
	{ id: "cheer", name: "Cheer", localizedName: "加油", tags: ["celebrate"] },
	{ id: "sleepy", name: "Sleepy", localizedName: "困困", tags: ["sleep"] },
	{ id: "surprised", name: "Surprised", localizedName: "惊讶", tags: ["wow"] },
	{ id: "angry", name: "Angry", localizedName: "生气", tags: ["mad"] },
	{ id: "cry", name: "Crying", localizedName: "哭哭", tags: ["sad"] },
	{ id: "snack", name: "Snack time", localizedName: "吃点心", tags: ["food"] },
	{ id: "selfie", name: "Selfie", localizedName: "自拍", tags: ["camera"] },
	{
		id: "thumbs-up",
		name: "Thumbs up",
		localizedName: "点赞",
		tags: ["like", "approve"],
		message: "真棒",
	},
	{
		id: "thank-you",
		name: "Thank you",
		localizedName: "谢谢",
		tags: ["thanks", "grateful"],
		message: "谢谢你",
	},
	{
		id: "good-luck",
		name: "Good luck",
		localizedName: "好运",
		tags: ["luck", "wish"],
		message: "好运来",
	},
	{
		id: "busy",
		name: "Busy",
		localizedName: "忙碌中",
		tags: ["busy", "work"],
		message: "忙碌中",
	},
	{
		id: "confused",
		name: "Confused",
		localizedName: "疑惑",
		tags: ["question", "thinking"],
		message: "嗯？",
	},
	{
		id: "shy",
		name: "Shy",
		localizedName: "害羞",
		tags: ["blush", "bashful"],
	},
	{
		id: "dance",
		name: "Dance",
		localizedName: "跳舞",
		tags: ["dance", "party"],
		message: "摇摆",
	},
	{
		id: "music",
		name: "Music",
		localizedName: "听音乐",
		tags: ["music", "headphones"],
	},
	{
		id: "working",
		name: "Working",
		localizedName: "工作中",
		tags: ["laptop", "work"],
		message: "专注中",
	},
	{
		id: "coffee",
		name: "Coffee break",
		localizedName: "喝一杯",
		tags: ["coffee", "break"],
	},
	{
		id: "gift",
		name: "A gift",
		localizedName: "送你礼物",
		tags: ["gift", "present"],
		message: "送给你",
	},
	{
		id: "birthday",
		name: "Birthday",
		localizedName: "生日快乐",
		tags: ["birthday", "cake"],
		message: "生日快乐",
	},
	{
		id: "rainy",
		name: "Rainy day",
		localizedName: "下雨啦",
		tags: ["rain", "umbrella"],
		message: "记得带伞",
	},
	{
		id: "sunny",
		name: "Sunny day",
		localizedName: "晴天",
		tags: ["sun", "weather"],
		message: "阳光正好",
	},
	{
		id: "cool",
		name: "So cool",
		localizedName: "酷",
		tags: ["cool", "sunglasses"],
		message: "太酷了",
	},
	{
		id: "okay",
		name: "Okay",
		localizedName: "收到",
		tags: ["okay", "confirm"],
		message: "收到",
	},
	{
		id: "no",
		name: "No",
		localizedName: "不可以",
		tags: ["no", "stop"],
		message: "不可以",
	},
	{
		id: "wait",
		name: "Wait",
		localizedName: "等等我",
		tags: ["wait", "hold"],
		message: "等等我",
	},
	{
		id: "hungry",
		name: "Hungry",
		localizedName: "饿了",
		tags: ["hungry", "food"],
		message: "开饭啦",
	},
	{
		id: "rest",
		name: "Take a break",
		localizedName: "休息一下",
		tags: ["rest", "relax"],
		message: "休息一下",
	},
] as const satisfies readonly CharacterStickerPose[];

export const CHARACTER_STICKER_PACKS = [
	{
		id: "pink-rabbit",
		name: "Pink Rabbit",
		localizedName: "粉红兔子",
		species: "rabbit",
		palette: {
			accent: "#ff5f9b",
			body: "#f7a8c8",
			inner: "#ffd8e8",
			outline: "#63384a",
		},
		poses: CHARACTER_POSES,
	},
	{
		id: "milk-tea-mouse",
		name: "Milk Tea Mouse",
		localizedName: "奶茶鼠",
		species: "mouse",
		palette: {
			accent: "#b77846",
			body: "#c99a74",
			inner: "#f3d2b7",
			outline: "#57392d",
		},
		poses: CHARACTER_POSES,
	},
	{
		id: "butter-bear",
		name: "Butter Bear",
		localizedName: "黄油小熊",
		species: "bear",
		palette: {
			accent: "#f2a93b",
			body: "#f4cf68",
			inner: "#ffe8a3",
			outline: "#674a23",
		},
		poses: CHARACTER_POSES,
	},
] as const satisfies readonly CharacterStickerPack[];
