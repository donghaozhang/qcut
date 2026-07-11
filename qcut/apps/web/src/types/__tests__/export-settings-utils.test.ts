import { describe, expect, it } from "vitest";
import {
	ExportFormat,
	ExportQuality,
	getEstimatedExportSize,
	getExportFilename,
} from "../export";

describe("export settings helpers", () => {
	it("estimates total size from duration and quality", () => {
		expect(
			getEstimatedExportSize({
				quality: ExportQuality.HIGH,
				durationSeconds: 90,
			})
		).toBe("~75-150 MB");
		expect(
			getEstimatedExportSize({
				quality: ExportQuality.MEDIUM,
				durationSeconds: 0,
			})
		).toBe("--");
	});

	it("adds the selected format extension exactly once", () => {
		expect(
			getExportFilename({ filename: "launch", format: ExportFormat.MP4 })
		).toBe("launch.mp4");
		expect(
			getExportFilename({ filename: "launch.MP4", format: ExportFormat.MP4 })
		).toBe("launch.MP4");
	});
});
