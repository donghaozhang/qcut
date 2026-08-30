/**
 * Canvas RGBA → BT.709 limited-range I420 conversion for WebCodecs exports.
 *
 * WebCodecs fixes a stream's color tags once, when the encoder emits its
 * first metadata, but Chromium chooses the RGB→Y'CbCr matrix per frame from
 * mutable canvas state: a fill-only canvas encodes BT.601 while an
 * image-sourced one encodes BT.709, so a single export can silently mix
 * both matrices under one tag (verified with mixed-frame probes on
 * Electron 40 / Chromium 144). Converting on our side removes Chromium's
 * choice entirely: every frame the encoder sees is already BT.709
 * limited-range I420, and the stream's VUI/`colr` tags then always match
 * the coded data.
 *
 * A WebGL2 fragment shader packs the I420 planes into an RGBA byte texture
 * and reads them back in one call (~5 ms per 1080p frame on ANGLE Metal);
 * a scalar fallback covers contexts without WebGL2. Both use the same
 * BT.709 coefficients and 2×2 chroma averaging and agree within one 8-bit
 * level.
 */

import { debugWarn } from "@/lib/debug/debug-config";

/** The color space every muxer-exported frame is converted to and tagged with. */
export const EXPORT_VIDEO_COLOR_SPACE = {
	primaries: "bt709",
	transfer: "bt709",
	matrix: "bt709",
	fullRange: false,
} as const;

export interface CanvasYuvFrame {
	/**
	 * I420 bytes: Y (w×h), then U and V (w/2 × h/2 each), tightly packed.
	 * The buffer is reused; consume or copy it before the next convert call.
	 */
	data: Uint8Array;
	codedWidth: number;
	codedHeight: number;
}

export interface CanvasYuvConverter {
	/** Active implementation; the WebGL path degrades to "cpu" if the context is lost. */
	readonly kind: "webgl" | "cpu";
	convert(source: HTMLCanvasElement | OffscreenCanvas): CanvasYuvFrame;
	dispose(): void;
}

/** Bytes per row of the packed WebGL output texture (RGBA8, 1024 texels). */
const PACKED_TEXTURE_WIDTH = 1024;

const VERTEX_SHADER = `#version 300 es
void main() {
	vec2 p = vec2(float((gl_VertexID & 1) * 4 - 1), float((gl_VertexID & 2) * 2 - 1));
	gl_Position = vec4(p, 0.0, 1.0);
}`;

/**
 * Each output texel carries 4 consecutive bytes of the I420 buffer; the
 * shader maps a byte index to its plane and source pixels. Chroma uses a
 * 2×2 box average (same siting libyuv uses). Alpha composites over black,
 * matching how the encoder treats canvas alpha today.
 */
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_src;
uniform int u_w;
uniform int u_h;
uniform int u_texW;
out vec4 o;
const vec3 KY = vec3(0.2126, 0.7152, 0.0722);
vec3 px(int x, int y) {
	vec4 c = texelFetch(u_src, ivec2(x, y), 0);
	return c.rgb * c.a;
}
float yOf(vec3 c) { return (16.0 + 219.0 * dot(c, KY)) / 255.0; }
float cbOf(vec3 c) { return (128.0 + 224.0 * (c.b - dot(c, KY)) / 1.8556) / 255.0; }
float crOf(vec3 c) { return (128.0 + 224.0 * (c.r - dot(c, KY)) / 1.5748) / 255.0; }
float byteAt(int k) {
	int ySize = u_w * u_h;
	int cw = u_w / 2;
	int cSize = cw * (u_h / 2);
	if (k < ySize) {
		int y = k / u_w;
		int x = k - y * u_w;
		return yOf(px(x, y));
	}
	k -= ySize;
	bool isV = k >= cSize;
	if (isV) k -= cSize;
	if (k >= cSize) return 0.0;
	int j = k / cw;
	int i = k - j * cw;
	int x = 2 * i;
	int y = 2 * j;
	vec3 c = 0.25 * (px(x, y) + px(x + 1, y) + px(x, y + 1) + px(x + 1, y + 1));
	return isV ? crOf(c) : cbOf(c);
}
void main() {
	int k0 = (int(gl_FragCoord.y) * u_texW + int(gl_FragCoord.x)) * 4;
	o = vec4(byteAt(k0), byteAt(k0 + 1), byteAt(k0 + 2), byteAt(k0 + 3));
}`;

class WebglYuvConverter {
	private readonly gl: WebGL2RenderingContext;
	private readonly readBuffer: Uint8Array;
	private readonly texHeight: number;
	private readonly total: number;

	constructor(
		private readonly width: number,
		private readonly height: number
	) {
		this.total = (width * height * 3) / 2;
		this.texHeight = Math.ceil(this.total / (PACKED_TEXTURE_WIDTH * 4));
		const canvas = new OffscreenCanvas(PACKED_TEXTURE_WIDTH, this.texHeight);
		const gl = canvas.getContext("webgl2", {
			alpha: true,
			antialias: false,
			depth: false,
			premultipliedAlpha: false,
			preserveDrawingBuffer: false,
			stencil: false,
		});
		if (!gl) throw new Error("WebGL2 is unavailable");
		this.gl = gl;
		const program = gl.createProgram();
		if (!program) throw new Error("Could not create the WebGL program");
		for (const [type, source] of [
			[gl.VERTEX_SHADER, VERTEX_SHADER],
			[gl.FRAGMENT_SHADER, FRAGMENT_SHADER],
		] as const) {
			const shader = gl.createShader(type);
			if (!shader) throw new Error("Could not create a WebGL shader");
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				throw new Error(
					`YUV shader failed to compile: ${gl.getShaderInfoLog(shader)}`
				);
			}
			gl.attachShader(program, shader);
		}
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(
				`YUV program failed to link: ${gl.getProgramInfoLog(program)}`
			);
		}
		// biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram is not a React hook
		gl.useProgram(program);
		const texture = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.uniform1i(gl.getUniformLocation(program, "u_src"), 0);
		gl.uniform1i(gl.getUniformLocation(program, "u_w"), width);
		gl.uniform1i(gl.getUniformLocation(program, "u_h"), height);
		gl.uniform1i(
			gl.getUniformLocation(program, "u_texW"),
			PACKED_TEXTURE_WIDTH
		);
		gl.viewport(0, 0, PACKED_TEXTURE_WIDTH, this.texHeight);
		this.readBuffer = new Uint8Array(PACKED_TEXTURE_WIDTH * this.texHeight * 4);
	}

	isLost(): boolean {
		return this.gl.isContextLost();
	}

	convert(source: HTMLCanvasElement | OffscreenCanvas): CanvasYuvFrame {
		const gl = this.gl;
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.readPixels(
			0,
			0,
			PACKED_TEXTURE_WIDTH,
			this.texHeight,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			this.readBuffer
		);
		if (gl.isContextLost()) {
			throw new Error("WebGL context lost during export color conversion");
		}
		return {
			data: this.readBuffer.subarray(0, this.total),
			codedWidth: this.width,
			codedHeight: this.height,
		};
	}

	dispose(): void {
		this.gl.getExtension("WEBGL_lose_context")?.loseContext();
	}
}

/**
 * Fixed-point BT.709 limited-range coefficients (libyuv-style, 8-bit
 * fraction): Y from full-range sRGB, chroma from a 2×2 sum (10-bit shift).
 */
export function convertRgbaToI420Bt709({
	rgba,
	width,
	height,
	out,
}: {
	rgba: Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
	out?: Uint8Array;
}): Uint8Array {
	const total = (width * height * 3) / 2;
	const data = out ?? new Uint8Array(total);
	const chromaWidth = width >> 1;
	const chromaHeight = height >> 1;
	const uOffset = width * height;
	const vOffset = uOffset + chromaWidth * chromaHeight;
	for (let y = 0; y < height; y += 1) {
		let inIndex = y * width * 4;
		let outIndex = y * width;
		for (let x = 0; x < width; x += 1, inIndex += 4, outIndex += 1) {
			let r = rgba[inIndex];
			let g = rgba[inIndex + 1];
			let b = rgba[inIndex + 2];
			const a = rgba[inIndex + 3];
			if (a !== 255) {
				r = (r * a + 127) / 255;
				g = (g * a + 127) / 255;
				b = (b * a + 127) / 255;
			}
			data[outIndex] = ((47 * r + 157 * g + 16 * b + 128) >> 8) + 16;
		}
	}
	for (let j = 0; j < chromaHeight; j += 1) {
		const rowTop = 2 * j * width * 4;
		const rowBottom = rowTop + width * 4;
		for (let i = 0; i < chromaWidth; i += 1) {
			let r = 0;
			let g = 0;
			let b = 0;
			for (const base of [rowTop + i * 8, rowBottom + i * 8]) {
				for (const offset of [base, base + 4]) {
					const a = rgba[offset + 3];
					if (a !== 255) {
						r += (rgba[offset] * a + 127) / 255;
						g += (rgba[offset + 1] * a + 127) / 255;
						b += (rgba[offset + 2] * a + 127) / 255;
					} else {
						r += rgba[offset];
						g += rgba[offset + 1];
						b += rgba[offset + 2];
					}
				}
			}
			const chromaIndex = j * chromaWidth + i;
			data[uOffset + chromaIndex] =
				((-26 * r - 87 * g + 112 * b + 512) >> 10) + 128;
			data[vOffset + chromaIndex] =
				((112 * r - 102 * g - 10 * b + 512) >> 10) + 128;
		}
	}
	return data;
}

class CpuYuvConverter {
	private readonly buffer: Uint8Array;

	constructor(
		private readonly width: number,
		private readonly height: number
	) {
		this.buffer = new Uint8Array((width * height * 3) / 2);
	}

	convert(source: HTMLCanvasElement | OffscreenCanvas): CanvasYuvFrame {
		const context = source.getContext("2d") as
			| CanvasRenderingContext2D
			| OffscreenCanvasRenderingContext2D
			| null;
		if (!context) {
			throw new Error("Export canvas has no 2D context to read pixels from");
		}
		const image = context.getImageData(0, 0, this.width, this.height);
		convertRgbaToI420Bt709({
			rgba: image.data,
			width: this.width,
			height: this.height,
			out: this.buffer,
		});
		return {
			data: this.buffer,
			codedWidth: this.width,
			codedHeight: this.height,
		};
	}
}

/**
 * Creates the converter for one export. Dimensions must be even (the AVC
 * encoder rejects odd sizes before this matters). WebGL2 is preferred; the
 * scalar path is the fallback at creation time and after a context loss.
 */
export function createCanvasYuvConverter({
	width,
	height,
}: {
	width: number;
	height: number;
}): CanvasYuvConverter {
	if (width % 2 === 1 || height % 2 === 1) {
		throw new Error(
			`Export dimensions ${width}x${height} must be even for 4:2:0 video.`
		);
	}
	const cpu = new CpuYuvConverter(width, height);
	let webgl: WebglYuvConverter | null = null;
	try {
		webgl = new WebglYuvConverter(width, height);
	} catch (error) {
		debugWarn(
			"[ExportCanvasYuv] WebGL2 unavailable; using scalar conversion",
			error
		);
	}
	return {
		get kind() {
			return webgl ? ("webgl" as const) : ("cpu" as const);
		},
		convert(source) {
			if (webgl) {
				if (!webgl.isLost()) {
					try {
						return webgl.convert(source);
					} catch (error) {
						debugWarn(
							"[ExportCanvasYuv] WebGL conversion failed; falling back to scalar",
							error
						);
					}
				}
				webgl = null;
			}
			return cpu.convert(source);
		},
		dispose() {
			webgl?.dispose();
			webgl = null;
		},
	};
}
