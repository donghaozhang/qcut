import { describe, expect, it, vi } from "vitest";
import { TIMELINE_TEMPLATES } from "../template-registry";
import {
	saveTimelineTemplateFile,
	timelineTemplateFilename,
} from "../timeline-template-file";

describe("timeline template file export", () => {
	it("saves a portable JSON envelope with a deterministic filename", async () => {
		const saveBlob = vi.fn().mockResolvedValue({
			success: true,
			filePath: "/tmp/template.json",
		});
		const template = TIMELINE_TEMPLATES[0];

		await expect(
			saveTimelineTemplateFile({ template, files: { saveBlob } })
		).resolves.toMatchObject({ success: true });
		expect(saveBlob).toHaveBeenCalledOnce();
		const [data, filename] = saveBlob.mock.calls[0] as [Uint8Array, string];
		expect(filename).toBe(timelineTemplateFilename({ template }));
		expect(JSON.parse(new TextDecoder().decode(data))).toEqual({
			templates: [template],
		});
	});

	it("distinguishes cancellation from a write failure", async () => {
		const template = TIMELINE_TEMPLATES[0];
		await expect(
			saveTimelineTemplateFile({
				template,
				files: {
					saveBlob: vi
						.fn()
						.mockResolvedValue({ success: false, canceled: true }),
				},
			})
		).resolves.toEqual({ success: false, canceled: true });
		await expect(
			saveTimelineTemplateFile({
				template,
				files: {
					saveBlob: vi
						.fn()
						.mockResolvedValue({ success: false, error: "disk full" }),
				},
			})
		).rejects.toThrow("disk full");
	});
});
