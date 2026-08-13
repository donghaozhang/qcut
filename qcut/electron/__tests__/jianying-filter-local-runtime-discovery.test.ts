// @vitest-environment node
import { describe, expect, it } from "vitest";
import { jianyingFilterLocalRuntimeDiscoveryTestUtils } from "../jianying-filter-local-runtime/runtime-discovery.js";

const KNOWN_UUID = "9A8A8F6B-31C0-3DDC-85AC-5F11087D7965";

function uuidLine({
	uuid,
	architecture,
}: {
	uuid: string;
	architecture: string;
}) {
	return `UUID: ${uuid} (${architecture}) /Applications/VideoFusion-macOS.app/Contents/Frameworks/libcccreator.dylib`;
}

describe("Jianying filter local runtime discovery", () => {
	it("requires a verified UUID for the current Apple Silicon slice", () => {
		const stdout = [
			uuidLine({
				uuid: "00000000-0000-0000-0000-000000000000",
				architecture: "arm64",
			}),
			uuidLine({ uuid: KNOWN_UUID, architecture: "x86_64" }),
		].join("\n");

		expect(
			jianyingFilterLocalRuntimeDiscoveryTestUtils.hasCompatibleLibrarySlice({
				stdout,
				architecture: "arm64",
			})
		).toBe(false);
	});

	it("maps Node x64 to the Mach-O x86_64 slice", () => {
		const stdout = uuidLine({ uuid: KNOWN_UUID, architecture: "x86_64" });

		expect(
			jianyingFilterLocalRuntimeDiscoveryTestUtils.hasCompatibleLibrarySlice({
				stdout,
				architecture: "x64",
			})
		).toBe(true);
	});
});
