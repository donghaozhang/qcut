import type { BrowserWindow } from "electron";
import type {
	EditorSnapshotActionResult,
	EditorSnapshotClickRequest,
	EditorSnapshotFillRequest,
	EditorSnapshotRequest,
	EditorSnapshotResult,
} from "../../types/claude-api.js";
import {
	EDITOR_SNAPSHOT_REF_ATTRIBUTE,
	EDITOR_SNAPSHOT_VERSION,
	MAX_EDITOR_SNAPSHOT_DEPTH,
} from "../../types/claude-api.js";

interface SnapshotActionFailure {
	ok: false;
	errorCode: string;
	message: string;
}

export class EditorSnapshotActionError extends Error {
	statusCode: number;

	constructor({
		message,
		statusCode,
	}: {
		message: string;
		statusCode: number;
	}) {
		super(message);
		this.name = "EditorSnapshotActionError";
		this.statusCode = statusCode;
	}
}

function normalizeSnapshotRequest({
	request,
}: {
	request?: EditorSnapshotRequest;
}): Required<EditorSnapshotRequest> {
	const interactive = request?.interactive === true;

	let depth = MAX_EDITOR_SNAPSHOT_DEPTH;
	if (typeof request?.depth === "number" && Number.isFinite(request.depth)) {
		const parsedDepth = Math.trunc(request.depth);
		if (parsedDepth >= 0) {
			depth = Math.min(parsedDepth, MAX_EDITOR_SNAPSHOT_DEPTH);
		}
	}

	return {
		interactive,
		depth,
	};
}

function buildSnapshotScript({
	request,
}: {
	request?: EditorSnapshotRequest;
}): string {
	const normalized = normalizeSnapshotRequest({ request });
	return `(() => {
		const REF_ATTR = ${JSON.stringify(EDITOR_SNAPSHOT_REF_ATTRIBUTE)};
		const interactiveOnly = ${normalized.interactive ? "true" : "false"};
		const maxDepth = ${normalized.depth};
		const MAX_TEXT = 120;
		const MAX_VALUE = 120;

		for (const node of Array.from(document.querySelectorAll("[" + REF_ATTR + "]"))) {
			if (node instanceof HTMLElement) {
				node.removeAttribute(REF_ATTR);
			}
		}

		const isVisible = (element) => {
			if (!(element instanceof HTMLElement)) return false;
			if (element.hidden) return false;
			const style = window.getComputedStyle(element);
			if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
				return false;
			}
			return element.getClientRects().length > 0;
		};

		const getRole = (element) => {
			const explicitRole = element.getAttribute("role");
			if (explicitRole) return explicitRole;
			const tag = element.tagName.toLowerCase();
			if (tag === "button") return "button";
			if (tag === "a" && element.getAttribute("href")) return "link";
			if (tag === "input") {
				const type = element.getAttribute("type") || "text";
				if (type === "checkbox") return "checkbox";
				if (type === "radio") return "radio";
				return "textbox";
			}
			if (tag === "textarea") return "textbox";
			if (tag === "select") return "combobox";
			return null;
		};

		const getTextPreview = (element) => {
			const text = (element.innerText || element.textContent || "").replace(/\\s+/g, " ").trim();
			return text ? text.slice(0, MAX_TEXT) : null;
		};

		const getName = (element) => {
			const ariaLabel = element.getAttribute("aria-label");
			if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim().slice(0, MAX_TEXT);

			const labelledBy = element.getAttribute("aria-labelledby");
			if (labelledBy) {
				const labels = labelledBy
					.split(/\\s+/)
					.map((id) => document.getElementById(id))
					.filter(Boolean)
					.map((node) => (node.textContent || "").replace(/\\s+/g, " ").trim())
					.filter(Boolean);
				if (labels.length > 0) return labels.join(" ").slice(0, MAX_TEXT);
			}

			const placeholder = element.getAttribute("placeholder");
			if (placeholder && placeholder.trim()) return placeholder.trim().slice(0, MAX_TEXT);

			return getTextPreview(element);
		};

		const isInteractive = (element) => {
			if (!(element instanceof HTMLElement)) return false;
			const role = getRole(element);
			const tag = element.tagName.toLowerCase();
			if (tag === "button" || tag === "summary" || tag === "select" || tag === "textarea") {
				return true;
			}
			if (tag === "a" && element.getAttribute("href")) {
				return true;
			}
			if (tag === "input") {
				return element.getAttribute("type") !== "hidden";
			}
			if (element.isContentEditable) return true;
			if (element.hasAttribute("onclick")) return true;
			if (role && ["button", "link", "tab", "checkbox", "radio", "switch", "menuitem", "option", "textbox", "combobox", "slider"].includes(role)) {
				return true;
			}
			const tabIndex = element.getAttribute("tabindex");
			return tabIndex !== null && tabIndex !== "-1";
		};

		const getChecked = (element) => {
			const ariaChecked = element.getAttribute("aria-checked");
			if (ariaChecked === "mixed") return "mixed";
			if (ariaChecked === "true") return true;
			if (ariaChecked === "false") return false;
			if ("checked" in element && typeof element.checked === "boolean") {
				return element.checked;
			}
			return null;
		};

		const getBooleanAttribute = (element, name) => {
			const value = element.getAttribute(name);
			if (value === "true") return true;
			if (value === "false") return false;
			return null;
		};

		const elements = [];
		let refCounter = 0;

		const walk = (node, depth, parentRef) => {
			if (!(node instanceof HTMLElement)) return;
			if (!isVisible(node)) return;

			const actionable = isInteractive(node);
			let currentParentRef = parentRef;

			if (!interactiveOnly || actionable) {
				const rect = node.getBoundingClientRect();
				const ref = \`@e\${++refCounter}\`;
				const disabled =
					node.hasAttribute("disabled") ||
					node.getAttribute("aria-disabled") === "true";
				const value =
					"value" in node && typeof node.value === "string"
						? node.value.slice(0, MAX_VALUE)
						: null;

				elements.push({
					ref,
					parentRef,
					depth,
					actionable,
					role: getRole(node),
					tagName: node.tagName.toLowerCase(),
					name: getName(node),
					textPreview: getTextPreview(node),
					testId: node.getAttribute("data-testid"),
					placeholder: node.getAttribute("placeholder"),
					value,
					disabled,
					checked: getChecked(node),
					selected: getBooleanAttribute(node, "aria-selected"),
					expanded: getBooleanAttribute(node, "aria-expanded"),
					bounds: {
						x: Math.round(rect.x),
						y: Math.round(rect.y),
						width: Math.round(rect.width),
						height: Math.round(rect.height),
					},
				});
				node.setAttribute(REF_ATTR, ref);
				currentParentRef = ref;
			}

			if (depth >= maxDepth) return;
			for (const child of Array.from(node.children)) {
				walk(child, depth + 1, currentParentRef);
			}
		};

		const root = document.body || document.documentElement;
		if (root) {
			walk(root, 0, null);
		}

		return {
			version: ${EDITOR_SNAPSHOT_VERSION},
			timestamp: Date.now(),
			interactiveOnly,
			maxDepth,
			elements,
			summary: {
				total: elements.length,
				actionable: elements.filter((item) => item.actionable).length,
			},
		};
	})()`;
}

function normalizeSnapshotRef({
	ref,
}: {
	ref: string;
}): string {
	const normalized = ref.trim();
	if (!/^@e\d+$/.test(normalized)) {
		throw new EditorSnapshotActionError({
			message: "Invalid snapshot ref. Use refs like @e1.",
			statusCode: 400,
		});
	}
	return normalized;
}

function buildSnapshotActionPrelude(): string {
	return `
		const REF_ATTR = ${JSON.stringify(EDITOR_SNAPSHOT_REF_ATTRIBUTE)};
		const MAX_TEXT = 120;
		const MAX_VALUE = 120;

		const findElementByRef = (targetRef) => {
			for (const node of Array.from(document.querySelectorAll("[" + REF_ATTR + "]"))) {
				if (node instanceof HTMLElement && node.getAttribute(REF_ATTR) === targetRef) {
					return node;
				}
			}
			return null;
		};

		const getRole = (element) => {
			const explicitRole = element.getAttribute("role");
			if (explicitRole) return explicitRole;
			const tag = element.tagName.toLowerCase();
			if (tag === "button") return "button";
			if (tag === "a" && element.getAttribute("href")) return "link";
			if (tag === "input") {
				const type = element.getAttribute("type") || "text";
				if (type === "checkbox") return "checkbox";
				if (type === "radio") return "radio";
				return "textbox";
			}
			if (tag === "textarea") return "textbox";
			if (tag === "select") return "combobox";
			return null;
		};

		const getTextPreview = (element) => {
			const text = (element.innerText || element.textContent || "").replace(/\\s+/g, " ").trim();
			return text ? text.slice(0, MAX_TEXT) : null;
		};

		const getName = (element) => {
			const ariaLabel = element.getAttribute("aria-label");
			if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim().slice(0, MAX_TEXT);
			const labelledBy = element.getAttribute("aria-labelledby");
			if (labelledBy) {
				const labels = labelledBy
					.split(/\\s+/)
					.map((id) => document.getElementById(id))
					.filter(Boolean)
					.map((node) => (node.textContent || "").replace(/\\s+/g, " ").trim())
					.filter(Boolean);
				if (labels.length > 0) return labels.join(" ").slice(0, MAX_TEXT);
			}
			const placeholder = element.getAttribute("placeholder");
			if (placeholder && placeholder.trim()) return placeholder.trim().slice(0, MAX_TEXT);
			return getTextPreview(element);
		};

		const getValue = (element) => {
			if ("value" in element && typeof element.value === "string") {
				return element.value.slice(0, MAX_VALUE);
			}
			if (element.isContentEditable) {
				const text = (element.textContent || "").replace(/\\s+/g, " ").trim();
				return text ? text.slice(0, MAX_VALUE) : null;
			}
			return null;
		};

		const buildSuccess = (element, action, targetRef) => ({
			action,
			ref: targetRef,
			tagName: element.tagName.toLowerCase(),
			role: getRole(element),
			name: getName(element),
			value: getValue(element),
		});

		const buildFailure = (errorCode, message) => ({
			ok: false,
			errorCode,
			message,
		});
	`;
}

function buildSnapshotClickScript({
	request,
}: {
	request: EditorSnapshotClickRequest;
}): string {
	const ref = normalizeSnapshotRef({ ref: request.ref });
	return `(() => {
		${buildSnapshotActionPrelude()}
		const targetRef = ${JSON.stringify(ref)};
		const element = findElementByRef(targetRef);
		if (!(element instanceof HTMLElement)) {
			return buildFailure("not_found", "No element found for snapshot ref " + targetRef + ". Capture a fresh snapshot first.");
		}

		const disabled =
			element.hasAttribute("disabled") ||
			element.getAttribute("aria-disabled") === "true";
		if (disabled) {
			return buildFailure("disabled", "Cannot click a disabled element.");
		}

		element.focus?.();
		if (typeof element.click === "function") {
			element.click();
		} else {
			for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
				element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
			}
		}

		return buildSuccess(element, "click", targetRef);
	})()`;
}

function buildSnapshotFillScript({
	request,
}: {
	request: EditorSnapshotFillRequest;
}): string {
	const ref = normalizeSnapshotRef({ ref: request.ref });
	return `(() => {
		${buildSnapshotActionPrelude()}
		const targetRef = ${JSON.stringify(ref)};
		const nextValue = ${JSON.stringify(request.value)};
		const element = findElementByRef(targetRef);
		if (!(element instanceof HTMLElement)) {
			return buildFailure("not_found", "No element found for snapshot ref " + targetRef + ". Capture a fresh snapshot first.");
		}

		const disabled =
			element.hasAttribute("disabled") ||
			element.getAttribute("aria-disabled") === "true";
		if (disabled) {
			return buildFailure("disabled", "Cannot fill a disabled element.");
		}

		const setInputValue = (input, value) => {
			const descriptor = Object.getOwnPropertyDescriptor(
				Object.getPrototypeOf(input),
				"value"
			);
			if (descriptor && typeof descriptor.set === "function") {
				descriptor.set.call(input, value);
				return;
			}
			input.value = value;
		};

		const dispatchTextEvents = (target) => {
			target.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, data: nextValue, inputType: "insertText" }));
			target.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
		};

		if (element instanceof HTMLInputElement) {
			const disallowed = ["checkbox", "radio", "file", "hidden", "button", "submit", "reset"];
			if (disallowed.includes((element.type || "text").toLowerCase())) {
				return buildFailure("invalid_fill_target", "Snapshot ref " + targetRef + " does not point to a text-fillable input.");
			}
			element.focus();
			setInputValue(element, nextValue);
			dispatchTextEvents(element);
			return buildSuccess(element, "fill", targetRef);
		}

		if (element instanceof HTMLTextAreaElement) {
			element.focus();
			setInputValue(element, nextValue);
			dispatchTextEvents(element);
			return buildSuccess(element, "fill", targetRef);
		}

		if (element.isContentEditable) {
			element.focus();
			element.textContent = nextValue;
			dispatchTextEvents(element);
			return buildSuccess(element, "fill", targetRef);
		}

		return buildFailure("invalid_fill_target", "Snapshot ref " + targetRef + " is not a fillable input.");
	})()`;
}

function isValidSnapshotResult(value: unknown): value is EditorSnapshotResult {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const candidate = value as Partial<EditorSnapshotResult>;
	return (
		typeof candidate.version === "number" &&
		typeof candidate.timestamp === "number" &&
		Array.isArray(candidate.elements) &&
		typeof candidate.summary === "object" &&
		candidate.summary !== null
	);
}

function isSnapshotActionFailure(value: unknown): value is SnapshotActionFailure {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const candidate = value as Partial<SnapshotActionFailure>;
	return (
		candidate.ok === false &&
		typeof candidate.errorCode === "string" &&
		typeof candidate.message === "string"
	);
}

function isValidSnapshotActionResult(
	value: unknown
): value is EditorSnapshotActionResult {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const candidate = value as Partial<EditorSnapshotActionResult>;
	return (
		(candidate.action === "click" || candidate.action === "fill") &&
		typeof candidate.ref === "string" &&
		typeof candidate.tagName === "string"
	);
}

function toSnapshotActionError({
	failure,
}: {
	failure: SnapshotActionFailure;
}): EditorSnapshotActionError {
	const statusCode =
		failure.errorCode === "not_found"
			? 404
			: failure.errorCode === "disabled"
				? 409
				: 400;
	return new EditorSnapshotActionError({
		message: failure.message,
		statusCode,
	});
}

async function executeSnapshotAction({
	win,
	script,
}: {
	win: BrowserWindow;
	script: string;
}): Promise<EditorSnapshotActionResult> {
	const result = await win.webContents.executeJavaScript(script);

	if (isSnapshotActionFailure(result)) {
		throw toSnapshotActionError({ failure: result });
	}

	if (!isValidSnapshotActionResult(result)) {
		throw new Error("Renderer returned an invalid snapshot action result");
	}

	return result;
}

export async function requestEditorSnapshotFromRenderer(
	win: BrowserWindow,
	request?: EditorSnapshotRequest
): Promise<EditorSnapshotResult> {
	const snapshot = await win.webContents.executeJavaScript(
		buildSnapshotScript({ request })
	);

	if (!isValidSnapshotResult(snapshot)) {
		throw new Error("Renderer returned an invalid accessibility snapshot");
	}

	return snapshot;
}

export async function clickEditorSnapshotRef(
	win: BrowserWindow,
	request: EditorSnapshotClickRequest
): Promise<EditorSnapshotActionResult> {
	return await executeSnapshotAction({
		win,
		script: buildSnapshotClickScript({ request }),
	});
}

export async function fillEditorSnapshotRef(
	win: BrowserWindow,
	request: EditorSnapshotFillRequest
): Promise<EditorSnapshotActionResult> {
	return await executeSnapshotAction({
		win,
		script: buildSnapshotFillScript({ request }),
	});
}
