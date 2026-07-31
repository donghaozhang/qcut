import type { LocalStickerCatalog } from "./local-sticker-manifest";

export function buildLegacyLocalStickerCatalog({
	filePath,
}: {
	filePath: string;
}): LocalStickerCatalog {
	return {
		version: 1,
		categories: [
			{
				id: "legacy-reference",
				label: "本机参考",
				sourcePanel: "旧版单文件配置",
				items: [
					{
						id: "hand-drawn-curved-arrow",
						displayName: "手绘弯箭头",
						fileName: "hand-drawn-curved-arrow.png",
						filePath,
						mimeType: "image/png",
						sourceKind: "atlas-animation",
						playback: {
							kind: "animated",
							frameCount: 4,
							frameRate: 5,
							cycleDuration: 0.8,
							loop: true,
						},
					},
				],
			},
		],
	};
}
