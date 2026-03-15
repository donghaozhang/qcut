/** macOS-style cursor SVG data URLs. */

const MACOS_ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
  <path d="M2 1L22 18H12L18 34L14 36L8 20L2 26V1Z" fill="white" stroke="black" stroke-width="1.5"/>
</svg>`;

const MACOS_POINTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
  <path d="M8 1C8 1 8 14 8 18C6 16 3 13 1 11L1 15L8 24L8 34L12 34L12 24L23 15L23 11C20 13 17 16 15 18C15 14 15 1 15 1C15 1 12 0 11.5 0C11 0 8 1 8 1Z" fill="white" stroke="black" stroke-width="1"/>
</svg>`;

function svgToDataUrl(svg: string): string {
	return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export const CURSOR_ASSETS: Record<string, string> = {
	"macos-arrow": svgToDataUrl(MACOS_ARROW_SVG),
	"macos-pointer": svgToDataUrl(MACOS_POINTER_SVG),
};
