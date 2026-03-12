export function buildContextMenuScript({
	elementId,
	debug,
}: {
	elementId: string;
	debug?: boolean;
}): string {
	const serializedElementId = JSON.stringify(elementId);
	const serializedDebug = debug === true ? "true" : "false";

	return `(function(elementId, debug) {
		var el = null;
		var nodes = document.querySelectorAll("[data-element-id]");
		for (var index = 0; index < nodes.length; index += 1) {
			var candidate = nodes[index];
			if (
				candidate instanceof HTMLElement &&
				candidate.getAttribute("data-element-id") === elementId
			) {
				el = candidate;
				break;
			}
		}
		if (!el) return Promise.resolve({ found: false, error: "Element not found" });
		var rect = el.getBoundingClientRect();
		var rawX = rect.left + rect.width / 2;
		var rawY = rect.top + rect.height / 2;
		var x = Math.max(20, Math.min(rawX, window.innerWidth - 20));
		var y = Math.max(20, Math.min(rawY, window.innerHeight - 20));
		var events = [];
		if (debug) {
			var types = ["pointerdown","pointerup","mousedown","mouseup","contextmenu","click","focusin","focusout"];
			var handler = function(e) {
				events.push({ type: e.type, target: e.target.tagName, phase: e.eventPhase, button: e.button, defaultPrevented: e.defaultPrevented });
			};
			types.forEach(function(t) { document.addEventListener(t, handler, true); document.addEventListener(t, handler, false); });
		}
		el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2, buttons: 2 }));
		return new Promise(function(resolve) {
			setTimeout(function() {
				if (debug) {
					var types2 = ["pointerdown","pointerup","mousedown","mouseup","contextmenu","click","focusin","focusout"];
					types2.forEach(function(t) { document.removeEventListener(t, handler, true); document.removeEventListener(t, handler, false); });
				}
				var menu = document.querySelector("[role='menu'][data-state='open']");
				resolve({ found: true, menuOpen: !!menu, x: Math.round(x), y: Math.round(y), events: debug ? events : undefined });
			}, 150);
		});
	})(${serializedElementId}, ${serializedDebug})`;
}
