import type { JianyingTextRuntimeReference } from "../jianying-text-runtime-contract.js";

export const JIANYING_SCRIPT_INFO_STICKER_CORPUS = [
	{
		resourceId: "7205562420020989240",
		packageHash: "ab23aef8b7e866ec2d83c6122dbfe307",
	},
	{
		resourceId: "7212143654293474621",
		packageHash: "11b5a72bbfe67e0b2c978c8e2a01bdde",
	},
	{
		resourceId: "7212166583127379258",
		packageHash: "176afb95160716dbb2b6497fa2afd5dd",
	},
	{
		resourceId: "7215810821769710885",
		packageHash: "70df30c1ed4e223ea3551903b8ff68ac",
	},
	{
		resourceId: "7224099290560384313",
		packageHash: "ee581a8fc0338a25c756e8c3f91344c1",
	},
	{
		resourceId: "7248878428206697785",
		packageHash: "659b4baaae4526fc84f11a18be61cb16",
	},
	{
		resourceId: "7269681453200395556",
		packageHash: "6543f9565ac93f5bc88d49e4a6a6ecd2",
	},
	{
		resourceId: "7270665371663813899",
		packageHash: "52a7db096c4d0faa9c62511c0dc0a1fb",
	},
	{
		resourceId: "7280819425605930279",
		packageHash: "f46ef1dfceca013a755b566632c150bf",
	},
	{
		resourceId: "7280820987438992676",
		packageHash: "1b6aac0b6bffd218cd19a002ab41f4c5",
	},
	{
		resourceId: "7301313855429414154",
		packageHash: "2d5190048b4ddd5b3cb419d24ab9abfb",
	},
	{
		resourceId: "7301343413947927846",
		packageHash: "b9a66c71c36bf24a8a6c72f04a9aaf4f",
	},
	{
		resourceId: "7302280874177940770",
		packageHash: "680cface0c8e4ed828f60dd3837c7887",
	},
	{
		resourceId: "7328639616670649634",
		packageHash: "22192237621ba88a20b84176ddb9d22a",
	},
	{
		resourceId: "7351043734277983528",
		packageHash: "64a8ad28e72fa8082da72c21ca7184ff",
	},
	{
		resourceId: "7371127400874151218",
		packageHash: "33c6edecddbcac81bed3400a754ca3a5",
	},
	{
		resourceId: "7371383933428108582",
		packageHash: "46f25949f06c2c69472dc423ee518eba",
	},
	{
		resourceId: "7380751845846797568",
		packageHash: "76b03257f1bbf26facac3ef5d6e5b64e",
	},
	{
		resourceId: "7390774568211844404",
		packageHash: "90757d66b0cf41319c46d7d9e81e68f5",
	},
	{
		resourceId: "7393022390638251303",
		packageHash: "94cb92fb1bfe59c51671c82c6295d51f",
	},
	{
		resourceId: "7410240535752903990",
		packageHash: "39b4b7c4e070ede70ae25ab264c842d4",
	},
	{
		resourceId: "7410613212141341989",
		packageHash: "e02916670bbed8b5edee8f6d04bd84ac",
	},
	{
		resourceId: "7413397177612995877",
		packageHash: "06e969829604e244f844042ff416f588",
	},
	{
		resourceId: "7483505465482267928",
		packageHash: "7b49d52814ca8ec8d8a716dab5b7f4ff",
	},
	{
		resourceId: "7599874183467699518",
		packageHash: "ec066c208559c767bbe9bddf6eca3a97",
	},
] as const;

export const JIANYING_SCRIPT_INFO_STICKER_STRESS_TEXT =
	"这是一个很长的QCut花字兼容验证😀Mixed123\n第二行é🇦🇺";

export function createJianyingScriptInfoStickerReference({
	resourceId,
	packageHash,
}: {
	resourceId: string;
	packageHash: string;
}): JianyingTextRuntimeReference {
	return {
		schemaVersion: 1,
		source: "jianying-cache",
		packageKind: "ScriptInfoSticker",
		resourceId,
		packageHash,
		editMode: "runtime-with-preload-fallback",
		slotMapping: "line-to-widget",
		timeMapping: "stretch",
		templateDuration: 3,
	};
}
