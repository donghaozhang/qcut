import { afterEach, describe, expect, it, vi } from "vitest";
import { StorageService } from "../storage-service";

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(
	navigator,
	"storage"
);

afterEach(() => {
	if (originalStorageDescriptor === undefined) {
		Reflect.deleteProperty(navigator, "storage");
		return;
	}
	Object.defineProperty(navigator, "storage", originalStorageDescriptor);
});

function installEstimate({
	quota,
	usage,
}: {
	quota: number;
	usage: number;
}): void {
	Object.defineProperty(navigator, "storage", {
		configurable: true,
		value: { estimate: vi.fn(async () => ({ quota, usage })) },
	});
}

describe("StorageService.checkStorageQuota", () => {
	it("reserves the configured safety margin for a full import", async () => {
		installEstimate({ usage: 60, quota: 100 });
		const service = new StorageService();

		await expect(
			service.checkStorageQuota({ requiredBytes: 20 })
		).resolves.toMatchObject({ available: true });
		await expect(
			service.checkStorageQuota({ requiredBytes: 21 })
		).resolves.toMatchObject({ available: false });
	});

	it("rejects invalid required byte counts", async () => {
		installEstimate({ usage: 0, quota: 100 });
		const service = new StorageService();
		await expect(
			service.checkStorageQuota({ requiredBytes: -1 })
		).rejects.toThrow("Required storage byte length is invalid");
	});
});
