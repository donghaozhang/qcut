import {
	platform,
	type PlatformFilesAPI,
	type SaveBlobResult,
} from "@qcut/platform-core";
import type { TimelineTemplate } from "@qcut/editor-core/templates";
import { encodeCustomTimelineTemplates } from "./custom-template-registry";

export function timelineTemplateFilename({
	template,
}: {
	template: TimelineTemplate;
}): string {
	return `${template.id}-${template.version}.qcut-template.json`;
}

export async function saveTimelineTemplateFile({
	template,
	files = platform().files,
}: {
	template: TimelineTemplate;
	files?: Pick<PlatformFilesAPI, "saveBlob">;
}): Promise<SaveBlobResult> {
	const data = new TextEncoder().encode(
		encodeCustomTimelineTemplates({ templates: [template] })
	);
	const result = await files.saveBlob(
		data,
		timelineTemplateFilename({ template })
	);
	if (!result.success && !result.canceled) {
		throw new Error(result.error ?? "Template export failed");
	}
	return result;
}
