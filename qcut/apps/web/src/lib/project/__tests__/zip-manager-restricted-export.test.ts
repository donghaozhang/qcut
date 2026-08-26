import { describe, expect, it, vi } from "vitest";
import { ZipManager } from "../zip-manager";

describe("ZipManager restricted media policy", () => {
	it("rejects restricted media before reading its bytes", async () => {
		const file = new File(["private-reference"], "reference.gif", {
			type: "image/gif",
		});
		const readBytes = vi.spyOn(file, "arrayBuffer");

		await expect(
			new ZipManager().addMediaItems([
				{
					file,
					id: "restricted-sticker",
					metadata: { redistribution: "prohibited" },
					name: file.name,
					type: "image",
				},
			])
		).rejects.toMatchObject({
			code: "QCUT_RESTRICTED_MEDIA_EXPORT",
		});
		expect(readBytes).not.toHaveBeenCalled();
	});
});
