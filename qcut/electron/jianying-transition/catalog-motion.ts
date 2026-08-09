import { defineJianyingCategory } from "./catalog-factory.js";

const slideshow = defineJianyingCategory({
	group: "slideshow",
	sources: [
		{
			localizedName: "爱心",
			resourceId: "6748289440130535947",
			metadataMd5: "dc112fea855be02c22c4e7f542fd8985",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "百叶窗",
			resourceId: "6789847331060584974",
			metadataMd5: "ec2ef435d94438cbcea7eb3c1e324fed",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "窗格",
			resourceId: "6747989545448378888",
			metadataMd5: "4c9bedfe2f757bac18893935806c4d0e",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "弹跳",
			resourceId: "6747865141120864779",
			metadataMd5: "cc56bf3edc364c10f78b89ea0a45ce3f",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "倒影",
			resourceId: "6748313807031898627",
			metadataMd5: "117d1db8f04a9e0e5fc3cc78c7dbd729",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "翻篇",
			resourceId: "7034446419641504264",
			metadataMd5: "e0a1857d0e3757209caa3a75141df8d2",
			defaultDuration: 1.3,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "风车",
			resourceId: "6748286529921094157",
			metadataMd5: "f17a5fe38057e4238deac4c59e91f109",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
	],
});

const shooting = defineJianyingCategory({
	group: "shooting",
	sources: [
		{
			localizedName: "复古放映",
			resourceId: "7237068402945167909",
			metadataMd5: "197d07433bdbd3c515b3b08d3db0f55c",
			defaultDuration: 0.6,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "快门",
			resourceId: "6882983860615778823",
			metadataMd5: "2df569fefb5004c041af5509c10d6c53",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "拍摄器",
			resourceId: "7100849808784495135",
			metadataMd5: "43b2d53edfb7885dd118cc320b2ca195",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "眨眼",
			resourceId: "6864867302936941064",
			metadataMd5: "cdda6cbc8ec67b991ed70e8c226d2de6",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "2024回忆流",
			resourceId: "7448898555617481225",
			metadataMd5: "e21c31c4d68bb535ab10905af32a8486",
			defaultDuration: 2,
			overlap: true,
			access: "vip",
		},
	],
});

const camera = defineJianyingCategory({
	group: "camera",
	sources: [
		{
			localizedName: "3D空间",
			resourceId: "7049979667406656014",
			metadataMd5: "aaecc038f6543411f601608fc5539f0b",
			defaultDuration: 1.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "穿越 III",
			resourceId: "7341295618863665690",
			metadataMd5: "6d6fa95fe1414d4b4a45db9ddec0ee9b",
			defaultDuration: 0.8,
			overlap: true,
			access: "vip",
		},
		{
			localizedName: "抖动",
			resourceId: "7252544245444121148",
			metadataMd5: "1cc13be9019f8321a25836fcd1c17c04",
			defaultDuration: 0.8,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "放射",
			resourceId: "6724239584663704071",
			metadataMd5: "06cc8d49c558d57e21207f68a6a7dbc0",
			defaultDuration: 1,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "吸入",
			resourceId: "7246288124110705209",
			metadataMd5: "fb75bf696e19a04795ae9a06b43a09f2",
			defaultDuration: 1,
			overlap: true,
			access: "free",
		},
	],
});

export const JIANYING_MOTION_TRANSITIONS = [
	...slideshow,
	...shooting,
	...camera,
];
