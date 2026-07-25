import type { HyperframesVariableValue } from "./types";

const RUNTIME_ATTRIBUTE = "data-hyperframes-preview-runtime";
const QCUT_RUNTIME_ATTRIBUTE = "data-qcut-hyperframes-runtime";

function escapeAttribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function serializeForInlineScript(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</g, "\\u003c")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
}

function protectInlineScript(source: string): string {
	return source.replace(/<\/script/gi, "<\\/script");
}

function stripExistingRuntime(html: string): string {
	const runtimePattern = new RegExp(
		`<script\\b[^>]*(?:${RUNTIME_ATTRIBUTE}|${QCUT_RUNTIME_ATTRIBUTE})[^>]*>[\\s\\S]*?<\\/script\\s*>`,
		"gi"
	);
	return html.replace(runtimePattern, "");
}

function injectAtHeadStart({
	html,
	content,
}: {
	html: string;
	content: string;
}): string {
	const headMatch = /<head\b[^>]*>/i.exec(html);
	if (headMatch?.index !== undefined) {
		const insertionIndex = headMatch.index + headMatch[0].length;
		return `${html.slice(0, insertionIndex)}${content}${html.slice(insertionIndex)}`;
	}

	const htmlMatch = /<html\b[^>]*>/i.exec(html);
	if (htmlMatch?.index !== undefined) {
		const insertionIndex = htmlMatch.index + htmlMatch[0].length;
		return `${html.slice(0, insertionIndex)}<head>${content}</head>${html.slice(insertionIndex)}`;
	}
	return `<head>${content}</head>${html}`;
}

function injectAtBodyEnd({
	html,
	content,
}: {
	html: string;
	content: string;
}): string {
	const bodyEnd = /<\/body\s*>/i.exec(html);
	if (bodyEnd?.index !== undefined) {
		return `${html.slice(0, bodyEnd.index)}${content}${html.slice(bodyEnd.index)}`;
	}
	return `${html}${content}`;
}

export function buildHyperframesBridgeScript(): string {
	return `(() => {
  const SOURCE = "qcut-hyperframes-runtime";
  let isPlaying = false;
  let isMuted = false;
  const send = (type, payload = {}) => parent.postMessage({ source: SOURCE, type, ...payload }, "*");
  const applyMuted = () => {
    for (const media of document.querySelectorAll("audio,video")) {
      media.muted = isMuted;
    }
  };
  new MutationObserver(applyMuted).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  const player = async () => {
    if (window.__playerReady) await window.__playerReady;
    if (!window.__player) throw new Error("HyperFrames player did not initialize");
    return window.__player;
  };
  const seek = async (time) => {
    const instance = await player();
    instance.renderSeek(Math.max(0, Number(time) || 0), { suppressEvents: true });
    if (window.__renderReady) await window.__renderReady;
  };
  window.addEventListener("message", async (event) => {
    if (event.source !== parent || event.data?.source !== "qcut-hyperframes") return;
    const { type, requestId } = event.data;
    try {
      const instance = await player();
      if (type === "seek") {
        await seek(event.data.time);
        if (isPlaying) instance.play();
      }
      if (type === "play") {
        isPlaying = true;
        instance.play();
      }
      if (type === "pause") {
        isPlaying = false;
        instance.pause();
      }
      if (type === "set-muted") {
        isMuted = Boolean(event.data.muted);
        applyMuted();
      }
      send(type === "seek" ? "seeked" : "ack", { requestId });
    } catch (error) {
      send("error", { requestId, message: error instanceof Error ? error.message : String(error) });
    }
  });
  const ready = async () => {
    try {
      const instance = await player();
      const duration = Number(instance.getDuration?.());
      applyMuted();
      send("ready", {
        duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
      });
    } catch (error) {
      send("error", { message: error instanceof Error ? error.message : String(error) });
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready, { once: true });
  } else {
    ready();
  }
})();`;
}

export function prepareHyperframesDocument({
	html,
	baseUrl,
	variables,
	runtimeSource,
}: {
	html: string;
	baseUrl: string;
	variables: Record<string, HyperframesVariableValue>;
	runtimeSource: string;
}): string {
	const sanitizedHtml = stripExistingRuntime(html);
	const bootstrap = `<base href="${escapeAttribute(baseUrl)}"><script>window.__hfVariables=${serializeForInlineScript(variables)};window.__HF_EXPORT_RENDER_SEEK_CONFIG={enabled:true};</script>`;
	const runtime = `<script ${RUNTIME_ATTRIBUTE}="1" ${QCUT_RUNTIME_ATTRIBUTE}="1">${protectInlineScript(runtimeSource)}</script>`;
	const bridge = `<script data-qcut-hyperframes-bridge="1">${protectInlineScript(buildHyperframesBridgeScript())}</script>`;

	return injectAtBodyEnd({
		html: injectAtHeadStart({
			html: sanitizedHtml,
			content: `${bootstrap}${runtime}`,
		}),
		content: bridge,
	});
}
