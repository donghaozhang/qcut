import { defineJianyingCategory } from "./catalog-factory.js";

const glitch = defineJianyingCategory({
	group: "glitch",
	sources: [
		{
			localizedName: "电视故障 I",
			resourceId: "7046293801123451405",
			metadataMd5: "c9c98b374154a9b620eb320299f2c7d1",
			defaultDuration: 1.6,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "电视故障 II",
			resourceId: "7426974716004486415",
			metadataMd5: "7998b4a6636ad3d57dd879f01db8babb",
			defaultDuration: 1.6,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "故障",
			resourceId: "6725771847444468236",
			metadataMd5: "7db47d922e6f0ba603978ae6484d8ee7",
			defaultDuration: 1,
			overlap: false,
			access: "free",
		},
		{
			localizedName: "故障拼贴",
			resourceId: "7397337004507140618",
			metadataMd5: "f11834850df054beb7db5f009d612be7",
			defaultDuration: 1,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "黑色块",
			resourceId: "6724866346569437710",
			metadataMd5: "65ffc765730416d50ac5cad89385310a",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
	],
});

const light = defineJianyingCategory({
	group: "light",
	sources: [
		{
			localizedName: "白光快闪",
			resourceId: "7343136487182963211",
			metadataMd5: "313a6e1f1ddce5b54d27af4b740466db",
			defaultDuration: 0.4,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "泛白",
			resourceId: "6949828109663212045",
			metadataMd5: "f75ae1b9b8a905737a9124e1c2373798",
			defaultDuration: 1,
			overlap: false,
			access: "free",
		},
		{
			localizedName: "泛光",
			resourceId: "6914112263645303303",
			metadataMd5: "0e989947965e7ab984a36dd9d009536d",
			defaultDuration: 1,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "炫光",
			resourceId: "6726707814028284423",
			metadataMd5: "2f4a8bd71c56b9230b20f04e5d7c4a7d",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "爆闪",
			resourceId: "7255132261584998969",
			metadataMd5: "b7dd33082bccc73aed43bcb8e4396549",
			defaultDuration: 1,
			overlap: true,
			access: "vip",
		},
	],
});

const blur = defineJianyingCategory({
	group: "blur",
	sources: [
		{
			localizedName: "烟雾转场",
			resourceId: "7450031574923350555",
			metadataMd5: "67dc647cf7b1c45ada91d32bebc2bde7",
			defaultDuration: 1.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "横向模糊",
			resourceId: "7450031573958660645",
			metadataMd5: "38f584c24f4383e9d10037ad4ce6fa00",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "粒子",
			resourceId: "6855565313715474952",
			metadataMd5: "a80681afcefe271a2147a54b13175fa7",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "马赛克",
			resourceId: "6724866519022440967",
			metadataMd5: "eed93b26d9cd6296b10d2f5065ee396e",
			defaultDuration: 1,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "模糊",
			resourceId: "6911569618171597320",
			metadataMd5: "71e1c09c0746659ba25526535ccf602e",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
	],
});

const distortion = defineJianyingCategory({
	group: "distortion",
	sources: [
		{
			localizedName: "漩涡",
			resourceId: "6851810799510360583",
			metadataMd5: "76cde1cc07f6044fb1b496a992046460",
			defaultDuration: 1,
			overlap: false,
			access: "free",
		},
		{
			localizedName: "波光置换",
			resourceId: "7645184687723334955",
			metadataMd5: "dfba6e6913189335e94a2b7245b0abf2",
			defaultDuration: 1.530001,
			overlap: true,
			access: "vip",
		},
		{
			localizedName: "横向拉扯",
			resourceId: "7573612999986990382",
			metadataMd5: "9ff6de5783d2f2729e29a7e20bf7dd18",
			defaultDuration: 2,
			overlap: true,
			access: "vip",
		},
		{
			localizedName: "扭转",
			resourceId: "7476375043098873098",
			metadataMd5: "c946f7f4b689603f519bdbac5796d2f0",
			defaultDuration: 0.9333333,
			overlap: true,
			access: "vip",
		},
		{
			localizedName: "色散波纹",
			resourceId: "7385028833356812840",
			metadataMd5: "5edc1db063e9e49375ba312e5ba6157f",
			defaultDuration: 1,
			overlap: true,
			access: "vip",
		},
	],
});

export const JIANYING_EFFECT_TRANSITIONS = [
	...glitch,
	...light,
	...blur,
	...distortion,
];
