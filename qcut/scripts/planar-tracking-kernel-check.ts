import { join } from "node:path";
import {
	invertPlanarHomography,
	projectPlanarPoint,
	type PlanarMatrix3,
	type PlanarQuad,
} from "@qcut/editor-core";
import {
	OpenCvPlanarTrackerError,
	OpenCvPlanarTrackerKernel,
	type OpenCvPlanarRuntime,
} from "../apps/web/src/lib/tracking/opencv-planar-tracker-kernel";
import {
	denormalizePlanarQuad,
	projectTrackedPlanarQuad,
} from "../apps/web/src/lib/tracking/planar-tracker-metrics";
import { DEFAULT_PLANAR_TRACKER_CONFIGURATION } from "../apps/web/src/lib/tracking/planar-tracker-protocol";

const WIDTH = 240;
const HEIGHT = 180;
const SEED_QUAD: PlanarQuad = {
	topLeft: { x: 0.15, y: 0.15 },
	topRight: { x: 0.85, y: 0.15 },
	bottomRight: { x: 0.85, y: 0.85 },
	bottomLeft: { x: 0.15, y: 0.85 },
};

function createTexture(): Uint8Array {
	const pixels = new Uint8Array(WIDTH * HEIGHT);
	for (let y = 0; y < HEIGHT; y += 1) {
		for (let x = 0; x < WIDTH; x += 1) {
			const checker = (Math.floor(x / 9) + Math.floor(y / 9)) % 2;
			pixels[y * WIDTH + x] =
				(checker * 115 + x * 13 + y * 29 + ((x * y) % 97)) % 256;
		}
	}
	return pixels;
}

function sampleBilinear({
	pixels,
	x,
	y,
}: {
	pixels: Uint8Array;
	x: number;
	y: number;
}): number {
	if (x < 0 || y < 0 || x >= WIDTH - 1 || y >= HEIGHT - 1) return 0;
	const left = Math.floor(x);
	const top = Math.floor(y);
	const dx = x - left;
	const dy = y - top;
	const topLeft = pixels[top * WIDTH + left];
	const topRight = pixels[top * WIDTH + left + 1];
	const bottomLeft = pixels[(top + 1) * WIDTH + left];
	const bottomRight = pixels[(top + 1) * WIDTH + left + 1];
	return Math.round(
		topLeft * (1 - dx) * (1 - dy) +
			topRight * dx * (1 - dy) +
			bottomLeft * (1 - dx) * dy +
			bottomRight * dx * dy
	);
}

function warpTexture({
	matrix,
	pixels,
}: {
	matrix: PlanarMatrix3;
	pixels: Uint8Array;
}): Uint8Array {
	const inverse = invertPlanarHomography({ matrix });
	if (!inverse) throw new Error("Synthetic homography must be invertible.");
	const warped = new Uint8Array(WIDTH * HEIGHT);
	for (let y = 0; y < HEIGHT; y += 1) {
		for (let x = 0; x < WIDTH; x += 1) {
			const source = projectPlanarPoint({ point: { x, y }, matrix: inverse });
			if (!source) continue;
			warped[y * WIDTH + x] = sampleBilinear({
				pixels,
				x: source.x,
				y: source.y,
			});
		}
	}
	return warped;
}

function frame({ gray, ptsUs }: { gray: Uint8Array; ptsUs: number }) {
	return { gray, height: HEIGHT, ptsUs, width: WIDTH };
}

function expectedQuad({ matrix }: { matrix: PlanarMatrix3 }): PlanarQuad {
	const quad = projectTrackedPlanarQuad({
		height: HEIGHT,
		matrix,
		seedQuad: denormalizePlanarQuad({
			height: HEIGHT,
			quad: SEED_QUAD,
			width: WIDTH,
		}),
		width: WIDTH,
	});
	if (!quad) throw new Error("Synthetic expected quad must be valid.");
	return quad;
}

function cornerErrorsPx({
	actual,
	expected,
}: {
	actual: PlanarQuad;
	expected: PlanarQuad;
}): number[] {
	return (["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).map(
		(key) =>
			Math.hypot(
				(actual[key].x - expected[key].x) * WIDTH,
				(actual[key].y - expected[key].y) * HEIGHT
			)
	);
}

function requireTracked({
	result,
}: {
	result: ReturnType<OpenCvPlanarTrackerKernel["track"]>;
}) {
	if (result.sample.status !== "tracked") {
		throw new Error(
			`Expected tracked sample: ${result.lostReason ?? "unknown"}`
		);
	}
	return result;
}

function createKernel({
	cv,
	pixels,
}: {
	cv: OpenCvPlanarRuntime;
	pixels: Uint8Array;
}) {
	const kernel = new OpenCvPlanarTrackerKernel({ cv });
	kernel.begin({
		configuration: DEFAULT_PLANAR_TRACKER_CONFIGURATION,
		frame: frame({ gray: pixels, ptsUs: 0 }),
		seedQuad: SEED_QUAD,
	});
	return kernel;
}

function checkSingleWarp({
	cv,
	matrix,
	pixels,
}: {
	cv: OpenCvPlanarRuntime;
	matrix: PlanarMatrix3;
	pixels: Uint8Array;
}) {
	const kernel = createKernel({ cv, pixels });
	try {
		const result = requireTracked({
			result: kernel.track({
				frame: frame({ gray: warpTexture({ matrix, pixels }), ptsUs: 33_333 }),
			}),
		});
		return {
			errors: cornerErrorsPx({
				actual: result.sample.quad,
				expected: expectedQuad({ matrix }),
			}),
			inliers: result.sample.diagnostics?.inliers ?? 0,
		};
	} finally {
		kernel.dispose();
	}
}

function checkSequence({
	cv,
	pixels,
}: {
	cv: OpenCvPlanarRuntime;
	pixels: Uint8Array;
}): number {
	const kernel = createKernel({ cv, pixels });
	let maximumErrorPx = 0;
	try {
		for (let index = 1; index <= 8; index += 1) {
			const matrix: PlanarMatrix3 = [1, 0, index * 2, 0, 1, index, 0, 0, 1];
			const result = requireTracked({
				result: kernel.track({
					frame: frame({
						gray: warpTexture({ matrix, pixels }),
						ptsUs: index * 33_333,
					}),
				}),
			});
			maximumErrorPx = Math.max(
				maximumErrorPx,
				...cornerErrorsPx({
					actual: result.sample.quad,
					expected: expectedQuad({ matrix }),
				})
			);
		}
		return maximumErrorPx;
	} finally {
		kernel.dispose();
	}
}

function checkBlankFrame({
	cv,
	pixels,
}: {
	cv: OpenCvPlanarRuntime;
	pixels: Uint8Array;
}): boolean {
	const kernel = createKernel({ cv, pixels });
	try {
		return (
			kernel.track({
				frame: frame({ gray: new Uint8Array(WIDTH * HEIGHT), ptsUs: 33_333 }),
			}).sample.status === "lost"
		);
	} finally {
		kernel.dispose();
	}
}

function checkTexturelessSeed({ cv }: { cv: OpenCvPlanarRuntime }): boolean {
	const kernel = new OpenCvPlanarTrackerKernel({ cv });
	try {
		kernel.begin({
			configuration: DEFAULT_PLANAR_TRACKER_CONFIGURATION,
			frame: frame({ gray: new Uint8Array(WIDTH * HEIGHT), ptsUs: 0 }),
			seedQuad: SEED_QUAD,
		});
		return false;
	} catch (cause) {
		return (
			cause instanceof OpenCvPlanarTrackerError &&
			cause.code === "insufficient-texture"
		);
	} finally {
		kernel.dispose();
	}
}

const runtimePath = Bun.resolveSync(
	"@techstark/opencv-js",
	join(process.cwd(), "apps", "web", "package.json")
);
const runtimeModule = (await import(runtimePath)) as {
	default: Promise<OpenCvPlanarRuntime>;
};
const cv = await runtimeModule.default;
const pixels = createTexture();
const translation = checkSingleWarp({
	cv,
	matrix: [1, 0, 7, 0, 1, 5, 0, 0, 1],
	pixels,
});
const perspective = checkSingleWarp({
	cv,
	matrix: [1.012, 0.018, 4, -0.009, 1.006, 3, 0.000_12, -0.000_08, 1],
	pixels,
});

const report = {
	blankFrameLost: checkBlankFrame({ cv, pixels }),
	perspectiveAverageErrorPx:
		perspective.errors.reduce((sum, value) => sum + value, 0) /
		perspective.errors.length,
	perspectiveMaximumErrorPx: Math.max(...perspective.errors),
	sequenceMaximumErrorPx: checkSequence({ cv, pixels }),
	texturelessSeedRejected: checkTexturelessSeed({ cv }),
	translationInliers: translation.inliers,
	translationMaximumErrorPx: Math.max(...translation.errors),
};

process.stdout.write(`${JSON.stringify(report)}\n`);
