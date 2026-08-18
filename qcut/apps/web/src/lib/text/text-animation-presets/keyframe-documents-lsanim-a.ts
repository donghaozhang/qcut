import type { TextKeyframeDocument } from "./keyframe-documents-entrance-a";

/**
 * Ports from the plaintext `studioAnim.lsanim` pool — packages whose animation
 * lives entirely in the AE model (selectors + effectAnimators + cubic
 * keyframes) with no Lua driver at all.
 *
 * These were missed by the first shader sweep because its portability metric
 * counted `char.* =` writes in Lua drivers, which this family does not have —
 * see docs/task/jianying-text-anim-port/LSANIM-POOL.md. Decoded with
 * scratchpad `decode_lsanim.py`: handles here are already relative
 * (`vti` negative, `vto` positive), so each key maps 1:1 onto a
 * TextKeyframePoint after dividing times by the renderGroup duration.
 *
 * The source composes several passes at once; QCut runs one raster pass per
 * frame, so each document below keeps the dominant pass and notes the drops.
 */

type Doc = TextKeyframeDocument;

export const ENTRANCE_LSANIM_DOCUMENTS_A: Record<string, Doc> = {
	// 剪映 立体折叠 (7526839887526448430), D=3. Stacked copies offset along a
	// shallow diagonal (LayeredReplacement, offsetX 0.1 → 0, offsetY 0.05 → 0
	// of the block, interval 0.15) give the fold its depth, and a wave warp
	// (amplitude 20 → 0) flexes the stack as it collapses onto the flat
	// original. The stack is the new layered pass — concentric echo shells
	// could not express a directional offset.
	"fold-stack-in": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			rasterScale: 20,
			rasterEvolution: 1,
			channels: {
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.1, v: 1 },
					{ t: 1, v: 1 },
				],
				layerOffsetXPx: [
					{ t: 0, v: 60, outValue: 60, outTime: 0.169 },
					{
						t: 0.512,
						v: 61,
						inValue: 61,
						inTime: -0.169,
						outValue: 12,
						outTime: 0.0367,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.4073 },
				],
				layerOffsetYPx: [
					{ t: 0, v: 30, outValue: 30, outTime: 0.176 },
					{
						t: 0.5333,
						v: 30,
						inValue: 30,
						inTime: -0.176,
						outValue: -8,
						outTime: 0.0837,
					},
					{ t: 1, v: 0, inValue: -4, inTime: -0.253 },
				],
				displaceAmplitudePx: [
					{ t: 0, v: 10, outValue: 9, outTime: 0.1333 },
					{
						t: 0.5333,
						v: 0,
						inValue: 0,
						inTime: -0.176,
						outValue: 0,
						outTime: 0.154,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.35 },
				],
			},
		},
	},
	// 剪映 脉冲光束 (D=3, GodRay + LinearWipe). Two selector windows arrive
	// from different distances — one from four text-heights up, one from a
	// single height — while a light source sweeps from below the block to
	// above it (center_y −0.5 → 0.5) casting shafts off the strokes, then
	// cuts out at 100%. Both new capabilities meet here: the layers keep the
	// two arrivals from cancelling, and the shafts are the GPU god-ray pass.
	// Dropped: the LinearWipe (its own reveal is subsumed by the arrivals)
	// and the light's horizontal travel — ours stays centred.
	"pulse-beam-in": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.3 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.1, v: 1 },
					{ t: 1, v: 1 },
				],
				godRayIntensity: [
					{ t: 0, v: 1, outValue: 1, outTime: 0.2457 },
					{
						t: 0.7223,
						v: 1,
						inValue: 1,
						inTime: -0.2383,
						outValue: 1,
						outTime: 0.0917,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.0943 },
				],
				godRayReach: [
					{ t: 0, v: 1.4 },
					{ t: 0.889, v: 0.7 },
					{ t: 1, v: 0.7 },
				],
			},
			layers: [
				{
					selector: {
						start: [{ t: 0, v: 0 }],
						end: [{ t: 0, v: 1 }],
						shape: "rampDown",
						feather: 1,
					},
					channels: {
						translateYEm: [
							{ t: 0, v: -4, outValue: -4, outTime: 0.275 },
							{
								t: 0.8333,
								v: 0,
								inValue: 0,
								inTime: -0.275,
								outValue: 0,
								outTime: 0.055,
							},
							{ t: 1, v: 0, inValue: 0, inTime: -0.0567 },
						],
					},
				},
				{
					selector: {
						start: [{ t: 0, v: 0 }],
						end: [{ t: 0, v: 1 }],
						shape: "rampUp",
						feather: 1,
					},
					channels: {
						translateYEm: [
							{ t: 0, v: -1, outValue: -1, outTime: 0.2713 },
							{
								t: 0.8223,
								v: 0,
								inValue: 0,
								inTime: -0.2713,
								outValue: 0,
								outTime: 0.0587,
							},
							{ t: 1, v: 0, inValue: 0, inTime: -0.0603 },
						],
					},
				},
			],
		},
	},
	// 剪映 缤纷冲屏 (7116829842271638053), D=2. Sixteen staggered ghost copies
	// rush the screen behind a DeepGlow + radial blur, all painted through a
	// four-colour gradient (ADBE_4ColorGradient, 20 references — the 缤纷 the
	// name promises). The gradient is the spatial palette: each unit takes
	// its tint by horizontal position, which is what those four colour layers
	// do. The ghost stack is the echo pass; the glow and gaussian ride their
	// own channels. Dropped: the per-instance 16-way stagger (our echo shells
	// share one profile) and the gradient's own point motion.
	"prism-rush-in": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.35 },
		effect: {
			kind: "keyframes",
			palette: ["#50ff00", "#ecff00", "#ff00ff", "#ff00f8"],
			channels: {
				colorAmount: [
					{ t: 0, v: 1 },
					{ t: 0.65, v: 1 },
					{ t: 1, v: 0 },
				],
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.12, v: 1 },
					{ t: 1, v: 1 },
				],
				scaleX: [
					{ t: 0, v: 1.6, outValue: 1.45, outTime: 0.1 },
					{ t: 0.55, v: 1, inValue: 1.02, inTime: -0.22 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 1.6, outValue: 1.45, outTime: 0.1 },
					{ t: 0.55, v: 1, inValue: 1.02, inTime: -0.22 },
					{ t: 1, v: 1 },
				],
				echoAmount: [
					{ t: 0, v: 0.55 },
					{ t: 0.5, v: 0.3 },
					{ t: 0.85, v: 0 },
					{ t: 1, v: 0 },
				],
				bloomIntensity: [
					{ t: 0, v: 1.1 },
					{ t: 0.6, v: 0.5 },
					{ t: 1, v: 0 },
				],
				bloomRadiusPx: [{ t: 0, v: 22 }],
				blurPx: [
					{ t: 0, v: 6 },
					{ t: 0.4, v: 0 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 烟花爆破 (7538330883162508570), D=3. The block bursts up from 30%
	// scale and fades in while a warm DeepGlow (radius 600, tint
	// (1, 0.736, 0.286)) flares at 1.05 exposure and burns out by 98%. The
	// glow tint rides colorTrack — our bloom samples the rendered text, so
	// tinting the glyphs warm is what makes the halo warm.
	"firework-burst-in": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			colorTrack: [
				{ t: 0, v: [1, 0.736, 0.286] },
				{ t: 0.55, v: [1, 0.88, 0.7] },
				{ t: 1, v: [1, 1, 1] },
			],
			channels: {
				colorAmount: [{ t: 0, v: 1 }],
				opacity: [
					{ t: 0, v: 0 },
					{
						t: 0.0557,
						v: 0,
						inValue: 0,
						inTime: -0.019,
						outValue: 0,
						outTime: 0.0867,
					},
					{
						t: 0.318,
						v: 1,
						inValue: 1,
						inTime: -0.114,
						outValue: 1,
						outTime: 0.225,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.232 },
				],
				scaleX: [
					{ t: 0, v: 0.3 },
					{
						t: 0.7333,
						v: 1,
						inValue: 1,
						inTime: -0.308,
						outValue: 1,
						outTime: 0.088,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.0907 },
				],
				scaleY: [
					{ t: 0, v: 0.3 },
					{
						t: 0.7333,
						v: 1,
						inValue: 1,
						inTime: -0.308,
						outValue: 1,
						outTime: 0.088,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.0907 },
				],
				bloomIntensity: [
					{ t: 0, v: 1.05, outValue: 1.05, outTime: 0.4107 },
					{ t: 0.9777, v: 0, outValue: 0, outTime: 0.0073 },
					{ t: 1, v: 0 },
				],
				// Source radius 600 is in its own render space; 26 px reads the
				// same at preview scale.
				bloomRadiusPx: [{ t: 0, v: 26 }],
			},
		},
	},
	// 剪映 光波扩散 (7644887196079508778), D=3. The block arrives from one text
	// height away (position type 2, distance −1 → 0), holds invisible for the
	// first third, then pops to full while a periwinkle DeepGlow (radius 800,
	// tint (0.482, 0.663, 1)) burns from the first frame and dies at 94%.
	// Dropped: the Shake pass (ampRatio 0.3 → 0) — a keyframe document cannot
	// also carry the parametric jitter kind.
	"light-wave-in": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			colorTrack: [
				{ t: 0, v: [0.482, 0.663, 1] },
				{ t: 0.7, v: [0.8, 0.87, 1] },
				{ t: 1, v: [1, 1, 1] },
			],
			channels: {
				colorAmount: [{ t: 0, v: 1 }],
				opacity: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.1063 },
					{
						t: 0.3223,
						v: 0,
						inValue: 0,
						inTime: -0.1063,
						outValue: 0,
						outTime: 0.0587,
					},
					{
						t: 0.5,
						v: 1,
						inValue: 1,
						inTime: -0.0587,
						outValue: 1,
						outTime: 0.165,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.17 },
				],
				translateYEm: [
					{ t: 0, v: -1, outValue: -1, outTime: 0.1063 },
					{
						t: 0.3223,
						v: -1,
						inValue: -1,
						inTime: -0.1063,
						outValue: -1,
						outTime: 0.077,
					},
					{
						t: 0.5557,
						v: -0.1,
						inValue: -0.2,
						inTime: -0.0797,
						outValue: -0.018,
						outTime: 0.0713,
					},
					{
						t: 0.889,
						v: 0,
						inValue: 0,
						inTime: -0.1487,
						outValue: 0,
						outTime: 0.0367,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.0377 },
				],
				bloomIntensity: [
					{ t: 0, v: 1, outValue: 1, outTime: 0.1467 },
					{
						t: 0.4443,
						v: 1,
						inValue: 1,
						inTime: -0.1467,
						outValue: 0.97,
						outTime: 0.2277,
					},
					{
						t: 0.9443,
						v: 0,
						inValue: 0.045,
						inTime: -0.2423,
						outValue: 0,
						outTime: 0.0183,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.019 },
				],
				bloomRadiusPx: [{ t: 0, v: 30 }],
			},
		},
	},
	// 剪映 模糊显现 (D=3, GaussianBlur only). The line resolves out of a heavy
	// 50-unit gaussian that clears on a long ease by 83%, held with a matching
	// fade. The single blur pass makes this the cleanest document in the pool.
	"blur-resolve-in": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0.4, outTime: 0.2 },
					{ t: 0.6, v: 1, inValue: 1, inTime: -0.25 },
					{ t: 1, v: 1 },
				],
				blurPx: [
					{ t: 0, v: 18, outValue: 7.65, outTime: 0.325 },
					{
						t: 0.8333,
						v: 0,
						inValue: 0,
						inTime: -0.3623,
						outValue: 0,
						outTime: 0.055,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.0567 },
				],
			},
		},
	},
	// 剪映 逐字显现2 (D=3, AlphaOutline). An outline traces the glyphs and
	// cycles hue as it goes — blue → teal → amber → coral — swelling to 2×
	// width at 42% then collapsing back into the fill. outlineAmount carries
	// the trace; the hue cycle rides colorTrack, since our stroke takes the
	// glyph's own color.
	"outline-trace-in": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.5 },
		effect: {
			kind: "keyframes",
			colorTrack: [
				{ t: 0.2, v: [0.29, 0.565, 0.886] },
				{ t: 0.4, v: [0.314, 0.89, 0.761] },
				{ t: 0.6, v: [0.961, 0.651, 0.145] },
				{ t: 0.8333, v: [1, 0.42, 0.42] },
				{ t: 1, v: [1, 1, 1] },
			],
			channels: {
				colorAmount: [
					{ t: 0, v: 1 },
					{ t: 0.85, v: 1 },
					{ t: 1, v: 0 },
				],
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.1, v: 1 },
					{ t: 1, v: 1 },
				],
				outlineAmount: [
					{ t: 0, v: 1, outValue: 1, outTime: 0.1627 },
					{
						t: 0.4167,
						v: 1,
						inValue: 1,
						inTime: -0.1813,
						outValue: 0.9,
						outTime: 0.1853,
					},
					{
						t: 0.8333,
						v: 0.35,
						inValue: 0.4,
						inTime: -0.1877,
						outValue: 0.15,
						outTime: 0.065,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.0723 },
				],
			},
		},
	},
};
