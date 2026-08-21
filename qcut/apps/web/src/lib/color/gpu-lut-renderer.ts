/**
 * GPU path for applying a filter cube to a frame.
 *
 * The CPU path walks every pixel in JS, which costs ~278ms for one 1080p frame
 * — over eight times a 30fps budget — so preview playback with a filter on
 * cannot keep up. A WebGL2 `sampler3D` does the same lookup with hardware
 * trilinear filtering in one draw call.
 *
 * WebGL2 is required for 3D textures. Callers must handle `null` from
 * {@link createGpuLutRenderer} by falling back to the CPU path.
 *
 * @module lib/color/gpu-lut-renderer
 */

import type { ColorCubeLut } from "@/types/timeline";

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  // Flip Y so the sampled texture matches canvas orientation.
  v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

/**
 * Scaling the lookup into the texel centres is what keeps the edges of the
 * cube from being clamped to half a texel short, which otherwise crushes pure
 * black and pure white.
 *
 * The spatial stages mirror processColorImageData in color-pixel-processor:
 * LUT → vignette (radial multiply) → grain (hash noise) per pixel, then a
 * cross-kernel sharpen over the graded neighbours, then a grade-mask mix
 * against the untouched source. Grain uses a range-safe uv hash instead of
 * the CPU's float64 linear-index sin (whose huge arguments collapse GPU
 * sin — see the shader comment): a different pattern, same statistics.
 * Vignette coordinates differ by under half a texel (uv centres vs
 * index/(dim-1)).
 */
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 v_uv;
uniform sampler2D u_frame;
uniform sampler3D u_lut;
uniform sampler2D u_mask;
uniform float u_lutSize;
uniform float u_intensity;
uniform vec2 u_resolution;
uniform float u_vignette;
uniform float u_grain;
uniform float u_grainSeed;
uniform float u_sharpness;
uniform float u_useMask;
out vec4 fragColor;

vec3 gradeAt(vec2 uv) {
  vec3 src = texture(u_frame, uv).rgb;
  float scale = (u_lutSize - 1.0) / u_lutSize;
  float offset = 1.0 / (2.0 * u_lutSize);
  vec3 color = texture(u_lut, clamp(src, 0.0, 1.0) * scale + offset).rgb;
  if (u_vignette > 0.0) {
    float distance = length(vec2((uv.x - 0.5) * 1.25, uv.y - 0.5)) / 0.72;
    color *= 1.0 - pow(max(0.0, distance - 0.45), 1.7) * u_vignette * 0.85;
  }
  if (u_grain > 0.0) {
    // GPU sin() collapses for large arguments (measured broken above ~7e6 on
    // ANGLE/Metal), so unlike the CPU's linear-index hash this keeps the
    // argument inside [0, 2pi): normalized coords plus a seed folded to a
    // 289-frame period. Different noise pattern than the CPU path, same
    // statistics.
    float seed = mod(u_grainSeed, 289.0);
    float argument = mod(
      dot(uv, vec2(127.1, 311.7)) + seed * 43.7,
      6.2831853
    );
    float hash = fract(sin(argument) * 43758.5453);
    color += vec3((hash * 2.0 - 1.0) * u_grain * 0.1);
  }
  return clamp(color, 0.0, 1.0);
}

void main() {
  vec4 source = texture(u_frame, v_uv);
  vec3 graded = gradeAt(v_uv);
  if (u_sharpness > 0.0) {
    vec2 pixel = floor(v_uv * u_resolution);
    // The CPU kernel leaves a one-pixel border unsharpened.
    if (pixel.x >= 1.0 && pixel.y >= 1.0 &&
        pixel.x <= u_resolution.x - 2.0 && pixel.y <= u_resolution.y - 2.0) {
      vec2 texel = 1.0 / u_resolution;
      vec3 average = (gradeAt(v_uv + vec2(0.0, -texel.y)) +
                      gradeAt(v_uv + vec2(0.0, texel.y)) +
                      gradeAt(v_uv + vec2(-texel.x, 0.0)) +
                      gradeAt(v_uv + vec2(texel.x, 0.0))) * 0.25;
      graded = clamp(graded + (graded - average) * u_sharpness, 0.0, 1.0);
    }
  }
  float maskWeight = u_useMask > 0.5 ? texture(u_mask, v_uv).a : 1.0;
  vec3 effected = mix(source.rgb, graded, u_intensity);
  fragColor = vec4(mix(source.rgb, effected, maskWeight), source.a);
}`;

export interface GpuLutRenderSpatial {
	/** 0..1 vignette strength (settings.basic.vignette / 100). */
	vignette: number;
	/** 0..1 grain strength (settings.basic.grain / 100). */
	grain: number;
	/** Frame seed driving the grain hash. */
	grainSeed: number;
	/** Sharpen strength min(2, sharpness / 50); 0 disables the kernel. */
	sharpness: number;
	/** RGBA pixels whose alpha weights the grade per pixel (grade mask). */
	mask?: Uint8ClampedArray;
}

export interface GpuLutRenderer {
	/** Draws `source` through `cube` and returns the canvas holding the result. */
	render(input: {
		source: CanvasImageSource;
		width: number;
		height: number;
		cube: ColorCubeLut;
		/** 0..1; 0 leaves the frame untouched. */
		intensity: number;
		spatial?: GpuLutRenderSpatial;
	}): HTMLCanvasElement;
	dispose(): void;
}

function compileShader({
	gl,
	source,
	type,
}: {
	gl: WebGL2RenderingContext;
	source: string;
	type: number;
}): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error("Unable to allocate a WebGL shader");
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const message = gl.getShaderInfoLog(shader) || "Unknown shader error";
		gl.deleteShader(shader);
		throw new Error(`LUT shader compilation failed: ${message}`);
	}
	return shader;
}

function linkProgram({ gl }: { gl: WebGL2RenderingContext }): WebGLProgram {
	const vertex = compileShader({
		gl,
		source: VERTEX_SHADER,
		type: gl.VERTEX_SHADER,
	});
	const fragment = compileShader({
		gl,
		source: FRAGMENT_SHADER,
		type: gl.FRAGMENT_SHADER,
	});
	const program = gl.createProgram();
	if (!program) throw new Error("Unable to allocate a WebGL program");
	gl.attachShader(program, vertex);
	gl.attachShader(program, fragment);
	gl.linkProgram(program);
	gl.deleteShader(vertex);
	gl.deleteShader(fragment);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const message = gl.getProgramInfoLog(program) || "Unknown link error";
		gl.deleteProgram(program);
		throw new Error(`LUT shader linking failed: ${message}`);
	}
	return program;
}

/**
 * Creates a renderer, or returns null when WebGL2 is unavailable so the caller
 * can stay on the CPU path.
 */
export function createGpuLutRenderer(): GpuLutRenderer | null {
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("webgl2", {
		alpha: true,
		premultipliedAlpha: false,
		preserveDrawingBuffer: true,
	});
	if (!context) return null;
	// Bind to a non-nullable local so the closures below keep the narrowing.
	const gl: WebGL2RenderingContext = context;

	let program: WebGLProgram;
	try {
		program = linkProgram({ gl });
	} catch {
		return null;
	}

	const buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(
		gl.ARRAY_BUFFER,
		new Float32Array([-1, -1, 3, -1, -1, 3]),
		gl.STATIC_DRAW
	);
	const positionLocation = gl.getAttribLocation(program, "a_position");
	gl.enableVertexAttribArray(positionLocation);
	gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

	const frameTexture = gl.createTexture();
	const uniforms = {
		frame: gl.getUniformLocation(program, "u_frame"),
		lut: gl.getUniformLocation(program, "u_lut"),
		mask: gl.getUniformLocation(program, "u_mask"),
		lutSize: gl.getUniformLocation(program, "u_lutSize"),
		intensity: gl.getUniformLocation(program, "u_intensity"),
		resolution: gl.getUniformLocation(program, "u_resolution"),
		vignette: gl.getUniformLocation(program, "u_vignette"),
		grain: gl.getUniformLocation(program, "u_grain"),
		grainSeed: gl.getUniformLocation(program, "u_grainSeed"),
		sharpness: gl.getUniformLocation(program, "u_sharpness"),
		useMask: gl.getUniformLocation(program, "u_useMask"),
	};

	// A 1x1 opaque texture keeps the mask sampler valid when no mask is bound.
	const emptyMaskTexture = gl.createTexture();
	gl.activeTexture(gl.TEXTURE2);
	gl.bindTexture(gl.TEXTURE_2D, emptyMaskTexture);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.RGBA,
		1,
		1,
		0,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		new Uint8Array([255, 255, 255, 255])
	);

	// Grade masks are cached upstream per masks+dims fingerprint, so the same
	// Uint8ClampedArray arrives every frame while the mask is static — key the
	// uploaded texture on that identity.
	const MASK_TEXTURE_CACHE_LIMIT = 4;
	const maskTextures = new Map<
		Uint8ClampedArray,
		{ texture: WebGLTexture; width: number; height: number }
	>();

	function maskTextureFor(
		mask: Uint8ClampedArray,
		width: number,
		height: number
	): WebGLTexture {
		const cached = maskTextures.get(mask);
		if (cached && cached.width === width && cached.height === height) {
			maskTextures.delete(mask);
			maskTextures.set(mask, cached);
			return cached.texture;
		}
		if (cached) {
			gl.deleteTexture(cached.texture);
			maskTextures.delete(mask);
		}
		if (maskTextures.size >= MASK_TEXTURE_CACHE_LIMIT) {
			const oldest = maskTextures.entries().next().value;
			if (oldest) {
				gl.deleteTexture(oldest[1].texture);
				maskTextures.delete(oldest[0]);
			}
		}
		const texture = gl.createTexture();
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			width,
			height,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			new Uint8Array(mask.buffer, mask.byteOffset, mask.byteLength)
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		maskTextures.set(mask, { texture, width, height });
		return texture;
	}

	// Re-uploading a cube every frame would waste most of the win, and two
	// visible elements alternate cubes within a frame — so keep a small LRU of
	// uploaded textures keyed by cube object identity.
	const LUT_TEXTURE_CACHE_LIMIT = 4;
	const lutTextures = new Map<ColorCubeLut, WebGLTexture>();

	function uploadLutTexture(cube: ColorCubeLut): WebGLTexture {
		const texture = gl.createTexture();
		const size = cube.size;
		const data = new Uint8Array(size * size * size * 3);
		for (let index = 0; index < data.length; index += 1) {
			data[index] = Math.round(
				Math.min(1, Math.max(0, cube.values[index] ?? 0)) * 255
			);
		}
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_3D, texture);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage3D(
			gl.TEXTURE_3D,
			0,
			gl.RGB8,
			size,
			size,
			size,
			0,
			gl.RGB,
			gl.UNSIGNED_BYTE,
			data
		);
		// LINEAR is the whole point: the hardware does the trilinear blend the
		// CPU path spells out per pixel.
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
		return texture;
	}

	function lutTextureFor(cube: ColorCubeLut): WebGLTexture {
		const cached = lutTextures.get(cube);
		if (cached) {
			// Re-insert so the Map's insertion order tracks recency of use.
			lutTextures.delete(cube);
			lutTextures.set(cube, cached);
			return cached;
		}
		if (lutTextures.size >= LUT_TEXTURE_CACHE_LIMIT) {
			const oldest = lutTextures.entries().next().value;
			if (oldest) {
				gl.deleteTexture(oldest[1]);
				lutTextures.delete(oldest[0]);
			}
		}
		const texture = uploadLutTexture(cube);
		lutTextures.set(cube, texture);
		return texture;
	}

	return {
		render({ source, width, height, cube, intensity, spatial }) {
			canvas.width = width;
			canvas.height = height;
			gl.viewport(0, 0, width, height);
			// biome-ignore lint/correctness/useHookAtTopLevel: WebGL call, not a React hook
			gl.useProgram(program);

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, frameTexture);
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				source as TexImageSource
			);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_3D, lutTextureFor(cube));

			const mask = spatial?.mask;
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(
				gl.TEXTURE_2D,
				mask ? maskTextureFor(mask, width, height) : emptyMaskTexture
			);

			gl.uniform1i(uniforms.frame, 0);
			gl.uniform1i(uniforms.lut, 1);
			gl.uniform1i(uniforms.mask, 2);
			gl.uniform1f(uniforms.lutSize, cube.size);
			gl.uniform1f(uniforms.intensity, Math.min(1, Math.max(0, intensity)));
			gl.uniform2f(uniforms.resolution, width, height);
			gl.uniform1f(uniforms.vignette, spatial?.vignette ?? 0);
			gl.uniform1f(uniforms.grain, spatial?.grain ?? 0);
			gl.uniform1f(uniforms.grainSeed, spatial?.grainSeed ?? 0);
			gl.uniform1f(uniforms.sharpness, spatial?.sharpness ?? 0);
			gl.uniform1f(uniforms.useMask, mask ? 1 : 0);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			return canvas;
		},
		dispose() {
			gl.deleteTexture(frameTexture);
			gl.deleteTexture(emptyMaskTexture);
			for (const texture of lutTextures.values()) {
				gl.deleteTexture(texture);
			}
			lutTextures.clear();
			for (const entry of maskTextures.values()) {
				gl.deleteTexture(entry.texture);
			}
			maskTextures.clear();
			gl.deleteBuffer(buffer);
			gl.deleteProgram(program);
		},
	};
}
