/** Public metadata only; no Jianying binaries or effect packages are bundled. */
export const JIANYING_TRANSITION_GROUPS = [
	{ id: "all", label: "全部" },
	{ id: "spatial-motion", label: "空间运镜" },
	{ id: "graphic-masks", label: "图形遮罩" },
	{ id: "light-blend", label: "光效叠加" },
	{ id: "glitch-atmosphere", label: "故障氛围" },
] as const;

export type JianyingTransitionGroup = Exclude<
	(typeof JIANYING_TRANSITION_GROUPS)[number]["id"],
	"all"
>;

export interface JianyingTransitionDefinition {
	id: string;
	name: string;
	localizedName: string;
	resourceId: string;
	metadataMd5: string;
	defaultDuration: number;
	overlap: boolean;
	group: JianyingTransitionGroup;
	family: string;
	preview: {
		type:
			| "dissolve"
			| "fade"
			| "slide"
			| "wipe"
			| "push"
			| "zoom"
			| "whip"
			| "flash"
			| "light"
			| "glitch"
			| "shake"
			| "motion-blur"
			| "pixel"
			| "ripple"
			| "particle"
			| "glass"
			| "page"
			| "texture"
			| "flare";
		clipType:
			| "dissolve"
			| "fade-white"
			| "slide"
			| "wipe"
			| "zoom-blur"
			| "zoom-in-blur"
			| "flash"
			| "rgb-glitch"
			| "shake"
			| "glass-refraction"
			| "page-flip"
			| "texture-mask"
			| "vortex";
		direction?: "left" | "right" | "up" | "down";
		maskShape?: "blinds" | "heart" | "ink" | "fog" | "triptych";
		tuning?: {
			intensity?: number;
			frequency?: number;
			tint?: string;
		};
	};
}

export const JIANYING_TRANSITIONS = [
	{
		id: "jianying-local-3d-space",
		name: "3D Space",
		localizedName: "3D空间",
		resourceId: "7049979667406656014",
		metadataMd5: "aaecc038f6543411f601608fc5539f0b",
		defaultDuration: 1.5,
		overlap: true,
		group: "spatial-motion",
		family: "multi-pass-glsl",
		preview: {
			type: "glass",
			clipType: "glass-refraction",
			tuning: { intensity: 1.25 },
		},
	},
	{
		id: "jianying-local-heart",
		name: "Heart",
		localizedName: "爱心",
		resourceId: "6748289440130535947",
		metadataMd5: "dc112fea855be02c22c4e7f542fd8985",
		defaultDuration: 0.5,
		overlap: true,
		group: "graphic-masks",
		family: "simple-glsl",
		preview: {
			type: "texture",
			clipType: "texture-mask",
			maskShape: "heart",
		},
	},
	{
		id: "jianying-local-white-flash",
		name: "White Flash",
		localizedName: "白光快闪",
		resourceId: "7343136487182963211",
		metadataMd5: "313a6e1f1ddce5b54d27af4b740466db",
		defaultDuration: 0.4,
		overlap: true,
		group: "light-blend",
		family: "sequence-composite",
		preview: {
			type: "flash",
			clipType: "flash",
			tuning: { intensity: 1.4, tint: "#ffffff" },
		},
	},
	{
		id: "jianying-local-white-ink",
		name: "White Ink Bloom",
		localizedName: "白色墨花",
		resourceId: "6858191556055142919",
		metadataMd5: "f646dad0fdf213568600b875c7149f90",
		defaultDuration: 0.5,
		overlap: false,
		group: "graphic-masks",
		family: "sequence-composite",
		preview: {
			type: "texture",
			clipType: "texture-mask",
			maskShape: "ink",
		},
	},
	{
		id: "jianying-local-blinds",
		name: "Blinds",
		localizedName: "百叶窗",
		resourceId: "6789847331060584974",
		metadataMd5: "ec2ef435d94438cbcea7eb3c1e324fed",
		defaultDuration: 0.5,
		overlap: true,
		group: "graphic-masks",
		family: "sequence-composite",
		preview: {
			type: "texture",
			clipType: "texture-mask",
			maskShape: "blinds",
		},
	},
	{
		id: "jianying-local-dots-right",
		name: "Dots Right",
		localizedName: "波点向右",
		resourceId: "6858191541706428941",
		metadataMd5: "035a364b803f4e0ee60508b9094e79ad",
		defaultDuration: 0.5,
		overlap: false,
		group: "graphic-masks",
		family: "sequence-composite",
		preview: { type: "wipe", clipType: "wipe", direction: "right" },
	},
	{
		id: "jianying-local-window-grid",
		name: "Window Grid",
		localizedName: "窗格",
		resourceId: "6747989545448378888",
		metadataMd5: "4c9bedfe2f757bac18893935806c4d0e",
		defaultDuration: 0.5,
		overlap: true,
		group: "graphic-masks",
		family: "simple-glsl",
		preview: {
			type: "texture",
			clipType: "texture-mask",
			maskShape: "triptych",
		},
	},
	{
		id: "jianying-local-bounce",
		name: "Bounce",
		localizedName: "弹跳",
		resourceId: "6747865141120864779",
		metadataMd5: "cc56bf3edc364c10f78b89ea0a45ce3f",
		defaultDuration: 0.5,
		overlap: true,
		group: "spatial-motion",
		family: "simple-glsl",
		preview: {
			type: "shake",
			clipType: "shake",
			tuning: { intensity: 0.7, frequency: 2.4 },
		},
	},
	{
		id: "jianying-local-reflection",
		name: "Reflection",
		localizedName: "倒影",
		resourceId: "6748313807031898627",
		metadataMd5: "117d1db8f04a9e0e5fc3cc78c7dbd729",
		defaultDuration: 0.5,
		overlap: true,
		group: "spatial-motion",
		family: "simple-glsl",
		preview: { type: "page", clipType: "page-flip" },
	},
	{
		id: "jianying-local-tv-glitch-1",
		name: "TV Glitch I",
		localizedName: "电视故障 I",
		resourceId: "7046293801123451405",
		metadataMd5: "c9c98b374154a9b620eb320299f2c7d1",
		defaultDuration: 1.6,
		overlap: true,
		group: "glitch-atmosphere",
		family: "sequence-composite",
		preview: {
			type: "glitch",
			clipType: "rgb-glitch",
			tuning: { intensity: 1.5, frequency: 2.5 },
		},
	},
	{
		id: "jianying-local-overlay",
		name: "Overlay",
		localizedName: "叠加",
		resourceId: "6914112332205396488",
		metadataMd5: "e663d3eadda5e233b48be9e128d1738a",
		defaultDuration: 1,
		overlap: true,
		group: "light-blend",
		family: "simple-glsl",
		preview: { type: "dissolve", clipType: "dissolve" },
	},
	{
		id: "jianying-local-anime-vortex",
		name: "Anime Vortex",
		localizedName: "动漫漩涡",
		resourceId: "6858191448827761160",
		metadataMd5: "3154a45bf721c590246d3d8b512c4865",
		defaultDuration: 0.5,
		overlap: false,
		group: "graphic-masks",
		family: "sequence-composite",
		preview: { type: "ripple", clipType: "vortex" },
	},
	{
		id: "jianying-local-shake",
		name: "Shake",
		localizedName: "抖动",
		resourceId: "7252544245444121148",
		metadataMd5: "1cc13be9019f8321a25836fcd1c17c04",
		defaultDuration: 0.8,
		overlap: true,
		group: "spatial-motion",
		family: "lua-pipeline",
		preview: {
			type: "shake",
			clipType: "shake",
			tuning: { intensity: 1.5, frequency: 2 },
		},
	},
	{
		id: "jianying-local-page-turn",
		name: "Page Turn",
		localizedName: "翻篇",
		resourceId: "7034446419641504264",
		metadataMd5: "e0a1857d0e3757209caa3a75141df8d2",
		defaultDuration: 1.3,
		overlap: true,
		group: "spatial-motion",
		family: "simple-glsl",
		preview: { type: "page", clipType: "page-flip" },
	},
	{
		id: "jianying-local-white-bloom",
		name: "White Bloom",
		localizedName: "泛白",
		resourceId: "6949828109663212045",
		metadataMd5: "f75ae1b9b8a905737a9124e1c2373798",
		defaultDuration: 1,
		overlap: false,
		group: "light-blend",
		family: "single-input-glsl",
		preview: { type: "fade", clipType: "fade-white" },
	},
	{
		id: "jianying-local-radial",
		name: "Radial",
		localizedName: "放射",
		resourceId: "6724239584663704071",
		metadataMd5: "06cc8d49c558d57e21207f68a6a7dbc0",
		defaultDuration: 1,
		overlap: true,
		group: "light-blend",
		family: "simple-glsl",
		preview: {
			type: "zoom",
			clipType: "zoom-blur",
			tuning: { intensity: 1.35 },
		},
	},
	{
		id: "jianying-local-pinwheel",
		name: "Pinwheel",
		localizedName: "风车",
		resourceId: "6748286529921094157",
		metadataMd5: "f17a5fe38057e4238deac4c59e91f109",
		defaultDuration: 0.5,
		overlap: true,
		group: "graphic-masks",
		family: "simple-glsl",
		preview: { type: "ripple", clipType: "vortex" },
	},
	{
		id: "jianying-local-traverse-3",
		name: "Traverse III",
		localizedName: "穿越 III",
		resourceId: "7341295618863665690",
		metadataMd5: "6d6fa95fe1414d4b4a45db9ddec0ee9b",
		defaultDuration: 0.8,
		overlap: true,
		group: "spatial-motion",
		family: "sequence-composite",
		preview: {
			type: "zoom",
			clipType: "zoom-in-blur",
			tuning: { intensity: 1.6 },
		},
	},
	{
		id: "jianying-local-suction",
		name: "Suction",
		localizedName: "吸入",
		resourceId: "7246288124110705209",
		metadataMd5: "fb75bf696e19a04795ae9a06b43a09f2",
		defaultDuration: 1,
		overlap: true,
		group: "spatial-motion",
		family: "multi-feature-lua",
		preview: {
			type: "zoom",
			clipType: "zoom-in-blur",
			tuning: { intensity: 1.8 },
		},
	},
	{
		id: "jianying-local-smoke",
		name: "Smoke Transition",
		localizedName: "烟雾转场",
		resourceId: "7450031574923350555",
		metadataMd5: "67dc647cf7b1c45ada91d32bebc2bde7",
		defaultDuration: 1.5,
		overlap: true,
		group: "glitch-atmosphere",
		family: "lumi-ae",
		preview: {
			type: "texture",
			clipType: "texture-mask",
			maskShape: "fog",
		},
	},
] as const satisfies readonly JianyingTransitionDefinition[];

export type JianyingTransitionId = (typeof JIANYING_TRANSITIONS)[number]["id"];
export type JianyingTransitionCatalogEntry =
	(typeof JIANYING_TRANSITIONS)[number];

export function resolveJianyingTransition({
	value,
}: {
	value: string;
}): JianyingTransitionCatalogEntry | undefined {
	const normalized = value.trim().toLocaleLowerCase();
	return JIANYING_TRANSITIONS.find((transition) =>
		[
			transition.id,
			transition.name,
			transition.localizedName,
			transition.resourceId,
		].some((candidate) => candidate.toLocaleLowerCase() === normalized)
	);
}
