import { describe, expect, it } from "vitest";
import {
	decodeReviewPackage,
	encodeReviewPackage,
	type ReviewPackage,
} from "../review-share";

function reviewPackage(): ReviewPackage {
	return {
		comments: [
			{
				author: "小萨",
				createdAt: 100,
				id: "comment-1",
				resolved: false,
				text: "这里剪快一点",
				time: 12.5,
				updatedAt: 100,
			},
		],
		createdAt: 100,
		project: { duration: 30, id: "project-1", name: "审片工程" },
		version: 1,
	};
}

describe("portable review packages", () => {
	it("round-trips Unicode comments through a URL-safe token", () => {
		const source = reviewPackage();
		const token = encodeReviewPackage({ reviewPackage: source });

		expect(token).toMatch(/^qcut-review:v1:[A-Za-z0-9_-]+$/);
		expect(decodeReviewPackage({ token })).toEqual(source);
	});

	it("rejects malformed and structurally invalid packages", () => {
		expect(decodeReviewPackage({ token: "not-a-review" })).toBeNull();
		const invalidToken = encodeReviewPackage({
			reviewPackage: { ...reviewPackage(), comments: [] },
		}).replace("qcut-review:v1:", "qcut-review:v2:");
		expect(decodeReviewPackage({ token: invalidToken })).toBeNull();
	});
});
