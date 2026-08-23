import type { MediaPortraitMakeupCategory } from "../jianying-portrait-adjustment-contract.js";

export interface JianyingPortraitMakeupCardDefinition {
	id: string;
	category: MediaPortraitMakeupCategory;
	titleZh: string;
	titleEn: string;
	resourceId: string;
	version: string;
	parameterKey: string;
	defaultIntensity: number;
	kind: "dynamic" | "standalone";
	thumbnailRelativePath: string;
}

export const JIANYING_PORTRAIT_MAKEUP_CARDS = [
	{
		id: "look-oxygen",
		category: "look",
		titleZh: "氧气感",
		titleEn: "Fresh air",
		resourceId: "7406174119940721935",
		version: "1ec0e8e3d3145339e34dc072b884f235",
		parameterKey: "face_adjust_whole",
		defaultIntensity: 80,
		kind: "standalone",
		thumbnailRelativePath: "AmazingFeature/image/lip/lipClose.png",
	},
	{
		id: "lip-soft-pink",
		category: "lip",
		titleZh: "柔和粉",
		titleEn: "Soft pink",
		resourceId: "7408076694126365992",
		version: "3ff9996e22120348c34b3abbed86712c",
		parameterKey: "face_adjust_lip_yunranColorRHF",
		defaultIntensity: 80,
		kind: "dynamic",
		thumbnailRelativePath: "image/lip/default/lipClose.png",
	},
	{
		id: "lip-coral-nude",
		category: "lip",
		titleZh: "珊瑚裸粉",
		titleEn: "Coral nude",
		resourceId: "7406181389613190435",
		version: "e3ccb34c651dd1b57e6c2fb6532c6990",
		parameterKey: "face_adjust_lip_shanhuluofen",
		defaultIntensity: 60,
		kind: "dynamic",
		thumbnailRelativePath: "image/lip_BlendModeColor/default/lipClose.png",
	},
	{
		id: "blush-baby-pink",
		category: "blush",
		titleZh: "婴儿粉",
		titleEn: "Baby pink",
		resourceId: "7406180986888654120",
		version: "9591fdbc8cdd0806e91ffd334bdd5f7b",
		parameterKey: "face_adjust_blusher_yingerfen",
		defaultIntensity: 40,
		kind: "dynamic",
		thumbnailRelativePath: "image/blusher/blusher.png",
	},
	{
		id: "contour-mixed",
		category: "contour",
		titleZh: "混血",
		titleEn: "Sculpted",
		resourceId: "7406181489412427060",
		version: "6fe23753b9c46a79b6f617c054a3608e",
		parameterKey: "face_adjust_stereo_fajixian",
		defaultIntensity: 65,
		kind: "dynamic",
		thumbnailRelativePath: "image/stereo/stereo.png",
	},
	{
		id: "aegyo-natural",
		category: "aegyo",
		titleZh: "自然",
		titleEn: "Natural",
		resourceId: "7406180908924996879",
		version: "ca0e678b9394dd720b3c04379dfb48a3",
		parameterKey: "face_adjust_eyemazing_ziran",
		defaultIntensity: 60,
		kind: "dynamic",
		thumbnailRelativePath: "image/eyeshadow/default/eyeshadow.png",
	},
	{
		id: "brows-flow",
		category: "brows",
		titleZh: "流畅眉",
		titleEn: "Flowing brows",
		resourceId: "7406174746829737231",
		version: "b6c830cdf68c163cd3dc2139db6b1fee",
		parameterKey: "eyebrow_adjust_BiaoZhun",
		defaultIntensity: 70,
		kind: "standalone",
		thumbnailRelativePath: "AmazingFeature/image/wry_eyebrow_biaozhun.png",
	},
	{
		id: "brows-fluffy",
		category: "brows",
		titleZh: "绒绒眉",
		titleEn: "Fluffy brows",
		resourceId: "7406174643247123746",
		version: "a983387e6a01d830b4c4f9cbc6607628",
		parameterKey: "face_adjust_brow_rongrongmei",
		defaultIntensity: 80,
		kind: "dynamic",
		thumbnailRelativePath: "image/eyebrow/eyebrow.png",
	},
	{
		id: "lashes-natural-ii",
		category: "lashes",
		titleZh: "妈生感 II",
		titleEn: "Natural II",
		resourceId: "7406175199361649920",
		version: "2334785805777457e48251169bf65b10",
		parameterKey: "face_adjust_eyelash_mashengganer",
		defaultIntensity: 80,
		kind: "dynamic",
		thumbnailRelativePath: "image/eyelash/default/eyelash.png",
	},
	{
		id: "eyeliner-natural",
		category: "eyeliner",
		titleZh: "自然",
		titleEn: "Natural",
		resourceId: "7406174938438044943",
		version: "8ae3097fb95ca9006f57856fccd625be",
		parameterKey: "face_adjust_eyeline_ziran",
		defaultIntensity: 60,
		kind: "dynamic",
		thumbnailRelativePath: "image/eyeline/eyeline.png",
	},
	{
		id: "eyeliner-cat",
		category: "eyeliner",
		titleZh: "小野猫",
		titleEn: "Cat eye",
		resourceId: "7406174561663782159",
		version: "743f9d928016a361227154fa946b763b",
		parameterKey: "face_adjust_eyeline_xiaoyemao",
		defaultIntensity: 80,
		kind: "dynamic",
		thumbnailRelativePath: "image/eyeline/eyeline.png",
	},
	{
		id: "eyeshadow-girl-pink",
		category: "eyeshadow",
		titleZh: "少女粉",
		titleEn: "Girl pink",
		resourceId: "7408077631049960744",
		version: "1a234c85160694dd855f9cfe76a81145",
		parameterKey: "face_adjust_eyeshadow_shaonvfen",
		defaultIntensity: 60,
		kind: "dynamic",
		thumbnailRelativePath: "image/eyeshadow/default/eyeshadow.png",
	},
	{
		id: "contacts-natural",
		category: "contacts",
		titleZh: "原生",
		titleEn: "Natural",
		resourceId: "7406181207551069440",
		version: "8c4a50efd7b603235abbb1b315704e8d",
		parameterKey: "face_adjust_pupil_yuansheng",
		defaultIntensity: 80,
		kind: "dynamic",
		thumbnailRelativePath: "image/pupil/pupil_normal.png",
	},
	{
		id: "highlight-sweetheart",
		category: "highlight",
		titleZh: "美式甜心",
		titleEn: "Sweetheart",
		resourceId: "7406175318072888576",
		version: "1fb1a0dfaaeadb313f4b3d3b96eaae0c",
		parameterKey: "face_adjust_highlight_meishitianxin",
		defaultIntensity: 60,
		kind: "dynamic",
		thumbnailRelativePath: "image/highlight3d/highlight_khgp_1655297390.png",
	},
	{
		id: "freckles-sunburn",
		category: "freckles",
		titleZh: "晒伤",
		titleEn: "Sun kissed",
		resourceId: "7406174488410262784",
		version: "547119e40339154d17eb93c62ee9433b",
		parameterKey: "face_adjust_mask_jipusaiqueban",
		defaultIntensity: 70,
		kind: "dynamic",
		thumbnailRelativePath: "image/mask3d/freckles.png",
	},
] as const satisfies readonly JianyingPortraitMakeupCardDefinition[];

const MAKEUP_CARD_BY_ID = new Map<string, JianyingPortraitMakeupCardDefinition>(
	JIANYING_PORTRAIT_MAKEUP_CARDS.map((card) => [card.id, card])
);

export function jianyingPortraitMakeupCard({ id }: { id: string }) {
	return MAKEUP_CARD_BY_ID.get(id);
}

export function buildJianyingStandaloneMakeupParameters({
	card,
	intensity,
	targetFaceId,
}: {
	card: JianyingPortraitMakeupCardDefinition;
	intensity: number;
	targetFaceId: number;
}) {
	const value = {
		id: targetFaceId,
		intensity: intensity / 100,
		...(card.id === "look-oxygen" ? { disable_part: [] } : {}),
	};
	return JSON.stringify({ [card.parameterKey]: [value] });
}

export function buildJianyingDynamicMakeupParameters({
	selections,
	targetFaceId,
}: {
	selections: Array<{
		card: JianyingPortraitMakeupCardDefinition;
		intensity: number;
		packagePath: string;
	}>;
	targetFaceId: number;
}) {
	return JSON.stringify(
		Object.fromEntries(
			selections.map(({ card, intensity, packagePath }) => [
				card.parameterKey,
				[
					{
						id: targetFaceId,
						intensity: intensity / 100,
						path: packagePath,
					},
				],
			])
		)
	);
}
