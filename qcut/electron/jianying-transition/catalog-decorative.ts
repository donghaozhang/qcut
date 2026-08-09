import { defineJianyingCategory } from "./catalog-factory.js";

const emoji = defineJianyingCategory({
	group: "emoji",
	sources: [
		{
			localizedName: "冲鸭",
			resourceId: "7030714241359286821",
			metadataMd5: "6ea783a70e60bba7a587dfae96788980",
			defaultDuration: 0.5,
			overlap: false,
			access: "free",
		},
		{
			localizedName: "打板转场 I",
			resourceId: "7028143517570437668",
			metadataMd5: "d69cfd80d0da72baeb063c7ec4f50e1b",
			defaultDuration: 4,
			overlap: false,
			access: "free",
		},
		{
			localizedName: "打板转场 II",
			resourceId: "7029592645538157086",
			metadataMd5: "98c9d48fac86d44334cdb16c69ebf313",
			defaultDuration: 4,
			overlap: false,
			access: "free",
		},
		{
			localizedName: "弹幕转场",
			resourceId: "7028877116259176974",
			metadataMd5: "9887194858b7c60db14764be0e680777",
			defaultDuration: 4,
			overlap: false,
			access: "free",
		},
		{
			localizedName: "气泡转场",
			resourceId: "7028880945671311903",
			metadataMd5: "eb20503928778063fb4a53f271234cf3",
			defaultDuration: 4,
			overlap: false,
			access: "free",
		},
	],
});

const natural = defineJianyingCategory({
	group: "natural",
	sources: [
		{
			localizedName: "白色烟雾",
			resourceId: "6885646856672514567",
			metadataMd5: "3c1d023578e7472d06e5a8e6a92d432d",
			defaultDuration: 0.5,
			overlap: false,
			access: "free",
		},
		{
			localizedName: "冰雪结晶",
			resourceId: "6919369228701143559",
			metadataMd5: "5a1f3a232329bbe1a00cbab60f7c8275",
			defaultDuration: 0.5,
			overlap: false,
			access: "free",
		},
		{
			localizedName: "黑色烟雾",
			resourceId: "6885647017452769805",
			metadataMd5: "078356c51ce55976e3a75f69eac235d9",
			defaultDuration: 0.5,
			overlap: false,
			access: "free",
		},
		{
			localizedName: "雏菊飞过",
			resourceId: "7632270698853027096",
			metadataMd5: "25a8b1618776a92df187727c6b401418",
			defaultDuration: 2.000001,
			overlap: true,
			access: "vip",
		},
		{
			localizedName: "穿林打叶",
			resourceId: "7613236495004192062",
			metadataMd5: "31a0ece80cf1e9505a9e6d2b5781646a",
			defaultDuration: 2.000001,
			overlap: true,
			access: "vip",
		},
	],
});

const variety = defineJianyingCategory({
	group: "variety",
	sources: [
		{
			localizedName: "撕纸拉屏",
			resourceId: "7254847807465460280",
			metadataMd5: "a0bebe3bfbda2d2a4c2ae459127d6491",
			defaultDuration: 0.7,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "爱心气球",
			resourceId: "7267895649599754808",
			metadataMd5: "8a89cd496b3f5a16c64663fc7bcc46d9",
			defaultDuration: 1,
			overlap: true,
			access: "vip",
		},
		{
			localizedName: "安全出口",
			resourceId: "7649756179761188121",
			metadataMd5: "df615b03678ad8db5e0bdb59e8b4d085",
			defaultDuration: 2.000001,
			overlap: true,
			access: "vip",
		},
		{
			localizedName: "报纸拼贴",
			resourceId: "7652288052211010878",
			metadataMd5: "20a372116c0d8ced39315cffbe3d198f",
			defaultDuration: 1.600001,
			overlap: true,
			access: "vip",
		},
		{
			localizedName: "报纸人物",
			resourceId: "7653116013025709374",
			metadataMd5: "56131317705a90b394a5d9993db5eea7",
			defaultDuration: 2.000001,
			overlap: true,
			access: "vip",
		},
	],
});

const mg = defineJianyingCategory({
	group: "mg",
	sources: [
		{
			localizedName: "白色墨花",
			resourceId: "6858191556055142919",
			metadataMd5: "f646dad0fdf213568600b875c7149f90",
			defaultDuration: 0.5,
			overlap: false,
			access: "free",
		},
		{
			localizedName: "波点向右",
			resourceId: "6858191541706428941",
			metadataMd5: "035a364b803f4e0ee60508b9094e79ad",
			defaultDuration: 0.5,
			overlap: false,
			access: "free",
		},
		{
			localizedName: "动漫漩涡",
			resourceId: "6858191448827761160",
			metadataMd5: "3154a45bf721c590246d3d8b512c4865",
			defaultDuration: 0.5,
			overlap: false,
			access: "free",
		},
		{
			localizedName: "动漫火焰",
			resourceId: "6777178765643485709",
			metadataMd5: "d9fed800acc2e13d53c27a250af440f8",
			defaultDuration: 0.5,
			overlap: false,
			access: "free",
		},
		{
			localizedName: "动漫闪电",
			resourceId: "6777178696609436174",
			metadataMd5: "197429be55d26ad48671e8c13d569ab9",
			defaultDuration: 0.5,
			overlap: false,
			access: "free",
		},
	],
});

export const JIANYING_DECORATIVE_TRANSITIONS = [
	...emoji,
	...natural,
	...variety,
	...mg,
];
