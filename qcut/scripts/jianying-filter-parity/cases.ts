export interface JianyingFilterParityCase {
	category: string;
	fileStem: string;
	lutId: string;
	order: number;
	resourceId: string;
	title: string;
	version: string;
}

/**
 * One current, cached, single-LUT card per Jianying panel category.
 * Payloads stay in Jianying's local cache; this manifest stores identity only.
 */
export const JIANYING_FILTER_PARITY_CASES = [
	{
		order: 1,
		category: "🍉夏日",
		title: "晴朗增蓝",
		resourceId: "7644886476886478116",
		version: "bb3cc0d475a670b037aac8f23813377c",
		lutId:
			"7644886476886478116/bb3cc0d475a670b037aac8f23813377c/filter.cube.vf",
		fileStem: "01-summer-sunny-blue",
	},
	{
		order: 2,
		category: "人像",
		title: "情绪大片",
		resourceId: "7650536865895894282",
		version: "4685932411ccffd67a275d6911f49193",
		lutId:
			"7650536865895894282/4685932411ccffd67a275d6911f49193/filter.cube.vf",
		fileStem: "02-portrait-emotional-blockbuster",
	},
	{
		order: 3,
		category: "风景",
		title: "海边大片",
		resourceId: "7633097495257550131",
		version: "271774c4c5e7aca9bf65462ed43114cf",
		lutId:
			"7633097495257550131/271774c4c5e7aca9bf65462ed43114cf/filter.cube.vf",
		fileStem: "03-landscape-seaside-blockbuster",
	},
	{
		order: 4,
		category: "美食",
		title: "通透暖食",
		resourceId: "7409674549467352374",
		version: "cad4cbe7d4bc4b96a84ff02b53733227",
		lutId:
			"7409674549467352374/cad4cbe7d4bc4b96a84ff02b53733227/filter.cube.vf",
		fileStem: "04-food-transparent-warm",
	},
	{
		order: 5,
		category: "相机模拟",
		title: "富士XT5",
		resourceId: "7535108076081335606",
		version: "45f9dc8539a89f9126776e4656741c1e",
		lutId:
			"7535108076081335606/45f9dc8539a89f9126776e4656741c1e/filter.cube.vf",
		fileStem: "05-camera-fuji-xt5",
	},
	{
		order: 6,
		category: "最新",
		title: "电影境遇",
		resourceId: "7611777721500306723",
		version: "cbfb00635fd223ddb16f9b46ac9f63a9",
		lutId: "7611777721500306723/cbfb00635fd223ddb16f9b46ac9f63a9/filter.3dl.vf",
		fileStem: "06-latest-cinematic-encounter",
	},
	{
		order: 7,
		category: "夜景",
		title: "暮色蓝调",
		resourceId: "7618993343128669486",
		version: "a20980a8e5fd0fb43448f72751542de8",
		lutId:
			"7618993343128669486/a20980a8e5fd0fb43448f72751542de8/filter.cube.vf",
		fileStem: "07-night-twilight-blue",
	},
	{
		order: 8,
		category: "影视级",
		title: "暗蓝电影",
		resourceId: "7596691154008132915",
		version: "9c176d06f4f1a394a3f3254662e77423",
		lutId:
			"7596691154008132915/9c176d06f4f1a394a3f3254662e77423/filter.cube.vf",
		fileStem: "08-cinematic-dark-blue-film",
	},
	{
		order: 9,
		category: "户外",
		title: "雨空",
		resourceId: "7196917591909109052",
		version: "d369f9e552965f827bb786f1e071a3bc",
		lutId: "7196917591909109052/d369f9e552965f827bb786f1e071a3bc/filter.cube",
		fileStem: "09-outdoor-rain-sky",
	},
	{
		order: 10,
		category: "风格化",
		title: "黑金大片",
		resourceId: "7621209972352814379",
		version: "524f2d4c82ba28b9509ff043b187e7e3",
		lutId:
			"7621209972352814379/524f2d4c82ba28b9509ff043b187e7e3/filter.cube.vf",
		fileStem: "10-stylized-black-gold",
	},
	{
		order: 11,
		category: "黑白",
		title: "高清黑白",
		resourceId: "7429744855724641545",
		version: "f4d46cb5bca43ef171199ea673d53b00",
		lutId:
			"7429744855724641545/f4d46cb5bca43ef171199ea673d53b00/filter.cube.vf",
		fileStem: "11-monochrome-hd-black-white",
	},
	{
		order: 12,
		category: "高清",
		title: "高清修复",
		resourceId: "7471501728546966835",
		version: "b3b6060fd2f78aef5791c5e6f2b142b5",
		lutId:
			"7471501728546966835/b3b6060fd2f78aef5791c5e6f2b142b5/filter.cube.vf",
		fileStem: "12-hd-restoration",
	},
	{
		order: 13,
		category: "复古胶片",
		title: "旧时光帧",
		resourceId: "7632707882093382974",
		version: "ead13f88abfc7a3c6d2cd9560bb77254",
		lutId:
			"7632707882093382974/ead13f88abfc7a3c6d2cd9560bb77254/filter.cube.vf",
		fileStem: "13-film-old-time-frame",
	},
	{
		order: 14,
		category: "基础",
		title: "净白",
		resourceId: "7127667352782572807",
		version: "c13995808d8fbfdf9ed2b9f2873dfea7",
		lutId:
			"7127667352782572807/c13995808d8fbfdf9ed2b9f2873dfea7/filter1.3dl.vf",
		fileStem: "14-basic-clean-white",
	},
	{
		order: 15,
		category: "室内",
		title: "静谧暗调",
		resourceId: "7630501558370733321",
		version: "32893a4130581511f99ca8d1db4b258a",
		lutId:
			"7630501558370733321/32893a4130581511f99ca8d1db4b258a/filter.cube.vf",
		fileStem: "15-indoor-quiet-dark",
	},
] as const satisfies JianyingFilterParityCase[];
