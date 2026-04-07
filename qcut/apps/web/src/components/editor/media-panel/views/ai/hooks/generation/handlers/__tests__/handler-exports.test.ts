import { describe, expect, it } from "vitest";
import * as avatarHandlers from "../avatar-handlers";
import * as imageToVideoHandlers from "../image-to-video-handlers";
import * as imageToVideoHandlersExt from "../image-to-video-handlers-ext";
import * as imageToVideoHandlersGmi from "../image-to-video-handlers-gmi";
import * as textToVideoHandlers from "../text-to-video-handlers";
import * as upscaleHandlers from "../upscale-handlers";

function getHandlerExports({
	moduleExports,
}: {
	moduleExports: Record<string, unknown>;
}): string[] {
	return Object.getOwnPropertyNames(moduleExports).flatMap((name) => {
		const value = moduleExports[name];
		if (!name.startsWith("handle")) {
			return [];
		}

		if (typeof value !== "function") {
			return [];
		}

		return [name];
	});
}

describe("handler module exports", () => {
	it("text-to-video-handlers exports exactly 15 functions", () => {
		const names = getHandlerExports({ moduleExports: textToVideoHandlers });
		expect(names).toHaveLength(15);
	});

	it("image-to-video-handlers exports exactly 14 functions", () => {
		const names = getHandlerExports({ moduleExports: imageToVideoHandlers });
		expect(names).toHaveLength(14);
	});

	it("image-to-video-handlers-gmi exports exactly 5 functions", () => {
		const names = getHandlerExports({
			moduleExports: imageToVideoHandlersGmi,
		});
		expect(names).toHaveLength(5);
	});

	it("image-to-video-handlers-ext exports exactly 5 functions", () => {
		const names = getHandlerExports({
			moduleExports: imageToVideoHandlersExt,
		});
		expect(names).toHaveLength(5);
	});

	it("upscale-handlers exports exactly 2 functions", () => {
		const names = getHandlerExports({ moduleExports: upscaleHandlers });
		expect(names).toHaveLength(2);
	});

	it("avatar-handlers exports exactly 9 functions", () => {
		const names = getHandlerExports({ moduleExports: avatarHandlers });
		expect(names).toHaveLength(9);
	});

	it("all 50 handlers are functions", () => {
		const allNames = [
			...getHandlerExports({ moduleExports: textToVideoHandlers }),
			...getHandlerExports({ moduleExports: imageToVideoHandlers }),
			...getHandlerExports({ moduleExports: imageToVideoHandlersExt }),
			...getHandlerExports({ moduleExports: imageToVideoHandlersGmi }),
			...getHandlerExports({ moduleExports: upscaleHandlers }),
			...getHandlerExports({ moduleExports: avatarHandlers }),
		];
		expect(allNames).toHaveLength(50);
	});

	it("handleWAN26T2V is in text-to-video, not image-to-video", () => {
		expect("handleWAN26T2V" in textToVideoHandlers).toBe(true);
		expect("handleWAN26T2V" in imageToVideoHandlers).toBe(false);
	});
});
