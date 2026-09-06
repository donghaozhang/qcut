import type { IndependentFilterIdentity } from "./contract.js";
import { INDEPENDENT_DETAIL_CHAIN_PROFILES } from "./graph-profiles-detail.js";
import { INDEPENDENT_SPATIAL_PROFILES } from "./graph-profiles-spatial.js";
import { INDEPENDENT_INVARIANT_PROFILES } from "./graph-profiles-invariant.js";

export interface IndependentGraphProfile extends IndependentFilterIdentity {
	title: string;
	kind:
		| "sharpen"
		| "vignette"
		| "direct"
		| "soften"
		| "detail-chain"
		| "tiled-alpha"
		| "spring"
		| "edge-camera"
		| "edge-glow"
		| "mask-invariant"
		| "mask-invariant-sharpen";
	maskInvariant?: "vf" | "tiled";
	featureDirectory?: "AmazingFeature_2998";
	detailVariant?: "sanyo";
	controlHash: string;
	assetHash: string;
	alphaWeighted: boolean;
	corner: number;
}

// Identity and control-file digests only; assets stay in the user's private cache.
export const INDEPENDENT_GRAPH_PROFILES: readonly IndependentGraphProfile[] = [
	{
		"resourceId": "7403664041945681191",
		"version": "59f14f9555fc38667c3ddb0814346cc8",
		"title": "清透美食",
		"assetHash":
			"4ab42105b788b70a7c3c5812ca0d15536076a5530b490fafe37580fe67f26991",
		"kind": "sharpen",
		"controlHash":
			"12c4b18f0d16c4a4d17250a0a54104d392b7879a725c89e62c7013405124854d",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	{
		"resourceId": "7131644140340776205",
		"version": "d90fecf26b240a5239b58f2b92c162d7",
		"title": "食色",
		"assetHash":
			"307bb73c7c77c68d60b62150b96ed0f05a63303f2513f28fcbeb46d56ee63dc9",
		"kind": "sharpen",
		"controlHash":
			"2ec51d40249e5b2403195f34d503e4d3c470a2ca0f438a3df8573b2da58b9bd9",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	{
		"resourceId": "7281166220794055997",
		"version": "80b72ba729cd9880354d1f1e030866b1",
		"title": "味蕾",
		"assetHash":
			"6b0f3b6ed5bbcec86c401ed8ef5e46bd8c373c532b3fe2e8523b2c51f0d7eb47",
		"kind": "sharpen",
		"controlHash":
			"2c18c1b8688b112d04258053010d5879b4c0cd6fac80c37ad04f7a24855fd724",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	{
		"resourceId": "7131656881805856013",
		"version": "7e7396c0679fe359e5761ae3d28518a1",
		"title": "贝果",
		"assetHash":
			"8906a68fde79fad2ee7cb2beef156d5c9e66dee31a64effe1dcf0d1863addc2e",
		"kind": "sharpen",
		"controlHash":
			"7d8ff76516ab4c903a266d330ef0d39b61bbd4c167912c3f4ae3eed80e9a440a",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	{
		"resourceId": "7281163501047991608",
		"version": "bd6f66fedce03cc95520ba57e09ee242",
		"title": "暗曛",
		"assetHash":
			"f41dc01cfd974e16a924b2170c88a1f114a82d6e4d033ca341c0fa3c3caeb0e3",
		"kind": "sharpen",
		"controlHash":
			"c956bdfc3fc0992c2013ce5fb44dbc439bdadeef572ce2591beb16e9cfdc0afd",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	{
		"resourceId": "7131899038625975559",
		"version": "be0ffa86208774b3c584f7ea9fd44ab6",
		"title": "西冷",
		"assetHash":
			"52bdc5c7c9333b617105f9d0002bbc050c55f39ed8aa5baf26d97a6ab813b80d",
		"kind": "sharpen",
		"controlHash":
			"70e28d16fe79ac5ea615c41ddfed324c6dde2f599579a32b590398898860ca1e",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	{
		"resourceId": "7647099764940557618",
		"version": "29fec8019c1c3fb2e4d8606e10ebb39d",
		"title": "暗角旧影",
		"assetHash":
			"4cf5f0bbed8de245c26116d20d1a5754d6149e50122b56d4cf6ceea8d596b6f0",
		"kind": "vignette",
		"controlHash":
			"78e255d0cb5bbf170259c0b7b095c381398fa07b444ae460cba3b4b4ee8d2419",
		"alphaWeighted": false,
		"corner": 1,
	},
	{
		"resourceId": "7366562830486621459",
		"version": "5a11f2dea32476e901a7f7d9cbf54604",
		"title": "旧时来信",
		"assetHash":
			"76ccbeefa25aede1f080eb7bcb103e3083c9617489e47c68f93c9422e651ea80",
		"kind": "vignette",
		"controlHash":
			"7bcd110ecb19b515f47c64cc08b2de193d8a5a16d328b183629b27bcc05e02c7",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	{
		"resourceId": "7366562845120646463",
		"version": "6972ec1db1294d997fca5269e4115f18",
		"title": "蓝调舞曲",
		"assetHash":
			"835f88e1664e47ba1bb1146b02a5d402fea462a0c54c0c675a83b60fea16b481",
		"kind": "vignette",
		"controlHash":
			"2a99305c44e0f8aeb57a2a8a5fb6e039ca28de10f694eb51790a35d8ddb7c9d0",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	{
		"resourceId": "7366562482812456255",
		"version": "585ad139644e1b0cced274b4e637fecc",
		"title": "古早记忆",
		"assetHash":
			"94365983704147375137c6a9e5c98b67976e7384baddf871a3fc3e2d264017bc",
		"kind": "vignette",
		"controlHash":
			"62bbdce46181748fb12be6f3a43c3114c3368537b1bc03deff2bfa002d8c960e",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	{
		"resourceId": "7268561936344780086",
		"version": "a451da3a8e92464be1d12df9c1ac80cf",
		"title": "富士CC I",
		"assetHash":
			"cc99ff11085594bfe22f97a829a4a1693d211c4030af52721f5858e86704d01e",
		"kind": "soften",
		"controlHash":
			"526a75dee3e01cb4b3d1c3206c8196623263e9fde108928ee255d015d2ef0fcf",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	{
		"resourceId": "7291597100389862707",
		"version": "4abf944af7605ca1da3135913f36c31d",
		"title": "佳能G7X II",
		"assetHash":
			"100b3d7ec4d7419edd95f83b5264c0d399efe618307e700728ad06ed07561c64",
		"kind": "soften",
		"controlHash":
			"2e71d567e87e00830c29639850841d5229cb7ba82ffe1653338be81920f124b0",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	{
		"resourceId": "7268561903721401641",
		"version": "5f35a444a24b7f3b198649aa15fd82a3",
		"title": "富士CC II",
		"assetHash":
			"133ca6d1b0f8a4ac9b4010e3be92cc2e282d57a6b61a84e773d20ee048157a2d",
		"kind": "soften",
		"controlHash":
			"a9100f6e39ad2f7d1108d374c8f4cc2817b2e2fde481490a48637ac4d573e242",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	{
		"resourceId": "7131219052021779719",
		"version": "75e3b76f1873164d8813825f9b3d44a9",
		"title": "摩登",
		"assetHash":
			"f2c102c3bbd2577b5f825e76df53ed303a06f02a4e896b8c3bcdd131598d0067",
		"kind": "direct",
		"controlHash":
			"d984e6fbcbb20d352e0e148f54a168d35e422f3d0819f27bfd48142a1bdd57bd",
		"alphaWeighted": true,
		"corner": 0.5,
	},
	{
		"resourceId": "7131431284403981605",
		"version": "835f01bd8f2fc31f499956ca74594bcf",
		"title": "嬉皮士",
		"assetHash":
			"7afa29f1fdc619d79f54376c47e6f5cb1789b5a588de560e21abedf36e31792b",
		"kind": "direct",
		"controlHash":
			"df618bee3c695b2793b8a2cab043b5e1c385cd4e944c65ec0c7e36156e50ade1",
		"alphaWeighted": true,
		"corner": 0.5,
	},
	{
		"resourceId": "7131522303082466597",
		"version": "3043a5704cdcc683354ac3a6c7e767b7",
		"title": "黑冰",
		"assetHash":
			"e512544fcacbe9749281df0119ae655ca87bd928e34e1e611256ec263f38b628",
		"kind": "direct",
		"controlHash":
			"6029afe00af2558e84e836d5837996b45d63a50c89672208c57548204913a4b2",
		"alphaWeighted": true,
		"corner": 0.5,
	},
	{
		"resourceId": "7131509679246675208",
		"version": "1b9dd13c4341573748d5f6764921b96f",
		"title": "铅绿",
		"assetHash":
			"0629a800834ecf0246da6e85aa02dd0c581b31ec5976633aaee5edd7ffde20c8",
		"kind": "direct",
		"controlHash":
			"9dd0df4a265b851e57941b99c294f969cbf07de8162ba08dc5ae87ea9941d129",
		"alphaWeighted": true,
		"corner": 0.5,
	},
	{
		"resourceId": "7131399016771800357",
		"version": "004747306db453a53d045b3d0b2d062d",
		"title": "冰茶",
		"assetHash":
			"6373f1568e7aa6f87af68d0edd6e22909ba2403a782f6efdd26993b72c4d3cec",
		"kind": "direct",
		"controlHash":
			"7c33ff745e2ef448b1f0c6814de716cb021e7a828ee3f930391c6d807e7d4d30",
		"alphaWeighted": true,
		"corner": 0.5,
	},
	{
		"resourceId": "7159134459088899339",
		"version": "2eba17cf93e2fa698344fb48866e5fdd",
		"title": "富士NC III",
		"assetHash":
			"8900402eebfe3bfa8a2fe1a077a3b0812126e4437e923e4cfc823f897848fcfb",
		"kind": "direct",
		"controlHash":
			"a8599a1a6cb06a4d4baf22796bc971d351101c78eebb1804bd5ae49be68700b3",
		"alphaWeighted": true,
		"corner": 0.5,
	},
	{
		"resourceId": "7159156535640296737",
		"version": "0d6aa79e6199794677f55a7732ccc383",
		"title": "富士NC I",
		"assetHash":
			"36681acaae5aa832427f5493563f047404dbd3d2fdefc2be3622165f21ba487d",
		"kind": "direct",
		"controlHash":
			"9fec15b6d8910654942ad29da6a25617ccb3514ee2b9b39d4a06b223ccfb561f",
		"alphaWeighted": true,
		"corner": 0.5,
	},
	{
		"resourceId": "7159408376378559747",
		"version": "b767dae86683fe391d7496b5c7db6825",
		"title": "富士NC II",
		"assetHash":
			"e3e5fe21cb52c27ad8826c6dd350ef0eb4aaa795290b8d748e62a6fb2f1d9eca",
		"kind": "direct",
		"controlHash":
			"6cfb27632250aafe320b864243776df28989fe95d171d5f9fb3855ca0a16b9e6",
		"alphaWeighted": true,
		"corner": 0.5,
	},
	{
		"resourceId": "7168098796860148995",
		"version": "af5e6d48be8ba6e90fc35fd19dfa60b7",
		"title": "GR正片",
		"assetHash":
			"11eb88fe13d353818710d927affd4b3e2ea3a5739549340bff2904ec4f068a4c",
		"kind": "direct",
		"controlHash":
			"a12ceb276bc910c50b88e18e3f3e50ff3834fe98879023a00d160b6537d2ed55",
		"alphaWeighted": true,
		"corner": 0.5,
	},
	{
		"resourceId": "7168121440141708576",
		"version": "4f39ddd32affa836e205a4014365b011",
		"title": "GR绿",
		"assetHash":
			"b9bc2a4f6faf40605620838ceed14b798613390f15e22b168d233f3efef3a258",
		"kind": "direct",
		"controlHash":
			"09870c721d51c3363ea360f32cd9114e4c16045bb581d8e58e2726e5e4af373c",
		"alphaWeighted": true,
		"corner": 0.5,
	},
	{
		"resourceId": "7338311462277991718",
		"version": "89284234c1a8a67e6fe357098221d69e",
		"title": "日和",
		"assetHash":
			"35fdcc33a4a9339e4d0892b5acebb666906b56276150dbd46125f023243dc038",
		"kind": "direct",
		"controlHash":
			"10134d88be4b4ed9e416215a81f8275c9b83bd620709a73699c12982f3d86852",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	{
		"resourceId": "7332714336315526409",
		"version": "2b0731e9eacb5098ad43bd99ae6f23d7",
		"title": "倾森",
		"assetHash":
			"c0ac9aa0b24535fbbb3fdd8dd59e5d47eb1c95ebea45ec91478c88a16efa8b43",
		"kind": "direct",
		"controlHash":
			"9ae0ca1f81d6f8c4a42c7152c0d7733ed393cb6d51d05becd52ed13769537896",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	{
		"resourceId": "7341296364598480178",
		"version": "40be6e9ae9bd57eb3de42035bf72fd1c",
		"title": "都卡",
		"assetHash":
			"be77405857eb25f77d829053e5911cf2f13dd08acb80f3ccaedf92cbb10a51d3",
		"kind": "direct",
		"controlHash":
			"89c9d00168756a725f2335a2508faf6e73e23350007c05489e6e18a09888d6df",
		"alphaWeighted": false,
		"corner": 0.5,
	},
	...INDEPENDENT_DETAIL_CHAIN_PROFILES,
	...INDEPENDENT_SPATIAL_PROFILES,
	...INDEPENDENT_INVARIANT_PROFILES,
];

export function findIndependentGraphProfile({
	identity,
}: {
	identity: IndependentFilterIdentity;
}) {
	return INDEPENDENT_GRAPH_PROFILES.find(
		(profile) =>
			profile.resourceId === identity.resourceId &&
			profile.version === identity.version
	);
}
