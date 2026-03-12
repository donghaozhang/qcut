import type { BrowserWindow } from "electron";
import type {
	EditorSnapshotActionResult,
	EditorSnapshotCheckRequest,
	EditorSnapshotSelectRequest,
} from "../../types/claude-api.js";
import {
	buildSnapshotActionPrelude,
	executeSnapshotAction,
	normalizeSnapshotRef,
} from "./claude-snapshot-handler.js";

function buildSnapshotSelectScript({
	request,
}: {
	request: EditorSnapshotSelectRequest;
}): string {
	const ref = normalizeSnapshotRef({ ref: request.ref });
	return `(() => {
		${buildSnapshotActionPrelude()}
		const targetRef = ${JSON.stringify(ref)};
		const selectValue = ${JSON.stringify(request.value)};
		const element = findElementByRef(targetRef);
		if (!(element instanceof HTMLElement)) {
			return buildFailure("not_found", "No element found for snapshot ref " + targetRef + ". Capture a fresh snapshot first.");
		}

		const disabled =
			element.hasAttribute("disabled") ||
			element.getAttribute("aria-disabled") === "true";
		if (disabled) {
			return buildFailure("disabled", "Cannot select on a disabled element.");
		}

		if (element instanceof HTMLSelectElement) {
			const option = Array.from(element.options).find(
				(opt) => opt.value === selectValue || opt.textContent?.trim() === selectValue
			);
			if (!option) {
				return buildFailure("invalid_option", "Option " + JSON.stringify(selectValue) + " not found in select element " + targetRef + ".");
			}
			element.value = option.value;
			element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
			element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
			return buildSuccess(element, "select", targetRef);
		}

		if (element.getAttribute("role") === "combobox" || element.getAttribute("role") === "listbox") {
			element.focus();
			element.click();
			// Look for a matching option within the listbox/combobox after opening
			const listboxId = element.getAttribute("aria-controls") || element.getAttribute("aria-owns");
			const listbox = listboxId ? document.getElementById(listboxId) : element;
			if (listbox && selectValue) {
				const options = listbox.querySelectorAll('[role="option"]');
				let matched = false;
				for (const opt of options) {
					const optText = opt.textContent?.trim();
					const optVal = opt.getAttribute("data-value") || opt.getAttribute("value");
					if (optText === selectValue || optVal === selectValue) {
						opt.click();
						matched = true;
						break;
					}
				}
				if (!matched) {
					return buildFailure("invalid_option", "Option " + JSON.stringify(selectValue) + " not found in combobox/listbox " + targetRef + ".");
				}
			}
			return buildSuccess(element, "select", targetRef);
		}

		return buildFailure("invalid_select_target", "Snapshot ref " + targetRef + " is not a select element or combobox.");
	})()`;
}

function buildSnapshotCheckScript({
	request,
}: {
	request: EditorSnapshotCheckRequest;
}): string {
	const ref = normalizeSnapshotRef({ ref: request.ref });
	return `(() => {
		${buildSnapshotActionPrelude()}
		const targetRef = ${JSON.stringify(ref)};
		const desiredChecked = ${JSON.stringify(request.checked)};
		const element = findElementByRef(targetRef);
		if (!(element instanceof HTMLElement)) {
			return buildFailure("not_found", "No element found for snapshot ref " + targetRef + ". Capture a fresh snapshot first.");
		}

		const disabled =
			element.hasAttribute("disabled") ||
			element.getAttribute("aria-disabled") === "true";
		if (disabled) {
			return buildFailure("disabled", "Cannot toggle a disabled element.");
		}

		if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
			if (element.checked !== desiredChecked) {
				element.click();
			}
			return buildSuccess(element, "check", targetRef);
		}

		const role = element.getAttribute("role");
		if (role === "checkbox" || role === "switch" || role === "radio") {
			const currentlyChecked = element.getAttribute("aria-checked") === "true";
			if (currentlyChecked !== desiredChecked) {
				element.click();
			}
			const afterChecked = element.getAttribute("aria-checked") === "true";
			if (afterChecked !== desiredChecked) {
				return buildFailure("check_failed", "Element " + targetRef + " could not be toggled to " + (desiredChecked ? "checked" : "unchecked") + " state.");
			}
			return buildSuccess(element, "check", targetRef);
		}

		return buildFailure("invalid_check_target", "Snapshot ref " + targetRef + " is not a checkbox, radio, or switch element.");
	})()`;
}

export async function selectEditorSnapshotRef(
	win: BrowserWindow,
	request: EditorSnapshotSelectRequest
): Promise<EditorSnapshotActionResult> {
	return await executeSnapshotAction({
		win,
		script: buildSnapshotSelectScript({ request }),
	});
}

export async function checkEditorSnapshotRef(
	win: BrowserWindow,
	request: EditorSnapshotCheckRequest
): Promise<EditorSnapshotActionResult> {
	return await executeSnapshotAction({
		win,
		script: buildSnapshotCheckScript({ request }),
	});
}
