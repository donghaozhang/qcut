import {
	TIMELINE_TEMPLATE_SCHEMA,
	TIMELINE_TEMPLATE_SCHEMA_VERSION,
	validateTimelineTemplate,
	type TimelineTemplate,
} from "@qcut/editor-core/templates";
import {
	notifyUserLibraryChanged,
	USER_LIBRARY_NAMESPACES,
} from "@/lib/user-library/user-library-events";

export const CUSTOM_TIMELINE_TEMPLATES_STORAGE_KEY =
	"qcut-timeline-templates-v1";
export const CUSTOM_TIMELINE_TEMPLATES_CHANGED_EVENT =
	"qcut:timeline-templates-changed";

const MAX_CUSTOM_TEMPLATES = 100;

function isTemplateShape({ value }: { value: unknown }): boolean {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return (
		candidate.schema === TIMELINE_TEMPLATE_SCHEMA &&
		candidate.schemaVersion === TIMELINE_TEMPLATE_SCHEMA_VERSION &&
		typeof candidate.id === "string" &&
		typeof candidate.name === "string" &&
		typeof candidate.version === "string" &&
		Array.isArray(candidate.supportedAspectRatios) &&
		Array.isArray(candidate.fonts) &&
		Array.isArray(candidate.slots) &&
		Array.isArray(candidate.variants)
	);
}

export function parseTimelineTemplate({
	value,
}: {
	value: unknown;
}): TimelineTemplate | null {
	if (!isTemplateShape({ value })) return null;
	try {
		const template = structuredClone(value) as TimelineTemplate;
		return validateTimelineTemplate({ template }).valid ? template : null;
	} catch {
		return null;
	}
}

export function loadCustomTimelineTemplates(): TimelineTemplate[] {
	if (typeof localStorage === "undefined") return [];
	try {
		const parsed: unknown = JSON.parse(
			localStorage.getItem(CUSTOM_TIMELINE_TEMPLATES_STORAGE_KEY) ?? "[]"
		);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.map((value) => parseTimelineTemplate({ value }))
			.filter((template): template is TimelineTemplate => template !== null)
			.slice(0, MAX_CUSTOM_TEMPLATES);
	} catch {
		return [];
	}
}

export function persistCustomTimelineTemplates({
	templates,
}: {
	templates: TimelineTemplate[];
}): void {
	if (typeof localStorage === "undefined") return;
	const validTemplates = templates
		.map((value) => parseTimelineTemplate({ value }))
		.filter((template): template is TimelineTemplate => template !== null)
		.slice(0, MAX_CUSTOM_TEMPLATES);
	localStorage.setItem(
		CUSTOM_TIMELINE_TEMPLATES_STORAGE_KEY,
		JSON.stringify(validTemplates)
	);
	notifyUserLibraryChanged({
		namespace: USER_LIBRARY_NAMESPACES.timelineTemplates,
	});
	if (typeof window !== "undefined") {
		window.dispatchEvent(new Event(CUSTOM_TIMELINE_TEMPLATES_CHANGED_EVENT));
	}
}

function importedValues({ value }: { value: unknown }): unknown[] {
	if (Array.isArray(value)) return value;
	if (value && typeof value === "object" && "templates" in value) {
		const templates = (value as { templates?: unknown }).templates;
		return Array.isArray(templates) ? templates : [];
	}
	return [value];
}

export function importCustomTimelineTemplates({
	text,
	builtInIds,
}: {
	text: string;
	builtInIds: ReadonlySet<string>;
}): TimelineTemplate[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error("Template file is not valid JSON");
	}
	const templates = importedValues({ value: parsed }).map((value, index) => {
		const template = parseTimelineTemplate({ value });
		if (!template) throw new Error(`Template ${index + 1} is invalid`);
		if (builtInIds.has(template.id)) {
			throw new Error(`Template id ${template.id} is reserved by QCut`);
		}
		return template;
	});
	if (templates.length === 0) throw new Error("Template file is empty");

	const merged = new Map(
		loadCustomTimelineTemplates().map((template) => [template.id, template])
	);
	for (const template of templates) merged.set(template.id, template);
	const next = [...merged.values()].slice(-MAX_CUSTOM_TEMPLATES);
	persistCustomTimelineTemplates({ templates: next });
	return templates;
}

export function removeCustomTimelineTemplate({
	templateId,
}: {
	templateId: string;
}): TimelineTemplate[] {
	const next = loadCustomTimelineTemplates().filter(
		(template) => template.id !== templateId
	);
	persistCustomTimelineTemplates({ templates: next });
	return next;
}

export function encodeCustomTimelineTemplates({
	templates,
}: {
	templates: TimelineTemplate[];
}): string {
	return JSON.stringify({ templates }, null, 2);
}
