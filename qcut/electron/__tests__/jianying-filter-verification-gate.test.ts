// @vitest-environment node
import { describe, expect, it } from "vitest";
import { selectVerificationForCard } from "../jianying-filter-verification-gate";

describe("selectVerificationForCard", () => {
	it("selects the latest record for the card's exact version", () => {
		const selected = selectVerificationForCard({
			version: "v1",
			implementation: "single-lut",
			candidates: [
				{
					status: "close",
					version: "v1",
					rgbRmse: 3,
					verifiedAt: "2026-08-10T00:00:00Z",
				},
				{
					status: "verified",
					version: "v2",
					rgbRmse: 0,
					verifiedAt: "2026-08-12T00:00:00Z",
				},
				{
					status: "verified",
					version: "v1",
					rgbRmse: 1,
					verifiedAt: "2026-08-11T00:00:00Z",
				},
			],
		});

		expect(selected).toMatchObject({
			status: "verified",
			version: "v1",
			rgbRmse: 1,
		});
	});

	it("rejects a versionless record for a versioned card", () => {
		expect(
			selectVerificationForCard({
				version: "v1",
				candidates: {
					status: "verified",
					verifiedAt: "2026-08-12T00:00:00Z",
				},
			})
		).toEqual({ status: "unverified" });
	});

	it("accepts the latest candidate when the card has no version", () => {
		expect(
			selectVerificationForCard({
				candidates: [
					{
						status: "close",
						version: "v1",
						verifiedAt: "2026-08-10T00:00:00Z",
					},
					{
						status: "verified",
						version: "v2",
						verifiedAt: "2026-08-12T00:00:00Z",
					},
				],
			})
		).toMatchObject({ status: "verified", version: "v2" });
	});

	it("downgrades dual LUT verification without mask-edge evidence", () => {
		const candidate = {
			status: "verified" as const,
			version: "v1",
			rgbRmse: 0.5,
			verifiedAt: "2026-08-12T00:00:00Z",
		};
		const selected = selectVerificationForCard({
			candidates: candidate,
			version: "v1",
			implementation: "dual-lut",
		});

		expect(selected).toMatchObject({ status: "unverified", rgbRmse: 0.5 });
		expect(candidate.status).toBe("verified");
	});
});
