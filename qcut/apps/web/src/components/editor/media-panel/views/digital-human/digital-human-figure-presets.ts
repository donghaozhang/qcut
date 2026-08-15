import type { AssetLicense } from "@qcut/editor-core";

/**
 * Licence covering every bundled portrait below. Pexels grants free commercial
 * use without attribution; the photographer is still recorded per preset so the
 * provenance of each file is auditable from the repo alone.
 *
 * Caveat worth knowing before these drive a real avatar model: the Pexels
 * licence covers the *photograph*, not the depicted person's likeness. Lip-syncing
 * an identifiable person to arbitrary speech is outside what it grants, so these
 * are safe as picker artwork but should be swapped for owned or synthetic
 * portraits before shipping generation on top of them.
 */
export const DIGITAL_HUMAN_FIGURE_LICENSE: AssetLicense = {
	name: "Pexels License",
	commercialUse: "allowed",
	attributionRequired: false,
	sourceUrl: "https://www.pexels.com/license/",
};

export interface DigitalHumanFigurePreset {
	id: string;
	/** Path under apps/web/public — resolves in vite dev and the app:// build. */
	previewUrl: string;
	/** Photographer credited on the source page. */
	photographer: string;
	/** Canonical page the file was downloaded from. */
	sourceUrl: string;
}

function preset({
	id,
	photographer,
	photoId,
}: {
	id: string;
	photographer: string;
	photoId: string;
}): DigitalHumanFigurePreset {
	return {
		id,
		previewUrl: `/digital-human/figures/${id}.jpg`,
		photographer,
		sourceUrl: `https://www.pexels.com/photo/${photoId}/`,
	};
}

/**
 * Built-in figures, so the panel is usable before the user imports anything.
 * Front-facing studio headshots on plain backdrops — the framing every avatar
 * model expects for a character image.
 */
export const DIGITAL_HUMAN_FIGURE_PRESETS: readonly DigitalHumanFigurePreset[] =
	[
		preset({
			id: "presenter-01",
			photographer: "Prolific People",
			photoId: "30004323",
		}),
		preset({
			id: "presenter-02",
			photographer: "Joseph Eulo",
			photoId: "12311572",
		}),
		preset({
			id: "presenter-03",
			photographer: "Ifeyinka Studios",
			photoId: "29852895",
		}),
		preset({
			id: "presenter-04",
			photographer: "Oluwakore Image",
			photoId: "15946547",
		}),
		preset({
			id: "presenter-05",
			photographer: "Augusto Carneiro Jr",
			photoId: "30468665",
		}),
		preset({
			id: "presenter-06",
			photographer: "Sandro Tavares",
			photoId: "13375591",
		}),
		preset({
			id: "presenter-07",
			photographer: "Finn Gruber",
			photoId: "31869537",
		}),
		preset({
			id: "presenter-08",
			photographer: "Beyza Yildiz",
			photoId: "16973767",
		}),
	];

export function findDigitalHumanFigurePreset({
	presetId,
}: {
	presetId: string;
}): DigitalHumanFigurePreset | undefined {
	return DIGITAL_HUMAN_FIGURE_PRESETS.find((entry) => entry.id === presetId);
}
