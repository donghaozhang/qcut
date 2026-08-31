// @vitest-environment node

import { access } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createPlanarTrackingWorkspace } from "../planar-tracking-video-fixture";

describe("planar tracking E2E workspace", () => {
	it("removes the temporary workspace when video setup fails", async () => {
		const setupFailure = new Error("fixture generation failed");
		let createdDirectory = "";

		await expect(
			createPlanarTrackingWorkspace({
				generateVideo: ({ rootDirectory }) => {
					createdDirectory = rootDirectory;
					return Promise.reject(setupFailure);
				},
			})
		).rejects.toBe(setupFailure);

		expect(createdDirectory).not.toBe("");
		await expect(access(createdDirectory)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
});
