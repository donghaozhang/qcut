import type { CharacterStickerCategoryId } from "./sticker-categories";

export interface CharacterStickerPose {
	id: string;
	name: string;
	localizedName: string;
	tags: readonly string[];
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
