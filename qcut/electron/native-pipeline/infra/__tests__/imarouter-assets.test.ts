import { describe, expect, it } from "vitest";

import { channelFor } from "../imarouter-assets.js";

describe("channelFor", () => {
	it("routes overseas seedance keys to seedance-upload", () => {
		const overseas = channelFor("imarouter_seedance_2_0_t2v");
		expect(overseas.region).toBe("overseas");
		expect(overseas.uploadModel).toBe("seedance-upload");
		expect(overseas.groupIdKey).toBe("groupIdOverseas");

		const fast = channelFor("imarouter_seedance_2_0_fast_i2v");
		expect(fast.region).toBe("overseas");
		expect(fast.uploadModel).toBe("seedance-upload");
	});

	it("routes _cn keys to the CN upload model", () => {
		const cn = channelFor("imarouter_seedance_2_0_cn_t2v");
		expect(cn.region).toBe("cn");
		expect(cn.uploadModel).toBe("ima-pro-upload-cn");
		expect(cn.groupIdKey).toBe("groupIdCn");

		const fastCn = channelFor("imarouter_seedance_2_0_fast_cn_ref2v");
		expect(fastCn.region).toBe("cn");
		expect(fastCn.uploadModel).toBe("ima-pro-upload-cn");
	});

	it("routes raw API model names (-cn suffix) to CN", () => {
		// Matches what the standalone script passes — guards against drift if
		// the executor ever feeds the API model name instead of the registry key.
		expect(channelFor("seedance-2.0-cn").region).toBe("cn");
		expect(channelFor("seedance-2.0-fast-cn").region).toBe("cn");
		expect(channelFor("seedance-2.0").region).toBe("overseas");
		expect(channelFor("seedance-2.0-fast").region).toBe("overseas");
	});

	it("defaults to overseas for unknown inputs", () => {
		expect(channelFor("not-a-real-model").region).toBe("overseas");
	});
});
