import { describe, expect, it } from "vitest";
import { listRemoteAssets } from "../sticker-lab-private-catalog/storage-client";
import type { StorageFetch } from "../sticker-lab-private-catalog/types";

const LIST_PAGE_SIZE = 1000;
const ASSET_OBJECT_PREFIX = "catalogs/jianying-batch-02/assets/";

function fullPageBody(): string {
	return JSON.stringify(
		Array.from({ length: LIST_PAGE_SIZE }, (_unused, index) => ({
			name: `${index}.gif`,
			metadata: { size: 1 },
		}))
	);
}

describe("listRemoteAssets", () => {
	it("stops instead of looping forever when the endpoint ignores the offset", async () => {
		// Always returns a full page, so the short-page terminator never fires.
		const body = fullPageBody();
		let requestCount = 0;
		const storageFetch: StorageFetch = async () => {
			requestCount += 1;
			return new Response(body, { status: 200 });
		};

		await expect(
			listRemoteAssets({ assetObjectPrefix: ASSET_OBJECT_PREFIX, storageFetch })
		).rejects.toThrow("exceeded 100 pages");
		expect(requestCount).toBe(100);
	});

	it("returns every page when the endpoint paginates correctly", async () => {
		const body = fullPageBody();
		let requestCount = 0;
		const storageFetch: StorageFetch = async () => {
			requestCount += 1;
			// Second response is short, which ends the walk.
			return requestCount === 1
				? new Response(body, { status: 200 })
				: Response.json([{ name: "0.png", metadata: { size: 2 } }]);
		};

		const assets = await listRemoteAssets({
			assetObjectPrefix: ASSET_OBJECT_PREFIX,
			storageFetch,
		});

		expect(requestCount).toBe(2);
		expect(assets).toHaveLength(LIST_PAGE_SIZE + 1);
	});
});
