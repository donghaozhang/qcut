// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveIndependentFogLut } from "../qcut-independent-filter/assets.js";
import {
	createIndependentFilterSession,
	createIndependentFrameRequest,
	type IndependentFilterSession,
} from "../qcut-independent-filter/session.js";

describe.skipIf(
	process.platform !== "darwin" ||
		process.env.QCUT_INDEPENDENT_METAL_TEST !== "1"
)("real QCut Metal protocol", () => {
	let session: IndependentFilterSession;
	beforeAll(async () => {
		session = await createIndependentFilterSession({
			lutPath: await resolveIndependentFogLut(),
		});
	}, 120_000);
	afterAll(async () => {
		await session?.dispose();
	});
	it("keeps transparent zero-strength pixels byte exact", async () => {
		const rgba = new Uint8Array([
			10, 250, 44, 0, 12, 49, 245, 128, 255, 128, 0, 255,
		]);
		const result = await session.render(
			createIndependentFrameRequest({ rgba, width: 3, height: 1, intensity: 0 })
		);
		expect(result.rgba).toEqual(rgba);
	});
	it("snapshots queued parameters and pixels", async () => {
		const request = createIndependentFrameRequest({
			rgba: new Uint8Array([50, 60, 70, 255]),
			width: 1,
			height: 1,
			intensity: 0,
		});
		const result = session.render(request);
		request.width = 4096;
		request.intensity = 100;
		request.rgba.fill(0);
		expect((await result).rgba).toEqual(new Uint8Array([50, 60, 70, 255]));
	});
	it("serializes eight requests and rejects queue overflow", async () => {
		const requests = Array.from({ length: 8 }, (_, i) =>
			createIndependentFrameRequest({
				rgba: new Uint8Array([i, 50, 90, 255]),
				width: 1,
				height: 1,
				intensity: 0,
			})
		);
		const pending = requests.map((request) => session.render(request));
		await expect(session.render(requests[0])).rejects.toThrow("queue is full");
		const frames = await Promise.all(pending);
		expect(frames.map((frame) => frame.rgba[0])).toEqual([
			0, 1, 2, 3, 4, 5, 6, 7,
		]);
	});
	it("rejects dimensions, intensity and versions before corrupting the stream", async () => {
		const request = createIndependentFrameRequest({
			rgba: new Uint8Array([50, 60, 70, 255]),
			width: 1,
			height: 1,
			intensity: 0,
		});
		await expect(session.render({ ...request, width: 0 })).rejects.toThrow();
		await expect(
			session.render({ ...request, width: 1920, height: 1081 })
		).rejects.toThrow();
		await expect(
			session.render({ ...request, intensity: Number.NaN })
		).rejects.toThrow();
		await expect(
			session.render({ ...request, version: "wrong" })
		).rejects.toThrow();
		expect((await session.render(request)).rgba).toEqual(request.rgba);
	});
	it("renders and repeats an opaque odd-sized frame across size changes", async () => {
		const rgba = new Uint8Array(33 * 17 * 4);
		for (let i = 0; i < rgba.length; i += 4) {
			rgba[i] = i % 255;
			rgba[i + 1] = 140;
			rgba[i + 2] = 200;
			rgba[i + 3] = 255;
		}
		const request = createIndependentFrameRequest({
			rgba,
			width: 33,
			height: 17,
			intensity: 100,
		});
		const first = await session.render(request);
		await session.render(
			createIndependentFrameRequest({
				rgba: new Uint8Array([0, 0, 0, 255]),
				width: 1,
				height: 1,
				intensity: 50,
			})
		);
		const second = await session.render(request);
		expect(first.rgba).not.toEqual(rgba);
		expect(second.rgba).toEqual(first.rgba);
	});
});
