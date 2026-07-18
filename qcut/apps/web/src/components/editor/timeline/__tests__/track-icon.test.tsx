import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { TrackIcon } from "../track-icon";

vi.mock("lucide-react", () => ({
	Video: () => <svg data-testid="video-icon" />,
	Music: () => <svg data-testid="music-icon" />,
	TypeIcon: () => <svg data-testid="type-icon" />,
	Sticker: () => <svg data-testid="sticker-icon" />,
	FileText: () => <svg data-testid="markdown-icon" />,
	Captions: () => <svg data-testid="captions-icon" />,
	Sparkles: () => <svg data-testid="effect-icon" />,
}));

describe("TrackIcon", () => {
	it('renders Video icon for "media" type', () => {
		render(<TrackIcon type="media" />);
		expect(document.querySelector('[data-testid="video-icon"]')).toBeTruthy();
	});

	it('renders Music icon for "audio" type', () => {
		render(<TrackIcon type="audio" />);
		expect(document.querySelector('[data-testid="music-icon"]')).toBeTruthy();
	});

	it('renders Sparkles icon for "effect" type', () => {
		render(<TrackIcon type="effect" />);
		expect(document.querySelector('[data-testid="effect-icon"]')).toBeTruthy();
	});

	it('renders FileText icon for "markdown" type', () => {
		render(<TrackIcon type="markdown" />);
		expect(
			document.querySelector('[data-testid="markdown-icon"]')
		).toBeTruthy();
	});
});
