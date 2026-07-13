import { describe, expect, it } from "vitest";
import {
	detectUpdateChannel,
	normalizeReleaseNotesVersion,
	parseReleaseVersion,
	toPackageVersion,
	toReleaseVersion,
} from "../update-version";

describe("update version mapping", () => {
	it("maps public calendar versions to valid sortable SemVer", () => {
		expect(toPackageVersion({ releaseVersion: "2026.07.11.1" })).toBe(
			"2026.7.1101"
		);
		expect(toPackageVersion({ releaseVersion: "2026.07.11.2-beta.3" })).toBe(
			"2026.7.1102-beta.3"
		);
	});

	it("round-trips package versions for user-facing release notes", () => {
		expect(toReleaseVersion({ packageVersion: "2026.7.1101" })).toBe(
			"2026.07.11.1"
		);
		expect(toReleaseVersion({ packageVersion: "2026.12.3109-rc.2" })).toBe(
			"2026.12.31.9-rc.2"
		);
	});

	it("preserves unknown legacy versions instead of mislabelling them", () => {
		expect(toReleaseVersion({ packageVersion: "0.3.72" })).toBe("0.3.72");
		expect(toReleaseVersion({ packageVersion: "2026.7.1-1.1" })).toBe(
			"2026.7.1-1.1"
		);
	});

	it("normalizes safe release-note filenames", () => {
		expect(normalizeReleaseNotesVersion({ version: "2026.7.1101" })).toBe(
			"2026.07.11.1"
		);
		expect(normalizeReleaseNotesVersion({ version: "2026.07.11.1" })).toBe(
			"2026.07.11.1"
		);
		expect(normalizeReleaseNotesVersion({ version: "0.3.72" })).toBe("0.3.72");
		expect(() =>
			normalizeReleaseNotesVersion({ version: "../../private" })
		).toThrow("Invalid version format");
	});

	it("rejects invalid dates and exhausted daily build slots", () => {
		expect(() => parseReleaseVersion({ version: "2026.13.11.1" })).toThrow(
			"invalid calendar date"
		);
		expect(() => parseReleaseVersion({ version: "2026.07.11.100" })).toThrow(
			"between 1 and 99"
		);
	});

	it("detects stable and prerelease channels", () => {
		expect(detectUpdateChannel({ version: "2026.7.1101" })).toBe("latest");
		expect(detectUpdateChannel({ version: "2026.7.1101-beta.2" })).toBe("beta");
	});
});
