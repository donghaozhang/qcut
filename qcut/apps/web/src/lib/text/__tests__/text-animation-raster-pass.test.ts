import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTextAnimationRasterPasses } from "../text-animation-raster-pass";
import { acquireTextAnimationRaster } from "../text-animation-canvas-raster";

vi.mock("../text-animation-canvas-raster", () => ({
	acquireTextAnimationRaster: vi.fn(),
}));

interface StubBuffer {
	channel: string;
	canvas: { id: string };
	ctx: {
		globalAlpha: number;
		clearRect: ReturnType<typeof vi.fn>;
		drawImage: ReturnType<typeof vi.fn>;
	};
}

function stubBuffer({ channel }: { channel: string }): StubBuffer {
	return {
		channel,
		canvas: { id: channel },
		ctx: {
			globalAlpha: 1,
			clearRect: vi.fn(),
			drawImage: vi.fn(),
		},
	};
}

/** A pass that draws: layered with a real offset. */
function drawingPass() {
	return { kind: "layered" as const, offsetPx: 8, amplitudePx: 0, samples: 2 };
}

/** A pass that declines: echo below its spread threshold. */
function decliningPass() {
	return { kind: "echo" as const, spread: 0, samples: 2 };
}

describe("applyTextAnimationRasterPasses ping-pong", () => {
	const buffers = new Map<string, StubBuffer>();

	beforeEach(() => {
		buffers.clear();
		vi.mocked(acquireTextAnimationRaster).mockImplementation(
			({ channel }: { channel: string }) => {
				const cached = buffers.get(channel) ?? stubBuffer({ channel });
				buffers.set(channel, cached);
				return cached as unknown as ReturnType<
					typeof acquireTextAnimationRaster
				>;
			}
		);
	});

	// A declined intermediate pass leaves `current` in the buffer written two
	// passes ago. Index-driven channel selection would hand the next pass
	// that very buffer, and its clearRect wipes the chain's output before it
	// is read. Channels must advance only on successful writes.
	it("never clears the buffer the chain is currently reading from", () => {
		const destination = stubBuffer({ channel: "destination" });
		const source = { id: "glyph-source" };

		const result = applyTextAnimationRasterPasses({
			ctx: destination.ctx as never,
			source: source as never,
			width: 64,
			height: 32,
			dx: 0,
			dy: 0,
			rasters: [drawingPass(), decliningPass(), drawingPass(), drawingPass()],
		});

		expect(result).toBe(true);
		for (const buffer of buffers.values()) {
			for (const call of buffer.ctx.drawImage.mock.calls) {
				// No buffer may ever draw FROM its own canvas: that means the
				// chain read a surface that was just cleared.
				expect(call[0]).not.toBe(buffer.canvas);
			}
		}
		// The two successful intermediate writes ping-ponged across BOTH
		// channels instead of reusing the first one.
		const drawnChannels = [...buffers.values()]
			.filter((buffer) => buffer.ctx.drawImage.mock.calls.length > 0)
			.map((buffer) => buffer.channel)
			.sort();
		expect(drawnChannels).toEqual(["post-chain-a", "post-chain-b"]);
		// The final composite came from the second write's buffer.
		const lastDraw = destination.ctx.drawImage.mock.calls.at(-1);
		expect(lastDraw?.[0]).toBe(buffers.get("post-chain-b")?.canvas);
	});
});
