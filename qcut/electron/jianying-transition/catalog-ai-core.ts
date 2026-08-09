import { defineJianyingCategory } from "./catalog-factory.js";

const aiOneTake = defineJianyingCategory({
	group: "ai-one-take",
	sources: [
		{
			localizedName: "360运镜",
			resourceId: "7639308680638270783",
			metadataMd5: "08e441ae1254fb62d76494f7f2a917d6",
			defaultDuration: 3,
			overlap: true,
			access: "vip",
		},
		{
			localizedName: "3D环绕运镜",
			resourceId: "7546125671714639131",
			metadataMd5: "b4949106dd6bdafc68cc901bfe650d3a",
			defaultDuration: 3,
			overlap: true,
			access: "vip",
		},
		{
			localizedName: "财神到",
			resourceId: "7604816820947799347",
			metadataMd5: "c1605a76fd51044d3414f9c2a0c715d6",
			defaultDuration: 3,
			overlap: true,
			access: "vip",
		},
		{
			localizedName: "穿行飞跃",
			resourceId: "7656750087137201462",
			metadataMd5: "58fe5c4535086e9229c5b386fa6b7348",
			defaultDuration: 3,
			overlap: true,
			access: "vip",
		},
		{
			localizedName: "叠化",
			resourceId: "7546450297770528050",
			metadataMd5: "6c208b91e3032a11df04091378ca98c4",
			defaultDuration: 3,
			overlap: true,
			access: "vip",
		},
	],
});

const dissolve = defineJianyingCategory({
	group: "dissolve",
	sources: [
		{
			localizedName: "叠加",
			resourceId: "6914112332205396488",
			metadataMd5: "e663d3eadda5e233b48be9e128d1738a",
			defaultDuration: 1,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "叠化",
			resourceId: "6724845717472416269",
			metadataMd5: "33d3a1ad16e89a4e2c9b6d45e3ec7aa1",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "画笔擦除",
			resourceId: "6789846828788486664",
			metadataMd5: "8634ee5192f399190a32145c4fe33cfb",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "渐变擦除",
			resourceId: "6919369138800431629",
			metadataMd5: "f908803f3a9e5ff8e745b71076bdfa89",
			defaultDuration: 1,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "色彩溶解",
			resourceId: "6724846004274729480",
			metadataMd5: "becf45fadb9beec3c72e995cd2e5642b",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
	],
});

const split = defineJianyingCategory({
	group: "split",
	sources: [
		{
			localizedName: "分割",
			resourceId: "6968372308419285540",
			metadataMd5: "ca45695f29bacf2dc29a6eb959e9e968",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "分割 II",
			resourceId: "6969782622868214302",
			metadataMd5: "5ba1cb89bcf4a0898f86494864348e13",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "分割 III",
			resourceId: "6969793843403166215",
			metadataMd5: "942fd71d67ca576384b2cd068157ca45",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "分割 IV",
			resourceId: "6969793934356648455",
			metadataMd5: "62d08c08542fe62e6a8429f9501e76fa",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
		{
			localizedName: "横向分割",
			resourceId: "7083771238564237861",
			metadataMd5: "5a75a8bcd1dc5ec5be04fd36a0198f21",
			defaultDuration: 0.5,
			overlap: true,
			access: "free",
		},
	],
});

export const JIANYING_AI_CORE_TRANSITIONS = [
	...aiOneTake,
	...dissolve,
	...split,
];
