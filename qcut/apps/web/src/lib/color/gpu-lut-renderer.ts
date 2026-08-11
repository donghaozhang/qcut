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
 */
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 v_uv;
uniform sampler2D u_frame;
uniform sampler3D u_lut;
uniform float u_lutSize;
uniform float u_intensity;
out vec4 fragColor;
void main() {
  vec4 source = texture(u_frame, v_uv);
  float scale = (u_lutSize - 1.0) / u_lutSize;
  float offset = 1.0 / (2.0 * u_lutSize);
  vec3 lutCoord = clamp(source.rgb, 0.0, 1.0) * scale + offset;
  vec3 graded = texture(u_lut, lutCoord).rgb;
  fragColor = vec4(mix(source.rgb, graded, u_intensity), source.a);
}`;

export interface GpuLutRenderer {
	/** Draws `source` through `cube` and returns the canvas holding the result. */
	render(input: {
		source: CanvasImageSource;
		width: number;
		height: number;
		cube: ColorCubeLut;
		/** 0..1; 0 leaves the frame untouched. */
		intensity: number;
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
		lutSize: gl.getUniformLocation(program, "u_lutSize"),
		intensity: gl.getUniformLocation(program, "u_intensity"),
	};

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
		render({ source, width, height, cube, intensity }) {
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

			gl.uniform1i(uniforms.frame, 0);
			gl.uniform1i(uniforms.lut, 1);
			gl.uniform1f(uniforms.lutSize, cube.size);
			gl.uniform1f(uniforms.intensity, Math.min(1, Math.max(0, intensity)));
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			return canvas;
		},
		dispose() {
			gl.deleteTexture(frameTexture);
			for (const texture of lutTextures.values()) {
				gl.deleteTexture(texture);
			}
			lutTextures.clear();
			gl.deleteBuffer(buffer);
			gl.deleteProgram(program);
		},
	};
}
