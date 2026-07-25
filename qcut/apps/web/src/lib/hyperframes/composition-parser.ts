import {
	CANVAS_DIMENSIONS,
	extractCompositionMetadata,
	parseCompositionVariables,
	parseGsapScript,
	parseHtml,
	validateCompositionHtml,
	type CompositionVariable,
} from "@hyperframes/parsers";
import type {
	HyperframesVariableDefinition,
	HyperframesVariableValue,
} from "@/types/timeline";
import { HyperframesParseError, type HyperframesComposition } from "./types";

const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_DURATION = 5;

interface ParseHyperframesCompositionOptions {
	html: string;
	sourcePath: string;
	projectPath: string;
}

function parsePositiveNumber({
	value,
	fallback,
}: {
	value: string | null;
	fallback: number;
}): number {
	if (!value) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toVariableDefinition({
	variable,
}: {
	variable: CompositionVariable;
}): HyperframesVariableDefinition {
	const definition: HyperframesVariableDefinition = {
		id: variable.id,
		type: variable.type,
		label: variable.label || variable.id,
		description: variable.description,
		default: variable.default,
	};

	if (variable.type === "string") {
		definition.placeholder = variable.placeholder;
		definition.maxLength = variable.maxLength;
	}
	if (variable.type === "number") {
		definition.min = variable.min;
		definition.max = variable.max;
		definition.step = variable.step;
		definition.unit = variable.unit;
	}
	if (variable.type === "enum") {
		definition.options = variable.options;
	}

	return definition;
}

function getCompositionRoot({
	document,
	compositionId,
}: {
	document: Document;
	compositionId: string;
}): Element | null {
	for (const element of document.querySelectorAll("[data-composition-id]")) {
		if (element.getAttribute("data-composition-id") === compositionId) {
			return element;
		}
	}
	return null;
}

function readDisplayName({
	document,
	compositionId,
	sourcePath,
}: {
	document: Document;
	compositionId: string;
	sourcePath: string;
}): string {
	const title = document.querySelector("title")?.textContent?.trim();
	if (title) return title;

	const filename = sourcePath
		.split(/[\\/]/)
		.at(-1)
		?.replace(/\.html?$/i, "");
	return filename || compositionId;
}

function buildDefaultVariableValues({
	variables,
}: {
	variables: HyperframesVariableDefinition[];
}): Record<string, HyperframesVariableValue> {
	return Object.fromEntries(
		variables.map((variable) => [variable.id, variable.default])
	);
}

function readDeclaredVariables({
	document,
	fallback,
}: {
	document: Document;
	fallback: CompositionVariable[];
}): HyperframesVariableDefinition[] {
	const variablesById = new Map(
		fallback.map((variable) => [variable.id, variable])
	);
	for (const declarer of document.querySelectorAll(
		"[data-composition-variables]"
	)) {
		for (const variable of parseCompositionVariables(declarer)) {
			variablesById.set(variable.id, variable);
		}
	}
	return Array.from(variablesById.values(), (variable) =>
		toVariableDefinition({ variable })
	);
}

function readDimensionPair({
	element,
	widthAttribute,
	heightAttribute,
}: {
	element: Element | null;
	widthAttribute: string;
	heightAttribute: string;
}): { width: number; height: number } | null {
	if (!element) return null;
	const width = parsePositiveNumber({
		value: element.getAttribute(widthAttribute),
		fallback: 0,
	});
	const height = parsePositiveNumber({
		value: element.getAttribute(heightAttribute),
		fallback: 0,
	});
	return width > 0 && height > 0 ? { width, height } : null;
}

function readCssPixelPair({
	css,
}: {
	css: string;
}): { width: number; height: number } | null {
	const stageRule = /#stage\s*\{([^}]*)\}/i.exec(css)?.[1];
	if (!stageRule) return null;
	const width = Number(/\bwidth\s*:\s*(\d+(?:\.\d+)?)px/i.exec(stageRule)?.[1]);
	const height = Number(
		/\bheight\s*:\s*(\d+(?:\.\d+)?)px/i.exec(stageRule)?.[1]
	);
	return width > 0 && height > 0 ? { width, height } : null;
}

function readViewportPair({
	document,
}: {
	document: Document;
}): { width: number; height: number } | null {
	const content = document
		.querySelector('meta[name="viewport"]')
		?.getAttribute("content");
	if (!content) return null;
	const width = Number(/\bwidth\s*=\s*(\d+(?:\.\d+)?)/i.exec(content)?.[1]);
	const height = Number(/\bheight\s*=\s*(\d+(?:\.\d+)?)/i.exec(content)?.[1]);
	return width > 0 && height > 0 ? { width, height } : null;
}

function readCompositionDimensions({
	document,
	root,
	html,
}: {
	document: Document;
	root: Element;
	html: string;
}): { width: number; height: number } {
	const stage = document.getElementById("stage");
	const attributeCandidates = [
		readDimensionPair({
			element: root,
			widthAttribute: "data-width",
			heightAttribute: "data-height",
		}),
		readDimensionPair({
			element: document.documentElement,
			widthAttribute: "data-composition-width",
			heightAttribute: "data-composition-height",
		}),
		readDimensionPair({
			element: stage,
			widthAttribute: "data-width",
			heightAttribute: "data-height",
		}),
	];
	for (const candidate of attributeCandidates) {
		if (candidate) return candidate;
	}

	if (stage instanceof HTMLElement) {
		const width = Number.parseFloat(stage.style.width);
		const height = Number.parseFloat(stage.style.height);
		if (width > 0 && height > 0) return { width, height };
	}

	const viewport = readViewportPair({ document });
	if (viewport) return viewport;

	const css = Array.from(document.querySelectorAll("style"))
		.map((style) => style.textContent ?? "")
		.join("\n");
	const cssDimensions = readCssPixelPair({ css });
	if (cssDimensions) return cssDimensions;

	try {
		const resolution = parseHtml(html).resolution;
		const dimensions = CANVAS_DIMENSIONS[resolution];
		if (document.documentElement.hasAttribute("data-resolution")) {
			return { ...dimensions };
		}
	} catch {
		// Legacy HTML may not satisfy the parser's complete document contract.
	}

	return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

function inferStaticDuration({ html }: { html: string }): number {
	try {
		const parsed = parseHtml(html);
		const elementDuration = parsed.elements.reduce(
			(maximum, element) =>
				Math.max(maximum, element.startTime + element.duration),
			0
		);
		if (!parsed.gsapScript) return elementDuration;

		const gsap = parseGsapScript(parsed.gsapScript);
		const animationDuration = gsap.animations.reduce((maximum, animation) => {
			const start = animation.resolvedStart;
			const duration = animation.duration;
			if (
				typeof start !== "number" ||
				!Number.isFinite(start) ||
				typeof duration !== "number" ||
				!Number.isFinite(duration)
			) {
				return maximum;
			}
			const repeat =
				typeof animation.extras?.repeat === "number" &&
				Number.isFinite(animation.extras.repeat) &&
				animation.extras.repeat > 0
					? Math.floor(animation.extras.repeat)
					: 0;
			const repeatDelay =
				typeof animation.extras?.repeatDelay === "number" &&
				Number.isFinite(animation.extras.repeatDelay) &&
				animation.extras.repeatDelay > 0
					? animation.extras.repeatDelay
					: 0;
			const totalDuration = duration * (repeat + 1) + repeatDelay * repeat;
			return Math.max(maximum, start + totalDuration);
		}, 0);
		return Math.max(elementDuration, animationDuration);
	} catch {
		return 0;
	}
}

/** Parse and validate a local HyperFrames HTML composition. */
export function parseHyperframesComposition({
	html,
	sourcePath,
	projectPath,
}: ParseHyperframesCompositionOptions): HyperframesComposition {
	if (!html.trim()) {
		throw new HyperframesParseError({
			issues: ["The selected HTML file is empty."],
		});
	}

	const validation = validateCompositionHtml(html);

	const document = new DOMParser().parseFromString(html, "text/html");
	const metadata = extractCompositionMetadata(html);
	const legacyRoot = document.querySelector("[data-composition-id]");
	const compositionId =
		metadata.compositionId ??
		legacyRoot?.getAttribute("data-composition-id") ??
		null;
	if (!compositionId) {
		throw new HyperframesParseError({
			issues: ["Missing data-composition-id on the root composition."],
		});
	}
	const root = getCompositionRoot({ document, compositionId });
	const explicitDuration =
		metadata.compositionDuration ??
		parsePositiveNumber({
			value:
				root?.getAttribute("data-duration") ??
				document.documentElement.getAttribute("data-composition-duration"),
			fallback: 0,
		});

	if (!root) {
		throw new HyperframesParseError({
			issues: [`Composition "${compositionId}" was not found in the HTML.`],
		});
	}

	const variables = readDeclaredVariables({
		document,
		fallback: metadata.variables,
	});
	const inferredDuration =
		explicitDuration > 0 ? explicitDuration : inferStaticDuration({ html });
	const duration = inferredDuration > 0 ? inferredDuration : DEFAULT_DURATION;
	const durationIsEstimated = explicitDuration <= 0;
	const dimensions = readCompositionDimensions({ document, root, html });
	const warnings = [...validation.errors, ...validation.warnings];
	if (durationIsEstimated) {
		warnings.push(
			"Composition duration was inferred and will be verified by the HyperFrames runtime."
		);
	}

	return {
		id: compositionId,
		name: readDisplayName({
			document,
			compositionId,
			sourcePath,
		}),
		sourcePath,
		projectPath,
		duration,
		durationIsEstimated,
		width: dimensions.width,
		height: dimensions.height,
		fps: parsePositiveNumber({
			value:
				root.getAttribute("data-fps") ??
				document.documentElement.getAttribute("data-fps"),
			fallback: DEFAULT_FPS,
		}),
		variables,
		defaultVariableValues: buildDefaultVariableValues({ variables }),
		warnings,
	};
}
