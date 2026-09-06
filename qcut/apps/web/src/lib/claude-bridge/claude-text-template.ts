import { TEXT_TEMPLATES } from "@/lib/text/text-template-registry";
import { BUILT_IN_TEXT_PRESETS } from "@/lib/text/text-presets";

export function resolveClaudeTextTemplate({
	element,
}: {
	element: Record<string, unknown>;
}): Record<string, unknown> {
	const templateId = element.textTemplateId;
	const presetId = element.stylePresetId;
	const template =
		templateId === "plain"
			? {}
			: typeof templateId === "string"
				? TEXT_TEMPLATES.find(({ id }) => id === templateId)
				: undefined;
	const preset =
		typeof presetId === "string"
			? BUILT_IN_TEXT_PRESETS.find(({ id }) => id === presetId)
			: undefined;
	if (templateId !== undefined && !template)
		throw new Error(`Unknown text template: ${String(templateId)}`);
	if (presetId !== undefined && !preset)
		throw new Error(`Unknown text style preset: ${String(presetId)}`);
	// Only getClaudeTextProperties' allowlisted visual fields leave this helper.
	const legacyStyle =
		element.style &&
		typeof element.style === "object" &&
		!Array.isArray(element.style)
			? element.style
			: {};
	return { ...template, ...preset?.updates, ...legacyStyle, ...element };
}
