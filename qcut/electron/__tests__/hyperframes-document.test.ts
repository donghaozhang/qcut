import { describe, expect, it } from "vitest";
import {
	buildHyperframesBridgeScript,
	prepareHyperframesDocument,
} from "../hyperframes/document";

describe("prepareHyperframesDocument", () => {
	it("injects variables and runtime before authored scripts", () => {
		const html =
			'<!doctype html><html><head><script>window.authored=true</script></head><body><main data-composition-id="main"></main></body></html>';
		const prepared = prepareHyperframesDocument({
			html,
			baseUrl: "qcut-hyperframes://token/",
			variables: { title: "Hello", enabled: true },
			runtimeSource: "window.__runtimeLoaded=true;",
		});

		expect(prepared.indexOf("window.__hfVariables")).toBeLessThan(
			prepared.indexOf("window.authored")
		);
		expect(prepared).toContain('<base href="qcut-hyperframes://token/">');
		expect(prepared).toContain("window.__runtimeLoaded=true");
		expect(prepared.indexOf("window.__runtimeLoaded")).toBeLessThan(
			prepared.indexOf("window.authored")
		);
	});

	it("escapes script-closing input and replaces an embedded preview runtime", () => {
		const prepared = prepareHyperframesDocument({
			html: `<html><body><script data-hyperframes-preview-runtime="1">oldRuntime()</script></body></html>`,
			baseUrl: "qcut-hyperframes://token/",
			variables: { title: "</script><script>window.injected=true</script>" },
			runtimeSource: "newRuntime();",
		});

		expect(prepared).not.toContain("oldRuntime()");
		expect(prepared).not.toContain("window.injected=true</script>");
		expect(prepared).toContain("\\u003c/script>");
		expect(prepared).toContain("newRuntime()");
	});
});

describe("buildHyperframesBridgeScript", () => {
	it("uses the deterministic renderSeek contract", () => {
		const script = buildHyperframesBridgeScript();
		expect(script).toContain("instance.renderSeek");
		expect(script).toContain("window.__playerReady");
		expect(script).toContain('event.data?.source !== "qcut-hyperframes"');
		expect(script).toContain("if (isPlaying) instance.play()");
		expect(script).toContain('type === "set-muted"');
		expect(script).toContain('document.querySelectorAll("audio,video")');
	});
});
